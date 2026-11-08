"use strict";

const crypto = require("node:crypto");
const {
  parseCookies,
  buildCookie,
  clearCookie,
  randomToken,
  sha256,
  hashIp,
} = require("./security");
const { NOW, isoAfterDays, isoBeforeDays } = require("./db");

const VISITOR_COOKIE = "ndv_visitor";
const VISITOR_SESSION_COOKIE = "ndv_session";
const ADMIN_COOKIE = "ndv_admin";
const SESSION_DAY_MS = 24 * 60 * 60 * 1000;

function readVisitorByToken(db, token) {
  if (!token) return null;
  return db
    .prepare("SELECT * FROM visitors WHERE token_hash = ? AND deleted_at IS NULL")
    .get(sha256(token));
}

function readVisitorSession(db, token) {
  if (!token) return null;
  return db
    .prepare(
      `SELECT s.*, v.id AS visitor_id, v.token_hash AS visitor_token_hash
       FROM visitor_sessions s
       JOIN visitors v ON v.id = s.visitor_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND v.deleted_at IS NULL`
    )
    .get(sha256(token), NOW());
}

function readVisitorById(db, id) {
  return db.prepare("SELECT * FROM visitors WHERE id = ? AND deleted_at IS NULL").get(id);
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) res.setHeader("Set-Cookie", [cookie]);
  else if (Array.isArray(existing)) existing.push(cookie);
  else res.setHeader("Set-Cookie", [existing, cookie]);
}

function setVisitorCookie(res, token, config) {
  appendSetCookie(
    res,
    buildCookie(VISITOR_COOKIE, token, {
      maxAge: config.privacy.visitorSessionDays * 86400,
      secure: config.cookieSecure,
      sameSite: "Strict",
      httpOnly: true,
    })
  );
}

function setVisitorSessionCookie(res, token, config) {
  appendSetCookie(
    res,
    buildCookie(VISITOR_SESSION_COOKIE, token, {
      maxAge: config.privacy.visitorSessionDays * 86400,
      secure: config.cookieSecure,
      sameSite: "Strict",
      httpOnly: true,
    })
  );
}

function clearVisitorCookies(res, config) {
  appendSetCookie(res, clearCookie(VISITOR_COOKIE, { secure: config.cookieSecure }));
  appendSetCookie(res, clearCookie(VISITOR_SESSION_COOKIE, { secure: config.cookieSecure }));
}

function createVisitor(db) {
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const now = NOW();
  db.prepare(
    `INSERT INTO visitors
      (id, token_hash, interests, first_seen, last_seen, lead_status, lead_score, lead_score_reasons, consent_status)
     VALUES (?, ?, '[]', ?, ?, 'new', 0, '[]', 0)`
  ).run(id, sha256(token), now, now);
  return { visitor: readVisitorById(db, id), token };
}

function createSession(db, visitorId, config, req) {
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = NOW();
  db.prepare(
    `INSERT INTO visitor_sessions
      (id, token_hash, visitor_id, csrf_token, created_at, last_seen, expires_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sha256(token),
    visitorId,
    csrf,
    now,
    now,
    isoAfterDays(config.privacy.visitorSessionDays),
    hashIp(req, config),
    String(req.headers["user-agent"] || "").slice(0, 300)
  );
  return {
    session: db.prepare("SELECT * FROM visitor_sessions WHERE id = ?").get(id),
    token,
    csrf,
  };
}

function getActiveConversation(db, visitorId) {
  return db
    .prepare(
      `SELECT * FROM conversations
       WHERE visitor_id = ? AND status = 'active' AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(visitorId);
}

function createConversation(db, visitorId) {
  const id = crypto.randomUUID();
  const now = NOW();
  db.prepare(
    `INSERT INTO conversations (id, visitor_id, status, created_at, updated_at, consent_prompted)
     VALUES (?, ?, 'active', ?, ?, 0)`
  ).run(id, visitorId, now, now);
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id);
}

function ensureConversation(db, visitorId) {
  return getActiveConversation(db, visitorId) || createConversation(db, visitorId);
}

