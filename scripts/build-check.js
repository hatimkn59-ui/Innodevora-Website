"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "index.html",
  "package.json",
  "knowledge/INNODEVORA.md",
  "server/index.js",
  "server/app.js",
  "admin/index.html",
  "admin/admin.js",
  "admin/admin.css",
  "assets/chat/chat-widget.js",
  "assets/chat/chat-widget.css",
  "privacy/index.html",
  "about/index.html",
  "services/index.html",
  "docs/CHATBOT.md",
  "docs/DEPLOYMENT.md",
  "Dockerfile",
  "render.yaml",
];

let failed = false;
for (const relative of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    console.error(`MISSING ${relative}`);
    failed = true;
  }
}

const check = spawnSync(process.execPath, [path.join(__dirname, "check.js")], {
  stdio: "inherit",
  windowsHide: true,
});
if (check.status !== 0) failed = true;

if (failed) {
  console.error("\nBuild check failed.");
  process.exit(1);
}

console.log("\nOK: static site, AI assistant backend and admin dashboard are ready.");
console.log("This project has no bundling step. Start it with: npm start");
