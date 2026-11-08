"use strict";

const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const { openDatabase, cleanupExpired, audit, recordAiUsage, getAiUsage } = require("./db");
const { KnowledgeBase } = require("./knowledge");
const { AiService } = require("./ai");
const { getAssistantSettings, updateAssistantSettings } = require("./assistant-settings");
const {
  ensureVisitorContext,
  getVisitorContext,
  getAdminContext,
} = require("./sessions");
const {
  buildBootstrapPayload,
  sendMessage,
  setConsent,
  resetConversation,
  eraseVisitor,
} = require("./chat-service");
const {
  login,
  logout,
  listLeads,
  getVisitorDetail,
  updateLeadStatus,
  deleteLead,
  exportCsv,
  listAudit,
  overview,
  updateRetention,
  purge,
} = require("./admin-service");
const { consumeRateLimit } = require("./rate-limit");
const {
  assertSameOrigin,
  safeEqual,
  hashIp,
  normalizeText,
  parseCookies,
} = require("./security");
const { serveStatic } = require("./static");

const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function commonHeaders(config, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (config.siteOrigin.startsWith("https://")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function setPageHeaders(config, res, { admin = false, api = false } = {}) {
  commonHeaders(config, res);
  res.setHeader("Content-Security-Policy", api ? API_CSP : admin ? ADMIN_CSP : SITE_CSP);
  if (api || admin) res.setHeader("Cache-Control", "no-store, max-age=0");
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message, extraHeaders = {}) {
  sendJson(res, status, { error: message, code }, extraHeaders);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function readJsonBody(req, { maxBytes = 32768 } = {}) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.toLowerCase().includes("application/json")) {
      const error = new Error("Content-Type must be application/json.");
      error.status = 415;
      error.code = "UNSUPPORTED_MEDIA_TYPE";
      reject(error);
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Body must be a JSON object.");
        }
        resolve(parsed);
      } catch {
        const error = new Error("Invalid JSON body.");
        error.status = 400;
        error.code = "INVALID_JSON";
        reject(error);
      }
    });
    req.on("error", (error) => reject(error));
  });
}

function requireOrigin(req) {
  if (!assertSameOrigin(req)) {
    const error = new Error("Cross-origin request rejected.");
    error.status = 403;
    error.code = "ORIGIN_REJECTED";
    throw error;
  }
}

function requireCsrf(req, expected) {
  const provided = String(req.headers["x-csrf-token"] || "");
  if (!provided || !safeEqual(provided, expected)) {
    const error = new Error("Invalid security token. Refresh the page and try again.");
    error.status = 403;
    error.code = "CSRF_REJECTED";
    throw error;
  }
}

function rateLimitError(result) {
  const error = new Error("Too many requests. Please wait and try again.");
  error.status = 429;
  error.code = "RATE_LIMITED";
  error.retryAfter = result.retryAfterSeconds;
  return error;
}

function startSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

function writeSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function formatRequestLog(req) {
  const url = new URL(req.url, "http://local");
  return `${req.method} ${url.pathname}`;
}

