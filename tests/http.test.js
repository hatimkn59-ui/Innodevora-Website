"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { startTestApp, parseSse, createClient } = require("./helpers");
const { hashPassword } = require("../server/security");
const { DAY_MS } = require("../server/db");

function assertNoCors(headers) {
  assert.equal(headers.get("access-control-allow-origin"), null);
  assert.equal(headers.get("access-control-allow-credentials"), null);
}

async function bootstrap(client) {
  const response = await client.request("/api/chat/bootstrap");
  assert.equal(response.status, 200);
  const body = response.json();
  return { response, body, csrf: body.csrfToken };
}

async function sendChat(client, csrf, message) {
  const response = await client.post(
    "/api/chat",
    { message },
    { "x-csrf-token": csrf }
  );
  const events = parseSse(response.text);
  const done = events.find((event) => event.event === "done");
  assert.ok(done, `expected a done event, got: ${response.text.slice(0, 300)}`);
  return { response, events, done: done.data };
}

test("chat, consent, withdrawal, reset and deletion work end to end", async () => {
  const context = await startTestApp();
  const { app, client } = context;
  try {
    const bootResponse = await client.request("/api/chat/bootstrap");
    assert.equal(bootResponse.status, 200);
    assertNoCors(bootResponse.headers);
    const setCookies = bootResponse.headers.getSetCookie().join("; ");
    assert.match(setCookies, /ndv_visitor=/);
    assert.match(setCookies, /ndv_session=/);
    assert.match(setCookies, /HttpOnly/);
    assert.match(setCookies, /SameSite=Strict/);

    const boot = bootResponse.json();
    assert.equal(boot.aiMode, "demo");
    assert.equal(boot.consentStatus, false);
    assert.deepEqual(boot.messages, []);
    assert.equal(boot.privacy.noticeUrl, "/privacy/");
    assert.ok(boot.privacy.retentionDays >= 1);
    assert.ok(boot.csrfToken.length >= 20);
    assert.ok(boot.suggestedQuestions.length >= 3);
    assert.equal(typeof boot.maxMessageChars, "number");
    assert.equal(boot.knowledge.available, true);
    assert.equal(Object.prototype.hasOwnProperty.call(boot, "knowledgeText"), false);

    const csrf = boot.csrfToken;

    const csrfFailure = await client.post("/api/chat", { message: "Hello" });
    assert.equal(csrfFailure.status, 403);
    assert.equal(csrfFailure.json().code, "CSRF_REJECTED");

    const crossOrigin = await client.request("/api/chat/consent", {
      method: "POST",
      headers: { origin: "https://evil.example", "x-csrf-token": csrf },
      body: { consent: true },
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal(crossOrigin.json().code, "ORIGIN_REJECTED");

    const first = await sendChat(
      client,
      csrf,
      "I need a website for my bakery. My email is jane@example.com and my budget is €5k. We hope to launch next month."
    );
    assert.equal(first.response.status, 200);
    assert.equal(first.done.mode, "demo");
    assert.equal(first.done.consentRequested, false);
    assert.ok(
      first.events.filter((event) => event.event === "delta").length > 0,
      "demo mode should stream visible deltas"
    );

    const visitorId = boot.profile.visitorId;
    let visitor = app.db
      .prepare("SELECT * FROM visitors WHERE id = ?")
      .get(visitorId);
    assert.equal(visitor.email, null);
    assert.equal(visitor.name, null);
    assert.ok(visitor.lead_score > 0);
    assert.equal(visitor.consent_status, 0);

    let messages = app.db
      .prepare("SELECT role, content, redacted FROM messages WHERE visitor_id = ? ORDER BY id")
      .all(visitorId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].redacted, 1);
    assert.doesNotMatch(messages[0].content, /jane@example\.com/i);
    assert.match(messages[0].content, /\[email hidden until consent\]/);

    const second = await sendChat(client, csrf, "Can you build it?");
    assert.equal(second.done.consentRequested, true);
    const prompted = app.db
      .prepare("SELECT consent_prompted FROM conversations WHERE visitor_id = ?")
      .get(visitorId);
    assert.equal(prompted.consent_prompted, 1);

    const consent = await client.post(
      "/api/chat/consent",
      { consent: true },
      { "x-csrf-token": csrf }
    );
    assert.equal(consent.status, 200);
    assert.equal(consent.json().consentStatus, true);

    const third = await sendChat(
      client,
      csrf,
      "My email is jane@example.com and I would like a quote for the bakery website."
    );
    assert.equal(third.done.consentStatus, true);
    visitor = app.db.prepare("SELECT * FROM visitors WHERE id = ?").get(visitorId);
    assert.equal(visitor.email, "jane@example.com");
    assert.equal(visitor.consent_status, 1);
    assert.equal(visitor.lead_status, "quote_requested");

    const withdraw = await client.post(
      "/api/chat/consent",
      { consent: false },
      { "x-csrf-token": csrf }
    );
    assert.equal(withdraw.status, 200);
    assert.equal(withdraw.json().consentStatus, false);
    visitor = app.db.prepare("SELECT * FROM visitors WHERE id = ?").get(visitorId);
    assert.equal(visitor.email, null);
    assert.equal(visitor.name, null);
    assert.equal(visitor.company, null);
    assert.equal(visitor.consent_status, 0);
    assert.notEqual(visitor.lead_status, "quote_requested");

    messages = app.db
      .prepare("SELECT content FROM messages WHERE visitor_id = ?")
      .all(visitorId);
    for (const message of messages) {
      assert.doesNotMatch(message.content, /jane@example\.com/i);
    }

    const reset = await client.post(
      "/api/chat/reset",
      {},
      { "x-csrf-token": csrf }
    );
    assert.equal(reset.status, 200);
    const resetBody = reset.json();
    assert.equal(resetBody.bootstrap.messages.length, 0);
    assert.notEqual(resetBody.bootstrap.conversationId, boot.conversationId);
    assert.equal(resetBody.bootstrap.csrfToken, csrf);

    const deletion = await client.post(
      "/api/chat/delete-data",
      {},
      { "x-csrf-token": csrf }
    );
    assert.equal(deletion.status, 200);
    const deletionBody = deletion.json();
    assert.equal(deletionBody.deleted, true);
    assert.notEqual(deletionBody.bootstrap.profile.visitorId, visitorId);
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS n FROM visitors WHERE id = ?").get(visitorId).n,
      0
    );
    assert.ok(deletionBody.bootstrap.csrfToken);

    const afterDelete = await client.request("/api/chat/bootstrap");
    assert.equal(afterDelete.status, 200);
    assert.equal(afterDelete.json().messages.length, 0);
  } finally {
    await context.close();
  }
});

