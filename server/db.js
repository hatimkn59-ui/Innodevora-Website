"use strict";

const { DatabaseSync } = require("node:sqlite");
const { hashPassword } = require("./security");

const NOW = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

function isoAfterDays(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function isoBeforeDays(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function openDatabase(config) {
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  seedAdmin(db, config);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      company TEXT,
      role TEXT,
      country TEXT,
      preferred_language TEXT,
      interests TEXT NOT NULL DEFAULT '[]',
      project_type TEXT,
      project_description TEXT,
      budget_range TEXT,
      timeline TEXT,
      lead_status TEXT NOT NULL DEFAULT 'new' CHECK (lead_status IN (
        'new','exploring','qualified','quote_requested','human_requested',
        'contacted','proposal_sent','won','lost','archived'
      )),
      lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
      lead_score_reasons TEXT NOT NULL DEFAULT '[]',
      consent_status INTEGER NOT NULL DEFAULT 0 CHECK (consent_status IN (0,1)),
      consent_at TEXT,
      conversation_summary TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen);
    CREATE INDEX IF NOT EXISTS idx_visitors_consent ON visitors(consent_status);
    CREATE INDEX IF NOT EXISTS idx_visitors_lead_status ON visitors(lead_status);
    CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_visitor ON visitor_sessions(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_visitor_sessions_expiry ON visitor_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','deleted')),
      summary TEXT,
      consent_prompted INTEGER NOT NULL DEFAULT 0 CHECK (consent_prompted IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_visitor ON conversations(visitor_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted IN (0,1)),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_visitor ON messages(visitor_id);

    CREATE TABLE IF NOT EXISTS consent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
      consent_status INTEGER NOT NULL CHECK (consent_status IN (0,1)),
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_consent_visitor ON consent_events(visitor_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','viewer')),
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)),
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success','fallback','error')),
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON ai_usage(status);
  `);

  // Forward-compatible migration for databases created before the consent
  // prompt flag existed. New databases already have the column.
  const conversationColumns = db.prepare("PRAGMA table_info(conversations)").all();
  if (!conversationColumns.some((column) => column.name === "consent_prompted")) {
    db.exec("ALTER TABLE conversations ADD COLUMN consent_prompted INTEGER NOT NULL DEFAULT 0;");
  }

  db.exec("PRAGMA user_version = 1;");
}

function seedAdmin(db, config) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM admin_users").get().n;
  if (count > 0) return;

  let passwordHash = config.admin.passwordHash;
  if (!passwordHash && config.admin.password) {
    passwordHash = hashPassword(config.admin.password);
  }
  if (!passwordHash) return;

  db.prepare(
    `INSERT INTO admin_users (id, username, password_hash, role, disabled, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  ).run(
    require("node:crypto").randomUUID(),
    config.admin.username,
    passwordHash,
    config.admin.role,
    NOW()
  );
}

function hasAdmin(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE disabled = 0").get().n > 0;
}

function getSetting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), NOW());
}

function getRetention(db, config) {
  return {
    visitorDays: Number.parseInt(
      getSetting(db, "retention.visitorDays", String(config.privacy.visitorRetentionDays)),
      10
    ),
    conversationDays: Number.parseInt(
      getSetting(db, "retention.conversationDays", String(config.privacy.conversationRetentionDays)),
      10
    ),
  };
}

function setRetention(db, { visitorDays, conversationDays }) {
  if (Number.isFinite(visitorDays)) setSetting(db, "retention.visitorDays", visitorDays);
  if (Number.isFinite(conversationDays)) setSetting(db, "retention.conversationDays", conversationDays);
}

