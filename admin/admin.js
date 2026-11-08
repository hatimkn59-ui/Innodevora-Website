"use strict";

(() => {
  const state = {
    csrf: null,
    admin: null,
    view: "leads",
    filters: {
      search: "",
      status: "all",
      consent: "all",
      sort: "last_seen",
      page: 1,
    },
    auditPage: 1,
    overview: null,
    assistant: null,
    detailId: null,
    detail: null,
    booted: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STATUS_LABELS = {
    new: "New",
    exploring: "Exploring",
    qualified: "Qualified",
    quote_requested: "Quote requested",
    human_requested: "Human requested",
    contacted: "Contacted",
    proposal_sent: "Proposal sent",
    won: "Won",
    lost: "Lost",
    archived: "Archived",
  };

  const VIEW_COPY = {
    leads: { eyebrow: "Overview", title: "Lead intelligence" },
    assistant: { eyebrow: "AI assistant", title: "Assistant control" },
    audit: { eyebrow: "Security", title: "Audit log" },
    settings: { eyebrow: "Configuration", title: "Settings" },
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(value, length = 80) {
    const text = String(value ?? "");
    if (text.length <= length) return text;
    return `${text.slice(0, length - 1).trimEnd()}…`;
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || titleCase(status);
  }

  function statusPill(status) {
    return `<span class="status-pill status-pill--${escapeHtml(status)}">${escapeHtml(
      statusLabel(status)
    )}</span>`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function relativeTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const ranges = [
      ["year", 31536000],
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    for (const [unit, size] of ranges) {
      if (Math.abs(seconds) >= size || unit === "minute") {
        const value = Math.round(seconds / size);
        try {
          return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
        } catch {
          return `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? "" : "s"} ago`;
        }
      }
    }
    return "just now";
  }

  function displayName(visitor) {
    return visitor.name || visitor.email || "Anonymous visitor";
  }

  function initialsFor(value) {
    const name = String(value || "").trim();
    if (!name) return "A";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function gradientFor(value) {
    let hash = 0;
    for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % 5;
  }

  function avatarHtml(visitor, size = "small") {
    return `<span class="avatar avatar--${size} avatar--gradient-${gradientFor(
      visitor.id || displayName(visitor)
    )}">${escapeHtml(initialsFor(displayName(visitor)))}</span>`;
  }

  function canWrite() {
    return state.admin && (state.admin.role === "owner" || state.admin.role === "admin");
  }

  function toast(message, type = "success") {
    const region = $("#toast-region");
    const node = document.createElement("div");
    node.className = `toast${type === "error" ? " toast--error" : ""}`;
    node.innerHTML = `<span class="dot"></span><span>${escapeHtml(message)}</span>`;
    region.append(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      setTimeout(() => node.remove(), 240);
    }, 4200);
  }

  async function api(path, options = {}) {
    const { method = "GET", body, silent = false, timeout = 20000 } = options;
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && method !== "HEAD" && state.csrf) {
      headers["X-CSRF-Token"] = state.csrf;
    }
    let response;
    try {
      response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new Error("Could not reach the server. Check your connection.");
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (response.status === 401 && !silent) {
      showLogin("Your session expired. Please sign in again.");
      const error = new Error("Session expired.");
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setLoginError(message) {
    const error = $("#login-error");
    if (!message) {
      error.hidden = true;
      error.textContent = "";
      return;
    }
    error.hidden = false;
    error.textContent = message;
  }

  function showLogin(message = "") {
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
    $("#login-password").value = "";
    setLoginError(message);
    setTimeout(() => $("#login-username").focus(), 40);
  }

  function showApp() {
    $("#login-view").hidden = true;
    $("#app-view").hidden = false;
  }

  function setUserChip() {
    if (!state.admin) return;
    $("#user-name").textContent = state.admin.username;
    $("#user-role").textContent = state.admin.role;
    $("#user-avatar").textContent = initialsFor(state.admin.username);
    $("#health-role").textContent = titleCase(state.admin.role);
  }

  function setAiMode(mode, enabled = true) {
    const label = !enabled
      ? "Assistant paused"
      : mode === "live"
        ? "Live AI"
        : mode === "demo"
          ? "Demo mode"
          : "Not configured";
    $("#ai-mode-label").textContent = label;
    const dot = $(".sidebar__status .dot");
    if (dot) {
      dot.classList.toggle("dot--live", enabled && mode === "live");
      dot.style.background = !enabled
        ? "var(--muted)"
        : mode === "live"
          ? ""
          : mode === "demo"
            ? "var(--amber)"
            : "var(--accent)";
    }
  }

  function renderOverview() {
    const overview = state.overview;
    if (!overview) return;
    const { stats, knowledge, ai, assistant } = overview;
    $("#stat-total").textContent = stats.totalVisitors;
    $("#stat-consented").textContent = stats.consented;
    $("#stat-qualified").textContent = stats.qualified;
    $("#stat-new").textContent = stats.newThisWeek;
    $("#stat-score").textContent = stats.averageScore;
    $("#nav-lead-count").textContent = stats.totalVisitors;
    $("#health-ai").textContent =
      ai.mode === "live" ? "Live provider connected" : ai.mode === "demo" ? "Deterministic demo mode" : "Not configured";
    $("#health-knowledge").textContent = knowledge.available
      ? `Loaded · ${knowledge.sectionCount} sections`
      : "Unavailable";
    $("#health-version").textContent = knowledge.version || "—";
    $("#health-updated").textContent = formatDate(knowledge.updatedAt);
    setAiMode(ai.mode, assistant?.enabled !== false);
    $("#retention-visitor").value = overview.retention.visitorDays;
    $("#retention-conversation").value = overview.retention.conversationDays;
    const notice = $("#settings-notice");
    if (ai.mode === "live") {
      notice.textContent =
        "Provider keys never reach the browser. The raw knowledge Markdown is never served to visitors.";
    } else if (ai.mode === "demo") {
      notice.textContent =
        "Demo mode is active: answers come from a conservative local fallback and no external AI provider is called. Set AI_API_KEY for live conversations.";
    } else {
      notice.textContent =
        "No AI provider is configured. Chat requests currently return a graceful 503 with the contact email. Set AI_API_KEY and restart the server.";
    }
    $("#export-button").disabled = !canWrite();
    $("#retention-form")
      .querySelectorAll("input, button")
      .forEach((node) => {
        node.disabled = !canWrite();
      });
  }

  async function loadOverview() {
    const overview = await api("/api/admin/overview");
    state.overview = overview;
    renderOverview();
  }

  function renderAssistantConversations(items) {
    const list = $("#assistant-conversations");
    const empty = $("#assistant-conversations-empty");
    if (!list || !empty) return;
    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items
      .map((item) => {
        const name = item.name || item.email || "Anonymous visitor";
        const contact = item.company || item.email || "No contact details";
        return `<button class="conversation-row" type="button" data-visitor-id="${escapeHtml(
          item.visitorId
        )}">
          <span class="conversation-row__identity">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(contact)}</small>
          </span>
          <span class="conversation-row__summary">${escapeHtml(
            truncate(item.summary || "No conversation summary yet.", 110)
          )}</span>
          <span class="conversation-row__meta">
            ${statusPill(item.leadStatus)}
            <small>${Number(item.messageCount) || 0} msg · ${escapeHtml(
              relativeTime(item.updatedAt)
            )}</small>
          </span>
        </button>`;
      })
      .join("");
    list.querySelectorAll("[data-visitor-id]").forEach((button) => {
      button.addEventListener("click", () => openDetail(button.dataset.visitorId));
    });
  }

  function renderAssistantErrors(items) {
    const list = $("#assistant-errors");
    const empty = $("#assistant-errors-empty");
    if (!list || !empty) return;
    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items
      .map(
        (item) => `<div class="error-row">
          <span class="dot"></span>
          <span class="error-row__body">
            <strong>${escapeHtml(item.errorCode || "AI_ERROR")}</strong>
            <small>${escapeHtml(titleCase(item.status))} · ${escapeHtml(
              item.mode || "unknown"
            )} · ${Number(item.latencyMs) || 0} ms</small>
          </span>
          <time>${escapeHtml(relativeTime(item.createdAt))}</time>
        </div>`
      )
      .join("");
  }

  function renderAssistant() {
    const data = state.assistant;
    if (!data) return;
    const { settings, ai, knowledge, usage } = data;
    const writable = canWrite();
    const toggle = $("#assistant-enabled");
    toggle.checked = Boolean(settings.enabled);
    toggle.disabled = !writable;
    $("#assistant-toggle-save").disabled = !writable;
    $("#assistant-enabled-note").textContent = settings.enabled
      ? "Visitors can start conversations."
      : "Visitors see a paused message and the contact email.";
    $("#assistant-welcome").value = settings.welcome || "";
    $("#assistant-instructions").value = settings.customInstructions || "";
    $("#assistant-questions").value = (settings.suggestedQuestions || []).join("\n");
    $("#assistant-form")
      .querySelectorAll("input, textarea, button")
      .forEach((node) => {
        node.disabled = !writable;
      });
    $("#assistant-form-hint").textContent = writable
      ? "Built-in safety rules always apply."
      : "Your role is read-only.";
    $("#assistant-control-notice").textContent = settings.enabled
      ? "The assistant is live. Pausing keeps conversations and leads intact."
      : "The assistant is paused. Visitors can still email contact@innodevora.com.";

    $("#assistant-health-enabled").textContent = settings.enabled ? "Enabled" : "Paused";
    $("#assistant-health-ai").textContent =
      ai.mode === "live"
        ? "Live provider connected"
        : ai.mode === "demo"
          ? "Deterministic demo mode"
          : "Not configured";
    $("#assistant-health-knowledge").textContent = knowledge.available
      ? `Loaded · ${knowledge.sectionCount} sections · v${knowledge.version}`
      : "Unavailable";
    $("#assistant-health-requests").textContent = String(usage.total || 0);
    $("#assistant-health-breakdown").textContent = `${usage.success || 0} / ${
      usage.fallback || 0
    } / ${usage.errors || 0}`;
    $("#assistant-health-latency").textContent = `${usage.averageLatencyMs || 0} ms`;
    $("#assistant-health-last").textContent = usage.lastRequest
      ? `${titleCase(usage.lastRequest.status)} · ${relativeTime(usage.lastRequest.createdAt)}`
      : "No requests yet";

    setAiMode(ai.mode, settings.enabled);
    renderAssistantConversations(data.recentConversations || []);
    renderAssistantErrors(usage.recentErrors || []);
  }

  async function loadAssistant() {
    const data = await api("/api/admin/assistant");
    state.assistant = data;
    renderAssistant();
  }

  async function saveAssistant(message = "Assistant settings saved.") {
    if (!canWrite()) {
      toast("Your role cannot change assistant settings.", "error");
      return;
    }
    const button = $("#assistant-toggle-save");
    button.disabled = true;
    try {
      const result = await api("/api/admin/assistant", {
        method: "PATCH",
        body: {
          enabled: $("#assistant-enabled").checked,
          welcome: $("#assistant-welcome").value.trim(),
          customInstructions: $("#assistant-instructions").value.trim(),
          suggestedQuestions: $("#assistant-questions")
            .value.split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        },
      });
      if (state.assistant) state.assistant.settings = result.settings;
      renderAssistant();
      await loadOverview();
      toast(message);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = !canWrite();
    }
  }

  function setLoadingLeads(loading) {
    $("#leads-loading").hidden = !loading;
    $("#leads-empty").hidden = true;
    if (loading) {
      $("#leads-body").innerHTML = "";
      $("#lead-cards").innerHTML = "";
    }
  }

  function emptyLeadsVisible(show) {
    $("#leads-empty").hidden = !show;
    if (show) {
      $("#leads-body").innerHTML = "";
      $("#lead-cards").innerHTML = "";
    }
  }

  function leadRow(visitor) {
    const name = displayName(visitor);
    const sub =
      visitor.company ||
      (visitor.email && visitor.email !== name ? visitor.email : "") ||
      "No company provided";
    const project = visitor.project_type || "Project not identified";
    const summary = visitor.conversation_summary
      ? truncate(visitor.conversation_summary, 70)
      : truncate((visitor.interests || []).join(" · "), 70) || "No summary yet";
    const score = Math.max(0, Math.min(100, Number(visitor.lead_score) || 0));
    return `<tr tabindex="0" data-id="${escapeHtml(visitor.id)}" aria-label="Open ${escapeHtml(
      name
    )}">
      <td>
        <div class="visitor-cell">
          ${avatarHtml(visitor)}
          <div class="visitor-cell__text">
            <span class="visitor-cell__name">${escapeHtml(name)}</span>
            <span class="visitor-cell__sub">${escapeHtml(sub)}</span>
          </div>
        </div>
      </td>
      <td>
        <div class="project-cell">
          <strong>${escapeHtml(project)}</strong>
          <small>${escapeHtml(summary)}</small>
        </div>
      </td>
      <td>${statusPill(visitor.lead_status)}</td>
      <td>
        <div class="score-cell">
          <div class="score-cell__row">
            <span class="score-cell__value">${score}</span>
            <span class="score-bar"><i style="width:${score}%"></i></span>
          </div>
        </div>
      </td>
      <td><span class="time-cell" title="${escapeHtml(formatDate(visitor.last_seen))}">${escapeHtml(
        relativeTime(visitor.last_seen)
      )}</span></td>
      <td>
        <span class="row-open" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </td>
    </tr>`;
  }

  function leadCard(visitor) {
    const name = displayName(visitor);
    const sub =
      visitor.company ||
      (visitor.email && visitor.email !== name ? visitor.email : "") ||
      "Anonymous visitor";
    const score = Math.max(0, Math.min(100, Number(visitor.lead_score) || 0));
    return `<article class="lead-card" tabindex="0" data-id="${escapeHtml(visitor.id)}" aria-label="Open ${escapeHtml(
      name
    )}">
      <div class="lead-card__top">
        <div class="visitor-cell">
          ${avatarHtml(visitor)}
          <div class="visitor-cell__text">
            <span class="visitor-cell__name">${escapeHtml(name)}</span>
            <span class="visitor-cell__sub">${escapeHtml(sub)}</span>
          </div>
        </div>
        ${statusPill(visitor.lead_status)}
      </div>
      <div class="lead-card__meta">
        <span><strong>Project</strong> ${escapeHtml(visitor.project_type || "Not identified")}</span>
        <span><strong>Last seen</strong> ${escapeHtml(relativeTime(visitor.last_seen))}</span>
        <span><strong>Messages</strong> ${Number(visitor.message_count) || 0}</span>
      </div>
      <div class="lead-card__bottom">
        <span class="lead-card__meta">${escapeHtml(
          truncate(visitor.conversation_summary || (visitor.interests || []).join(" · ") || "No summary yet", 90)
        )}</span>
        <span class="lead-card__score">
          <span class="score-cell__value">${score}</span>
          <span class="score-bar score-bar--accent"><i style="width:${score}%"></i></span>
        </span>
      </div>
    </article>`;
  }

  function updatePagination(data) {
    const start = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
    const end = Math.min(data.total, data.page * data.limit);
    $("#pagination-label").textContent = `Showing ${start}–${end} of ${data.total}`;
    $("#prev-page").disabled = data.page <= 1;
    $("#next-page").disabled = data.page >= data.pages;
  }

  function attachLeadOpenHandlers() {
    $$("[data-id]", $("#leads-table-wrap")).forEach((node) => {
      node.addEventListener("click", () => openDetail(node.dataset.id));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(node.dataset.id);
        }
      });
    });
  }

  async function loadLeads() {
    setLoadingLeads(true);
    const params = new URLSearchParams({
      search: state.filters.search,
      status: state.filters.status,
      consent: state.filters.consent,
      sort: state.filters.sort,
      page: String(state.filters.page),
      limit: "25",
    });
    try {
      const data = await api(`/api/admin/leads?${params.toString()}`);
      setLoadingLeads(false);
      if (!data.items.length) {
        emptyLeadsVisible(true);
      } else {
        emptyLeadsVisible(false);
        $("#leads-body").innerHTML = data.items.map(leadRow).join("");
        $("#lead-cards").innerHTML = data.items.map(leadCard).join("");
        attachLeadOpenHandlers();
      }
      updatePagination(data);
    } catch (error) {
      setLoadingLeads(false);
      toast(error.message, "error");
    }
  }

  function scoreReasons(reasons) {
    if (!Array.isArray(reasons) || !reasons.length) {
      return `<li><span>No qualification signals yet.</span><strong>0</strong></li>`;
    }
    return reasons
      .map(
        (reason) =>
          `<li><span>${escapeHtml(reason.label || reason.code)}</span><strong>+${Number(
            reason.points
          )}</strong></li>`
      )
      .join("");
  }

  function profileField(label, value, { email = false, wide = false } = {}) {
    const display = value ? escapeHtml(value) : "—";
    const content =
      email && value
        ? `<a href="mailto:${encodeURIComponent(value)}">${escapeHtml(value)}</a>`
        : display;
    return `<div${wide ? ' style="grid-column:1/-1"' : ""}><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
  }

  function renderDetail(detail) {
    const visitor = detail.visitor;
    const name = displayName(visitor);
    $("#detail-avatar").className = `avatar avatar--large avatar--gradient-${gradientFor(visitor.id)}`;
    $("#detail-avatar").textContent = initialsFor(name);
    $("#detail-name").textContent = name;
    $("#detail-sub").textContent =
      [
        visitor.company,
        visitor.email && visitor.email !== name ? visitor.email : "",
        visitor.role,
        visitor.country,
      ]
        .filter(Boolean)
        .join(" · ") || "No contact details saved";
    $("#detail-eyebrow").textContent = visitor.consent_status ? "Consented lead" : "Anonymous visitor";
    $("#detail-status").value = visitor.lead_status;
    $("#detail-status").disabled = !canWrite();
    $("#detail-score").textContent = visitor.lead_score;
    $("#detail-score-bar").style.width = `${Math.max(0, Math.min(100, Number(visitor.lead_score) || 0))}%`;
    const consent = $("#detail-consent");
    consent.className = `detail-consent ${visitor.consent_status ? "detail-consent--yes" : "detail-consent--no"}`;
    consent.innerHTML = `<span>Consent</span><strong>${
      visitor.consent_status ? "Given · details may be saved" : "Not given"
    }</strong>`;

    $("#detail-summary").textContent =
      visitor.conversation_summary || "No conversation summary has been generated yet.";

    const interests = Array.isArray(visitor.interests) && visitor.interests.length
      ? visitor.interests.join(", ")
      : "—";
    $("#detail-profile").innerHTML = [
      profileField("Email", visitor.email, { email: true }),
      profileField("Company", visitor.company),
      profileField("Role", visitor.role),
      profileField("Country", visitor.country),
      profileField("Language", visitor.preferred_language),
      profileField("Project type", visitor.project_type),
      profileField("Budget range", visitor.budget_range),
      profileField("Timeline", visitor.timeline),
      profileField("Interests", interests, { wide: true }),
      profileField("Project description", visitor.project_description, { wide: true }),
      profileField("First seen", formatDate(visitor.first_seen)),
      profileField("Last seen", formatDate(visitor.last_seen)),
      profileField("Visitor ID", visitor.id),
    ].join("");

    $("#detail-reasons").innerHTML = scoreReasons(visitor.lead_score_reasons);

    const messages = detail.messages || [];
    $("#detail-transcript").innerHTML = messages.length
      ? messages
          .map((message) => {
            const role = message.role === "user" ? "Visitor" : message.role === "assistant" ? "Assistant" : "System";
            return `<div class="message message--${message.role === "user" ? "user" : "assistant"}">
              <span class="message__meta">${escapeHtml(role)} · ${escapeHtml(formatDate(message.created_at))}${
                message.redacted ? ' <span class="redacted-pill">redacted pre-consent</span>' : ""
              }</span>
              <span class="message__body">${escapeHtml(message.content)}</span>
            </div>`;
          })
          .join("")
      : `<div class="detail-loading">No messages stored for this visitor.</div>`;

    const events = detail.consentEvents || [];
    $("#detail-consent-history").innerHTML = events.length
      ? events
          .map(
            (event) => `<div class="consent-event ${event.consent_status ? "" : "consent-event--withdrawn"}">
              <span class="dot ${event.consent_status ? "dot--live" : ""}"></span>
              <span>${event.consent_status ? "Consent granted" : "Consent withdrawn"} · ${escapeHtml(
                formatDate(event.created_at)
              )} · ${escapeHtml(event.source)}</span>
            </div>`
          )
          .join("")
      : `<div class="consent-event"><span class="dot"></span><span>No consent events recorded.</span></div>`;

    $("#detail-delete").disabled = !canWrite();
    $("#detail-delete").hidden = !canWrite();
    $("#detail-content").hidden = false;
    $("#detail-loading").hidden = true;
    $("#detail-scroll").scrollTop = 0;
  }

  async function openDetail(id) {
    state.detailId = id;
    state.detail = null;
    const dialog = $("#detail-dialog");
    $("#detail-content").hidden = true;
    $("#detail-loading").hidden = false;
    $("#detail-name").textContent = "Loading…";
    $("#detail-sub").textContent = "";
    $("#detail-avatar").className = "avatar avatar--large";
    $("#detail-avatar").textContent = "…";
    if (!dialog.open) dialog.showModal();
    try {
      const detail = await api(`/api/admin/visitors/${encodeURIComponent(id)}`);
      state.detail = detail;
      renderDetail(detail);
    } catch (error) {
      $("#detail-loading").textContent = error.message;
      toast(error.message, "error");
    }
  }

  async function updateDetailStatus(status) {
    if (!state.detailId || !canWrite()) return;
    const select = $("#detail-status");
    select.disabled = true;
    try {
      await api(`/api/admin/visitors/${encodeURIComponent(state.detailId)}`, {
        method: "PATCH",
        body: { status },
      });
      toast(`Status updated to ${statusLabel(status)}.`);
      if (state.detail) state.detail.visitor.lead_status = status;
      await Promise.all([loadLeads(), loadOverview()]);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      select.disabled = false;
    }
  }

  async function deleteDetail() {
    if (!state.detailId || !canWrite()) return;
    const confirmed = window.confirm(
      "Delete this visitor and all stored conversations? This cannot be undone."
    );
    if (!confirmed) return;
    try {
      await api(`/api/admin/visitors/${encodeURIComponent(state.detailId)}`, { method: "DELETE" });
      $("#detail-dialog").close();
      toast("Visitor record deleted.");
      await Promise.all([loadLeads(), loadOverview()]);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function exportCsv() {
    if (!canWrite()) {
      toast("Your role cannot export lead data.", "error");
      return;
    }
    const params = new URLSearchParams({
      search: state.filters.search,
      status: state.filters.status,
      consent: state.filters.consent,
      sort: state.filters.sort,
    });
    try {
      const response = await fetch(`/api/admin/export.csv?${params.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "text/csv" },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `innodevora-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("Lead export downloaded.");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function auditLabel(action) {
    return String(action || "")
      .replace(/^admin\./, "")
      .replace(/^visitor\./, "")
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function loadAudit() {
    $("#audit-list").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    try {
      const data = await api(`/api/admin/audit?page=${state.auditPage}&limit=50`);
      $("#audit-empty").hidden = data.items.length > 0;
      $("#audit-list").innerHTML = data.items
        .map((item) => {
          let details = "";
          if (item.details) {
            try {
              details = JSON.stringify(item.details);
            } catch {
              details = "";
            }
          }
          return `<div class="audit-row">
            <div class="audit-row__time">${escapeHtml(formatDate(item.created_at))}</div>
            <div>
              <div class="audit-row__action">${escapeHtml(auditLabel(item.action))}</div>
              <div class="audit-row__meta">
                <span class="audit-actor ${item.actor_type === "admin" ? "audit-actor--admin" : ""}">${escapeHtml(
                  item.actor_type
                )}</span>
                ${item.target_type ? ` · ${escapeHtml(item.target_type)}` : ""}
                ${item.target_id ? ` · ${escapeHtml(String(item.target_id).slice(0, 8))}` : ""}
              </div>
            </div>
            <div class="audit-row__details">${escapeHtml(truncate(details, 220))}</div>
          </div>`;
        })
        .join("");
      const start = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
      const end = Math.min(data.total, data.page * data.limit);
      $("#audit-page-label").textContent = `Showing ${start}–${end} of ${data.total}`;
      $("#audit-prev").disabled = data.page <= 1;
      $("#audit-next").disabled = data.page >= data.pages;
    } catch (error) {
      $("#audit-list").innerHTML = "";
      toast(error.message, "error");
    }
  }

  function setView(view) {
    state.view = view;
    $$(".nav__item").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    $$(".view").forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
    const copy = VIEW_COPY[view];
    $("#page-eyebrow").textContent = copy.eyebrow;
    $("#page-title").textContent = copy.title;
    if (view === "assistant") {
      loadAssistant().catch((error) => toast(error.message, "error"));
    }
    if (view === "audit") loadAudit();
    if (view === "settings") {
      if (state.overview) renderOverview();
      else loadOverview().catch((error) => toast(error.message, "error"));
    }
  }

  async function refreshCurrent() {
    const button = $("#refresh-button");
    button.disabled = true;
    try {
      if (state.view === "leads") {
        await Promise.all([loadOverview(), loadLeads()]);
      } else if (state.view === "assistant") {
        await Promise.all([loadOverview(), loadAssistant()]);
      } else if (state.view === "audit") {
        await loadAudit();
      } else {
        await loadOverview();
      }
      toast("Dashboard refreshed.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function boot() {
    try {
      const me = await api("/api/admin/me", { silent: true });
      state.csrf = me.csrfToken;
      state.admin = me.admin;
      showApp();
      setUserChip();
      setAiMode(me.ai?.mode, me.assistant?.enabled !== false);
      await Promise.all([loadOverview(), loadLeads()]);
      state.booted = true;
    } catch (error) {
      showLogin(error.status === 401 ? "" : error.message);
    }
  }

  function bindEvents() {
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginError("");
      const button = $("#login-submit");
      const username = $("#login-username").value.trim();
      const password = $("#login-password").value;
      if (!username || !password) {
        setLoginError("Enter your username and password.");
        return;
      }
      button.disabled = true;
      try {
        const data = await api("/api/admin/login", {
          method: "POST",
          body: { username, password },
          silent: true,
        });
        state.csrf = data.csrfToken;
        state.admin = data.admin;
        $("#login-password").value = "";
        showApp();
        setUserChip();
        setAiMode(data.ai?.mode, data.assistant?.enabled !== false);
        await Promise.all([loadOverview(), loadLeads()]);
        toast("Signed in. Welcome back.");
        state.booted = true;
      } catch (error) {
        setLoginError(error.message || "Sign in failed.");
      } finally {
        button.disabled = false;
        $("#login-password").focus();
      }
    });

    $("#logout-button").addEventListener("click", async () => {
      try {
        await api("/api/admin/logout", { method: "POST", body: {} });
      } catch {
        /* clear the local session even if the server call fails */
      }
      state.csrf = null;
      state.admin = null;
      state.overview = null;
      state.assistant = null;
      state.detail = null;
      showLogin("");
    });

    $$(".nav__item").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    $("#refresh-button").addEventListener("click", refreshCurrent);
    $("#export-button").addEventListener("click", exportCsv);
    $("#assistant-toggle-save").addEventListener("click", () =>
      saveAssistant("Assistant availability saved.")
    );
    $("#assistant-form").addEventListener("submit", (event) => {
      event.preventDefault();
      saveAssistant("Assistant instructions saved.");
    });

    let searchTimer = null;
    $("#lead-search").addEventListener("input", (event) => {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.search = value.trim();
        state.filters.page = 1;
        loadLeads();
      }, 300);
    });

    $("#status-filter").addEventListener("change", (event) => {
      state.filters.status = event.target.value;
      state.filters.page = 1;
      loadLeads();
    });
    $("#consent-filter").addEventListener("change", (event) => {
      state.filters.consent = event.target.value;
      state.filters.page = 1;
      loadLeads();
    });
    $("#sort-filter").addEventListener("change", (event) => {
      state.filters.sort = event.target.value;
      state.filters.page = 1;
      loadLeads();
    });

    $("#prev-page").addEventListener("click", () => {
      if (state.filters.page > 1) {
        state.filters.page -= 1;
        loadLeads();
      }
    });
    $("#next-page").addEventListener("click", () => {
      state.filters.page += 1;
      loadLeads();
    });

    $("#detail-close").addEventListener("click", () => $("#detail-dialog").close());
    $("#detail-dialog").addEventListener("click", (event) => {
      if (event.target === $("#detail-dialog")) $("#detail-dialog").close();
    });
    $("#detail-status").addEventListener("change", (event) => updateDetailStatus(event.target.value));
    $("#detail-delete").addEventListener("click", deleteDetail);

    $("#retention-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!canWrite()) {
        toast("Your role cannot change retention.", "error");
        return;
      }
      try {
        await api("/api/admin/settings/retention", {
          method: "PATCH",
          body: {
            visitorDays: Number($("#retention-visitor").value),
            conversationDays: Number($("#retention-conversation").value),
          },
        });
        toast("Retention settings saved.");
        await loadOverview();
      } catch (error) {
        toast(error.message, "error");
      }
    });

    $("#purge-button").addEventListener("click", async () => {
      if (!canWrite()) {
        toast("Your role cannot purge data.", "error");
        return;
      }
      if (!window.confirm("Purge all records older than the configured retention windows?")) return;
      try {
        const result = await api("/api/admin/purge", { method: "POST", body: {} });
        const total =
          (result.result?.oldVisitors || 0) +
          (result.result?.oldConversations || 0) +
          (result.result?.expiredSessions || 0);
        toast(`Purge complete. ${total} expired record group(s) removed.`);
        await Promise.all([loadOverview(), loadLeads()]);
      } catch (error) {
        toast(error.message, "error");
      }
    });

    $("#audit-prev").addEventListener("click", () => {
      if (state.auditPage > 1) {
        state.auditPage -= 1;
        loadAudit();
      }
    });
    $("#audit-next").addEventListener("click", () => {
      state.auditPage += 1;
      loadAudit();
    });
  }

  bindEvents();
  boot();
})();
