"use strict";

const crypto = require("node:crypto");
const { NOW } = require("./db");
const { audit } = require("./db");
const {
  ensureVisitorContext,
  clearConversation,
  deleteVisitor,
  clearVisitorCookies,
} = require("./sessions");
const {
  AUTO_STATUSES,
  sanitizeMetadata,
  extractSignals,
  mergeProfile,
  scoreLead,
  deriveLeadStatus,
  redactPII,
} = require("./profile");
const { getAssistantSettings } = require("./assistant-settings");
const { hashIp } = require("./security");

function getMessages(db, conversationId, limit) {
  const rows = db
    .prepare(
      `SELECT id, role, content, redacted, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(conversationId, limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    redacted: Boolean(row.redacted),
    createdAt: row.created_at,
  }));
}

function countUserMessages(db, visitorId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE visitor_id = ? AND role = 'user'")
    .get(visitorId).n;
}

function insertMessage(db, { conversationId, visitorId, role, content, redacted }) {
  const createdAt = NOW();
  db.prepare(
    `INSERT INTO messages (conversation_id, visitor_id, role, content, redacted, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(conversationId, visitorId, role, content, redacted ? 1 : 0, createdAt);
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(createdAt, conversationId);
  return db.prepare("SELECT * FROM messages WHERE id = last_insert_rowid()").get();
}

function publicProfile(visitor) {
  return {
    visitorId: visitor.id,
    name: visitor.name || null,
    email: visitor.email || null,
    company: visitor.company || null,
    role: visitor.role || null,
    country: visitor.country || null,
    preferredLanguage: visitor.preferred_language || null,
    interests: (() => {
      try {
        const value = JSON.parse(visitor.interests || "[]");
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    })(),
    projectType: visitor.project_type || null,
    projectDescription: visitor.project_description || null,
    budgetRange: visitor.budget_range || null,
    timeline: visitor.timeline || null,
    leadStatus: visitor.lead_status,
    leadScore: visitor.lead_score,
    consentStatus: Boolean(visitor.consent_status),
    firstSeen: visitor.first_seen,
    lastSeen: visitor.last_seen,
  };
}

function buildSummary(visitor, signals = {}) {
  const interests = Array.isArray(visitor.interests)
    ? visitor.interests
    : (() => {
        try {
          const value = JSON.parse(visitor.interests || "[]");
          return Array.isArray(value) ? value : [];
        } catch {
          return [];
        }
      })();
  const parts = [];
  if (visitor.project_type || signals.projectType) {
    parts.push(`Project type: ${visitor.project_type || signals.projectType}.`);
  }
  if (interests.length) parts.push(`Interests: ${interests.slice(0, 5).join(", ")}.`);
  if (visitor.project_description) parts.push(visitor.project_description);
  if (visitor.budget_range) parts.push(`Budget range: ${visitor.budget_range}.`);
  if (visitor.timeline) parts.push(`Timeline: ${visitor.timeline}.`);
  if (visitor.consent_status && visitor.name) parts.push(`Visitor: ${visitor.name}.`);
  if (visitor.consent_status && visitor.company) parts.push(`Company: ${visitor.company}.`);
  return parts.join(" ").slice(0, 1000) || null;
}

function buildBootstrapPayload(db, context, config, aiService, knowledge) {
  const profile = publicProfile(context.visitor);
  const assistant = getAssistantSettings(db);
  const messages = getMessages(
    db,
    context.conversation.id,
    config.privacy.messageHistoryLimit
  );
  return {
    conversationId: context.conversation.id,
    csrfToken: context.session.csrf_token,
    profile,
    messages,
    consentStatus: Boolean(context.visitor.consent_status),
    consentPrompted: Boolean(context.conversation.consent_prompted),
    assistantEnabled: assistant.enabled,
    suggestedQuestions: assistant.suggestedQuestions,
    maxMessageChars: config.limits.maxMessageChars,
    aiMode: assistant.enabled ? aiService.mode : "disabled",
    knowledge: knowledge.getStatus(),
    privacy: {
      summary:
        "This chat is stored so the assistant can keep context. Anonymous project interests may be saved. Name, email and company details are only saved after you choose to allow it. You can clear the conversation or delete your data at any time.",
      noticeUrl: "/privacy/",
      contactEmail: "contact@innodevora.com",
      retentionDays: config.privacy.visitorRetentionDays,
    },
    welcome: assistant.enabled
      ? assistant.welcome
      : "The assistant is temporarily paused. You can still reach the Innodevora team at contact@innodevora.com.",
  };
}

function updateVisitor(db, visitorId, updates) {
  const allowed = [
    "name",
    "email",
    "company",
    "role",
    "country",
    "preferred_language",
    "interests",
    "project_type",
    "project_description",
    "budget_range",
    "timeline",
    "lead_status",
    "lead_score",
    "lead_score_reasons",
    "conversation_summary",
    "consent_status",
    "consent_at",
  ];
  const entries = Object.entries(updates).filter(
    ([key, value]) => allowed.includes(key) && value !== undefined
  );
  if (!entries.length) return;
  const sets = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([key, value]) => {
    if (key === "interests" || key === "lead_score_reasons") {
      return JSON.stringify(value);
    }
    if (key === "consent_status") return value ? 1 : 0;
    return value;
  });
  db.prepare(`UPDATE visitors SET ${sets} WHERE id = ?`).run(...values, visitorId);
}

async function sendMessage({
  db,
  config,
  aiService,
  knowledge,
  context,
  message,
  onDelta,
}) {
  const consentStatus = Boolean(context.visitor.consent_status);
  const storedUserContent = consentStatus ? message : redactPII(message);

  const priorMessages = getMessages(
    db,
    context.conversation.id,
    config.privacy.messageHistoryLimit
  );

  insertMessage(db, {
    conversationId: context.conversation.id,
    visitorId: context.visitor.id,
    role: "user",
    content: storedUserContent,
    redacted: !consentStatus,
  });

  const result = await aiService.respond({
    visitor: context.visitor,
    conversationSummary: context.conversation.summary || context.visitor.conversation_summary,
    messages: priorMessages,
    userMessage: message,
    onDelta,
    assistantSettings: getAssistantSettings(db),
  });

  const meta = sanitizeMetadata(result.meta || {}, { consentStatus });
  const signals = extractSignals(message, { consentStatus });
  const assistantStored = consentStatus ? result.text : redactPII(result.text);
  insertMessage(db, {
    conversationId: context.conversation.id,
    visitorId: context.visitor.id,
    role: "assistant",
    content: assistantStored,
    redacted: !consentStatus,
  });

  const updates = mergeProfile(context.visitor, meta, signals, { consentStatus });

  if (meta.preferred_language) updates.preferred_language = meta.preferred_language;
  if (meta.quote_requested) signals.quoteRequested = true;
  if (meta.human_assistance) signals.humanAssistance = true;

  const summaryFromModel = meta.conversation_summary;
  if (summaryFromModel) {
    updates.conversation_summary = consentStatus
      ? summaryFromModel
      : redactPII(summaryFromModel);
  }

  const userMessageCount = countUserMessages(db, context.visitor.id);
  const prospective = { ...context.visitor, ...updates };
  const { score, reasons } = scoreLead(prospective, config.leadWeights, {
    userMessageCount,
    signals,
  });
  const nextStatus = signals.humanAssistance
    ? "human_requested"
    : signals.quoteRequested
      ? "quote_requested"
      : deriveLeadStatus({
          existingStatus: context.visitor.lead_status,
          score,
          qualifiedThreshold: config.qualifiedThreshold,
          signals,
        });

  updates.lead_score = score;
  updates.lead_score_reasons = reasons;
  updates.lead_status = nextStatus;

  if (!updates.conversation_summary) {
    const generated = buildSummary({ ...prospective, ...updates }, signals);
    if (generated) updates.conversation_summary = generated;
  }

  updateVisitor(db, context.visitor.id, updates);

  const summary =
    updates.conversation_summary ||
    context.conversation.summary ||
    context.visitor.conversation_summary ||
    null;
  if (summary) {
    db.prepare("UPDATE conversations SET summary = ?, updated_at = ? WHERE id = ?").run(
      summary,
      NOW(),
      context.conversation.id
    );
  }

  let consentRequested = false;
  if (!consentStatus && !context.conversation.consent_prompted) {
    const shouldAsk =
      meta.consent_requested ||
      (signals.projectIntent && userMessageCount >= 2) ||
      Boolean(meta.email || meta.name || signals.email);
    if (shouldAsk) {
      db.prepare("UPDATE conversations SET consent_prompted = 1 WHERE id = ?").run(
        context.conversation.id
      );
      consentRequested = true;
    }
  }

  return {
    conversationId: context.conversation.id,
    leadStatus: nextStatus,
    leadScore: score,
    consentRequested,
    consentStatus,
    knowledgeVersion: result.knowledgeVersion || knowledge.getStatus().version,
    mode: result.mode,
    providerError: Boolean(result.providerError),
    summary,
  };
}

function setConsent({ db, req, config, context, granted }) {
  const now = NOW();
  const visitorId = context.visitor.id;
  if (granted) {
    updateVisitor(db, visitorId, {
      consent_status: 1,
      consent_at: now,
    });
    db.prepare(
      `INSERT INTO consent_events (visitor_id, consent_status, source, created_at)
       VALUES (?, 1, 'chat_widget', ?)`
    ).run(visitorId, now);
    audit(db, {
      actorType: "visitor",
      actorId: visitorId,
      action: "visitor.consent_granted",
      targetType: "visitor",
      targetId: visitorId,
      details: { source: "chat_widget" },
      ipHash: hashIp(req, config),
    });
    return { consentStatus: true };
  }

  const anonymous = {
    ...context.visitor,
    consent_status: 0,
    name: null,
    email: null,
    company: null,
    role: null,
    country: null,
    project_description: null,
  };
  const { score, reasons } = scoreLead(anonymous, config.leadWeights, {
    userMessageCount: 0,
    signals: {},
  });
  const nextStatus = AUTO_STATUSES.has(context.visitor.lead_status)
    ? deriveLeadStatus({
        existingStatus: "new",
        score,
        qualifiedThreshold: config.qualifiedThreshold,
        signals: {},
      })
    : context.visitor.lead_status;
  const redactedSummary = context.visitor.conversation_summary
    ? redactPII(context.visitor.conversation_summary)
    : null;

  updateVisitor(db, visitorId, {
    consent_status: 0,
    consent_at: null,
    name: null,
    email: null,
    company: null,
    role: null,
    country: null,
    project_description: null,
    lead_score: score,
    lead_score_reasons: reasons,
    lead_status: nextStatus,
    conversation_summary: redactedSummary,
  });

  const rows = db
    .prepare("SELECT id, content FROM messages WHERE visitor_id = ?")
    .all(visitorId);
  const updateMessage = db.prepare("UPDATE messages SET content = ?, redacted = 1 WHERE id = ?");
  for (const row of rows) {
    updateMessage.run(redactPII(row.content), row.id);
  }

  const conversations = db
    .prepare("SELECT id, summary FROM conversations WHERE visitor_id = ? AND summary IS NOT NULL")
    .all(visitorId);
  const updateConversation = db.prepare("UPDATE conversations SET summary = ? WHERE id = ?");
  for (const conversation of conversations) {
    updateConversation.run(redactPII(conversation.summary), conversation.id);
  }

  db.prepare(
    `INSERT INTO consent_events (visitor_id, consent_status, source, created_at)
     VALUES (?, 0, 'chat_widget', ?)`
  ).run(visitorId, now);
  audit(db, {
    actorType: "visitor",
    actorId: visitorId,
    action: "visitor.consent_withdrawn",
    targetType: "visitor",
    targetId: visitorId,
    details: { source: "chat_widget" },
    ipHash: hashIp(req, config),
  });
  return { consentStatus: false };
}

function resetConversation({ db, req, context, config }) {
  const oldId = context.conversation.id;
  const conversation = clearConversation(db, context);
  audit(db, {
    actorType: "visitor",
    actorId: context.visitor.id,
    action: "visitor.conversation_cleared",
    targetType: "conversation",
    targetId: oldId,
    details: { newConversationId: conversation.id },
    ipHash: hashIp(req, config),
  });
  return conversation;
}

function eraseVisitor({ db, res, req, context, config, knowledge, aiService }) {
  const visitorId = context.visitor.id;
  audit(db, {
    actorType: "visitor",
    actorId: visitorId,
    action: "visitor.data_deleted",
    targetType: "visitor",
    targetId: visitorId,
    details: { source: "chat_widget" },
    ipHash: hashIp(req, config),
  });
  deleteVisitor(db, visitorId);
  clearVisitorCookies(res, config);
  const freshContext = ensureVisitorContext(db, req, res, config);
  return {
    deleted: true,
    bootstrap: buildBootstrapPayload(db, freshContext, config, aiService, knowledge),
  };
}

module.exports = {
  getMessages,
  publicProfile,
  buildBootstrapPayload,
  sendMessage,
  setConsent,
  resetConversation,
  eraseVisitor,
  updateVisitor,
};
