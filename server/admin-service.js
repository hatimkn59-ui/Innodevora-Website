"use strict";

const crypto = require("node:crypto");
const {
  audit,
  cleanupExpired,
  getRetention,
  setRetention,
  hasAdmin,
  NOW,
} = require("./db");
const {
  verifyPassword,
  hashPassword,
  hashIp,
  csvCell,
  normalizeText,
} = require("./security");
const { consumeRateLimit } = require("./rate-limit");
const { getAssistantSettings } = require("./assistant-settings");
const { ALL_STATUSES, parseProfileRow } = require("./profile");
const {
  createAdminSession,
  getAdminContext,
  deleteAdminSession,
  clearAdminCookie,
} = require("./sessions");

const DUMMY_HASH = hashPassword("not-a-real-admin-password");

function canWrite(role) {
  return role === "owner" || role === "admin";
}

function findAdminByUsername(db, username) {
  return db
    .prepare("SELECT * FROM admin_users WHERE username = ? AND disabled = 0")
    .get(username);
}

function login({ db, req, res, config, username, password }) {
  const cleanUsername = normalizeText(username, 80);
  const ipHash = hashIp(req, config);
  const ipLimit = consumeRateLimit(
    db,
    `admin_login_ip:${ipHash}`,
    20,
    config.admin.loginWindowMs
  );
  if (!ipLimit.allowed) {
    audit(db, {
      actorType: "anonymous",
      action: "admin.login_rate_limited",
      targetType: "admin",
      details: { scope: "ip" },
      ipHash,
    });
    return { ok: false, status: 429, retryAfter: ipLimit.retryAfterSeconds };
  }
  const userLimit = consumeRateLimit(
    db,
    `admin_login_user:${ipHash}:${crypto.createHash("sha256").update(cleanUsername).digest("hex")}`,
    config.admin.loginAttempts,
    config.admin.loginWindowMs
  );
  if (!userLimit.allowed) {
    audit(db, {
      actorType: "anonymous",
      action: "admin.login_rate_limited",
      targetType: "admin",
      details: { scope: "username" },
      ipHash,
    });
    return { ok: false, status: 429, retryAfter: userLimit.retryAfterSeconds };
  }

  const user = findAdminByUsername(db, cleanUsername);
  const valid = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid) {
    audit(db, {
      actorType: "anonymous",
      action: "admin.login_failed",
      targetType: "admin",
      details: {
        usernameHash: crypto.createHash("sha256").update(cleanUsername).digest("hex").slice(0, 16),
      },
      ipHash,
    });
    return { ok: false, status: 401, message: "Invalid username or password." };
  }

  const created = createAdminSession(db, req, res, config, user);
  audit(db, {
    actorType: "admin",
    actorId: user.id,
    action: "admin.login_success",
    targetType: "admin",
    targetId: user.id,
    details: null,
    ipHash,
  });
  return {
    ok: true,
    admin: { username: user.username, role: user.role },
    csrfToken: created.csrf,
    knowledge: null,
  };
}

function logout({ db, req, res, config, context }) {
  if (context) {
    audit(db, {
      actorType: "admin",
      actorId: context.admin.id,
      action: "admin.logout",
      targetType: "admin",
      targetId: context.admin.id,
      ipHash: hashIp(req, config),
    });
  }
  deleteAdminSession(db, req);
  clearAdminCookie(res, config);
  return { ok: true };
}

function parseFilters(url) {
  const search = normalizeText(url.searchParams.get("search") || "", 120);
  const statusRaw = String(url.searchParams.get("status") || "all");
  const status = ALL_STATUSES.has(statusRaw) ? statusRaw : "all";
  const consentRaw = String(url.searchParams.get("consent") || "all");
  const consent = ["all", "1", "0"].includes(consentRaw) ? consentRaw : "all";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));
  const sortRaw = String(url.searchParams.get("sort") || "last_seen");
  const sort = ["last_seen", "first_seen", "score", "status"].includes(sortRaw)
    ? sortRaw
    : "last_seen";
  return { search, status, consent, page, limit, sort };
}

function buildLeadWhere(filters) {
  const clauses = ["v.deleted_at IS NULL"];
  const params = [];
  if (filters.search) {
    const like = `%${filters.search}%`;
    clauses.push(
      `(v.name LIKE ? COLLATE NOCASE OR v.email LIKE ? COLLATE NOCASE
        OR v.company LIKE ? COLLATE NOCASE OR v.project_type LIKE ? COLLATE NOCASE
        OR v.project_description LIKE ? COLLATE NOCASE
        OR v.conversation_summary LIKE ? COLLATE NOCASE
        OR v.role LIKE ? COLLATE NOCASE)`
    );
    params.push(like, like, like, like, like, like, like);
  }
  if (filters.status !== "all") {
    clauses.push("v.lead_status = ?");
    params.push(filters.status);
  }
  if (filters.consent !== "all") {
    clauses.push("v.consent_status = ?");
    params.push(Number(filters.consent));
  }
  return { where: clauses.join(" AND "), params };
}

