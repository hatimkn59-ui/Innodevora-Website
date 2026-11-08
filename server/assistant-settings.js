"use strict";

const { getSetting, setSetting } = require("./db");
const { normalizeText } = require("./security");
const { SUGGESTED_QUESTIONS, DEFAULT_WELCOME } = require("./prompts");

const LIMITS = {
  welcome: 600,
  customInstructions: 6000,
  suggestedQuestion: 160,
  suggestedQuestions: 6,
};

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseQuestions(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const questions = parsed
      .map((item) => normalizeText(item, LIMITS.suggestedQuestion))
      .filter(Boolean)
      .slice(0, LIMITS.suggestedQuestions);
    return questions.length ? questions : null;
  } catch {
    return null;
  }
}

function getAssistantSettings(db) {
  const storedQuestions = parseQuestions(getSetting(db, "assistant.suggestedQuestions", ""));
  return {
    enabled: parseBoolean(getSetting(db, "assistant.enabled", "true"), true),
    welcome:
      normalizeText(getSetting(db, "assistant.welcome", DEFAULT_WELCOME), LIMITS.welcome) ||
      DEFAULT_WELCOME,
    customInstructions: normalizeText(
      getSetting(db, "assistant.customInstructions", ""),
      LIMITS.customInstructions
    ),
    suggestedQuestions: storedQuestions || [...SUGGESTED_QUESTIONS],
    updatedAt: getSetting(db, "assistant.updatedAt", null),
  };
}

function validateAssistantSettings(input) {
  const errors = [];
  const enabled =
    input.enabled === undefined
      ? true
      : input.enabled === true || input.enabled === 1 || input.enabled === "true";
  const welcome = normalizeText(input.welcome, LIMITS.welcome + 1);
  const customInstructions = normalizeText(
    input.customInstructions,
    LIMITS.customInstructions + 1
  );
  const rawQuestions = Array.isArray(input.suggestedQuestions)
    ? input.suggestedQuestions
    : [];
  const suggestedQuestions = rawQuestions
    .map((item) => normalizeText(item, LIMITS.suggestedQuestion + 1))
    .filter(Boolean);

  if (!welcome) errors.push("Welcome message is required.");
  if (welcome.length > LIMITS.welcome) {
    errors.push(`Welcome message must be ${LIMITS.welcome} characters or fewer.`);
  }
  if (customInstructions.length > LIMITS.customInstructions) {
    errors.push(
      `Additional instructions must be ${LIMITS.customInstructions} characters or fewer.`
    );
  }
  if (suggestedQuestions.length > LIMITS.suggestedQuestions) {
    errors.push(`Use no more than ${LIMITS.suggestedQuestions} suggested questions.`);
  }
  for (const question of suggestedQuestions) {
    if (question.length > LIMITS.suggestedQuestion) {
      errors.push(
        `Each suggested question must be ${LIMITS.suggestedQuestion} characters or fewer.`
      );
      break;
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    settings: {
      enabled,
      welcome,
      customInstructions,
      suggestedQuestions: suggestedQuestions.length
        ? suggestedQuestions
        : [...SUGGESTED_QUESTIONS],
    },
  };
}

function updateAssistantSettings(db, input) {
  const validated = validateAssistantSettings(input);
  if (!validated.ok) return validated;
  const settings = validated.settings;
  setSetting(db, "assistant.enabled", settings.enabled ? "true" : "false");
  setSetting(db, "assistant.welcome", settings.welcome);
  setSetting(db, "assistant.customInstructions", settings.customInstructions);
  setSetting(db, "assistant.suggestedQuestions", JSON.stringify(settings.suggestedQuestions));
  setSetting(db, "assistant.updatedAt", new Date().toISOString());
  return { ok: true, settings: getAssistantSettings(db) };
}

module.exports = {
  DEFAULT_WELCOME,
  LIMITS,
  getAssistantSettings,
  validateAssistantSettings,
  updateAssistantSettings,
};