test("static protection, privacy pages and admin authentication are enforced", async () => {
  const context = await startTestApp();
  const { app, client } = context;
  try {
    for (const pathname of [
      "/knowledge/INNODEVORA.md",
      "/server/app.js",
      "/data/test.db",
      "/.env",
      "/tests/helpers.js",
      "/package.json",
    ]) {
      const response = await client.request(pathname);
      assert.equal(response.status, 404, pathname);
    }

    const health = await client.request("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.json().ok, true);
    assertNoCors(health.headers);

    const privacy = await client.request("/privacy/");
    assert.equal(privacy.status, 200);
    assert.match(privacy.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(privacy.text, /Privacy, in/);
    assert.match(privacy.text, /contact@innodevora\.com/);

    const legal = await client.request("/mentions-legales/");
    assert.equal(legal.status, 200);
    assert.match(legal.text, /AI assistant/i);

    const adminPage = await client.request("/admin/");
    assert.equal(adminPage.status, 200);
    assert.match(adminPage.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(adminPage.headers.get("cache-control"), /no-store/);
    assert.match(adminPage.text, /Innodevora/);

    const redirect = await client.request("/admin");
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), "/admin/");

    const unauthorized = await client.request("/api/admin/leads");
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.json().code, "AUTH_REQUIRED");

    const badLogin = await client.post("/api/admin/login", {
      username: "owner",
      password: "wrong-password",
    });
    assert.equal(badLogin.status, 401);
    assert.equal(badLogin.json().code, "LOGIN_FAILED");

    const login = await client.post("/api/admin/login", {
      username: "owner",
      password: "correct horse battery staple",
    });
    assert.equal(login.status, 200);
    const loginBody = login.json();
    assert.equal(loginBody.admin.role, "owner");
    assert.ok(loginBody.csrfToken.length >= 20);
    assert.match(login.headers.getSetCookie().join("; "), /ndv_admin=/);
    assert.match(login.headers.getSetCookie().join("; "), /HttpOnly/);

    const me = await client.request("/api/admin/me");
    assert.equal(me.status, 200);
    assert.equal(me.json().admin.role, "owner");

    // Create a real lead through the public API so the dashboard has data.
    const chatClient = createClient(context.baseUrl);
    const chatBoot = await bootstrap(chatClient);
    await sendChat(
      chatClient,
      chatBoot.csrf,
      "I need a SaaS dashboard for a logistics startup, budget €20k, launch in three months."
    );

    const leads = await client.request("/api/admin/leads?sort=score&limit=10");
    assert.equal(leads.status, 200);
    const leadsBody = leads.json();
    assert.equal(leadsBody.total, 1);
    assert.equal(leadsBody.items.length, 1);
    assert.equal(leadsBody.items[0].token_hash, undefined);
    assert.ok(leadsBody.items[0].lead_score > 0);

    const leadId = leadsBody.items[0].id;
    const detail = await client.request(`/api/admin/visitors/${leadId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.json().visitor.token_hash, undefined);
    assert.ok(detail.json().messages.length >= 2);

    const update = await client.request(`/api/admin/visitors/${leadId}`, {
      method: "PATCH",
      headers: { "x-csrf-token": loginBody.csrfToken, origin: context.baseUrl },
      body: { status: "contacted" },
    });
    assert.equal(update.status, 200);
    assert.equal(update.json().visitor.lead_status, "contacted");

    const exportResponse = await client.request("/api/admin/export.csv");
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type"), /text\/csv/);
    assert.match(exportResponse.headers.get("content-disposition"), /attachment/);
    assert.match(exportResponse.text, /^\uFEFF?visitor_id,/);
    assert.doesNotMatch(exportResponse.text, /token_hash/);
    assert.match(exportResponse.text, /contacted/);

    const retention = await client.request("/api/admin/settings/retention", {
      method: "PATCH",
      headers: { "x-csrf-token": loginBody.csrfToken, origin: context.baseUrl },
      body: { visitorDays: 30, conversationDays: 60 },
    });
    assert.equal(retention.status, 200);
    assert.deepEqual(retention.json().retention, {
      visitorDays: 30,
      conversationDays: 60,
    });

    const overview = await client.request("/api/admin/overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.json().retention.visitorDays, 30);
    assert.equal(overview.json().retention.conversationDays, 60);

    const audit = await client.request("/api/admin/audit");
    assert.equal(audit.status, 200);
    const actions = audit.json().items.map((item) => item.action);
    assert.ok(actions.includes("admin.login_success"));
    assert.ok(actions.includes("admin.lead_status_updated"));
    assert.ok(actions.includes("admin.leads_exported"));

    // A viewer can read leads but cannot mutate or export them.
    const viewerId = crypto.randomUUID();
    app.db
      .prepare(
        `INSERT INTO admin_users (id, username, password_hash, role, disabled, created_at)
         VALUES (?, ?, ?, 'viewer', 0, ?)`
      )
      .run(
        viewerId,
        "viewer",
        hashPassword("viewer-password-123"),
        new Date().toISOString()
      );
    const viewerClient = createClient(context.baseUrl);
    const viewerLogin = await viewerClient.post("/api/admin/login", {
      username: "viewer",
      password: "viewer-password-123",
    });
    assert.equal(viewerLogin.status, 200);
    const viewerCsrf = viewerLogin.json().csrfToken;
    const viewerLeads = await viewerClient.request("/api/admin/leads");
    assert.equal(viewerLeads.status, 200);
    const viewerPatch = await viewerClient.request(`/api/admin/visitors/${leadId}`, {
      method: "PATCH",
      headers: { "x-csrf-token": viewerCsrf, origin: context.baseUrl },
      body: { status: "won" },
    });
    assert.equal(viewerPatch.status, 403);
    const viewerExport = await viewerClient.request("/api/admin/export.csv");
    assert.equal(viewerExport.status, 403);
    const viewerRetention = await viewerClient.request(
      "/api/admin/settings/retention",
      {
        method: "PATCH",
        headers: { "x-csrf-token": viewerCsrf, origin: context.baseUrl },
        body: { visitorDays: 2, conversationDays: 2 },
      }
    );
    assert.equal(viewerRetention.status, 403);

    const deleteLead = await client.request(`/api/admin/visitors/${leadId}`, {
      method: "DELETE",
      headers: { "x-csrf-token": loginBody.csrfToken, origin: context.baseUrl },
    });
    assert.equal(deleteLead.status, 200);
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS n FROM visitors WHERE id = ?").get(leadId).n,
      0
    );

    const logout = await client.post(
      "/api/admin/logout",
      {},
      { "x-csrf-token": loginBody.csrfToken }
    );
    assert.equal(logout.status, 200);
    const afterLogout = await client.request("/api/admin/me");
    assert.equal(afterLogout.status, 401);
  } finally {
    await context.close();
  }
});

test("chat rate limits return a retryable 429", async () => {
  const context = await startTestApp({
    env: {
      RATE_LIMIT_PER_MINUTE: "2",
      RATE_LIMIT_PER_HOUR: "20",
    },
  });
  const { client } = context;
  try {
    const boot = await bootstrap(client);
    await sendChat(client, boot.csrf, "I need a website for a bakery.");
    await sendChat(client, boot.csrf, "Can you build it?");
    const blocked = await client.post(
      "/api/chat",
      { message: "One more question" },
      { "x-csrf-token": boot.csrf }
    );
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json().code, "RATE_LIMITED");
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  } finally {
    await context.close();
  }
});

test("admin login attempts are rate limited", async () => {
  const context = await startTestApp({
    env: { ADMIN_LOGIN_ATTEMPTS: "2" },
  });
  const { client } = context;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.post("/api/admin/login", {
        username: "owner",
        password: "wrong-password",
      });
      assert.equal(response.status, 401);
    }
    const blocked = await client.post("/api/admin/login", {
      username: "owner",
      password: "wrong-password",
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  } finally {
    await context.close();
  }
});

test("retention purges old conversations and visitors regardless of consent", async () => {
  const context = await startTestApp();
  const { app, config } = context;
  try {
    const old = new Date(Date.now() - 400 * DAY_MS).toISOString();
    const visitorId = crypto.randomUUID();
    const conversationId = crypto.randomUUID();
    app.db
      .prepare(
        `INSERT INTO visitors
          (id, token_hash, name, email, consent_status, lead_status, first_seen, last_seen)
         VALUES (?, ?, ?, ?, 1, 'qualified', ?, ?)`
      )
      .run(visitorId, `hash-${visitorId}`, "Old Lead", "old@example.com", old, old);
    app.db
      .prepare(
        `INSERT INTO conversations (id, visitor_id, status, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`
      )
      .run(conversationId, visitorId, old, old);
    app.db
      .prepare(
        `INSERT INTO messages (conversation_id, visitor_id, role, content, created_at)
         VALUES (?, ?, 'user', 'old message', ?)`
      )
      .run(conversationId, visitorId, old);

    const result = app.db
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE id = ?")
      .get(conversationId);
    assert.equal(result.n, 1);

    const { cleanupExpired } = require("../server/db");
    const cleanup = cleanupExpired(app.db, config);
    assert.equal(cleanup.oldConversations, 1);
    assert.equal(cleanup.oldVisitors, 1);
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS n FROM visitors WHERE id = ?").get(visitorId).n,
      0
    );
    assert.equal(
      app.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE visitor_id = ?").get(visitorId).n,
      0
    );
  } finally {
    await context.close();
  }
});