function listLeads(db, url) {
  const filters = parseFilters(url);
  const { where, params } = buildLeadWhere(filters);
  const orderBy =
    filters.sort === "first_seen"
      ? "v.first_seen ASC"
      : filters.sort === "score"
        ? "v.lead_score DESC, v.last_seen DESC"
        : filters.sort === "status"
          ? "v.lead_status ASC, v.last_seen DESC"
          : "v.last_seen DESC";
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM visitors v WHERE ${where}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT v.*, (SELECT COUNT(*) FROM messages m WHERE m.visitor_id = v.id) AS message_count
       FROM visitors v
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, filters.limit, (filters.page - 1) * filters.limit);

  return {
    items: rows.map((row) => parseProfileRow(row)),
    total,
    page: filters.page,
    limit: filters.limit,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
    filters,
  };
}

function getVisitorDetail(db, visitorId) {
  const row = db
    .prepare("SELECT * FROM visitors WHERE id = ? AND deleted_at IS NULL")
    .get(visitorId);
  if (!row) return null;
  const visitor = parseProfileRow(row);
  const conversations = db
    .prepare(
      `SELECT id, status, summary, created_at, updated_at
       FROM conversations WHERE visitor_id = ? ORDER BY updated_at DESC`
    )
    .all(visitorId);
  const messages = db
    .prepare(
      `SELECT id, conversation_id, role, content, redacted, created_at
       FROM messages WHERE visitor_id = ? ORDER BY id ASC LIMIT 400`
    )
    .all(visitorId);
  const consentEvents = db
    .prepare(
      `SELECT consent_status, source, created_at FROM consent_events
       WHERE visitor_id = ? ORDER BY id DESC LIMIT 20`
    )
    .all(visitorId);
  return {
    visitor,
    conversations,
    messages: messages.map((message) => ({
      ...message,
      redacted: Boolean(message.redacted),
    })),
    consentEvents: consentEvents.map((event) => ({
      ...event,
      consent_status: Boolean(event.consent_status),
    })),
  };
}

function updateLeadStatus({ db, req, config, admin, visitorId, status }) {
  if (!canWrite(admin.role)) {
    return { ok: false, status: 403, message: "This role cannot update leads." };
  }
  if (!ALL_STATUSES.has(status)) {
    return { ok: false, status: 400, message: "Unknown lead status." };
  }
  const row = db.prepare("SELECT id FROM visitors WHERE id = ?").get(visitorId);
  if (!row) return { ok: false, status: 404, message: "Visitor not found." };
  db.prepare("UPDATE visitors SET lead_status = ? WHERE id = ?").run(status, visitorId);
  audit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.lead_status_updated",
    targetType: "visitor",
    targetId: visitorId,
    details: { status },
    ipHash: hashIp(req, config),
  });
  return { ok: true, visitor: parseProfileRow(db.prepare("SELECT * FROM visitors WHERE id = ?").get(visitorId)) };
}

function deleteLead({ db, req, config, admin, visitorId }) {
  if (!canWrite(admin.role)) {
    return { ok: false, status: 403, message: "This role cannot delete records." };
  }
  const row = db.prepare("SELECT id FROM visitors WHERE id = ?").get(visitorId);
  if (!row) return { ok: false, status: 404, message: "Visitor not found." };
  audit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.visitor_deleted",
    targetType: "visitor",
    targetId: visitorId,
    details: { source: "admin_dashboard" },
    ipHash: hashIp(req, config),
  });
  db.prepare("DELETE FROM visitors WHERE id = ?").run(visitorId);
  return { ok: true };
}

