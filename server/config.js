"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, "\n");
  }
  return out;
}

function loadEnv(root = ROOT) {
  const values = parseEnvFile(path.join(root, ".env"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return values;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function integer(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function number(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function resolveInsideRoot(root, value, fallback) {
  const raw = value || fallback;
  if (!raw) return null;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(root, raw);
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

function readOrCreateSalt(filePath) {
  if (fs.existsSync(filePath)) {
    const value = fs.readFileSync(filePath, "utf8").trim();
    if (value.length >= 32) return value;
  }
  const salt = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(filePath, `${salt}\n`, { encoding: "utf8", mode: 0o600 });
  return salt;
}

function validateAiUrl(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AI_API_URL must be a valid URL.");
  }
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("AI_API_URL must use HTTPS (HTTP is allowed only for local providers).");
  }
  if (url.username || url.password) {
    throw new Error("AI_API_URL must not contain credentials.");
  }
  return url.toString();
}

function validateOrigin(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
    return url.origin;
  } catch {
    throw new Error("SITE_ORIGIN must be an absolute http(s) URL.");
  }
}

function createConfig({ env = process.env, root = ROOT } = {}) {
  const isProduction = String(env.NODE_ENV || "development").toLowerCase() === "production";
  const host = env.HOST || "127.0.0.1";
  const port = integer(env.PORT, 3000, { min: 1, max: 65535 });
  const siteOrigin = validateOrigin(env.SITE_ORIGIN || `http://${host}:${port}`);
  const dataDir = resolveInsideRoot(root, env.DATA_DIR, "data");
  ensureDirectory(dataDir);
  const databasePath = resolveInsideRoot(root, env.DATABASE_PATH, "data/innodevora-chat.db");
  ensureDirectory(path.dirname(databasePath));
  const knowledgePath = resolveInsideRoot(root, env.KNOWLEDGE_PATH, "knowledge/INNODEVORA.md");
  const ipSaltFile = path.join(dataDir, "ip-hash-salt");
  const ipHashSalt = env.IP_HASH_SALT && env.IP_HASH_SALT.length >= 16
    ? env.IP_HASH_SALT
    : readOrCreateSalt(ipSaltFile);

  const cookieSecure = (() => {
    const raw = String(env.COOKIE_SECURE || "auto").toLowerCase();
    if (raw === "auto") return siteOrigin.startsWith("https://");
    return bool(raw, false);
  })();

  const aiKeylessDefault = !isProduction;
  const leadWeights = {
    projectType: integer(env.LEAD_WEIGHT_PROJECT_TYPE, 10, { min: 0, max: 50 }),
    description: integer(env.LEAD_WEIGHT_DESCRIPTION, 10, { min: 0, max: 50 }),
    budget: integer(env.LEAD_WEIGHT_BUDGET, 20, { min: 0, max: 50 }),
    timeline: integer(env.LEAD_WEIGHT_TIMELINE, 15, { min: 0, max: 50 }),
    quote: integer(env.LEAD_WEIGHT_QUOTE, 15, { min: 0, max: 50 }),
    contact: integer(env.LEAD_WEIGHT_CONTACT, 15, { min: 0, max: 50 }),
    company: integer(env.LEAD_WEIGHT_COMPANY, 5, { min: 0, max: 50 }),
    repeat: integer(env.LEAD_WEIGHT_REPEAT, 5, { min: 0, max: 50 }),
  };
  const qualifiedThreshold = integer(env.LEAD_QUALIFIED_THRESHOLD, 45, { min: 1, max: 100 });

  return {
    root,
    isProduction,
    host,
    port,
    siteOrigin,
    trustProxy: bool(env.TRUST_PROXY, false),
    cookieSecure,
    dataDir,
    databasePath,
    knowledgePath,
    ipHashSalt,
    ai: {
      url: validateAiUrl(env.AI_API_URL || "https://api.openai.com/v1/chat/completions"),
      apiKey: String(env.AI_API_KEY || "").trim(),
      model: String(env.AI_MODEL || "gpt-4.1-mini").trim(),
      timeoutMs: integer(env.AI_TIMEOUT_MS, 45000, { min: 5000, max: 120000 }),
      maxOutputTokens: integer(env.AI_MAX_OUTPUT_TOKENS, 700, { min: 80, max: 4000 }),
      temperature: number(env.AI_TEMPERATURE, 0.3, { min: 0, max: 1.5 }),
      keylessDemo: bool(env.AI_KEYLESS_DEMO, aiKeylessDefault),
      streamDelayMs: integer(env.AI_STREAM_DELAY_MS, 18, { min: 0, max: 1000 }),
    },
    admin: {
      username: String(env.ADMIN_USERNAME || "owner").trim(),
      passwordHash: String(env.ADMIN_PASSWORD_HASH || "").trim(),
      password: String(env.ADMIN_PASSWORD || ""),
      role: ["owner", "admin", "viewer"].includes(String(env.ADMIN_ROLE || "owner"))
        ? String(env.ADMIN_ROLE || "owner")
        : "owner",
      sessionHours: integer(env.ADMIN_SESSION_HOURS, 12, { min: 1, max: 168 }),
      loginAttempts: integer(env.ADMIN_LOGIN_ATTEMPTS, 5, { min: 1, max: 50 }),
      loginWindowMs: integer(env.ADMIN_LOGIN_WINDOW_MINUTES, 15, { min: 1, max: 1440 }) * 60_000,
    },
    privacy: {
      visitorSessionDays: integer(env.VISITOR_SESSION_DAYS, 30, { min: 1, max: 365 }),
      visitorRetentionDays: integer(env.VISITOR_RETENTION_DAYS, 180, { min: 1, max: 3650 }),
      conversationRetentionDays: integer(env.CONVERSATION_RETENTION_DAYS, 365, { min: 1, max: 3650 }),
      messageHistoryLimit: integer(env.MESSAGE_HISTORY_LIMIT, 40, { min: 4, max: 200 }),
    },
    limits: {
      maxMessageChars: integer(env.MAX_MESSAGE_CHARS, 1500, { min: 80, max: 10000 }),
      perMinute: integer(env.RATE_LIMIT_PER_MINUTE, 12, { min: 1, max: 1000 }),
      perHour: integer(env.RATE_LIMIT_PER_HOUR, 80, { min: 1, max: 10000 }),
      burst: integer(env.RATE_LIMIT_BURST, 4, { min: 1, max: 100 }),
    },
    leadWeights,
    qualifiedThreshold,
  };
}

module.exports = {
  ROOT,
  parseEnvFile,
  loadEnv,
  createConfig,
  bool,
  integer,
  number,
};