function createApp({ config, logger = console }) {
  const db = openDatabase(config);
  const knowledge = new KnowledgeBase({ filePath: config.knowledgePath, logger });
  const aiService = new AiService({
    config,
    knowledge,
    logger,
    onUsage: (event) => recordAiUsage(db, event),
  });

  try {
    cleanupExpired(db, config);
  } catch (error) {
    logger.warn?.(`[startup] retention cleanup skipped: ${error.message}`);
  }
  const cleanupTimer = setInterval(() => {
    try {
      cleanupExpired(db, config);
    } catch (error) {
      logger.warn?.(`[retention] cleanup failed: ${error.message}`);
    }
  }, 60 * 60 * 1000);
  cleanupTimer.unref?.();

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);
    const method = String(req.method || "").toUpperCase();
    let pathname = "/";
    let lowerPath = "/";
    try {
      const requestUrl = new URL(req.url, "http://local");
      pathname = requestUrl.pathname;
      lowerPath = pathname.toLowerCase();
      const isAdminPage = lowerPath === "/admin" || lowerPath.startsWith("/admin/");
      const isApi = lowerPath.startsWith("/api/");

      // Render a usable 404 for unknown API routes and protect the internal
      // source, knowledge and runtime-data directories from the static server.
      if (isApi) {
        setPageHeaders(config, res, { api: true });
        await handleApi({ req, res, method, pathname, requestUrl, config, db, knowledge, aiService, requestId, logger });
        logger.debug?.(`${formatRequestLog(req)} ${res.statusCode} ${Date.now() - started}ms`);
        return;
      }

      if (method !== "GET" && method !== "HEAD") {
        setPageHeaders(config, res);
        sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
        return;
      }

      if (lowerPath === "/admin") {
        setPageHeaders(config, res, { admin: true });
        redirect(res, "/admin/", 308);
        return;
      }

      if (isAdminPage) {
        setPageHeaders(config, res, { admin: true });
        const adminRoot = path.join(config.root, "admin");
        serveStatic(req, res, {
          root: adminRoot,
          pathname: pathname.replace(/^\/admin\/?/i, "/"),
          noStore: true,
        });
        logger.debug?.(`${formatRequestLog(req)} ${res.statusCode} ${Date.now() - started}ms`);
        return;
      }

      setPageHeaders(config, res);
      serveStatic(req, res, { root: config.root, pathname });
      logger.debug?.(`${formatRequestLog(req)} ${res.statusCode} ${Date.now() - started}ms`);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        logger.error?.(`[${requestId}] ${formatRequestLog(req)}: ${error.stack || error.message}`);
      }
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (lowerPath.startsWith("/api/")) {
        setPageHeaders(config, res, { api: true });
        if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
        sendError(
          res,
          status,
          error.code || "INTERNAL_ERROR",
          status >= 500 ? "Something went wrong. Please try again." : error.message
        );
      } else {
        setPageHeaders(config, res);
        sendError(res, status, error.code || "INTERNAL_ERROR", status >= 500 ? "Something went wrong." : error.message);
      }
    }
  });

  server.on("clientError", (error, socket) => {
    if (!socket.writable) return;
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  async function handleApi({
    req,
    res,
    method,
    pathname,
    requestUrl,
    config,
    db,
    knowledge,
    aiService,
    requestId,
    logger,
  }) {
    // CSRF/Origin protection is applied to all state-changing API requests.
    // GET endpoints are still protected by SameSite=Strict session cookies and
    // no CORS response headers.
    if (method !== "GET" && method !== "HEAD") requireOrigin(req);

    if (pathname === "/api/health" && method === "GET") {
      const assistant = getAssistantSettings(db);
      return sendJson(res, 200, {
        ok: true,
        service: "innodevora-assistant",
        serverTime: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        assistant: { enabled: assistant.enabled },
        knowledge: knowledge.getStatus(),
        ai: aiService.status(),
      });
    }

    if (pathname === "/api/chat/bootstrap" && method === "GET") {
      const ipResult = consumeRateLimit(
        db,
        `bootstrap_ip:${hashIp(req, config)}`,
        90,
        60_000
      );
      if (!ipResult.allowed) throw rateLimitError(ipResult);
      const context = ensureVisitorContext(db, req, res, config);
      return sendJson(res, 200, buildBootstrapPayload(db, context, config, aiService, knowledge));
    }

    if (pathname === "/api/chat" && method === "POST") {
      const context = getVisitorContext(db, req, config);
      if (!context) {
        return sendError(res, 401, "SESSION_REQUIRED", "Please refresh the page to start a new chat session.");
      }
      requireCsrf(req, context.session.csrf_token);
      const assistant = getAssistantSettings(db);
      if (!assistant.enabled) {
        return sendError(
          res,
          503,
          "CHATBOT_DISABLED",
          "The assistant is temporarily paused. Please email contact@innodevora.com."
        );
      }
      const minute = consumeRateLimit(
        db,
        `chat_visitor_minute:${context.visitor.id}`,
        config.limits.perMinute,
        60_000
      );
      if (!minute.allowed) throw rateLimitError(minute);
      const hour = consumeRateLimit(
        db,
        `chat_visitor_hour:${context.visitor.id}`,
        config.limits.perHour,
        3_600_000
      );
      if (!hour.allowed) throw rateLimitError(hour);
      const ipLimit = consumeRateLimit(
        db,
        `chat_ip_minute:${hashIp(req, config)}`,
        40,
        60_000
      );
      if (!ipLimit.allowed) throw rateLimitError(ipLimit);

      const body = await readJsonBody(req, { maxBytes: 24_000 });
      const message = normalizeText(body.message, config.limits.maxMessageChars + 1);
      if (!message) {
        return sendError(res, 400, "EMPTY_MESSAGE", "Please enter a message.");
      }
      if (message.length > config.limits.maxMessageChars) {
        return sendError(
          res,
          400,
          "MESSAGE_TOO_LONG",
          `Please keep messages under ${config.limits.maxMessageChars} characters.`
        );
      }
      if (aiService.mode === "unavailable") {
        return sendError(
          res,
          503,
          "AI_UNAVAILABLE",
          "The AI assistant is not configured yet. Please email contact@innodevora.com."
        );
      }

      startSse(res);
      res.on("close", () => {
        // The response may close naturally after the done event; nothing needs
        // to be cancelled server-side because the database write is useful even
        // if the visitor navigates away.
      });

      try {
        const result = await sendMessage({
          db,
          config,
          aiService,
          knowledge,
          context,
          message,
          onDelta: (text) => writeSse(res, "delta", { text }),
        });
        writeSse(res, "done", result);
      } catch (error) {
        logger.error?.(
          `[${requestId}] chat failed for visitor ${context.visitor.id.slice(0, 8)}: ${
            error.code || error.message
          }`
        );
        writeSse(res, "error", {
          code: error.code || "CHAT_FAILED",
          message: error.partial
            ? "The connection was interrupted. Please retry your last message."
            : "I couldn't finish that answer. Please try again or email contact@innodevora.com.",
        });
      } finally {
        if (!res.writableEnded) res.end();
      }
      return;
    }

    if (pathname === "/api/chat/consent" && method === "POST") {
      const context = getVisitorContext(db, req, config);
      if (!context) {
        return sendError(res, 401, "SESSION_REQUIRED", "Please refresh the page to start a new chat session.");
      }
      requireCsrf(req, context.session.csrf_token);
      const body = await readJsonBody(req);
      if (typeof body.consent !== "boolean") {
        return sendError(res, 400, "INVALID_CONSENT", "Consent must be true or false.");
      }
      const result = setConsent({
        db,
        req,
        config,
        context,
        granted: body.consent,
      });
      db.prepare("UPDATE conversations SET consent_prompted = 1 WHERE id = ?").run(
        context.conversation.id
      );
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (pathname === "/api/chat/reset" && method === "POST") {
      const context = getVisitorContext(db, req, config);
      if (!context) {
        return sendError(res, 401, "SESSION_REQUIRED", "Please refresh the page to start a new chat session.");
      }
      requireCsrf(req, context.session.csrf_token);
      const conversation = resetConversation({ db, req, context, config });
      const bootstrap = buildBootstrapPayload(
        db,
        { ...context, conversation },
        config,
        aiService,
        knowledge
      );
      return sendJson(res, 200, { ok: true, bootstrap });
    }

    if (pathname === "/api/chat/delete-data" && method === "POST") {
      const context = getVisitorContext(db, req, config);
      if (!context) {
        return sendError(res, 401, "SESSION_REQUIRED", "Please refresh the page to start a new chat session.");
      }
      requireCsrf(req, context.session.csrf_token);
      const result = eraseVisitor({
        db,
        res,
        req,
        context,
        config,
        knowledge,
        aiService,
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    // ---------------------------------------------------------------------
    // Admin API
    // ---------------------------------------------------------------------
    if (pathname === "/api/admin/login" && method === "POST") {
      const body = await readJsonBody(req);
      const username = typeof body.username === "string" ? body.username : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!username || !password || username.length > 80 || password.length > 200) {
        return sendError(res, 400, "INVALID_CREDENTIALS", "Enter your username and password.");
      }
      const result = login({ db, req, res, config, username, password });
      if (!result.ok) {
        if (result.retryAfter) res.setHeader("Retry-After", String(result.retryAfter));
        return sendError(res, result.status, "LOGIN_FAILED", result.message || "Login failed.");
      }
      return sendJson(res, 200, {
        ok: true,
        admin: result.admin,
        csrfToken: result.csrfToken,
        knowledge: knowledge.getStatus(),
        ai: aiService.status(),
        assistant: { enabled: getAssistantSettings(db).enabled },
      });
    }

    if (pathname === "/api/admin/logout" && method === "POST") {
      const context = getAdminContext(db, req);
      if (context) requireCsrf(req, context.csrfToken);
      logout({ db, req, res, config, context });
      return sendJson(res, 200, { ok: true });
    }

    const adminContext = getAdminContext(db, req);
    if (!adminContext) {
      return sendError(res, 401, "AUTH_REQUIRED", "Please sign in to access the dashboard.");
    }

    if (pathname === "/api/admin/me" && method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        admin: adminContext.admin,
        csrfToken: adminContext.csrfToken,
        knowledge: knowledge.getStatus(),
        ai: aiService.status(),
        assistant: { enabled: getAssistantSettings(db).enabled },
      });
    }

    if (pathname === "/api/admin/assistant" && method === "GET") {
      const settings = getAssistantSettings(db);
      const recentConversations = db
        .prepare(
          `SELECT c.id, c.summary, c.updated_at,
                  v.id AS visitor_id, v.name, v.email, v.company, v.lead_status,
                  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
           FROM conversations c
           JOIN visitors v ON v.id = c.visitor_id
           WHERE c.status = 'active' AND v.deleted_at IS NULL
           ORDER BY c.updated_at DESC LIMIT 8`
        )
        .all()
        .map((row) => ({
          id: row.id,
          summary: row.summary || null,
          updatedAt: row.updated_at,
          visitorId: row.visitor_id,
          name: row.name || null,
          email: row.email || null,
          company: row.company || null,
          leadStatus: row.lead_status,
          messageCount: row.message_count,
        }));
      return sendJson(res, 200, {
        ok: true,
        settings,
        ai: aiService.status(),
        knowledge: knowledge.getStatus(),
        usage: getAiUsage(db, { hours: 24 }),
        recentConversations,
        serverTime: new Date().toISOString(),
      });
    }

    if (pathname === "/api/admin/assistant" && method === "PATCH") {
      requireCsrf(req, adminContext.csrfToken);
      if (!["owner", "admin"].includes(adminContext.admin.role)) {
        return sendError(
          res,
          403,
          "FORBIDDEN",
          "This role cannot change assistant settings."
        );
      }
      const body = await readJsonBody(req, { maxBytes: 16_384 });
      const result = updateAssistantSettings(db, body);
      if (!result.ok) {
        return sendError(
          res,
          400,
          "INVALID_ASSISTANT_SETTINGS",
          result.errors.join(" ")
        );
      }
      audit(db, {
        actorType: "admin",
        actorId: adminContext.admin.id,
        action: "admin.assistant_settings_updated",
        targetType: "settings",
        details: {
          enabled: result.settings.enabled,
          welcomeLength: result.settings.welcome.length,
          customInstructionsLength: result.settings.customInstructions.length,
          suggestedQuestionCount: result.settings.suggestedQuestions.length,
        },
        ipHash: hashIp(req, config),
      });
      return sendJson(res, 200, { ok: true, settings: result.settings });
    }

    if (pathname === "/api/admin/overview" && method === "GET") {
      return sendJson(
        res,
        200,
        overview({ db, config, aiService, knowledge, admin: adminContext.admin })
      );
    }

    if (pathname === "/api/admin/leads" && method === "GET") {
      return sendJson(res, 200, listLeads(db, requestUrl));
    }

    if (pathname === "/api/admin/audit" && method === "GET") {
      return sendJson(res, 200, listAudit(db, requestUrl));
    }

    if (pathname === "/api/admin/export.csv" && method === "GET") {
      const result = exportCsv({
        db,
        url: requestUrl,
        req,
        config,
        admin: adminContext.admin,
      });
      if (!result.ok) return sendError(res, result.status, "EXPORT_DENIED", result.message);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="innodevora-leads-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      });
      return res.end(result.csv);
    }

    if (pathname === "/api/admin/settings/retention" && method === "PATCH") {
      requireCsrf(req, adminContext.csrfToken);
      const body = await readJsonBody(req);
      const result = updateRetention({
        db,
        req,
        config,
        admin: adminContext.admin,
        visitorDays: body.visitorDays,
        conversationDays: body.conversationDays,
      });
      if (!result.ok) return sendError(res, result.status, "RETENTION_UPDATE_FAILED", result.message);
      return sendJson(res, 200, { ok: true, retention: result.retention });
    }

    if (pathname === "/api/admin/purge" && method === "POST") {
      requireCsrf(req, adminContext.csrfToken);
      const result = purge({ db, req, config, admin: adminContext.admin });
      if (!result.ok) return sendError(res, result.status, "PURGE_FAILED", result.message);
      return sendJson(res, 200, { ok: true, result: result.result });
    }

    const visitorMatch = /^\/api\/admin\/visitors\/([a-f0-9-]{36})$/.exec(pathname);
    if (visitorMatch) {
      const visitorId = visitorMatch[1];
      if (method === "GET") {
        const detail = getVisitorDetail(db, visitorId);
        if (!detail) return sendError(res, 404, "NOT_FOUND", "Visitor not found.");
        return sendJson(res, 200, { ok: true, ...detail });
      }
      if (method === "PATCH") {
        requireCsrf(req, adminContext.csrfToken);
        const body = await readJsonBody(req);
        const result = updateLeadStatus({
          db,
          req,
          config,
          admin: adminContext.admin,
          visitorId,
          status: String(body.status || ""),
        });
        if (!result.ok) return sendError(res, result.status, "UPDATE_FAILED", result.message);
        return sendJson(res, 200, { ok: true, visitor: result.visitor });
      }
      if (method === "DELETE") {
        requireCsrf(req, adminContext.csrfToken);
        const result = deleteLead({
          db,
          req,
          config,
          admin: adminContext.admin,
          visitorId,
        });
        if (!result.ok) return sendError(res, result.status, "DELETE_FAILED", result.message);
        return sendJson(res, 200, { ok: true });
      }
      return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }

    return sendError(res, 404, "NOT_FOUND", "Not found.");
  }

  function close() {
    clearInterval(cleanupTimer);
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }

  return { server, db, knowledge, aiService, close };
}

module.exports = { createApp, SITE_CSP, ADMIN_CSP };
