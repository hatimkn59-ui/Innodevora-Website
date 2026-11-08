"use strict";

function consumeRateLimit(db, key, limit, windowMs) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + windowMs).toISOString();

  db.exec("BEGIN IMMEDIATE;");
  try {
    const row = db.prepare("SELECT count, expires_at FROM rate_limits WHERE key = ?").get(key);
    let count = 1;
    let expires = expiresAt;
    if (row && new Date(row.expires_at).getTime() > now) {
      count = row.count + 1;
      expires = row.expires_at;
    }

    if (count > limit) {
      db.prepare(
        `INSERT INTO rate_limits (key, count, window_start, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, expires_at = excluded.expires_at`
      ).run(key, count, nowIso, expires);
      db.exec("COMMIT;");
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((new Date(expires).getTime() - now) / 1000)),
        resetAt: expires,
      };
    }

    db.prepare(
      `INSERT INTO rate_limits (key, count, window_start, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, expires_at = excluded.expires_at`
    ).run(key, count, nowIso, expires);
    db.exec("COMMIT;");
    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: 0,
      resetAt: expires,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* no-op */
    }
    throw error;
  }
}

function consumeMany(db, entries) {
  for (const entry of entries) {
    const result = consumeRateLimit(db, entry.key, entry.limit, entry.windowMs);
    if (!result.allowed) return result;
  }
  return { allowed: true, remaining: 0, retryAfterSeconds: 0, resetAt: null };
}

module.exports = { consumeRateLimit, consumeMany };
