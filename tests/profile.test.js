"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeMetadata,
  extractSignals,
  mergeProfile,
  scoreLead,
  deriveLeadStatus,
  parseProfileRow,
} = require("../server/profile");

test("metadata strips direct identifiers before consent", () => {
  const cleaned = sanitizeMetadata(
    {
      name: "Jane Doe",
      email: "Jane@Example.com",
      company: "Acme",
      role: "Founder",
      country: "France",
      project_type: "Website",
      project_description: "A detailed brief with an email jane@example.com",
      budget_range: "€10k",
      timeline: "next month",
      interests: ["Website", "AI"],
      conversation_summary: "Jane at jane@example.com wants a site.",
      consent_requested: true,
      quote_requested: true,
    },
    { consentStatus: false }
  );

  assert.equal(cleaned.name, undefined);
  assert.equal(cleaned.email, undefined);
  assert.equal(cleaned.company, undefined);
  assert.equal(cleaned.project_description, undefined);
  assert.equal(cleaned.project_type, "Website");
  assert.equal(cleaned.budget_range, "€10k");
  assert.deepEqual(cleaned.interests, ["Website", "AI"]);
  assert.doesNotMatch(cleaned.conversation_summary, /jane@example\.com/i);
  assert.equal(cleaned.consent_requested, true);
  assert.equal(cleaned.quote_requested, true);
});

test("metadata keeps validated contact fields after consent", () => {
  const cleaned = sanitizeMetadata(
    {
      name: "Jane Doe",
      email: "Jane@Example.com",
      company: "Acme",
      role: "Founder",
      country: "France",
      project_description: "A detailed brief.",
    },
    { consentStatus: true }
  );
  assert.equal(cleaned.email, "jane@example.com");
  assert.equal(cleaned.name, "Jane Doe");
  assert.equal(cleaned.company, "Acme");
  assert.equal(cleaned.project_description, "A detailed brief.");

  assert.equal(
    sanitizeMetadata({ email: "invalid" }, { consentStatus: true }).email,
    undefined
  );
});

test("signals detect project type, budget, timeline and intent", () => {
  const signals = extractSignals(
    "I need a SaaS web app with a budget around €12k, launch next month, and I would like a quote. Please email me at jane@example.com."
  );
  assert.equal(signals.projectType, "SaaS");
  assert.ok(signals.interests.includes("SaaS development"));
  assert.match(signals.budgetRange, /12k/);
  assert.equal(signals.timeline.toLowerCase(), "next month");
  assert.equal(signals.quoteRequested, true);
  assert.equal(signals.humanAssistance, true);
  assert.equal(signals.projectIntent, true);
  assert.equal(signals.email, null);

  const consented = extractSignals("My email is jane@example.com.", {
    consentStatus: true,
  });
  assert.equal(consented.email, "jane@example.com");
  assert.equal(consented.projectIntent, false);
});

test("lead scoring rewards stated intent, not identity", () => {
  const weights = {
    projectType: 10,
    description: 10,
    budget: 20,
    timeline: 15,
    quote: 15,
    contact: 15,
    company: 5,
    repeat: 5,
  };
  const anonymous = {
    project_type: "Website",
    project_description: "x".repeat(100),
    budget_range: "€10k",
    timeline: "next month",
    consent_status: 0,
    interests: ["Website"],
    lead_status: "exploring",
  };
  const first = scoreLead(anonymous, weights, {
    userMessageCount: 5,
    signals: { quoteRequested: true },
  });
  assert.equal(first.score, 75);
  assert.equal(first.reasons.some((reason) => reason.code === "contact"), false);

  const consented = scoreLead(
    {
      ...anonymous,
      consent_status: 1,
      email: "jane@example.com",
      company: "Acme",
      interests: ["Website", "AI", "SaaS"],
    },
    weights,
    { userMessageCount: 1, signals: { quoteRequested: true } }
  );
  assert.equal(consented.score, 95);
  assert.ok(consented.reasons.some((reason) => reason.code === "contact"));
});

test("lead status follows explicit intent and the qualification threshold", () => {
  assert.equal(
    deriveLeadStatus({
      existingStatus: "new",
      score: 10,
      qualifiedThreshold: 45,
      signals: { humanAssistance: true },
    }),
    "human_requested"
  );
  assert.equal(
    deriveLeadStatus({
      existingStatus: "exploring",
      score: 10,
      qualifiedThreshold: 45,
      signals: { quoteRequested: true },
    }),
    "quote_requested"
  );
  assert.equal(
    deriveLeadStatus({ existingStatus: "new", score: 50, qualifiedThreshold: 45, signals: {} }),
    "qualified"
  );
  assert.equal(
    deriveLeadStatus({ existingStatus: "new", score: 5, qualifiedThreshold: 45, signals: {} }),
    "exploring"
  );
  assert.equal(
    deriveLeadStatus({ existingStatus: "contacted", score: 0, qualifiedThreshold: 45, signals: {} }),
    "contacted"
  );
});

test("profile merging never repeats known data and respects consent", () => {
  const existing = {
    interests: JSON.stringify(["Website"]),
    project_type: "Website",
    email: null,
  };
  const beforeConsent = mergeProfile(
    existing,
    { name: "Jane", email: "jane@example.com", project_description: "Secret brief" },
    { projectType: "Website", interests: ["Website"], email: "jane@example.com" },
    { consentStatus: false }
  );
  assert.equal(beforeConsent.name, undefined);
  assert.equal(beforeConsent.email, undefined);
  assert.equal(beforeConsent.project_description, undefined);
  assert.equal(beforeConsent.interests, undefined);

  const afterConsent = mergeProfile(
    existing,
    {},
    {
      projectType: "Website",
      interests: ["Website"],
      email: "jane@example.com",
    },
    { consentStatus: true }
  );
  assert.equal(afterConsent.email, "jane@example.com");
  assert.equal(afterConsent.project_type, undefined);
  assert.equal(afterConsent.interests, undefined);
});

test("profile rows hide token hashes and parse JSON fields", () => {
  const parsed = parseProfileRow({
    id: "v1",
    token_hash: "secret-token-hash",
    interests: '["AI"]',
    lead_score_reasons: '[{"code":"budget"}]',
    consent_status: 1,
  });
  assert.equal(parsed.token_hash, undefined);
  assert.deepEqual(parsed.interests, ["AI"]);
  assert.deepEqual(parsed.lead_score_reasons, [{ code: "budget" }]);
  assert.equal(parsed.consent_status, true);
});
