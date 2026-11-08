"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createConfig, parseEnvFile, bool, integer, number } = require("../server/config");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "innodevora-config-"));
}

const baseEnv = (root) => ({
  NODE_ENV: "development",
  HOST: "127.0.0.1",
  PORT: "3000",
  DATA_DIR: path.join(root, "data"),
  DATABASE_PATH: path.join(root, "data", "test.db"),
  KNOWLEDGE_PATH: path.join(root, "knowledge", "INNODEVORA.md"),
  SITE_ORIGIN: "http://localhost:3000",
  IP_HASH_SALT: "a".repeat(32),
});

test("environment parsing supports comments, quotes and escaped newlines", () => {
  const dir = tempRoot();
  const file = path.join(dir, ".env");
  try {
    fs.writeFileSync(
      file,
      [
        "# comment",
        "PLAIN=value",
        'QUOTED="hello world"',
        "SINGLE='single value'",
        "MULTILINE=line1\\nline2",
        "NO_EQUALS",
        "INVALID KEY=value",
      ].join("\n")
    );
    const parsed = parseEnvFile(file);
    assert.equal(parsed.PLAIN, "value");
    assert.equal(parsed.QUOTED, "hello world");
    assert.equal(parsed.SINGLE, "single value");
    assert.equal(parsed.MULTILINE, "line1\nline2");
    assert.equal(parsed.NO_EQUALS, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("primitive helpers clamp and fall back safely", () => {
  assert.equal(bool("yes", false), true);
  assert.equal(bool("0", true), false);
  assert.equal(bool(undefined, true), true);
  assert.equal(integer("500", 10, { min: 1, max: 100 }), 100);
  assert.equal(integer("nope", 7), 7);
  assert.equal(number("0.5", 0, { min: 0, max: 1 }), 0.5);
  assert.equal(number("9", 0, { min: 0, max: 1 }), 1);
});

test("config validates origins and AI URLs and derives security defaults", () => {
  const root = tempRoot();
  try {
    const dev = createConfig({ root, env: baseEnv(root) });
    assert.equal(dev.isProduction, false);
    assert.equal(dev.cookieSecure, false);
    assert.equal(dev.ai.keylessDemo, true);
    assert.equal(dev.ai.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(dev.admin.username, "owner");

    const secure = createConfig({
      root,
      env: {
        ...baseEnv(root),
        SITE_ORIGIN: "https://innodevora.com",
        COOKIE_SECURE: "auto",
      },
    });
    assert.equal(secure.cookieSecure, true);

    const localAi = createConfig({
      root,
      env: {
        ...baseEnv(root),
        AI_API_URL: "http://localhost:11434/v1/chat/completions",
      },
    });
    assert.equal(localAi.ai.url, "http://localhost:11434/v1/chat/completions");

    assert.throws(
      () =>
        createConfig({
          root,
          env: { ...baseEnv(root), AI_API_URL: "http://internal.example/v1" },
        }),
      /must use HTTPS/
    );
    assert.throws(
      () =>
        createConfig({
          root,
          env: { ...baseEnv(root), SITE_ORIGIN: "not-a-url" },
        }),
      /SITE_ORIGIN/
    );
    assert.throws(
      () =>
        createConfig({
          root,
          env: { ...baseEnv(root), AI_API_URL: "https://user:pass@example.com/v1" },
        }),
      /must not contain credentials/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production disables keyless demo by default", () => {
  const root = tempRoot();
  try {
    const prod = createConfig({
      root,
      env: {
        ...baseEnv(root),
        NODE_ENV: "production",
        SITE_ORIGIN: "https://innodevora.com",
        COOKIE_SECURE: "auto",
        ADMIN_PASSWORD: "a-long-production-password",
      },
    });
    assert.equal(prod.isProduction, true);
    assert.equal(prod.ai.keylessDemo, false);
    assert.equal(prod.cookieSecure, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("limits and retention values are clamped to safe ranges", () => {
  const root = tempRoot();
  try {
    const config = createConfig({
      root,
      env: {
        ...baseEnv(root),
        MAX_MESSAGE_CHARS: "2",
        RATE_LIMIT_PER_MINUTE: "999999",
        VISITOR_SESSION_DAYS: "0",
        VISITOR_RETENTION_DAYS: "999999",
        CONVERSATION_RETENTION_DAYS: "999999",
        MESSAGE_HISTORY_LIMIT: "99999",
        AI_TIMEOUT_MS: "1",
        AI_MAX_OUTPUT_TOKENS: "99999",
      },
    });
    assert.equal(config.limits.maxMessageChars, 80);
    assert.equal(config.limits.perMinute, 1000);
    assert.equal(config.privacy.visitorSessionDays, 1);
    assert.equal(config.privacy.visitorRetentionDays, 3650);
    assert.equal(config.privacy.conversationRetentionDays, 3650);
    assert.equal(config.privacy.messageHistoryLimit, 200);
    assert.equal(config.ai.timeoutMs, 5000);
    assert.equal(config.ai.maxOutputTokens, 4000);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
