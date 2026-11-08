"use strict";

const { normalizeText, isValidEmail, redactPII } = require("./security");

const PII_FIELDS = ["name", "email", "company", "role", "country"];
const AUTO_STATUSES = new Set(["new", "exploring", "qualified", "quote_requested", "human_requested"]);
const ALL_STATUSES = new Set([
  "new",
  "exploring",
  "qualified",
  "quote_requested",
  "human_requested",
  "contacted",
  "proposal_sent",
  "won",
  "lost",
  "archived",
]);

const FIELD_LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  role: 120,
  country: 80,
  preferred_language: 40,
  project_type: 120,
  project_description: 2400,
  budget_range: 100,
  timeline: 100,
  conversation_summary: 1000,
};

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseProfileRow(row) {
  if (!row) return null;
  const { token_hash: _tokenHash, ...publicRow } = row;
  return {
    ...publicRow,
    interests: parseJsonArray(row.interests),
    lead_score_reasons: (() => {
      try {
        const parsed = JSON.parse(row.lead_score_reasons || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    consent_status: Boolean(row.consent_status),
  };
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = normalizeText(value, maxLength);
  return cleaned || null;
}

function cleanEmail(value) {
  const email = cleanString(value, FIELD_LIMITS.email);
  if (!email) return null;
  const normalized = email.toLowerCase();
  return isValidEmail(normalized) ? normalized : null;
}

function sanitizeMetadata(input, { consentStatus = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};

  for (const field of Object.keys(FIELD_LIMITS)) {
    if (field === "email") {
      const email = cleanEmail(input.email);
      if (email) output.email = email;
      continue;
    }
    const value = cleanString(input[field], FIELD_LIMITS[field]);
    if (value) output[field] = value;
  }

  if (Array.isArray(input.interests)) {
    const seen = new Set();
    const interests = [];
    for (const raw of input.interests.slice(0, 12)) {
      const item = cleanString(raw, 80);
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      interests.push(item);
    }
    if (interests.length) output.interests = interests;
  }

  if (typeof input.consent_requested === "boolean") {
    output.consent_requested = input.consent_requested;
  }
  if (typeof input.quote_requested === "boolean") {
    output.quote_requested = input.quote_requested;
  }
  if (typeof input.human_assistance === "boolean") {
    output.human_assistance = input.human_assistance;
  }
  if (typeof input.lead_status === "string" && ALL_STATUSES.has(input.lead_status)) {
    output.lead_status = input.lead_status;
  }

  if (!consentStatus) {
    for (const field of PII_FIELDS) delete output[field];
    delete output.project_description;
    if (output.conversation_summary) {
      output.conversation_summary = redactPII(output.conversation_summary);
    }
  } else if (output.project_description) {
    output.project_description = normalizeText(output.project_description, FIELD_LIMITS.project_description);
  }

  return output;
}

const PROJECT_SIGNALS = [
  { type: "Website", pattern: /\b(website|web site|landing page|e-?commerce|online store|shopify|portfolio site)\b/i, interest: "Website development" },
  { type: "AI assistant", pattern: /\b(ai assistant|chatbot|chat bot|llm|ai integration|ai agent|retrieval|rag)\b/i, interest: "AI assistants & integrations" },
  { type: "SaaS", pattern: /\b(saas|software as a service|subscription platform)\b/i, interest: "SaaS development" },
  { type: "Mobile app", pattern: /\b(mobile app|ios app|android app|app store)\b/i, interest: "Mobile & web applications" },
  { type: "Web app", pattern: /\b(web app|dashboard|portal|platform|application)\b/i, interest: "Web applications" },
  { type: "Automation", pattern: /\b(automation|automate|workflow|n8n|zapier)\b/i, interest: "Business automation" },
  { type: "UI/UX", pattern: /\b(ui\/ux|ux design|interface design|design system|brand identity|branding|art direction)\b/i, interest: "UI/UX design" },
  { type: "Data & analytics", pattern: /\b(data|analytics|visuali[sz]ation|vector search|dashboarding)\b/i, interest: "Data & analytics" },
  { type: "Cybersecurity", pattern: /\b(cyber ?security|security review|penetration|secure coding)\b/i, interest: "Cybersecurity" },
  { type: "Software engineering", pattern: /\b(software|api|integration|laravel|react|vue\.js|node\.js)\b/i, interest: "Software engineering" },
];

function extractSignals(text, { consentStatus = false } = {}) {
  const value = String(text || "");
  const matched = PROJECT_SIGNALS.filter((entry) => entry.pattern.test(value));
  const interests = matched.map((entry) => entry.interest);
  const projectType = matched.length ? matched[0].type : null;

  const budgetMatch = value.match(
    /(?:budget|budget range|spend|invest|around|about|up to|between)[^.\n]{0,40}?([$€£]\s?\d[\d.,\s]*(?:k|m)?|\d[\d.,\s]*(?:k|m)?\s?(?:eur|usd|gbp|€|\$|£))/i
  );
  const budgetRange = budgetMatch
    ? normalizeText(budgetMatch[1], 100).replace(/[.,;:]+$/, "")
    : null;

  const timelineMatch = value.match(
    /\b(asap|as soon as possible|immediately|next month|next quarter|this month|this quarter|this year|within \d+\s*(?:days|weeks|months)|in \d+\s*(?:days|weeks|months)|\d+\s*(?:days|weeks|months)|q[1-4]\s*20\d{2}|q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|by (?:the )?(?:end of )?20\d{2})\b/i
  );
  const timeline = timelineMatch
    ? normalizeText(timelineMatch[1], 100).replace(/[.,;:]+$/, "")
    : null;

  const emailMatch = value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  const quoteRequested = /\b(quote|quotation|estimate|cost|price|pricing|how much|proposal|rates?)\b/i.test(value);
  const humanAssistance = /\b(human|call me|phone|speak to someone|talk to someone|contact me|book a call|email me)\b/i.test(value);
  const projectIntent =
    matched.length > 0 ||
    quoteRequested ||
    /\b(i (?:want|need|would like|am looking) (?:to|for)|we (?:want|need|would like|are looking)|start a project|build|redesign|launch)\b/i.test(
      value
    );

  return {
    projectType,
    interests,
    budgetRange,
    timeline,
    email: consentStatus ? email : null,
    quoteRequested,
    humanAssistance,
    projectIntent,
    // Signals derived from the visitor's own message, never from IP or browser data.
    source: "visitor_message",
  };
}

function mergeProfile(existing, meta, signals, { consentStatus = false } = {}) {
  const updates = {};
  const nextInterests = new Set(parseJsonArray(existing.interests).map((item) => String(item)));

  for (const item of meta.interests || []) nextInterests.add(item);
  for (const item of signals.interests || []) nextInterests.add(item);

  const nextFields = {
    ...meta,
    ...(meta.project_type ? {} : signals.projectType ? { project_type: signals.projectType } : {}),
    ...(meta.budget_range ? {} : signals.budgetRange ? { budget_range: signals.budgetRange } : {}),
    ...(meta.timeline ? {} : signals.timeline ? { timeline: signals.timeline } : {}),
    ...(meta.email ? {} : consentStatus && signals.email ? { email: signals.email } : {}),
  };

  for (const field of Object.keys(FIELD_LIMITS)) {
    if (field === "conversation_summary") continue;
    if (field === "email") continue;
    if (PII_FIELDS.includes(field) && !consentStatus) continue;
    if (!consentStatus && field === "project_description") continue;
    const value = nextFields[field];
    if (!value) continue;
    if (existing[field] !== value) updates[field] = value;
  }

  if (nextFields.email && consentStatus && !existing.email) {
    updates.email = nextFields.email;
  }

  const interests = Array.from(nextInterests).slice(0, 20);
  if (interests.length && JSON.stringify(interests) !== JSON.stringify(parseJsonArray(existing.interests))) {
    updates.interests = interests;
  }

  if (meta.conversation_summary) {
    const summary = consentStatus ? meta.conversation_summary : redactPII(meta.conversation_summary);
    if (summary !== existing.conversation_summary) updates.conversation_summary = summary;
  }

  return updates;
}

function scoreLead(visitor, weights, { userMessageCount = 0, signals = {} } = {}) {
  const reasons = [];
  let score = 0;
  const add = (condition, points, code, label) => {
    if (!condition || points <= 0) return;
    score += points;
    reasons.push({ code, label, points });
  };

  const interests = parseJsonArray(visitor.interests);
  add(Boolean(visitor.project_type), weights.projectType, "project_type", "Project type identified");
  add(
    Boolean(visitor.project_description && visitor.project_description.length >= 80),
    weights.description,
    "description",
    "Detailed project requirements"
  );
  add(Boolean(visitor.budget_range), weights.budget, "budget", "Budget range provided");
  add(Boolean(visitor.timeline), weights.timeline, "timeline", "Timeline provided");
  add(Boolean(signals.quoteRequested || visitor.lead_status === "quote_requested"), weights.quote, "quote", "Requested a quotation");
  add(
    Boolean(visitor.consent_status && (visitor.email || visitor.name)),
    weights.contact,
    "contact",
    "Consented contact details"
  );
  add(Boolean(visitor.consent_status && visitor.company), weights.company, "company", "Company provided");
  add(userMessageCount >= 5 || interests.length >= 3, weights.repeat, "engagement", "Meaningful discovery conversation");

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

function deriveLeadStatus({ existingStatus, score, qualifiedThreshold, signals = {} }) {
  if (!AUTO_STATUSES.has(existingStatus)) return existingStatus || "new";
  if (signals.humanAssistance) return "human_requested";
  if (signals.quoteRequested) return "quote_requested";
  if (score >= qualifiedThreshold) return "qualified";
  if (signals.projectIntent || score > 0) return "exploring";
  return "new";
}

module.exports = {
  AUTO_STATUSES,
  ALL_STATUSES,
  PII_FIELDS,
  FIELD_LIMITS,
  parseJsonArray,
  parseProfileRow,
  sanitizeMetadata,
  extractSignals,
  mergeProfile,
  scoreLead,
  deriveLeadStatus,
  redactPII,
};
