"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

const MAX_KNOWLEDGE_BYTES = 500 * 1024;
const CORE_HEADINGS = [
  "company overview",
  "company identity and positioning",
  "our services",
  "pricing and quotation policy",
  "contact information",
  "what the ai assistant is allowed to say",
  "what the ai assistant must never claim",
];

const STOP_WORDS = new Set(
  `a an and are as at be been being but by can could did do does for from had has have he her his how i if in into is it its may me might more most my no not of on or our ours out over she should so some than that the their them there they this those to too under up us was we were what when where which while who why will with would you your yours about after before between during each few other same such only own just also very`.split(
    /\s+/
  )
);

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value) {
  return normalizeForSearch(value)
    .split(/[^a-z0-9+#.-]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function parseSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;
  let preamble = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current);
      current = {
        title: line.replace(/^##\s+/, "").trim(),
        body: [line],
      };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map((section) => ({
      title: section.title,
      body: section.body.join("\n").trim(),
      normalizedTitle: normalizeForSearch(section.title),
      normalizedBody: normalizeForSearch(section.body.join("\n")),
    })),
  };
}

class KnowledgeBase {
  constructor({ filePath, logger = console }) {
    this.filePath = filePath;
    this.logger = logger;
    this.cached = null;
    this.lastError = null;
  }

  ensureFresh(force = false) {
    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch (error) {
      this.lastError = error.code || "READ_ERROR";
      if (!this.cached || !this.cached.available) {
        this.cached = {
          available: false,
          stale: false,
          version: "unavailable",
          updatedAt: null,
          size: 0,
          sections: [],
          preamble: "",
          error: this.lastError,
        };
      } else {
        this.cached = { ...this.cached, available: false, stale: true, error: this.lastError };
      }
      return this.cached;
    }

    if (!force && this.cached && this.cached.mtimeMs === stat.mtimeMs && this.cached.size === stat.size) {
      return this.cached;
    }

    try {
      if (stat.size > MAX_KNOWLEDGE_BYTES) {
        throw new Error(`Knowledge base exceeds ${MAX_KNOWLEDGE_BYTES} bytes.`);
      }
      const text = fs.readFileSync(this.filePath, "utf8");
      if (!text.trim()) throw new Error("Knowledge base is empty.");
      const version = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
      const parsed = parseSections(text);
      this.cached = {
        available: true,
        stale: false,
        version,
        updatedAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        preamble: parsed.preamble,
        sections: parsed.sections,
        error: null,
      };
      this.lastError = null;
      this.logger.info?.(
        `[knowledge] loaded ${parsed.sections.length} sections, version ${version}, ${stat.size} bytes`
      );
      return this.cached;
    } catch (error) {
      this.lastError = error.code || "READ_ERROR";
      this.logger.warn?.(`[knowledge] could not load knowledge base: ${error.message}`);
      if (!this.cached) {
        this.cached = {
          available: false,
          stale: false,
          version: "unavailable",
          updatedAt: null,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          sections: [],
          preamble: "",
          error: this.lastError,
        };
      } else {
        this.cached = { ...this.cached, available: false, stale: true, error: this.lastError };
      }
      return this.cached;
    }
  }

  getStatus() {
    const snapshot = this.ensureFresh();
    return {
      available: snapshot.available,
      stale: snapshot.stale,
      version: snapshot.version,
      updatedAt: snapshot.updatedAt,
      sectionCount: snapshot.sections.length,
    };
  }

  getContext(query = "", maxChars = 18000) {
    const snapshot = this.ensureFresh();
    if (!snapshot.available && !snapshot.stale) {
      return {
        available: false,
        version: snapshot.version,
        text:
          "The company knowledge base is temporarily unavailable. Do not invent company facts. " +
          "Tell the visitor you cannot access the company details right now and offer contact@innodevora.com.",
      };
    }

    const tokens = new Set(tokenize(query));
    const selected = [];
    const selectedIndexes = new Set();

    for (const section of snapshot.sections) {
      if (CORE_HEADINGS.includes(section.normalizedTitle)) {
        selected.push(section);
        selectedIndexes.add(section);
      }
    }

    const ranked = snapshot.sections
      .filter((section) => !selectedIndexes.has(section))
      .map((section) => {
        let score = 0;
        for (const token of tokens) {
          if (section.normalizedTitle.includes(token)) score += 8;
          if (section.normalizedBody.includes(token)) score += 1;
        }
        return { section, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    for (const entry of ranked) selected.push(entry.section);

    let text = `Company knowledge file version: ${snapshot.version}\nLast updated: ${snapshot.updatedAt || "unknown"}\n\n`;
    if (snapshot.preamble) text += `${snapshot.preamble}\n\n`;
    for (const section of selected) {
      if (text.length >= maxChars) break;
      const remaining = maxChars - text.length;
      const chunk = `${section.body}\n\n`;
      text += chunk.slice(0, Math.max(0, remaining));
    }

    return {
      available: snapshot.available,
      stale: snapshot.stale,
      version: snapshot.version,
      text,
    };
  }

  /** Returns full text for local, non-LLM fallback answers. Never send to visitors. */
  getPlainTextForFallback() {
    const snapshot = this.ensureFresh();
    if (!snapshot.available && !snapshot.stale) return "";
    return snapshot.sections.map((section) => section.body).join("\n\n");
  }
}

module.exports = { KnowledgeBase, parseSections, tokenize, MAX_KNOWLEDGE_BYTES };