function cleanupExpired(db, config) {
  const now = NOW();
  const expiredSessions = db
    .prepare("DELETE FROM visitor_sessions WHERE expires_at < ?")
    .run(now).changes;
  const expiredAdmin = db
    .prepare("DELETE FROM admin_sessions WHERE expires_at < ?")
    .run(now).changes;
  const expiredLimits = db
    .prepare("DELETE FROM rate_limits WHERE expires_at < ?")
    .run(now).changes;

  const retention = getRetention(db, config);
  const visitorCutoff = new Date(Date.now() - retention.visitorDays * DAY_MS).toISOString();
  const conversationCutoff = new Date(
    Date.now() - retention.conversationDays * DAY_MS
  ).toISOString();

  const oldConversations = db
    .prepare("DELETE FROM conversations WHERE updated_at < ?")
    .run(conversationCutoff).changes;

  const oldVisitors = db
    .prepare("DELETE FROM visitors WHERE last_seen < ?")
    .run(visitorCutoff).changes;

  const aiUsageCutoff = new Date(Date.now() - 90 * DAY_MS).toISOString();
  const oldAiUsage = db
    .prepare("DELETE FROM ai_usage WHERE created_at < ?")
    .run(aiUsageCutoff).changes;

  return {
    expiredSessions,
    expiredAdmin,
    expiredLimits,
    oldConversations,
    oldVisitors,
    oldAiUsage,
    retention,
    cutoff: visitorCutoff,
  };
}

function recordAiUsage(db, { mode, status, latencyMs = 0, errorCode = null }) {
  const safeStatus = ["success", "fallback", "error"].includes(status) ? status : "error";
  db.prepare(
    `INSERT INTO ai_usage (mode, status, latency_ms, error_code, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    String(mode || "unknown").slice(0, 32),
    safeStatus,
    Math.max(0, Math.round(Number(latencyMs) || 0)),
    errorCode ? String(errorCode).slice(0, 80) : null,
    NOW()
  );
}

function getAiUsage(db, { hours = 24, errorLimit = 20 } = {}) {
  const safeHours = Math.min(24 * 90, Math.max(1, Number.parseInt(hours, 10) || 24));
  const since = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS n, AVG(latency_ms) AS avg_latency
       FROM ai_usage WHERE created_at >= ? GROUP BY status`
    )
    .all(since);
  const counts = { success: 0, fallback: 0, error: 0 };
  let latencyTotal = 0;
  let latencySamples = 0;
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] = row.n;
    if (row.avg_latency !== null && row.n > 0) {
      latencyTotal += Number(row.avg_latency) * row.n;
      latencySamples += row.n;
    }
  }
  const total = counts.success + counts.fallback + counts.error;
  const last = db
    .prepare(
      `SELECT mode, status, latency_ms, error_code, created_at
       FROM ai_usage ORDER BY id DESC LIMIT 1`
    )
    .get();
  const recentErrors = db
    .prepare(
      `SELECT mode, status, latency_ms, error_code, created_at
       FROM ai_usage WHERE status IN ('fallback','error')
       ORDER BY id DESC LIMIT ?`
    )
    .all(Math.min(100, Math.max(1, Number.parseInt(errorLimit, 10) || 20)))
    .map((row) => ({
      mode: row.mode,
      status: row.status,
      latencyMs: row.latency_ms,
      errorCode: row.error_code || null,
      createdAt: row.created_at,
    }));
  return {
    hours: safeHours,
    since,
    total,
    success: counts.success,
    fallback: counts.fallback,
    errors: counts.error,
    averageLatencyMs: latencySamples ? Math.round(latencyTotal / latencySamples) : 0,
    lastRequest: last
      ? {
          mode: last.mode,
          status: last.status,
          latencyMs: last.latency_ms,
          errorCode: last.error_code || null,
          createdAt: last.created_at,
        }
      : null,
    recentErrors,
  };
}

function audit(db, { actorType, actorId = null, action, targetType = null, targetId = null, details = null, ipHash = null }) {
  db.prepare(
    `INSERT INTO audit_logs
      (actor_type, actor_id, action, target_type, target_id, details, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actorType,
    actorId,
    action,
    targetType,
    targetId,
    details === null ? null : JSON.stringify(details),
    ipHash,
    NOW()
  );
}

module.exports = {
  openDatabase,
  migrate,
  seedAdmin,
  hasAdmin,
  getSetting,
  setSetting,
  getRetention,
  setRetention,
  cleanupExpired,
  audit,
  recordAiUsage,
  getAiUsage,
  isoAfterDays,
  isoBeforeDays,
  NOW,
  DAY_MS,
};
