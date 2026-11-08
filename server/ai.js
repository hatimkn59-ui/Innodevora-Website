"use strict";

const crypto = require("node:crypto");
const { buildSystemPrompt, buildFallbackAnswer } = require("./prompts");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalProviderUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseMetadata(raw, nonce) {
  if (!raw || !nonce) return null;
  const prefix = `[[NDV_META:${nonce}:`;
  const start = raw.indexOf(prefix);
  if (start === -1) return null;
  const jsonStart = start + prefix.length;
  const end = raw.indexOf("]]", jsonStart);
  if (end === -1) return null;
  const jsonText = raw.slice(jsonStart, end).trim();
  const parsed = safeJsonParse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}

class AiService {
  constructor({ config, knowledge, logger = console, onUsage = null }) {
    this.config = config;
    this.knowledge = knowledge;
    this.logger = logger;
    this.onUsage = onUsage;
  }

  recordUsage(event) {
    if (!this.onUsage) return;
    try {
      this.onUsage(event);
    } catch (error) {
      this.logger.warn?.(`[ai] usage logging failed: ${error.message}`);
    }
  }

  get providerConfigured() {
    return Boolean(this.config.ai.apiKey) || isLocalProviderUrl(this.config.ai.url);
  }

  get mode() {
    if (this.providerConfigured) return "live";
    if (this.config.ai.keylessDemo) return "demo";
    return "unavailable";
  }

  status() {
    return {
      mode: this.mode,
      providerConfigured: this.providerConfigured,
      keylessDemo: this.config.ai.keylessDemo,
    };
  }

  async streamText(text, onDelta) {
    const delay = this.config.ai.streamDelayMs;
    const chunks = text.match(/[\s\S]{1,18}/g) || [text];
    for (const chunk of chunks) {
      onDelta(chunk);
      if (delay > 0) await sleep(delay);
    }
  }

  async respond({
    visitor,
    conversationSummary,
    messages,
    userMessage,
    onDelta,
    assistantSettings = null,
  }) {
    const started = Date.now();
    const nonce = crypto.randomBytes(12).toString("hex");
    const knowledgeContext = this.knowledge.getContext(userMessage);
    const mode = this.mode;
    const record = (status, errorCode = null) =>
      this.recordUsage({
        mode,
        status,
        latencyMs: Date.now() - started,
        errorCode,
      });

    if (mode === "unavailable") {
      record("error", "AI_UNAVAILABLE");
      const error = new Error("AI provider is not configured.");
      error.code = "AI_UNAVAILABLE";
      throw error;
    }

    if (mode === "demo") {
      const answer = this.buildDemoAnswer({
        userMessage,
        knowledgeAvailable: knowledgeContext.available,
      });
      await this.streamText(answer, onDelta);
      record("success");
      return {
        text: answer,
        meta: null,
        mode: "demo",
        knowledgeVersion: knowledgeContext.version,
        nonce,
      };
    }

    const systemPrompt = buildSystemPrompt({
      knowledge: knowledgeContext.text,
      visitor,
      conversationSummary,
      nonce,
      consentStatus: Boolean(visitor.consent_status),
      customInstructions: assistantSettings?.customInstructions || "",
      isDemoMode: false,
    });

    const history = this.buildHistory(messages);
    const requestMessages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ];

    let visibleSent = 0;
    let rawText = "";
    let markerStart = -1;
    let sentAny = false;
    const prefix = `[[NDV_META:${nonce}:`;

    const consume = (delta) => {
      if (!delta) return;
      rawText += delta;
      if (markerStart === -1) {
        const index = rawText.indexOf(prefix);
        if (index !== -1) markerStart = index;
      }
      const safeEnd =
        markerStart === -1
          ? Math.max(0, rawText.length - prefix.length)
          : markerStart;
      if (safeEnd > visibleSent) {
        const chunk = rawText.slice(visibleSent, safeEnd);
        visibleSent = safeEnd;
        if (chunk) {
          sentAny = true;
          onDelta(chunk);
        }
      }
    };

    try {
      const response = await fetch(this.config.ai.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.ai.apiKey
            ? { Authorization: `Bearer ${this.config.ai.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.ai.model,
          messages: requestMessages,
          temperature: this.config.ai.temperature,
          max_tokens: this.config.ai.maxOutputTokens,
          stream: true,
        }),
        signal: AbortSignal.timeout(this.config.ai.timeoutMs),
      });

      const contentType = String(response.headers.get("content-type") || "");
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(
          `AI provider returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
        error.code = "AI_PROVIDER_ERROR";
        throw error;
      }

      if (contentType.includes("text/event-stream")) {
        await this.readStream(response, consume);
      } else {
        const payload = await response.json();
        const content =
          payload?.choices?.[0]?.message?.content ||
          payload?.choices?.[0]?.delta?.content ||
          "";
        if (typeof content === "string" && content) consume(content);
      }

      // Flush text that was held back while looking for the hidden marker.
      if (markerStart === -1 && visibleSent < rawText.length) {
        const chunk = rawText.slice(visibleSent);
        visibleSent = rawText.length;
        if (chunk) {
          sentAny = true;
          onDelta(chunk);
        }
      }

      const meta = parseMetadata(rawText, nonce);
      const visible = (markerStart === -1 ? rawText : rawText.slice(0, markerStart)).trim();
      if (!visible) {
        const fallback = buildFallbackAnswer({
          message: userMessage,
          knowledgeAvailable: knowledgeContext.available,
        });
        if (!sentAny) await this.streamText(fallback, onDelta);
        record("fallback", "AI_EMPTY_ANSWER");
        return {
          text: fallback,
          meta,
          mode: "live",
          knowledgeVersion: knowledgeContext.version,
          nonce,
        };
      }

      record("success");
      return {
        text: visible,
        meta,
        mode: "live",
        knowledgeVersion: knowledgeContext.version,
        nonce,
      };
    } catch (error) {
      if (sentAny) {
        error.partial = true;
        error.code = error.code || "AI_STREAM_ERROR";
        record("error", error.code);
        throw error;
      }
      const fallback = buildFallbackAnswer({
        message: userMessage,
        knowledgeAvailable: knowledgeContext.available,
      });
      await this.streamText(fallback, onDelta);
      record("fallback", error.code || "AI_PROVIDER_ERROR");
      return {
        text: fallback,
        meta: null,
        mode: "fallback",
        providerError: true,
        knowledgeVersion: knowledgeContext.version,
        nonce,
      };
    }
  }

  buildHistory(messages) {
    const recent = messages.slice(-30);
    const history = [];
    for (const message of recent) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      const content = String(message.content || "").slice(0, 4000);
      if (!content) continue;
      if (history.length && history[history.length - 1].role === message.role) {
        history[history.length - 1].content += `\n\n${content}`;
      } else {
        history.push({ role: message.role, content });
      }
    }
    return history;
  }

  buildDemoAnswer({ userMessage, knowledgeAvailable }) {
    // The demo fallback is deliberately deterministic and conservative. It is
    // for local evaluation when no provider key exists; it never fabricates.
    return buildFallbackAnswer({ message: userMessage, knowledgeAvailable });
  }

  async readStream(response, consume) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          const parsed = safeJsonParse(data);
          if (!parsed) continue;
          const delta =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";
          if (typeof delta === "string" && delta) consume(delta);
        }
      }
      if (buffer.trim().startsWith("data:")) {
        const data = buffer.trim().slice(5).trim();
        if (data && data !== "[DONE]") {
          const parsed = safeJsonParse(data);
          const delta =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";
          if (typeof delta === "string" && delta) consume(delta);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

module.exports = { AiService, parseMetadata };
