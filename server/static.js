"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const BLOCKED_SEGMENTS = new Set([
  "server",
  "data",
  "knowledge",
  "tests",
  "docs",
  "scripts",
  "admin",
  "node_modules",
  ".git",
  ".claude",
  ".claude-flow",
  ".impeccable",
  ".vscode",
  "mailer",
]);

const BLOCKED_FILES = new Set([
  ".env",
  ".env.example",
  "package.json",
  "package-lock.json",
  "dockerfile",
  "readme.md",
  "demo-trust.md",
  "design-handoff.md",
  "notes.md",
  ".gitignore",
]);

function shouldBlockPath(relativePath) {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith(".")) return true;
    if (BLOCKED_SEGMENTS.has(lower)) return true;
    if (BLOCKED_FILES.has(lower)) return true;
  }
  const ext = path.extname(relativePath).toLowerCase();
  if (!MIME[ext]) return true;
  return false;
}

function cacheControlFor(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (/\.html?$/i.test(normalized)) return "no-cache";
  if (normalized.startsWith("assets/demo/") || normalized.startsWith("assets/chat/")) {
    return "public, max-age=300, must-revalidate";
  }
  if (/assets\/.+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(normalized)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}

function sendNotFound(res, message = "Not found") {
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(message);
}

function serveStatic(req, res, { root, pathname, documentRoot = true, noStore = false }) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendNotFound(res, "Bad request");
    return;
  }
  if (decoded.includes("\0")) {
    sendNotFound(res, "Bad request");
    return;
  }

  let relative = decoded.replace(/^\/+/, "");
  if (!relative) relative = "index.html";
  if (relative.endsWith("/")) relative += "index.html";

  if (shouldBlockPath(relative)) {
    sendNotFound(res);
    return;
  }

  const absolute = path.resolve(root, relative);
  const rootWithSep = path.resolve(root) + path.sep;
  if (absolute !== path.resolve(root) && !absolute.startsWith(rootWithSep)) {
    sendNotFound(res);
    return;
  }

  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    sendNotFound(res);
    return;
  }

  if (stat.isDirectory()) {
    if (!decoded.endsWith("/")) {
      res.writeHead(301, { Location: `${decoded}/` });
      res.end();
      return;
    }
    const indexFile = path.join(absolute, "index.html");
    try {
      stat = fs.statSync(indexFile);
      relative = path.relative(root, indexFile).replace(/\\/g, "/");
    } catch {
      sendNotFound(res);
      return;
    }
    return serveFile(req, res, indexFile, relative, stat, noStore, documentRoot);
  }

  if (!stat.isFile()) {
    sendNotFound(res);
    return;
  }
  return serveFile(req, res, absolute, relative, stat, noStore, documentRoot);
}

function serveFile(req, res, absolute, relative, stat, noStore = false, documentRoot = true) {
  if (!documentRoot && !path.extname(relative)) {
    sendNotFound(res);
    return;
  }
  const ext = path.extname(relative).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    sendNotFound(res);
    return;
  }

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const lastModified = new Date(stat.mtimeMs).toUTCString();
  const cacheControl = noStore ? "no-store, max-age=0" : cacheControlFor(relative);
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": cacheControl });
    res.end();
    return;
  }

  const range = req.headers.range;
  const commonHeaders = {
    "Content-Type": mime,
    "Cache-Control": cacheControl,
    ETag: etag,
    "Last-Modified": lastModified,
    "Accept-Ranges": "bytes",
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range));
    if (match) {
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const safeEnd = Math.min(end, stat.size - 1);
        res.writeHead(206, {
          ...commonHeaders,
          "Content-Range": `bytes ${start}-${safeEnd}/${stat.size}`,
          "Content-Length": safeEnd - start + 1,
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(absolute, { start, end: safeEnd }).pipe(res);
        return;
      }
    }
    res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(200, {
    ...commonHeaders,
    "Content-Length": stat.size,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(absolute).pipe(res);
}

module.exports = { serveStatic, shouldBlockPath, cacheControlFor, MIME };
