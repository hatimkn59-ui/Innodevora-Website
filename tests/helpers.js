"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function createSilentLogger() {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

function createClient(baseUrl) {
  const cookies = new Map();

  async function request(pathname, options = {}) {
    const headers = new Headers(options.headers || {});
    if (cookies.size) {
      headers.set(
        "cookie",
        Array.from(cookies.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join("; ")
      );
    }
    let body;
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers,
      body,
      redirect: "manual",
    });

    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (/max-age=0/i.test(header)) cookies.delete(name);
      else cookies.set(name, value);
    }

    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text,
      json() {
        return JSON.parse(text);
      },
    };
  }

  return {
    request,
    cookies,
    csrfHeaders(token) {
      return { "x-csrf-token": token, origin: baseUrl };
    },
    post(pathname, body, extraHeaders = {}) {
      return request(pathname, {
        method: "POST",
        body,
        headers: { origin: baseUrl, ...extraHeaders },
      });
    },
  };
}

async function startTestApp({ env = {}, logger = createSilentLogger() } = {}) {
  const { createConfig } = require("../server/config");
  const { createApp } = require("../server/app");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "innodevora-test-"));
  const knowledgeDir = path.join(tempRoot, "knowledge");
  fs.mkdirSync(knowledgeDir, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "knowledge", "INNODEVORA.md"),
    path.join(knowledgeDir, "INNODEVORA.md")
  );

  const mergedEnv = {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    SITE_ORIGIN: "http://127.0.0.1:1",
    DATA_DIR: path.join(tempRoot, "data"),
    DATABASE_PATH: path.join(tempRoot, "data", "test.db"),
    KNOWLEDGE_PATH: path.join(knowledgeDir, "INNODEVORA.md"),
    IP_HASH_SALT: "test-ip-salt-that-is-long-enough-123456",
    COOKIE_SECURE: "false",
    AI_KEYLESS_DEMO: "true",
    AI_STREAM_DELAY_MS: "0",
    AI_API_KEY: "",
    AI_API_URL: "https://api.openai.com/v1/chat/completions",
    ADMIN_USERNAME: "owner",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_PASSWORD_HASH: "",
    ADMIN_LOGIN_ATTEMPTS: "100",
    ...env,
  };

  const config = createConfig({ root: ROOT, env: mergedEnv });
  const app = createApp({ config, logger });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = createClient(baseUrl);

  return {
    app,
    config,
    baseUrl,
    client,
    tempRoot,
    async close() {
      await new Promise((resolve) => {
        app.server.close(resolve);
        app.server.closeAllConnections?.();
      });
      app.close();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

function parseSse(text) {
  const events = [];
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    let event = "message";
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    const raw = dataLines.join("\n");
    let data = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep text */
    }
    events.push({ event, data });
  }
  return events;
}

function pngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
}

module.exports = {
  ROOT,
  createSilentLogger,
  createClient,
  startTestApp,
  parseSse,
  pngBytes,
};
