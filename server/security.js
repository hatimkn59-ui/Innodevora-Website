"use strict";

const crypto = require("node:crypto");

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw new Error("Password must be between 8 and 200 characters.");
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every(Number.isFinite)) return false;
  if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    });
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Strict"}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, options = {}) {
  return buildCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) });
}

function getClientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
  }
  const raw = req.socket?.remoteAddress || "";
  return raw.replace(/^::ffff:/, "");
}

function hashIp(req, config) {
  const ip = getClientIp(req, config.trustProxy);
  return crypto
    .createHmac("sha256", config.ipHashSalt)
    .update(ip || "unknown")
    .digest("hex");
}

function originMatchesHost(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = String(req.headers.host || "").toLowerCase();
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function assertSameOrigin(req) {
  return originMatchesHost(req);
}

function normalizeText(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(value) {
  if (typeof value !== "string" || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function redactPII(value) {
  let text = String(value ?? "");
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email hidden until consent]");

  text = text.replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return match;
    return "[phone number hidden until consent]";
  });

  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return match;
    return "[sensitive number removed]";
  });

  text = text.replace(
    /\b(password|passcode|secret|api\s*key|private\s*key)\b\s*(?:is|:|=)\s*[^\s,;]{3,}/gi,
    "$1: [hidden]"
  );
  return text.slice(0, 12000);
}

function csvCell(value) {
  let cell = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[",\n\r]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function constantCompare(a, b) {
  return safeEqual(a, b);
}

module.exports = {
  randomToken,
  sha256,
  safeEqual,
  constantCompare,
  hashPassword,
  verifyPassword,
  parseCookies,
  buildCookie,
  clearCookie,
  getClientIp,
  hashIp,
  assertSameOrigin,
  originMatchesHost,
  normalizeText,
  isValidEmail,
  redactPII,
  csvCell,
};
