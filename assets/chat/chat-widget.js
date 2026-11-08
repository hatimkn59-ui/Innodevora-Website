"use strict";

(() => {
  if (window.__ndvChatLoaded) return;
  window.__ndvChatLoaded = true;

  const PANEL_ID = "ndv-chat-panel";
  const state = {
    boot: null,
    csrf: null,
    mode: "live",
    hasBootstrapped: false,
    isOpen: false,
    isLoading: false,
    isSending: false,
    consentStatus: false,
    consentPrompted: false,
    consentDismissed: false,
    menuOpen: false,
    privacyOpen: false,
    assistantBubble: null,
    assistantText: "",
    hadStreamError: false,
    lastUserMessage: "",
  };

  const els = {};
  let typingEl = null;
  let root = null;

  function createRoot() {
    const existing = document.getElementById("ndv-chat-root");
    if (existing) return existing;
    const container = document.createElement("div");
    container.id = "ndv-chat-root";
    container.className = "ndv-chat";
    container.innerHTML = `
      <button class="ndv-launcher" id="ndv-launcher" type="button" aria-controls="${PANEL_ID}" aria-expanded="false">
        <span class="ndv-launcher__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-1.02 0-2-.14-2.9-.4L4 21l1.36-3.86C3.88 15.65 3 13.4 3 11c0-4.42 4.03-8 9-8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 11h.01M12 11h.01M16 11h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </span>
        <span class="ndv-launcher__text">Ask Innodevora</span>
        <span class="ndv-launcher__dot" id="ndv-launcher-dot" aria-hidden="true"></span>
      </button>

      <section class="ndv-panel" id="${PANEL_ID}" role="dialog" aria-modal="false" aria-labelledby="ndv-chat-title" hidden>
        <header class="ndv-header">
          <div class="ndv-header__brand">
            <span class="ndv-header__mark" aria-hidden="true">
              <img src="/brand/logo-innodevora.svg" alt="" />
            </span>
            <div>
              <h2 class="ndv-header__title" id="ndv-chat-title">Innodevora Assistant</h2>
              <p class="ndv-header__sub"><span class="ndv-status-dot" id="ndv-status-dot"></span><span id="ndv-status-text">AI assistant</span></p>
            </div>
          </div>
          <div class="ndv-header__actions">
            <button class="ndv-icon-button" id="ndv-menu-button" type="button" aria-label="Chat options" aria-expanded="false" aria-controls="ndv-menu">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>
            </button>
            <button class="ndv-icon-button" id="ndv-close" type="button" aria-label="Close chat">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="ndv-menu" id="ndv-menu" hidden></div>
        </header>

        <div class="ndv-notice" id="ndv-notice">
          <span class="ndv-notice__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 14v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </span>
          <span id="ndv-notice-text">Chats are stored for context. Personal details are saved only with consent.</span>
          <button class="ndv-text-button" id="ndv-privacy-link" type="button">Privacy</button>
        </div>

        <div class="ndv-messages" id="ndv-messages" role="log" aria-live="polite" aria-label="Conversation"></div>

        <form class="ndv-composer" id="ndv-form">
          <div class="ndv-composer__field">
            <textarea id="ndv-input" rows="1" maxlength="1500" placeholder="Tell me about your project…" aria-label="Message the Innodevora assistant"></textarea>
            <button class="ndv-send" id="ndv-send" type="submit" aria-label="Send message" disabled>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="ndv-composer__foot">
            <span>AI can make mistakes. <button class="ndv-text-button" id="ndv-human-help" type="button">Talk to a human</button></span>
            <span class="ndv-composer__hint">Enter to send</span>
          </div>
        </form>

        <div class="ndv-privacy" id="ndv-privacy" role="dialog" aria-modal="true" aria-labelledby="ndv-privacy-title" hidden>
          <div class="ndv-privacy__backdrop" data-close-privacy></div>
          <div class="ndv-privacy__card" role="document">
            <div class="ndv-privacy__top">
              <div>
                <p class="ndv-eyebrow">Your data</p>
                <h3 id="ndv-privacy-title">A clear, short notice.</h3>
              </div>
              <button class="ndv-icon-button" id="ndv-privacy-close" type="button" aria-label="Close privacy notice">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="ndv-privacy__body">
              <p><strong>What is stored.</strong> Your conversation and anonymous project interests are kept so the assistant can remember context. Your name, email, company, role and country are saved only after you choose to give consent.</p>
              <p><strong>How it is used.</strong> To answer your questions, understand your project and let the Innodevora team follow up on a project enquiry. We do not sell your data or use it for unrelated marketing.</p>
              <p><strong>AI processing.</strong> Messages may be processed by our AI provider to generate a reply. Provider keys stay on our server and are never sent to your browser.</p>
              <p><strong>Retention.</strong> Records are deleted automatically after the retention period configured by Innodevora. You can also delete everything now.</p>
              <p><strong>Your choices.</strong> Clear the conversation, withdraw consent or delete your stored data from the options menu (•••). You can also email <a href="mailto:contact@innodevora.com">contact@innodevora.com</a>.</p>
              <p><a class="ndv-read-more" href="/privacy/" target="_blank" rel="noopener">Read the full privacy notice</a></p>
            </div>
          </div>
        </div>

        <div class="ndv-sr-only" id="ndv-announcer" aria-live="polite"></div>
      </section>
    `;
    document.body.append(container);
    return container;
  }

  function cacheElements() {
    els.launcher = document.getElementById("ndv-launcher");
    els.launcherDot = document.getElementById("ndv-launcher-dot");
    els.panel = document.getElementById(PANEL_ID);
    els.menuButton = document.getElementById("ndv-menu-button");
    els.menu = document.getElementById("ndv-menu");
    els.close = document.getElementById("ndv-close");
    els.messages = document.getElementById("ndv-messages");
    els.form = document.getElementById("ndv-form");
    els.input = document.getElementById("ndv-input");
    els.send = document.getElementById("ndv-send");
    els.humanHelp = document.getElementById("ndv-human-help");
    els.privacyLink = document.getElementById("ndv-privacy-link");
    els.privacy = document.getElementById("ndv-privacy");
    els.privacyClose = document.getElementById("ndv-privacy-close");
    els.statusText = document.getElementById("ndv-status-text");
    els.statusDot = document.getElementById("ndv-status-dot");
    els.noticeText = document.getElementById("ndv-notice-text");
    els.announcer = document.getElementById("ndv-announcer");
  }

  function announce(message) {
    if (!els.announcer) return;
    els.announcer.textContent = "";
    setTimeout(() => {
      els.announcer.textContent = message;
    }, 30);
  }

  function setMode(mode) {
    state.mode = mode;
    const isDemo = mode === "demo";
    const isDisabled = mode === "disabled";
    const isOffline = mode === "unavailable" || isDisabled;
    if (els.statusText) {
      els.statusText.textContent = isDisabled
        ? "Assistant paused"
        : isDemo
          ? "Demo mode · local answers"
          : isOffline
            ? "Assistant offline"
            : "AI assistant · online";
    }
    els.statusDot?.classList.toggle("is-demo", isDemo);
    els.statusDot?.classList.toggle("is-offline", isOffline);
    els.launcherDot?.classList.toggle("is-demo", isDemo);
    els.launcherDot?.classList.toggle("is-offline", isOffline);
    if (isOffline) {
      els.noticeText.textContent = isDisabled
        ? "The assistant is temporarily paused. Email contact@innodevora.com."
        : "The assistant is not configured yet. Email contact@innodevora.com.";
      els.input.disabled = true;
      els.send.disabled = true;
      els.input.placeholder = isDisabled
        ? "Assistant paused — email contact@innodevora.com"
        : "Assistant unavailable — email contact@innodevora.com";
    } else {
      els.input.disabled = false;
      els.input.placeholder = "Tell me about your project…";
      els.noticeText.textContent = state.consentStatus
        ? "You have consented to save project details. You can withdraw or delete them from the menu."
        : "Chats are stored for context. Personal details are saved only with consent.";
    }
    updateSendState();
  }

  function scrollToBottom(behavior = "auto") {
    if (!els.messages) return;
    requestAnimationFrame(() => {
      els.messages.scrollTo({ top: els.messages.scrollHeight, behavior });
    });
  }

  function resetMessages() {
    els.messages.innerHTML = "";
    typingEl = null;
    state.assistantBubble = null;
    state.assistantText = "";
  }

  function updateSendState() {
    if (!els.input || !els.send) return;
    const hasText = els.input.value.trim().length > 0;
    const isOffline = state.mode === "unavailable" || state.mode === "disabled";
    els.send.disabled = state.isSending || !hasText || isOffline;
  }

  function autoResizeInput() {
    if (!els.input) return;
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(120, els.input.scrollHeight)}px`;
  }

  function addWelcome() {
    const welcome =
      state.boot?.welcome ||
      "Hi — I'm the Innodevora Assistant. I can explain our services, help shape a project brief, or connect you with the team. What are you working on?";
    appendMessage("assistant", welcome);
    addSuggestions();
  }

  function addSuggestions() {
    const existing = els.messages.querySelector(".ndv-suggestions");
    if (existing) existing.remove();
    const questions = state.boot?.suggestedQuestions || [
      "What does Innodevora do?",
      "Can you build an AI assistant?",
      "How does a project start?",
    ];
    const wrap = document.createElement("div");
    wrap.className = "ndv-suggestions";
    wrap.setAttribute("aria-label", "Suggested questions");
    for (const question of questions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ndv-suggestion";
      button.textContent = question;
      button.addEventListener("click", () => {
        els.input.value = question;
        autoResizeInput();
        updateSendState();
        sendCurrentMessage();
      });
      wrap.append(button);
    }
    els.messages.append(wrap);
    scrollToBottom();
  }

  function appendMessage(role, text, options = {}) {
    const row = document.createElement("div");
    row.className = `ndv-msg ndv-msg--${role === "user" ? "user" : "assistant"}`;
    if (role === "assistant") {
      const mark = document.createElement("span");
      mark.className = "ndv-msg__mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "✦";
      row.append(mark);
    }
    const bubble = document.createElement("div");
    bubble.className = "ndv-msg__bubble";
    const body = document.createElement("div");
    body.className = "ndv-msg__body";
    body.textContent = text;
    bubble.append(body);
    if (options.link) {
      const link = document.createElement("a");
      link.className = "ndv-msg__link";
      link.href = options.link.href;
      link.textContent = options.link.label;
      if (options.link.external) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      bubble.append(link);
    }
    row.append(bubble);
    els.messages.append(row);
    scrollToBottom();
    return { row, bubble, body };
  }

  function appendSystemNote(text) {
    const note = document.createElement("div");
    note.className = "ndv-system-note";
    note.textContent = text;
    els.messages.append(note);
    scrollToBottom();
  }

  function showTyping() {
    hideTyping();
    const row = document.createElement("div");
    row.className = "ndv-msg ndv-msg--assistant ndv-typing-row";
    row.innerHTML = `<span class="ndv-msg__mark" aria-hidden="true">✦</span><div class="ndv-typing" aria-label="Assistant is typing"><span></span><span></span><span></span></div>`;
    els.messages.append(row);
    typingEl = row;
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl) typingEl.remove();
    typingEl = null;
  }

  function showLoading() {
    resetMessages();
    const loading = document.createElement("div");
    loading.className = "ndv-loading";
    loading.innerHTML = `<div class="ndv-skeleton"></div><div class="ndv-skeleton"></div><div class="ndv-skeleton ndv-skeleton--short"></div>`;
    els.messages.append(loading);
    state.isLoading = true;
  }

  function renderConversation() {
    resetMessages();
    const messages = Array.isArray(state.boot?.messages) ? state.boot.messages : [];
    if (messages.length) {
      const divider = document.createElement("div");
      divider.className = "ndv-resume";
      divider.textContent = "Earlier conversation";
      els.messages.append(divider);
      for (const message of messages) {
        if (message.role === "user" || message.role === "assistant") {
          appendMessage(message.role, message.content);
        }
      }
      addSuggestions();
    } else {
      addWelcome();
    }
    setMode(state.boot?.aiMode || state.mode);
    scrollToBottom();
  }

  async function bootstrap() {
    state.isLoading = true;
    showLoading();
    try {
      const response = await fetch("/api/chat/bootstrap", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("The assistant could not start a session.");
      const data = await response.json();
      state.boot = data;
      state.csrf = data.csrfToken;
      state.consentStatus = Boolean(data.consentStatus);
      state.consentPrompted = Boolean(data.consentPrompted);
      state.hasBootstrapped = true;
      state.isLoading = false;
      renderConversation();
      if (state.mode === "unavailable") {
        appendMessage(
          "assistant",
          "The assistant is not configured yet, so I can't reply in chat right now. You can reach the Innodevora team directly at contact@innodevora.com.",
          { link: { href: "mailto:contact@innodevora.com", label: "Email the team" } }
        );
      }
      return true;
    } catch (error) {
      state.isLoading = false;
      resetMessages();
      appendMessage(
        "assistant",
        "I couldn't connect to the assistant. Please check your connection and try again, or email contact@innodevora.com.",
        { link: { href: "mailto:contact@innodevora.com", label: "Email the team" } }
      );
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "ndv-retry";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => {
        if (!state.isLoading) bootstrap();
      });
      els.messages.append(retry);
      scrollToBottom();
      return false;
    }
  }

  function openPanel() {
    if (state.isOpen) return;
    state.isOpen = true;
    els.panel.hidden = false;
    els.launcher.setAttribute("aria-expanded", "true");
    document.body.classList.add("ndv-chat-open");
    if (window.matchMedia("(min-width: 721px)").matches) {
      document.body.classList.remove("ndv-chat-locked");
    } else {
      document.body.classList.add("ndv-chat-locked");
    }
    if (!state.hasBootstrapped) {
      bootstrap();
    } else {
      setMode(state.boot?.aiMode || state.mode);
      scrollToBottom();
    }
    setTimeout(() => {
      if (state.mode !== "unavailable" && state.mode !== "disabled") els.input.focus();
      else els.close.focus();
    }, 120);
  }

  function closePanel() {
    if (!state.isOpen) return;
    state.isOpen = false;
    closeMenu();
    closePrivacy();
    els.panel.hidden = true;
    els.launcher.setAttribute("aria-expanded", "false");
    document.body.classList.remove("ndv-chat-open", "ndv-chat-locked");
    els.launcher.focus();
  }

  function togglePanel() {
    if (state.isOpen) closePanel();
    else openPanel();
  }

  function openMenu() {
    state.menuOpen = true;
    renderMenu();
    els.menu.hidden = false;
    els.menuButton.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    state.menuOpen = false;
    els.menu.hidden = true;
    els.menuButton.setAttribute("aria-expanded", "false");
  }

  function menuItem(action, label, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ndv-menu__item ${className}`.trim();
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", () => {
      closeMenu();
      handleMenuAction(action);
    });
    return button;
  }

  function renderMenu() {
    els.menu.innerHTML = "";
    els.menu.append(menuItem("clear", "Clear conversation"));
    if (!state.consentStatus) {
      els.menu.append(menuItem("consent", "Save project details"));
    } else {
      els.menu.append(menuItem("withdraw", "Withdraw consent"));
    }
    els.menu.append(menuItem("privacy", "Privacy notice"));
    els.menu.append(menuItem("human", "Contact a human"));
    const divider = document.createElement("div");
    divider.className = "ndv-menu__divider";
    els.menu.append(divider);
    els.menu.append(menuItem("delete", "Delete my data", "ndv-menu__item--danger"));
  }

  async function handleMenuAction(action) {
    if (action === "clear") return clearConversation();
    if (action === "consent") {
      const card = ensureConsentCard();
      if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (action === "withdraw") return withdrawConsent();
    if (action === "privacy") return openPrivacy();
    if (action === "human") return showHuman();
    if (action === "delete") return deleteData();
    return undefined;
  }

  function showHuman() {
    appendMessage(
      "assistant",
      "You can reach the Innodevora team at contact@innodevora.com. Tell them a little about the project, your goal and any timing — that will make the first conversation more useful.",
      { link: { href: "mailto:contact@innodevora.com", label: "contact@innodevora.com" } }
    );
  }

  function ensureConsentCard() {
    if (state.consentStatus) return null;
    const existing = els.messages.querySelector(".ndv-consent-card");
    if (existing) return existing;
    const card = document.createElement("div");
    card.className = "ndv-consent-card";
    card.innerHTML = `
      <p class="ndv-eyebrow">Optional</p>
      <h3>Keep the context for the team?</h3>
      <p>Allow Innodevora to save this project conversation and your contact details so the team can follow up. You can continue anonymously.</p>
      <div class="ndv-consent-card__actions">
        <button type="button" class="ndv-consent-allow">Allow &amp; continue</button>
        <button type="button" class="ndv-consent-later">Not now</button>
      </div>
      <a class="ndv-consent-card__privacy" href="/privacy/" target="_blank" rel="noopener">How your data is used</a>
    `;
    card.querySelector(".ndv-consent-allow").addEventListener("click", grantConsent);
    card.querySelector(".ndv-consent-later").addEventListener("click", () => {
      card.remove();
      state.consentDismissed = true;
      appendSystemNote("Continuing anonymously. You can save details later from the options menu.");
    });
    els.messages.append(card);
    scrollToBottom();
    return card;
  }

  async function grantConsent() {
    if (state.isSending || state.consentStatus) return;
    const card = els.messages.querySelector(".ndv-consent-card");
    const allow = card?.querySelector(".ndv-consent-allow");
    if (allow) allow.disabled = true;
    try {
      const response = await fetch("/api/chat/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf || "",
        },
        body: JSON.stringify({ consent: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Consent could not be saved.");
      state.consentStatus = true;
      card?.remove();
      setMode(state.mode);
      appendSystemNote("Consent saved. You can withdraw it or delete your data from the options menu.");
      announce("Consent saved. Your project details can now be stored.");
    } catch (error) {
      if (allow) allow.disabled = false;
      appendSystemNote(error.message || "Consent could not be saved. Please try again.");
    }
  }

  async function withdrawConsent() {
    if (!state.consentStatus) return;
    if (!window.confirm("Withdraw consent and remove saved name, email and company details?")) return;
    try {
      const response = await fetch("/api/chat/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf || "",
        },
        body: JSON.stringify({ consent: false }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Consent could not be withdrawn.");
      state.consentStatus = false;
      setMode(state.mode);
      appendSystemNote("Consent withdrawn. Identifiable details have been removed.");
    } catch (error) {
      appendSystemNote(error.message || "Consent could not be withdrawn.");
    }
  }

  async function clearConversation() {
    if (!window.confirm("Clear this conversation? The visitor profile and consent stay in place.")) return;
    try {
      const response = await fetch("/api/chat/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf || "",
        },
        body: "{}",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "The conversation could not be cleared.");
      if (data?.bootstrap) {
        state.boot = data.bootstrap;
        state.csrf = data.bootstrap.csrfToken;
        state.consentStatus = Boolean(data.bootstrap.consentStatus);
        state.consentPrompted = Boolean(data.bootstrap.consentPrompted);
      }
      resetMessages();
      addWelcome();
      setMode(state.boot?.aiMode || state.mode);
      announce("Conversation cleared.");
    } catch (error) {
      appendSystemNote(error.message || "The conversation could not be cleared.");
    }
  }

  async function deleteData() {
    if (
      !window.confirm(
        "Delete your profile, conversations and consent history? This cannot be undone."
      )
    )
      return;
    try {
      const response = await fetch("/api/chat/delete-data", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf || "",
        },
        body: "{}",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Your data could not be deleted.");
      if (data?.bootstrap) {
        state.boot = data.bootstrap;
        state.csrf = data.bootstrap.csrfToken;
        state.consentStatus = Boolean(data.bootstrap.consentStatus);
        state.consentPrompted = Boolean(data.bootstrap.consentPrompted);
      }
      resetMessages();
      addWelcome();
      setMode(state.boot?.aiMode || state.mode);
      appendSystemNote("Your stored data has been deleted.");
      announce("Your stored data has been deleted.");
    } catch (error) {
      appendSystemNote(error.message || "Your data could not be deleted.");
    }
  }

  async function sendCurrentMessage() {
    if (state.isSending || state.isLoading) return;
    const message = els.input.value.trim();
    if (!message) return;
    if (message.length > (state.boot?.maxMessageChars || 1500)) {
      appendSystemNote(`Please keep messages under ${state.boot?.maxMessageChars || 1500} characters.`);
      return;
    }
    if (state.mode === "unavailable" || state.mode === "disabled") {
      showHuman();
      return;
    }
    if (!state.hasBootstrapped) {
      const ok = await bootstrap();
      if (!ok) return;
    }

    state.isSending = true;
    state.hadStreamError = false;
    state.assistantBubble = null;
    state.assistantText = "";
    state.lastUserMessage = message;
    els.input.value = "";
    autoResizeInput();
    updateSendState();
    els.messages.querySelector(".ndv-suggestions")?.remove();
    appendMessage("user", message);
    showTyping();
    announce("Message sent.");

    let done = false;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrf || "",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        hideTyping();
        if (response.status === 401) {
          state.hasBootstrapped = false;
          await bootstrap();
          appendSystemNote("Your session was refreshed. Please send the message again.");
        } else if (response.status === 429) {
          const retry = response.headers.get("Retry-After");
          appendSystemNote(
            `Too many messages. Please wait ${retry || "a few"} seconds and try again.`
          );
        } else {
          appendSystemNote(
            data?.error || "The assistant could not reply. Please try again or email contact@innodevora.com."
          );
        }
        return;
      }

      await consumeStream(response, {
        onDelta(text) {
          hideTyping();
          if (!state.assistantBubble) {
            state.assistantBubble = appendMessage("assistant", "");
          }
          state.assistantText += text;
          state.assistantBubble.body.textContent = state.assistantText;
          scrollToBottom();
        },
        onDone(data) {
          done = true;
          hideTyping();
          if (!state.assistantBubble) {
            state.assistantBubble = appendMessage(
              "assistant",
              "I don't have a useful answer for that yet. You can reach the team at contact@innodevora.com.",
              { link: { href: "mailto:contact@innodevora.com", label: "Email the team" } }
            );
          }
          if (state.assistantBubble) {
            state.assistantBubble.row.classList.remove("is-streaming");
          }
          state.consentStatus = Boolean(data.consentStatus);
          setMode(state.mode);
          if (data.consentRequested && !state.consentStatus && !state.consentDismissed) {
            ensureConsentCard();
          }
          if (data.consentRequested) state.consentPrompted = true;
          announce("Assistant replied.");
        },
        onError(data) {
          state.hadStreamError = true;
          hideTyping();
          if (state.assistantBubble && !state.assistantText) {
            state.assistantBubble.row.remove();
            state.assistantBubble = null;
          }
          appendSystemNote(data?.message || "The connection was interrupted. Please try again.");
          announce("The assistant could not finish the answer.");
        },
      });

      if (!done && !state.hadStreamError) {
        hideTyping();
        appendSystemNote("The connection ended before the answer was complete. Please try again.");
      }
    } catch (error) {
      hideTyping();
      appendSystemNote(
        "I couldn't connect to the assistant. Please check your connection and try again, or email contact@innodevora.com."
      );
      announce("Connection problem.");
    } finally {
      state.isSending = false;
      hideTyping();
      updateSendState();
      if (state.mode !== "unavailable") els.input.focus();
    }
  }

  async function consumeStream(response, handlers) {
    if (!response.body) throw new Error("Streaming is not available.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    const handleEvent = (raw) => {
      const lines = raw.split("\n");
      let event = "message";
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        return;
      }
      if (event === "delta" && typeof data.text === "string") handlers.onDelta(data.text);
      else if (event === "done") handlers.onDone(data);
      else if (event === "error") handlers.onError(data);
      if (event === "done" || event === "error") finished = true;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleEvent(raw);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);
    if (!finished) {
      // A done/error event is always sent by the server. If the stream ended
      // without one, surface the incomplete state rather than silently hanging.
      handlers.onError({ message: "The connection ended before the answer was complete." });
    }
  }

  function openPrivacy() {
    state.privacyOpen = true;
    els.privacy.hidden = false;
    els.privacyClose.focus();
  }

  function closePrivacy() {
    state.privacyOpen = false;
    els.privacy.hidden = true;
  }

  function bindEvents() {
    els.launcher.addEventListener("click", togglePanel);
    els.close.addEventListener("click", closePanel);
    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendCurrentMessage();
    });
    els.input.addEventListener("input", () => {
      autoResizeInput();
      updateSendState();
    });
    els.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendCurrentMessage();
      }
    });
    els.menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.menuOpen) closeMenu();
      else openMenu();
    });
    els.privacyLink.addEventListener("click", openPrivacy);
    els.privacyClose.addEventListener("click", closePrivacy);
    els.privacy.querySelector("[data-close-privacy]").addEventListener("click", closePrivacy);
    els.humanHelp.addEventListener("click", () => {
      if (!state.hasBootstrapped) {
        openPanel();
        return;
      }
      showHuman();
    });
    document.addEventListener("click", (event) => {
      if (
        state.menuOpen &&
        !els.menu.contains(event.target) &&
        !els.menuButton.contains(event.target)
      ) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (state.privacyOpen) {
        closePrivacy();
        return;
      }
      if (state.menuOpen) {
        closeMenu();
        return;
      }
      if (state.isOpen) closePanel();
    });
    window.addEventListener("resize", () => {
      if (!state.isOpen) return;
      if (window.matchMedia("(min-width: 721px)").matches) {
        document.body.classList.remove("ndv-chat-locked");
      } else {
        document.body.classList.add("ndv-chat-locked");
      }
    });
  }

  function init() {
    root = createRoot();
    cacheElements();
    bindEvents();
    setMode("live");
    updateSendState();
    if (window.location.hash === "#chat") {
      setTimeout(openPanel, 120);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
