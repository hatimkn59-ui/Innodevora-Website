"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { KnowledgeBase, parseSections, tokenize } = require("../server/knowledge");
const { createSilentLogger } = require("./helpers");

function tempKnowledge(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "innodevora-knowledge-"));
  const filePath = path.join(dir, "knowledge.md");
  fs.writeFileSync(filePath, content, "utf8");
  return { dir, filePath };
}

test("parseSections separates the preamble and level-two sections", () => {
  const parsed = parseSections("# Title\n\nPreamble text.\n\n## Services\n\nWe build websites.\n\n## Pricing\n\nNo fixed prices.");
  assert.match(parsed.preamble, /Preamble text/);
  assert.deepEqual(
    parsed.sections.map((section) => section.title),
    ["Services", "Pricing"]
  );
  assert.match(parsed.sections[0].body, /We build websites/);
});

test("tokenize removes stop words and keeps useful terms", () => {
  const tokens = tokenize("What does the company do for AI assistants in Paris?");
  assert.ok(tokens.includes("company"));
  assert.ok(tokens.includes("assistants"));
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("what"));
});

test("knowledge loads, caches, versions and reloads changed content", () => {
  const { dir, filePath } = tempKnowledge(
    "# Knowledge\n\n## Company overview\n\nInnodevora builds websites.\n\n## Our services\n\nAI assistants and SaaS.\n"
  );
  try {
    const knowledge = new KnowledgeBase({ filePath, logger: createSilentLogger() });
    const first = knowledge.getStatus();
    assert.equal(first.available, true);
    assert.equal(first.sectionCount, 2);

    const context = knowledge.getContext("Do you build AI assistants?");
    assert.match(context.text, /Company overview/);
    assert.match(context.text, /AI assistants and SaaS/);
    assert.equal(context.version, first.version);

    fs.writeFileSync(filePath, "# Knowledge\n\n## Company overview\n\nUpdated content.\n", "utf8");
    const second = knowledge.getStatus();
    assert.notEqual(second.version, first.version);
    assert.match(knowledge.getContext("updated").text, /Updated content/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing and empty knowledge files degrade gracefully", () => {
  const missing = path.join(os.tmpdir(), `innodevora-missing-${Date.now()}.md`);
  const knowledge = new KnowledgeBase({ filePath: missing, logger: createSilentLogger() });
  const status = knowledge.getStatus();
  assert.equal(status.available, false);
  assert.equal(status.version, "unavailable");
  assert.match(knowledge.getContext("anything").text, /temporarily unavailable/);

  const { dir, filePath } = tempKnowledge("   \n");
  try {
    const empty = new KnowledgeBase({ filePath, logger: createSilentLogger() });
    assert.equal(empty.getStatus().available, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an unavailable knowledge file never exposes raw content to the fallback", () => {
  const missing = path.join(os.tmpdir(), `innodevora-missing-${Date.now()}-b.md`);
  const knowledge = new KnowledgeBase({ filePath: missing, logger: createSilentLogger() });
  assert.equal(knowledge.getPlainTextForFallback(), "");
});
