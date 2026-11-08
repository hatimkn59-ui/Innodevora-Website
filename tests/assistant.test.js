"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

const { startTestApp, createClient, parseSse } = require("./helpers");
const { hashPassword } = require("../server/security");

function authHeaders(csrf, origin) {
  return { "x-csrf-token": csrf, origin };
}

test("assistant settings pause the widget, persist instructions and expose usage", async () => {
  const context = await startTestApp();
  const { app, client, baseUrl } = context;
  try {
    const login = await client.post("/api/admin/login", {
      username: "owner",
      password: "correct horse battery staple",
    });
    assert.equal(login.status, 200);
    const csrf = login.json().csrfToken;

    const anonymous = createClient(baseUrl);
    const unauthorized = await anonymous.request("/api/admin/assistant");
    assert.equal(unauthorized.status, 401);

    const initial = await client.request("/api/admin/assistant");
    assert.equal(initial.status, 200);
    assert.equal(initial.json().settings.enabled, true);
    assert.ok(initial.json().settings.suggestedQuestions.length >= 3);
    assert.equal(initial.json().usage.total, 0);

    const paused = await client.request("/api/admin/assistant", {
      method: "PATCH",
      headers: authHeaders(csrf, baseUrl),
      body: {
        enabled: false,
        welcome: "Welcome to the paused assistant.",
        customInstructions: "Emphasize AI assistants and SaaS work.",
        suggestedQuestions: ["What do you build?", "How do I start?"],
      },
    });
    assert.equal(paused.status, 200);
    assert.equal(paused.json().settings.enabled, false);
    assert.equal(paused.json().settings.customInstructions, "Emphasize AI assistants and SaaS work.");

    const chatClient = createClient(baseUrl);
    const disabledBoot = await chatClient.request("/api/chat/bootstrap");
    assert.equal(disabledBoot.status, 200);
    assert.equal(disabledBoot.json().assistantEnabled, false);
    assert.equal(disabledBoot.json().aiMode, "disabled");
    assert.match(disabledBoot.json().welcome, /paused/i);
    assert.deepEqual(disabledBoot.json().suggestedQuestions, [
      "What do you build?",
      "How do I start?",
    ]);

    const disabledSend = await chatClient.post(
      "/api/chat",
      { message: "Hello" },
      { "x-csrf-token": disabledBoot.json().csrfToken }
    );
    assert.equal(disabledSend.status, 503);
    assert.equal(disabledSend.json().code, "CHATBOT_DISABLED");

    const enabled = await client.request("/api/admin/assistant", {
      method: "PATCH",
      headers: authHeaders(csrf, baseUrl),
      body: {
        enabled: true,
        welcome: "Hello from the Innodevora Assistant.",
        customInstructions: "Ask about the visitor's launch date before discussing budget.",
        suggestedQuestions: ["What does Innodevora do?", "Can you build an AI assistant?"],
      },
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.json().settings.enabled, true);

    const activeBoot = await chatClient.request("/api/chat/bootstrap");
    assert.equal(activeBoot.status, 200);
    assert.equal(activeBoot.json().assistantEnabled, true);
    assert.equal(activeBoot.json().aiMode, "demo");
    assert.equal(activeBoot.json().welcome, "Hello from the Innodevora Assistant.");
    assert.deepEqual(activeBoot.json().suggestedQuestions, [
      "What does Innodevora do?",
      "Can you build an AI assistant?",
    ]);

    const chat = await chatClient.post(
      "/api/chat",
      { message: "I need a website for my bakery." },
      { "x-csrf-token": activeBoot.json().csrfToken }
    );
    assert.equal(chat.status, 200);
    const events = parseSse(chat.text);
    assert.ok(events.some((event) => event.event === "done"));

    const usage = await client.request("/api/admin/assistant");
    assert.equal(usage.status, 200);
    assert.ok(usage.json().usage.total >= 1);
    assert.ok(usage.json().usage.success >= 1);
    assert.ok(usage.json().recentConversations.length >= 1);
    assert.equal(usage.json().recentConversations[0].token_hash, undefined);

    const audit = await client.request("/api/admin/audit");
    const actions = audit.json().items.map((item) => item.action);
    assert.ok(actions.includes("admin.assistant_settings_updated"));

    const invalid = await client.request("/api/admin/assistant", {
      method: "PATCH",
      headers: authHeaders(csrf, baseUrl),
      body: {
        enabled: true,
        welcome: "",
        customInstructions: "",
        suggestedQuestions: [],
      },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json().code, "INVALID_ASSISTANT_SETTINGS");

    const viewerClient = createClient(baseUrl);
    app.db
      .prepare(
        `INSERT INTO admin_users (id, username, password_hash, role, disabled, created_at)
         VALUES (?, ?, ?, 'viewer', 0, ?)`
      )
      .run(
        crypto.randomUUID(),
        "assistant-viewer",
        hashPassword("viewer-password-123"),
        new Date().toISOString()
      );
    const viewerLogin = await viewerClient.post("/api/admin/login", {
      username: "assistant-viewer",
      password: "viewer-password-123",
    });
    assert.equal(viewerLogin.status, 200);
    const viewerRead = await viewerClient.request("/api/admin/assistant");
    assert.equal(viewerRead.status, 200);
    const viewerWrite = await viewerClient.request("/api/admin/assistant", {
      method: "PATCH",
      headers: authHeaders(viewerLogin.json().csrfToken, baseUrl),
      body: {
        enabled: false,
        welcome: "Viewer cannot change this.",
        customInstructions: "",
        suggestedQuestions: [],
      },
    });
    assert.equal(viewerWrite.status, 403);
    assert.equal(viewerWrite.json().code, "FORBIDDEN");
  } finally {
    await context.close();
  }
});

test("live provider receives owner instructions and records successful usage", async () => {
  let captured = null;
  const provider = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Innodevora builds " } }] })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "digital products." } }] })}\n\n`
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerPort = provider.address().port;
  const context = await startTestApp({
    env: {
      NODE_ENV: "test",
      AI_KEYLESS_DEMO: "false",
      AI_API_KEY: "test-provider-key",
      AI_API_URL: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
      AI_STREAM_DELAY_MS: "0",
    },
  });
  try {
    const { client, baseUrl } = context;
    const login = await client.post("/api/admin/login", {
      username: "owner",
      password: "correct horse battery staple",
    });
    assert.equal(login.status, 200);
    const csrf = login.json().csrfToken;

    const patch = await client.request("/api/admin/assistant", {
      method: "PATCH",
      headers: authHeaders(csrf, baseUrl),
      body: {
        enabled: true,
        welcome: "Hello from the Innodevora Assistant.",
        customInstructions: "Mention the AI assistant service when it is relevant.",
        suggestedQuestions: ["What do you build?"],
      },
    });
    assert.equal(patch.status, 200);

    const chatClient = createClient(baseUrl);
    const boot = await chatClient.request("/api/chat/bootstrap");
    assert.equal(boot.status, 200);
    assert.equal(boot.json().aiMode, "live");
    const chat = await chatClient.post(
      "/api/chat",
      { message: "What does Innodevora build?" },
      { "x-csrf-token": boot.json().csrfToken }
    );
    assert.equal(chat.status, 200);
    assert.match(chat.text, /Innodevora builds digital products\./);
    const events = parseSse(chat.text);
    assert.ok(events.some((event) => event.event === "done"));

    assert.ok(captured);
    assert.equal(captured.model, "gpt-4.1-mini");
    assert.match(captured.messages[0].content, /Owner-approved additional instructions/);
    assert.match(captured.messages[0].content, /Mention the AI assistant service/);
    assert.match(captured.messages[0].content, /Never invent prices/);
    assert.equal(
      captured.messages.some((message) => String(message.content).includes("test-provider-key")),
      false
    );

    const assistant = await client.request("/api/admin/assistant");
    assert.equal(assistant.status, 200);
    assert.equal(assistant.json().usage.success, 1);
    assert.equal(assistant.json().usage.errors, 0);
    assert.equal(assistant.json().usage.fallback, 0);

    const logout = await client.post("/api/admin/logout", {}, { "x-csrf-token": csrf });
    assert.equal(logout.status, 200);
    const me = await client.request("/api/admin/me");
    assert.equal(me.status, 401);
  } finally {
    await context.close();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("live provider metadata is saved as a consented lead visible to admins", async () => {
  let captured = null;
  const provider = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured = JSON.parse(body);
      const systemPrompt = captured.messages[0].content;
      const nonceMatch = systemPrompt.match(/\[\[NDV_META:([a-f0-9]{16,}):/i);
      assert.ok(nonceMatch, "the system prompt must contain the metadata nonce");
      const nonce = nonceMatch[1];
      const metadata = {
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        preferred_language: "en",
        project_type: "Web platform",
        project_description: "A secure client portal for analytics.",
        budget_range: "EUR 20k-30k",
        timeline: "Q2 2027",
        conversation_summary:
          "Ada Lovelace at Analytical Engines needs a secure client portal for analytics.",
      };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content:
                  "Thanks, Ada. I have saved your project details for the Innodevora team.",
              },
            },
          ],
        })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                content: `\n\n[[NDV_META:${nonce}:${JSON.stringify(metadata)}]]`,
              },
            },
          ],
        })}\n\n`
      );
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerPort = provider.address().port;
  const context = await startTestApp({
    env: {
      NODE_ENV: "test",
      AI_KEYLESS_DEMO: "false",
      AI_API_KEY: "test-provider-key",
      AI_API_URL: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
      AI_STREAM_DELAY_MS: "0",
    },
  });
  try {
    const { baseUrl } = context;
    const chatClient = createClient(baseUrl);
    const boot = await chatClient.request("/api/chat/bootstrap");
    assert.equal(boot.status, 200);
    const csrf = boot.json().csrfToken;
    const consent = await chatClient.post(
      "/api/chat/consent",
      { consent: true },
      { "x-csrf-token": csrf }
    );
    assert.equal(consent.status, 200);
    assert.equal(consent.json().consentStatus, true);

    const chat = await chatClient.post(
      "/api/chat",
      {
        message:
          "I am Ada from Analytical Engines. We need a secure client portal for analytics. Our budget is EUR 20k-30k and we want to launch in Q2 2027. My email is ada@example.com.",
      },
      { "x-csrf-token": csrf }
    );
    assert.equal(chat.status, 200);
    const events = parseSse(chat.text);
    const visible = events
      .filter((event) => event.event === "delta")
      .map((event) => event.data?.text || "")
      .join("");
    assert.match(visible, /saved your project details/);
    assert.doesNotMatch(visible, /NDV_META/);

    assert.ok(captured);
    assert.match(captured.messages[0].content, /CONSENTED/);
    assert.equal(captured.messages.at(-1).content.includes("Ada"), true);

    const adminClient = createClient(baseUrl);
    const login = await adminClient.post("/api/admin/login", {
      username: "owner",
      password: "correct horse battery staple",
    });
    assert.equal(login.status, 200);
    const leads = await adminClient.request(
      `/api/admin/leads?search=${encodeURIComponent("ada@example.com")}`
    );
    assert.equal(leads.status, 200);
    assert.equal(leads.json().total, 1);
    const lead = leads.json().items[0];
    assert.equal(lead.name, "Ada Lovelace");
    assert.equal(lead.email, "ada@example.com");
    assert.equal(lead.company, "Analytical Engines");
    assert.equal(lead.project_type, "Web platform");
    assert.equal(lead.project_description, "A secure client portal for analytics.");
    assert.equal(lead.budget_range, "EUR 20k-30k");
    assert.equal(lead.timeline, "Q2 2027");
    assert.equal(lead.consent_status, true);
    assert.equal(lead.preferred_language, "en");
    assert.ok(lead.lead_score > 0);

    const detail = await adminClient.request(
      `/api/admin/visitors/${encodeURIComponent(lead.id)}`
    );
    assert.equal(detail.status, 200);
    assert.equal(detail.json().visitor.email, "ada@example.com");
    assert.ok(
      detail.json().messages.some(
        (message) =>
          message.role === "user" && message.content.includes("Analytical Engines")
      )
    );
  } finally {
    await context.close();
    await new Promise((resolve) => provider.close(resolve));
  }
});

test("provider failures fall back safely and record error metadata", async () => {
  const provider = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "upstream unavailable",
          secret: "must-not-reach-the-visitor",
        })
      );
    });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerPort = provider.address().port;
  const context = await startTestApp({
    env: {
      NODE_ENV: "test",
      AI_KEYLESS_DEMO: "false",
      AI_API_KEY: "test-provider-key",
      AI_API_URL: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
      AI_STREAM_DELAY_MS: "0",
    },
  });
  try {
    const { client, baseUrl } = context;
    const login = await client.post("/api/admin/login", {
      username: "owner",
      password: "correct horse battery staple",
    });
    assert.equal(login.status, 200);

    const chatClient = createClient(baseUrl);
    const boot = await chatClient.request("/api/chat/bootstrap");
    assert.equal(boot.status, 200);
    assert.equal(boot.json().aiMode, "live");
    const chat = await chatClient.post(
      "/api/chat",
      { message: "Do you offer a two-week delivery guarantee?" },
      { "x-csrf-token": boot.json().csrfToken }
    );
    assert.equal(chat.status, 200);
    const events = parseSse(chat.text);
    assert.ok(events.some((event) => event.event === "done"));
    assert.doesNotMatch(chat.text, /must-not-reach-the-visitor/);
    assert.doesNotMatch(chat.text, /upstream unavailable/);

    const assistant = await client.request("/api/admin/assistant");
    assert.equal(assistant.status, 200);
    assert.equal(assistant.json().usage.total, 1);
    assert.equal(assistant.json().usage.fallback, 1);
    assert.equal(assistant.json().usage.errors, 0);
    assert.equal(assistant.json().usage.recentErrors.length, 1);
    assert.equal(
      assistant.json().usage.recentErrors[0].errorCode,
      "AI_PROVIDER_ERROR"
    );
  } finally {
    await context.close();
    await new Promise((resolve) => provider.close(resolve));
  }
});