function exportCsv({ db, url, req, config, admin }) {
  if (!canWrite(admin.role)) {
    return { ok: false, status: 403, message: "This role cannot export lead data." };
  }
  const filters = parseFilters(url);
  filters.limit = 100000;
  const { where, params } = buildLeadWhere(filters);
  const rows = db
    .prepare(
      `SELECT v.*, (SELECT COUNT(*) FROM messages m WHERE m.visitor_id = v.id) AS message_count
       FROM visitors v WHERE ${where} ORDER BY v.last_seen DESC LIMIT ?`
    )
    .all(...params, filters.limit);
  const headers = [
    "visitor_id",
    "name",
    "email",
    "company",
    "role",
    "country",
    "consent",
    "lead_status",
    "lead_score",
    "project_type",
    "interests",
    "budget_range",
    "timeline",
    "first_seen",
    "last_seen",
    "message_count",
    "conversation_summary",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const parsed = parseProfileRow(row);
    lines.push(
      [
        parsed.id,
        parsed.name,
        parsed.email,
        parsed.company,
        parsed.role,
        parsed.country,
        parsed.consent_status ? "yes" : "no",
        parsed.lead_status,
        parsed.lead_score,
        parsed.project_type,
        (parsed.interests || []).join("; "),
        parsed.budget_range,
        parsed.timeline,
        parsed.first_seen,
        parsed.last_seen,
        row.message_count,
        parsed.conversation_summary,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  audit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.leads_exported",
    targetType: "visitor",
    details: { count: rows.length, filters: { ...filters, search: filters.search ? "[redacted]" : "" } },
    ipHash: hashIp(req, config),
  });
  return {
    ok: true,
    csv: `\uFEFF${lines.join("\r\n")}\r\n`,
    count: rows.length,
  };
}

function listAudit(db, url) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const total = db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get().n;
  const rows = db
    .prepare(
      `SELECT id, actor_type, actor_id, action, target_type, target_id, details, created_at
       FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, (page - 1) * limit);
  return {
    items: rows.map((row) => {
      let details = null;
      try {
        details = row.details ? JSON.parse(row.details) : null;
      } catch {
        details = null;
      }
      return { ...row, details };
    }),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

function overview({ db, config, aiService, knowledge, admin }) {
  const totalVisitors = db.prepare("SELECT COUNT(*) AS n FROM visitors").get().n;
  const consented = db
    .prepare("SELECT COUNT(*) AS n FROM visitors WHERE consent_status = 1")
    .get().n;
  const qualified = db
    .prepare(
      "SELECT COUNT(*) AS n FROM visitors WHERE lead_score >= ? OR lead_status IN ('qualified','quote_requested','human_requested','proposal_sent','won')"
    )
    .get(config.qualifiedThreshold).n;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const newThisWeek = db
    .prepare("SELECT COUNT(*) AS n FROM visitors WHERE first_seen >= ?")
    .get(weekAgo).n;
  const avg = db.prepare("SELECT AVG(lead_score) AS n FROM visitors").get().n;
  const messages = db.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
  const conversations = db.prepare("SELECT COUNT(*) AS n FROM conversations").get().n;
  const statusRows = db
    .prepare("SELECT lead_status, COUNT(*) AS n FROM visitors GROUP BY lead_status")
    .all();
  const statusCounts = Object.fromEntries(statusRows.map((row) => [row.lead_status, row.n]));
  return {
    stats: {
      totalVisitors,
      consented,
      qualified,
      newThisWeek,
      averageScore: Math.round(Number(avg) || 0),
      messages,
      conversations,
      statusCounts,
    },
    retention: getRetention(db, config),
    knowledge: knowledge.getStatus(),
    ai: aiService.status(),
    assistant: { enabled: getAssistantSettings(db).enabled },
    admin,
    hasAdmin: hasAdmin(db),
    serverTime: NOW(),
  };
}

function updateRetention({ db, req, config, admin, visitorDays, conversationDays }) {
  if (!canWrite(admin.role)) {
    return { ok: false, status: 403, message: "This role cannot update retention." };
  }
  const v = Number.parseInt(visitorDays, 10);
  const c = Number.parseInt(conversationDays, 10);
  if (!Number.isFinite(v) || v < 1 || v > 3650 || !Number.isFinite(c) || c < 1 || c > 3650) {
    return { ok: false, status: 400, message: "Retention must be between 1 and 3650 days." };
  }
  setRetention(db, { visitorDays: v, conversationDays: c });
  audit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.retention_updated",
    targetType: "settings",
    details: { visitorDays: v, conversationDays: c },
    ipHash: hashIp(req, config),
  });
  return { ok: true, retention: { visitorDays: v, conversationDays: c } };
}

function purge({ db, req, config, admin }) {
  if (!canWrite(admin.role)) {
    return { ok: false, status: 403, message: "This role cannot purge data." };
  }
  const result = cleanupExpired(db, config);
  audit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.retention_purge",
    targetType: "settings",
    details: result,
    ipHash: hashIp(req, config),
  });
  return { ok: true, result };
}

module.exports = {
  canWrite,
  login,
  logout,
  getAdminContext,
  listLeads,
  getVisitorDetail,
  updateLeadStatus,
  deleteLead,
  exportCsv,
  listAudit,
  overview,
  updateRetention,
  purge,
  getRetention,
};
