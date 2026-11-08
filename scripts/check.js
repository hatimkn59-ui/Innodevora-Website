"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const targets = ["server", "admin", "assets/chat", "tests", "scripts"];
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith(".js")) files.push(full);
  }
}

for (const target of targets) walk(path.join(root, target));
files.push(path.join(root, "package.json"));

let failed = false;
for (const file of files) {
  if (file.endsWith("package.json")) {
    try {
      JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`FAIL package.json: ${error.message}`);
      failed = true;
    }
    continue;
  }
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.error(`FAIL ${path.relative(root, file)}`);
    console.error(result.stderr.trim());
    failed = true;
  }
}

if (failed) {
  console.error(`\n${files.length} files checked, with failures.`);
  process.exit(1);
}
console.log(`OK: ${files.length} JavaScript files parse cleanly.`);