function ensureVisitorContext(db, req, res, config) {
  const cookies = parseCookies(req.headers.cookie);
  let visitor = readVisitorByToken(db, cookies[VISITOR_COOKIE]);
  let visitorToken = cookies[VISITOR_COOKIE] || null;
  let session = readVisitorSession(db, cookies[VISITOR_SESSION_COOKIE]);
  let sessionToken = cookies[VISITOR_SESSION_COOKIE] || null;

  if (session && visitor && session.visitor_id !== visitor.id) {
    session = null;
  }

  if (!visitor) {
    const created = createVisitor(db);
    visitor = created.visitor;
    visitorToken = created.token;
    setVisitorCookie(res, visitorToken, config);
    session = null;
  } else if (!visitorToken) {
    // A valid session issued without a visitor cookie is unusual, but the
    // session's visitor remains authoritative and the cookie is restored.
    const token = randomToken(32);
    db.prepare("UPDATE visitors SET token_hash = ? WHERE id = ?").run(sha256(token), visitor.id);
    visitorToken = token;
    setVisitorCookie(res, visitorToken, config);
  }

  if (!session) {
    const created = createSession(db, visitor.id, config, req);
    session = created.session;
    sessionToken = created.token;
    setVisitorSessionCookie(res, sessionToken, config);
  }

  const now = NOW();
  db.prepare("UPDATE visitors SET last_seen = ? WHERE id = ?").run(now, visitor.id);
  db.prepare("UPDATE visitor_sessions SET last_seen = ? WHERE id = ?").run(now, session.id);
  visitor = readVisitorById(db, visitor.id);
  const conversation = ensureConversation(db, visitor.id);

  return {
    visitor,
    session: { ...session, token: sessionToken },
    conversation,
    cookies,
  };
}

function getVisitorContext(db, req, config) {
  const cookies = parseCookies(req.headers.cookie);
  const session = readVisitorSession(db, cookies[VISITOR_SESSION_COOKIE]);
  if (!session) return null;
  const visitor = readVisitorById(db, session.visitor_id);
  if (!visitor) return null;
  const conversation = ensureConversation(db, visitor.id);
  const now = NOW();
  db.prepare("UPDATE visitors SET last_seen = ? WHERE id = ?").run(now, visitor.id);
  db.prepare("UPDATE visitor_sessions SET last_seen = ? WHERE id = ?").run(now, session.id);
  return { visitor, session, conversation, cookies };
}

function clearConversation(db, context) {
  const now = NOW();
  db.prepare(
    `UPDATE conversations SET status = 'deleted', deleted_at = ?, updated_at = ?
     WHERE id = ? AND visitor_id = ?`
  ).run(now, now, context.conversation.id, context.visitor.id);
  return createConversation(db, context.visitor.id);
}

function deleteVisitor(db, visitorId) {
  db.prepare("DELETE FROM visitors WHERE id = ?").run(visitorId);
}

function setAdminCookie(res, token, config) {
  appendSetCookie(
    res,
    buildCookie(ADMIN_COOKIE, token, {
      maxAge: config.admin.sessionHours * 3600,
      secure: config.cookieSecure,
      sameSite: "Strict",
      httpOnly: true,
    })
  );
}

function clearAdminCookie(res, config) {
  appendSetCookie(res, clearCookie(ADMIN_COOKIE, { secure: config.cookieSecure }));
}

function readAdminSession(db, token) {
  if (!token) return null;
  return db
    .prepare(
      `SELECT s.*, u.username, u.role, u.disabled
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`
    )
    .get(sha256(token), NOW());
}

function createAdminSession(db, req, res, config, user) {
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = NOW();
  const expires = new Date(Date.now() + config.admin.sessionHours * 3600 * 1000).toISOString();
  db.prepare(
    `INSERT INTO admin_sessions
      (id, token_hash, admin_id, csrf_token, created_at, last_seen, expires_at, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sha256(token),
    user.id,
    csrf,
    now,
    now,
    expires,
    hashIp(req, config),
    String(req.headers["user-agent"] || "").slice(0, 300)
  );
  db.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?").run(now, user.id);
  setAdminCookie(res, token, config);
  return {
    session: db.prepare("SELECT * FROM admin_sessions WHERE id = ?").get(id),
    token,
    csrf,
  };
}

function getAdminContext(db, req) {
  const cookies = parseCookies(req.headers.cookie);
  const session = readAdminSession(db, cookies[ADMIN_COOKIE]);
  if (!session) return null;
  db.prepare("UPDATE admin_sessions SET last_seen = ? WHERE id = ?").run(NOW(), session.id);
  return {
    session,
    admin: { id: session.admin_id, username: session.username, role: session.role },
    csrfToken: session.csrf_token,
  };
}

function deleteAdminSession(db, req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[ADMIN_COOKIE];
  if (token) db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
}

module.exports = {
  VISITOR_COOKIE,
  VISITOR_SESSION_COOKIE,
  ADMIN_COOKIE,
  ensureVisitorContext,
  getVisitorContext,
  ensureConversation,
  clearConversation,
  deleteVisitor,
  clearVisitorCookies,
  createAdminSession,
  getAdminContext,
  deleteAdminSession,
  clearAdminCookie,
  readVisitorById,
};
