/* Mail merge dashboard - frontend (vanilla JS, no build step) */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  view: "overview",
  overview: null,
  accounts: [],
  campaigns: [],
  wizard: { open: false, source: "csv", imp: null, mapping: {} },
  history: { page: 1, total: 0, perPage: 40 },
  drawerCampaignId: null,
  pollTimer: null,
};

/* --------------------------------------------------------------------- */
/* helpers                                                               */
/* --------------------------------------------------------------------- */
async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const message = data.error || `Request failed (HTTP ${res.status})`;
    const err = new Error(message);
    err.code = data.code;
    throw err;
  }
  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function fmtTime(ts) {
  if (!ts) return "–";
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtRelative(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

function toast(message, kind = "info", ms = 5200) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try { return await fn(); }
  catch (err) { toast(err.message, "error", 8000); return null; }
  finally { if (button) button.disabled = false; }
}

/* --------------------------------------------------------------------- */
/* navigation                                                            */
/* --------------------------------------------------------------------- */
const VIEW_TITLES = {
  overview: "Overview",
  accounts: "Gmail accounts",
  campaigns: "Campaigns",
  history: "Email history",
};

function showView(view) {
  state.view = view;
  $$(".view").forEach((el) => {
    const active = el.id === `view-${view}`;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  });
  $$(".nav__item").forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("is-active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  $("#viewTitle").textContent = VIEW_TITLES[view] || view;
  $("#sidebar").classList.remove("is-open");
  refresh();
}

/* --------------------------------------------------------------------- */
/* overview                                                              */
/* --------------------------------------------------------------------- */
async function loadOverview() {
  try {
    state.overview = await api("/api/overview");
  } catch (err) { toast(err.message, "error"); return; }
  const o = state.overview;

  $("#statAccounts").textContent = o.accounts.total;
  $("#statAccountsHint").textContent =
    `${o.accounts.connected} connected${o.accounts.attention ? ` · ${o.accounts.attention} need attention` : ""}`;
  $("#statRecipients").textContent = o.recipients.rows;
  $("#statRecipientsHint").textContent = `${o.recipients.imports} import(s)`;
  $("#statSent").textContent = o.messages.sent;
  $("#statSentHint").textContent = `${o.messages.skipped} skipped`;
  $("#statPending").textContent = o.messages.pending;
  $("#statFailed").textContent = o.messages.failed;
  $("#statSentToday").textContent = o.messages.sent_today;

  const badge = $("#navAccountsBadge");
  badge.hidden = !o.accounts.attention;
  badge.textContent = o.accounts.attention;

  $("#configBanner").hidden = state.configured !== false;

  // campaigns summary
  const list = $("#overviewCampaigns");
  if (!o.campaigns.length) {
    list.innerHTML = `<div class="empty">No campaigns yet. Create one to get started.</div>`;
  } else {
    list.innerHTML = o.campaigns.slice(0, 6).map((c) => `
      <div class="campaign">
        <div class="campaign__top">
          <span class="campaign__name">${esc(c.name)}</span>
          <span class="badge badge--${esc(c.status)}">${esc(c.status)}</span>
          <span class="campaign__meta">${esc(c.account_email || "no account")}</span>
        </div>
        <div class="meter"><div class="meter__fill" style="width:${c.progress}%"></div></div>
        <div class="counts">
          <span><b>${c.sent_count}</b> sent</span>
          <span><b>${c.pending_count}</b> pending</span>
          <span><b>${c.failed_count}</b> failed</span>
          <span><b>${c.skipped_count}</b> skipped</span>
        </div>
      </div>`).join("");
  }

  // events
  const events = $("#overviewEvents");
  events.innerHTML = o.recent_events.length
    ? o.recent_events.map((e) => `
        <div class="log__row log__row--${esc(e.level)}">
          <span class="log__time">${fmtRelative(e.ts)}</span>
          <span>${esc(e.message)}</span>
        </div>`).join("")
    : `<div class="empty">No activity yet.</div>`;

  updateSenderState(o.sender);
}

function updateSenderState(sender) {
  const dot = $("#senderDot");
  const label = $("#senderLabel");
  const detail = $("#senderDetail");
  const badge = $("#navSenderBadge");
  const campaign = state.campaigns.find((c) => c.id === sender.campaign_id);
  if (sender.running) {
    dot.className = "dot dot--live";
    label.textContent = "Sending";
    detail.textContent = campaign
      ? `${campaign.name} · ${campaign.sent_count}/${campaign.total_count}`
      : `Campaign #${sender.campaign_id}`;
    badge.hidden = false;
  } else {
    dot.className = "dot dot--idle";
    label.textContent = "Idle";
    detail.textContent = "No campaign running";
    badge.hidden = true;
  }
}

/* --------------------------------------------------------------------- */
/* accounts                                                              */
/* --------------------------------------------------------------------- */
async function loadAccounts() {
  let data;
  try { data = await api("/api/accounts"); }
  catch (err) { toast(err.message, "error"); return; }
  state.accounts = data.accounts;
  state.configured = data.configured;
  $("#configBanner").hidden = data.configured;
  $("#accountsConfigBanner").hidden = data.configured;
  const connectBtn = $("#connectBtn");
  connectBtn.title = data.configured
    ? "Open Google's consent screen"
    : "OAuth client not configured yet - see the setup steps above";

  const box = $("#accountsList");
  if (!state.accounts.length) {
    box.innerHTML = `<div class="empty">No Gmail account connected yet.
      <br>Use <b>Connect Gmail account</b> - it opens Google's consent screen
      (permission to <i>send mail</i> only).</div>`;
  } else {
    box.innerHTML = state.accounts.map((a) => {
      const pct = Math.min(100, Math.round((a.daily_sent / Math.max(1, a.daily_limit)) * 100));
      const meterClass = pct > 85 ? "meter__fill--warn" : "";
      return `
      <div class="account">
        <div class="account__top">
          <span class="account__email">${esc(a.email)}</span>
          <span class="badge badge--${esc(a.status)}">${esc(a.status.replace("_", " "))}</span>
        </div>
        ${a.status_reason ? `<div class="reason">${esc(a.status_reason)}</div>` : ""}
        <div class="meter"><div class="meter__fill ${meterClass}" style="width:${pct}%"></div></div>
        <div class="muted">Sent today: <b>${a.daily_sent}</b> / ${a.daily_limit} (own cap)
          · last send ${fmtRelative(a.last_sent_at) || "never"}</div>
        <div class="muted">Scopes: ${a.can_send ? "send mail" : "no send permission"}${a.can_read_sheets ? " + sheets read" : ""}</div>
        <div class="account__actions">
          ${a.status === "paused"
            ? `<button class="btn btn--sm" data-account-resume="${a.id}">Resume</button>`
            : `<button class="btn btn--sm" data-account-pause="${a.id}">Pause</button>`}
          <button class="btn btn--sm" data-account-limit="${a.id}" data-limit="${a.daily_limit}">Daily limit</button>
          <button class="btn btn--sm btn--danger" data-account-disconnect="${a.id}">Disconnect</button>
        </div>
      </div>`;
    }).join("");
  }

  // account activity
  const events = await api("/api/events?limit=40").catch(() => ({ events: [] }));
  const accountEvents = events.events.filter((e) => String(e.scope || "").startsWith("account:"));
  $("#accountActivity").innerHTML = accountEvents.length
    ? accountEvents.slice(0, 20).map((e) => `
        <div class="log__row log__row--${esc(e.level)}">
          <span class="log__time">${fmtRelative(e.ts)}</span><span>${esc(e.message)}</span>
        </div>`).join("")
    : `<div class="empty">No account events yet.</div>`;
}

async function connectAccount() {
  await withBusy($("#connectBtn"), async () => {
    const data = await api("/api/accounts/connect", { method: "POST", body: {} });
    toast("Opening Google's consent screen… approve the account you want to use.", "info");
    window.open(data.authorize_url, "_blank", "noopener");
    await sleep(1500);
    toast("After approving, you will be redirected back here.", "info", 8000);
  });
}

/* --------------------------------------------------------------------- */
/* campaigns                                                             */
/* --------------------------------------------------------------------- */
async function loadCampaigns() {
  try {
    const data = await api("/api/campaigns");
    state.campaigns = data.campaigns;
  } catch (err) { toast(err.message, "error"); return; }

  const box = $("#campaignList");
  if (!state.campaigns.length) {
    box.innerHTML = `<div class="empty">No campaigns yet. Click <b>New campaign</b> to import
      recipients and write your message.</div>`;
  } else {
    box.innerHTML = state.campaigns.map((c) => {
      const running = c.status === "running";
      const canStart = ["draft", "paused", "ready"].includes(c.status) && c.pending_count > 0;
      return `
      <div class="campaign">
        <div class="campaign__top">
          <span class="campaign__name">${esc(c.name)}</span>
          <span class="badge badge--${esc(c.status)}">${esc(c.status)}</span>
          <span class="campaign__meta">${esc(c.account_email || "no account")} ·
            ${c.rate_delay_sec}s delay · max ${c.max_per_day}/day</span>
          <div class="campaign__actions">
            ${running
              ? `<button class="btn btn--sm" data-campaign-pause="${c.id}">Pause</button>`
              : canStart
                ? `<button class="btn btn--sm btn--primary" data-campaign-start="${c.id}">${c.status === "paused" ? "Resume" : "Start"}</button>`
                : ""}
            ${["draft", "paused", "running"].includes(c.status)
              ? `<button class="btn btn--sm btn--danger" data-campaign-cancel="${c.id}">Cancel</button>` : ""}
            <button class="btn btn--sm" data-campaign-open="${c.id}">Details</button>
            <button class="btn btn--sm btn--danger" data-campaign-delete="${c.id}">Delete</button>
          </div>
        </div>
        <div class="meter"><div class="meter__fill" style="width:${c.progress}%"></div></div>
        <div class="counts">
          <span><b>${c.sent_count}</b> sent</span>
          <span><b>${c.pending_count}</b> pending</span>
          <span><b>${c.failed_count}</b> failed</span>
          <span><b>${c.skipped_count}</b> skipped</span>
          <span>of <b>${c.total_count}</b></span>
        </div>
        ${c.status_reason ? `<div class="reason">${esc(c.status_reason)}</div>` : ""}
      </div>`;
    }).join("");
  }
  updateSenderState(state.overview?.sender || { running: false });
}

/* --------------------------------------------------------------------- */
/* campaign drawer                                                       */
/* --------------------------------------------------------------------- */
async function openDrawer(campaignId) {
  state.drawerCampaignId = campaignId;
  $("#drawer").hidden = false;
  $("#drawerBackdrop").hidden = false;
  await renderDrawer();
}

function closeDrawer() {
  state.drawerCampaignId = null;
  $("#drawer").hidden = true;
  $("#drawerBackdrop").hidden = true;
}

async function renderDrawer() {
  const id = state.drawerCampaignId;
  if (!id) return;
  let data;
  try { data = await api(`/api/campaigns/${id}`); }
  catch (err) { toast(err.message, "error"); closeDrawer(); return; }
  const c = data.campaign;
  $("#drawerTitle").textContent = c.name;

  const preview = await api(`/api/campaigns/${id}/preview?limit=3`).catch(() => ({ previews: [] }));
  const messages = await api(`/api/campaigns/${id}/messages?per_page=25`).catch(() => ({ messages: [], total: 0 }));

  const running = c.status === "running";
  const canStart = ["draft", "paused", "ready"].includes(c.status) && c.pending_count > 0;

  $("#drawerBody").innerHTML = `
    <div class="campaign">
      <div class="campaign__top">
        <span class="badge badge--${esc(c.status)}">${esc(c.status)}</span>
        <span class="campaign__meta">${esc(c.account_email || "no account")}</span>
      </div>
      <div class="meter"><div class="meter__fill" style="width:${c.progress}%"></div></div>
      <div class="counts">
        <span><b>${c.sent_count}</b> sent</span><span><b>${c.pending_count}</b> pending</span>
        <span><b>${c.failed_count}</b> failed</span><span><b>${c.skipped_count}</b> skipped</span>
        <span>of <b>${c.total_count}</b></span>
      </div>
      ${c.status_reason ? `<div class="reason">${esc(c.status_reason)}</div>` : ""}
      <div class="account__actions">
        ${running
          ? `<button class="btn btn--sm" data-campaign-pause="${c.id}">Pause</button>`
          : canStart ? `<button class="btn btn--sm btn--primary" data-campaign-start="${c.id}">${c.status === "paused" ? "Resume" : "Start"}</button>` : ""}
        ${["draft", "paused", "running"].includes(c.status)
          ? `<button class="btn btn--sm btn--danger" data-campaign-cancel="${c.id}">Cancel</button>` : ""}
        ${c.failed_count > 0
          ? `<button class="btn btn--sm" data-campaign-retry="${c.id}">Re-queue ${c.failed_count} failed</button>` : ""}
      </div>
    </div>

    <div class="card">
      <div class="card__head"><h3>Personalized preview</h3></div>
      ${(preview.previews || []).map((p) => `
        <div class="preview" style="margin-bottom:10px">
          <div class="preview__head">
            <div><b>To:</b> ${esc(p.to)}</div>
            <div><b>From:</b> ${esc(p.from)}</div>
            <div><b>Subject:</b> ${esc(p.subject)}</div>
            ${p.missing.length ? `<div class="err">Missing values: ${esc(p.missing.join(", "))}</div>` : ""}
          </div>
          <div class="preview__body ${p.format === "html" ? "preview__body--html" : ""}">${p.format === "html" ? p.body : esc(p.body)}</div>
        </div>`).join("") || `<div class="empty">No recipients.</div>`}
    </div>

    <div class="card">
      <div class="card__head"><h3>Recipients (${messages.total})</h3></div>
      <div class="table-wrap"><table class="mini-table">
        <thead><tr><th>Recipient</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>
          ${(messages.messages || []).map((m) => `
            <tr><td>${esc(m.recipient_email)}</td>
                <td><span class="badge badge--${esc(m.status)}">${esc(m.status)}</span></td>
                <td>${esc(m.error || (m.sent_at ? fmtTime(m.sent_at) : ""))}</td></tr>`).join("")}
        </tbody></table></div>
    </div>

    <div class="card">
      <div class="card__head"><h3>Message template</h3></div>
      <div class="preview">
        <div class="preview__head"><div><b>Subject:</b> ${esc(c.subject_template)}</div></div>
        <div class="preview__body ${c.body_format === "html" ? "preview__body--html" : ""}">${c.body_format === "html" ? c.body_template : esc(c.body_template)}</div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------- */
/* campaign actions                                                      */
/* --------------------------------------------------------------------- */
async function campaignAction(id, action, button) {
  await withBusy(button, async () => {
    const data = await api(`/api/campaigns/${id}/${action}`, { method: "POST", body: {} });
    toast(action === "start"
      ? `Campaign ${data.campaign.status === "running" ? "started" : "resumed"}.`
      : `Campaign ${action}d.`, "ok");
    await Promise.all([loadCampaigns(), loadOverview()]);
    if (state.drawerCampaignId === id) await renderDrawer();
  });
}

async function deleteCampaign(id, button) {
  if (!window.confirm("Delete this campaign and all of its message history?")) return;
  await withBusy(button, async () => {
    await api(`/api/campaigns/${id}`, { method: "DELETE" });
    toast("Campaign deleted.", "ok");
    if (state.drawerCampaignId === id) closeDrawer();
    await Promise.all([loadCampaigns(), loadOverview()]);
  });
}

/* --------------------------------------------------------------------- */
/* wizard                                                                */
/* --------------------------------------------------------------------- */
function openWizard() {
  state.wizard = { open: true, source: "csv", imp: null, mapping: {} };
  $("#wizard").hidden = false;
  $("#importResult").hidden = true;
  $("#toStep2").disabled = true;
  $("#sheetImport").disabled = true;
  goStep(1);
  ["#cName", "#cSubject", "#cBody", "#cSender", "#cReplyTo", "#sheetId", "#sheetRange"]
    .forEach((s) => { $(s).value = ""; });
  $("#csvFile").value = "";
  $("#cDelay").value = 8;
  $("#cMaxPerDay").value = 60;
  $("#cSkipExisting").checked = true;
  populateAccountSelects();
  $("#wizard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeWizard() {
  state.wizard.open = false;
  $("#wizard").hidden = true;
}

function goStep(step) {
  $$("#wizardSteps li").forEach((li) => li.classList.toggle("is-active", +li.dataset.step === step));
  $$(".step").forEach((el) => {
    const active = +el.dataset.step === step;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
  });
}

function populateAccountSelects() {
  const options = state.accounts
    .filter((a) => a.status === "connected" && a.can_send)
    .map((a) => `<option value="${a.id}">${esc(a.email)} (${a.daily_remaining} left today)</option>`)
    .join("");
  const empty = `<option value="">No connected account - connect one first</option>`;
  $("#cAccount").innerHTML = empty + options;
  $("#sheetAccount").innerHTML =
    `<option value="">Select account…</option>` +
    state.accounts.filter((a) => a.status === "connected")
      .map((a) => `<option value="${a.id}">${esc(a.email)}${a.can_read_sheets ? "" : " (needs Sheets permission)"}</option>`).join("");
}

function setSource(source) {
  state.wizard.source = source;
  $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.source === source));
  $$(".tabpanel").forEach((p) => { p.hidden = p.dataset.source !== source; });
}

function renderImportResult() {
  const imp = state.wizard.imp;
  if (!imp) return;
  const mapping = state.wizard.mapping;
  const mapField = (key, label) => `
    <label class="field"><span>${label}</span>
      <select data-map="${key}">
        <option value="">— not mapped —</option>
        ${imp.headers.map((h) => `<option value="${esc(h)}" ${mapping[key] === h ? "selected" : ""}>${esc(h)}</option>`).join("")}
      </select></label>`;

  $("#importResult").hidden = false;
  $("#importResult").innerHTML = `
    <h3>${imp.row_count} recipient(s) imported
      <span class="muted">from ${esc(imp.kind === "csv" ? "CSV" : "Google Sheets")} · ${esc(imp.name)}</span></h3>
    <div class="muted">
      ${imp.invalid_count} invalid/empty address(es) removed ·
      ${imp.duplicate_count} duplicate(s) removed
      ${imp.kind === "sheet" ? `· source <code>${esc(imp.source_ref)}</code>` : ""}
    </div>
    <div class="map-grid">
      ${mapField("email", "E-mail column *")}
      ${mapField("name", "Name column")}
      ${mapField("company", "Company column")}
      ${mapField("job_title", "Job title column")}
      ${mapField("url", "Source URL column")}
    </div>
    <table class="mini-table"><thead><tr>${imp.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${imp.sample.map((row) => `<tr>${imp.headers.map((h) => `<td>${esc(row[h] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  $$("[data-map]", $("#importResult")).forEach((select) => {
    select.addEventListener("change", () => {
      state.wizard.mapping[select.dataset.map] = select.value;
      $("#toStep2").disabled = !state.wizard.mapping.email;
    });
  });
  $("#toStep2").disabled = !mapping.email;
}

async function uploadCsv(file) {
  const form = new FormData();
  form.append("file", file);
  await withBusy(null, async () => {
    const data = await api("/api/imports/csv", { method: "POST", body: form });
    state.wizard.imp = data.payload;
    state.wizard.mapping = { ...data.payload.mapping };
    renderImportResult();
    toast(`Imported ${data.payload.row_count} recipient(s).`, "ok");
  });
}

async function importSheet() {
  const accountId = $("#sheetAccount").value;
  const spreadsheetId = $("#sheetId").value.trim();
  const range = ($("#sheetRange").value || $("#sheetTab").value || "").trim();
  if (!accountId || !spreadsheetId || !range) {
    toast("Pick an account, paste a spreadsheet ID and choose a worksheet/range.", "warn");
    return;
  }
  await withBusy($("#sheetImport"), async () => {
    const data = await api("/api/imports/sheet", {
      method: "POST",
      body: { account_id: +accountId, spreadsheet_id: spreadsheetId, range },
    });
    state.wizard.imp = data.payload;
    state.wizard.mapping = { ...data.payload.mapping };
    renderImportResult();
    toast(`Imported ${data.payload.row_count} recipient(s) from the sheet.`, "ok");
  });
}

async function loadSheetTabs() {
  const accountId = $("#sheetAccount").value;
  const spreadsheetId = $("#sheetId").value.trim();
  if (!accountId || !spreadsheetId) {
    toast("Select an account and paste the spreadsheet ID first.", "warn");
    return;
  }
  await withBusy($("#sheetLoad"), async () => {
    let data;
    try {
      data = await api(`/api/sheets/workbooks?account_id=${accountId}&spreadsheet_id=${encodeURIComponent(spreadsheetId)}`);
    } catch (err) {
      if (err.code === "sheets_scope_required") {
        const grant = await api(`/api/accounts/${accountId}/authorize-sheets`, { method: "POST", body: {} });
        toast("Google Sheets permission is needed - approving it in the new tab, then repeat this step.", "info", 9000);
        window.open(grant.authorize_url, "_blank", "noopener");
      } else {
        toast(err.message, "error", 8000);
      }
      return;
    }
    $("#sheetTab").innerHTML = data.sheets
      .map((s) => `<option value="'${esc(s.title)}'!A:Z">${esc(s.title)}</option>`).join("");
    $("#sheetImport").disabled = false;
    toast(`Spreadsheet “${data.title}” loaded.`, "ok");
  });
}

/* ---- client-side preview while composing ------------------------------ */
function normalizeKey(key) {
  return String(key).replace(/[\s_-]+/g, " ").trim().toLowerCase();
}

function renderTemplateClient(template, row, mapping) {
  const normalized = {};
  Object.entries(row || {}).forEach(([k, v]) => { normalized[normalizeKey(k)] = String(v ?? "").trim(); });
  // the column mapping makes {{name}} / {{company}} / {{job title}} / {{url}}
  // work even when the source column has a different header
  const aliases = {
    name: mapping?.name, company: mapping?.company,
    "job title": mapping?.job_title, url: mapping?.url,
  };
  Object.entries(aliases).forEach(([aliasKey, column]) => {
    if (column && row[column]) normalized[normalizeKey(aliasKey)] = String(row[column]).trim();
  });
  const missing = [];
  const out = String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
    const key = normalizeKey(name);
    const value = normalized[key] || "";
    if (!value && !missing.includes(key)) missing.push(key);
    return value;
  });
  return { out, missing };
}

function updatePreview() {
  const imp = state.wizard.imp;
  if (!imp || !imp.sample.length) return;
  const pick = $("#previewPick");
  if (!pick.options.length || pick.options.length !== imp.sample.length) {
    pick.innerHTML = imp.sample.map((_, i) => `<option value="${i}">Recipient ${i + 1}</option>`).join("");
  }
  const row = imp.sample[+pick.value || 0];
  const subject = renderTemplateClient($("#cSubject").value, row, state.wizard.mapping);
  const body = renderTemplateClient($("#cBody").value, row, state.wizard.mapping);
  const format = $("#cFormat").value;
  const fromName = $("#cSender").value || "";
  const accountId = $("#cAccount").value;
  const fromEmail = accountId
    ? ($("#cAccount").selectedOptions[0]?.textContent || "").split(" ")[0]
    : "no sender selected";

  $("#previewBox").innerHTML = `
    <div class="preview__head">
      <div><b>To:</b> ${esc(row[state.wizard.mapping.email] || "")}</div>
      <div><b>From:</b> ${esc(fromName)} &lt;${esc(fromEmail)}&gt;</div>
      <div><b>Subject:</b> ${esc(subject.out)}</div>
      ${subject.missing.length || body.missing.length
        ? `<div class="err">Missing values: ${esc([...new Set([...subject.missing, ...body.missing])].join(", "))}</div>` : ""}
    </div>
    <div class="preview__body ${format === "html" ? "preview__body--html" : ""}">${format === "html" ? body.out : esc(body.out)}</div>`;

  const used = [...new Set([
    ...($("#cSubject").value.match(/\{\{[^{}]+\}\}/g) || []),
    ...($("#cBody").value.match(/\{\{[^{}]+\}\}/g) || []),
  ])];
  $("#varChips").innerHTML =
    (used.length ? `<div class="muted" style="flex-basis:100%">In use: ${used.map(esc).join(" ")}</div>` : "") +
    imp.headers.map((h) => `<button type="button" class="var-chip">{{${esc(h)}}}</button>`).join("");
  $$("#varChips .var-chip").forEach((chip, i) => {
    chip.addEventListener("click", () => {
      const ta = $("#cBody");
      const token = chip.textContent;
      const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + token + ta.value.slice(pos);
      ta.focus();
      updatePreview();
    });
  });
}

function renderReview() {
  const imp = state.wizard.imp;
  const account = state.accounts.find((a) => a.id === +$("#cAccount").value);
  $("#reviewBox").innerHTML = `
    <div class="review__row"><span>Campaign</span><b>${esc($("#cName").value || "(no name)")}</b></div>
    <div class="review__row"><span>Source</span><b>${imp.row_count} recipient(s)
      (${esc(imp.kind === "csv" ? "CSV" : "Google Sheet")}: ${esc(imp.name)})</b></div>
    <div class="review__row"><span>Sender account</span><b>${esc(account?.email || "not selected")}</b></div>
    <div class="review__row"><span>Subject</span><b>${esc($("#cSubject").value || "(empty)")}</b></div>
    <div class="review__row"><span>Daily caps</span><b>account ${esc(account?.daily_limit ?? "–")}/day ·
      campaign ${esc($("#cMaxPerDay").value)}/day</b></div>
    <div class="banner banner--info">Sending starts only after you press <b>Start</b> on the next screen.
      Emails are paced ${esc($("#cDelay").value)}s apart, one at a time, and the job can be paused at any point.</div>`;
}

async function createCampaign() {
  const imp = state.wizard.imp;
  if (!imp) return;
  await withBusy($("#createCampaign"), async () => {
    const data = await api("/api/campaigns", {
      method: "POST",
      body: {
        name: $("#cName").value.trim(),
        import_id: imp.import_id,
        account_id: +$("#cAccount").value,
        sender_name: $("#cSender").value.trim(),
        reply_to: $("#cReplyTo").value.trim(),
        subject_template: $("#cSubject").value,
        body_template: $("#cBody").value,
        body_format: $("#cFormat").value,
        column_map: state.wizard.mapping,
        skip_existing: $("#cSkipExisting").checked,
        rate_delay_sec: +$("#cDelay").value || 8,
        max_per_day: +$("#cMaxPerDay").value || 60,
      },
    });
    if (data.note) toast(data.note, "warn", 8000);
    toast("Campaign created. Review the preview, then press Start.", "ok");
    closeWizard();
    showView("campaigns");
    await Promise.all([loadCampaigns(), loadOverview()]);
    openDrawer(data.campaign.id);
  });
}

/* --------------------------------------------------------------------- */
/* history                                                               */
/* --------------------------------------------------------------------- */
async function loadHistory() {
  const params = new URLSearchParams({
    page: state.history.page,
    per_page: state.history.perPage,
    status: $("#hStatus").value,
    campaign_id: $("#hCampaign").value,
    account_id: $("#hAccount").value,
    q: $("#hSearch").value.trim(),
  });
  let data;
  try { data = await api(`/api/history?${params}`); }
  catch (err) { toast(err.message, "error"); return; }
  state.history.total = data.total;

  $("#hCount").textContent = `${data.total} message(s)`;
  const perPage = data.per_page || state.history.perPage;
  const pages = Math.max(1, Math.ceil(data.total / perPage));
  $("#hPage").textContent = `Page ${data.page} of ${pages}`;
  $("#hPrev").disabled = data.page <= 1;
  $("#hNext").disabled = data.page >= pages;

  const tbody = $("#historyTable tbody");
  tbody.innerHTML = data.history.length ? data.history.map((row) => `
    <tr>
      <td>${esc(row.recipient_email)}</td>
      <td>${esc(row.campaign_name)}</td>
      <td>${esc(row.account_email || "–")}</td>
      <td><span class="badge badge--${esc(row.status)}">${esc(row.status)}</span></td>
      <td>${row.sent_at ? fmtTime(row.sent_at) : "–"}</td>
      <td class="err">${esc(row.error || (row.gmail_id ? `accepted by Gmail (${row.gmail_id.slice(0, 10)}…)` : ""))}</td>
    </tr>`).join("")
    : `<tr><td colspan="6"><div class="empty">No messages match these filters.</div></td></tr>`;
}

function fillHistoryFilters() {
  const campaignSel = $("#hCampaign");
  const accountSel = $("#hAccount");
  const keepC = campaignSel.value;
  const keepA = accountSel.value;
  campaignSel.innerHTML = `<option value="">All campaigns</option>` +
    state.campaigns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  accountSel.innerHTML = `<option value="">All accounts</option>` +
    state.accounts.map((a) => `<option value="${a.id}">${esc(a.email)}</option>`).join("");
  campaignSel.value = keepC;
  accountSel.value = keepA;
}

/* --------------------------------------------------------------------- */
/* wiring                                                                */
/* --------------------------------------------------------------------- */
async function refresh() {
  if (state.view === "overview") await loadOverview();
  else if (state.view === "accounts") await loadAccounts();
  else if (state.view === "campaigns") await loadCampaigns();
  else if (state.view === "history") { await loadCampaigns(); fillHistoryFilters(); await loadHistory(); }
  if (state.view !== "overview" && state.overview) updateSenderState(state.overview.sender);
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const overview = await api("/api/overview");
      state.overview = overview;
      updateSenderState(overview.sender);
      if (state.view === "overview") {
        await loadOverview();
      } else if (state.view === "campaigns") {
        const before = JSON.stringify(state.campaigns.map((c) => [c.id, c.sent_count, c.status]));
        await loadCampaigns();
        if (before !== JSON.stringify(state.campaigns.map((c) => [c.id, c.sent_count, c.status]))
            && state.drawerCampaignId) await renderDrawer();
      } else if (state.drawerCampaignId && overview.sender.running) {
        await renderDrawer();
      } else if (state.view === "history" && overview.sender.running) {
        await loadHistory();
      }
    } catch (_) { /* server briefly unavailable */ }
  }, 3000);
}

function wireEvents() {
  // navigation
  $$(".nav__item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $$("[data-goto]").forEach((btn) => btn.addEventListener("click", () => {
    showView(btn.dataset.goto);
    if (btn.dataset.goto === "campaigns") openWizard();
  }));
  $("#menuToggle").addEventListener("click", () => {
    const sidebar = $("#sidebar");
    const open = sidebar.classList.toggle("is-open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });
  $("#refreshBtn").addEventListener("click", () => withBusy($("#refreshBtn"), refresh));

  // accounts
  $("#connectBtn").addEventListener("click", connectAccount);
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-account-pause], button[data-account-resume], " +
      "button[data-account-disconnect], button[data-account-limit]");
    if (!btn) return;
    const id = btn.dataset.accountPause || btn.dataset.accountResume ||
      btn.dataset.accountDisconnect || btn.dataset.accountLimit;
    if (btn.dataset.accountPause) {
      withBusy(btn, () => api(`/api/accounts/${id}/pause`, { method: "POST", body: {} })
        .then(() => { toast("Account paused.", "ok"); loadAccounts(); }));
    } else if (btn.dataset.accountResume) {
      withBusy(btn, () => api(`/api/accounts/${id}/resume`, { method: "POST", body: {} })
        .then(() => { toast("Account resumed.", "ok"); loadAccounts(); }));
    } else if (btn.dataset.accountDisconnect) {
      if (!window.confirm("Disconnect this Gmail account? Its stored tokens are deleted.")) return;
      withBusy(btn, () => api(`/api/accounts/${id}/disconnect`, { method: "POST", body: {} })
        .then(() => { toast("Account disconnected.", "ok"); loadAccounts(); }));
    } else if (btn.dataset.accountLimit) {
      const value = window.prompt("Daily sending cap for this account (emails/day):", btn.dataset.limit);
      if (!value) return;
      withBusy(btn, () => api(`/api/accounts/${id}`, { method: "PATCH", body: { daily_limit: +value } })
        .then(() => { toast("Daily cap updated.", "ok"); loadAccounts(); }));
    }
  });

  // wizard
  $("#newCampaignBtn").addEventListener("click", openWizard);
  $("#wizardClose").addEventListener("click", closeWizard);
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setSource(tab.dataset.source)));
  $("#csvFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) uploadCsv(file);
  });
  $("#sheetLoad").addEventListener("click", loadSheetTabs);
  $("#sheetImport").addEventListener("click", importSheet);
  $("#sheetTab").addEventListener("change", () => { $("#sheetImport").disabled = !$("#sheetTab").value; });
  $("#toStep2").addEventListener("click", () => {
    if (!state.wizard.imp) return;
    goStep(2);
    if (!$("#cName").value) {
      $("#cName").value = state.wizard.imp.name ? `${state.wizard.imp.name} outreach` : "New campaign";
    }
    updatePreview();
  });
  $("#backTo1").addEventListener("click", () => goStep(1));
  ["#cSubject", "#cBody", "#cSender", "#cReplyTo", "#cFormat", "#cAccount", "#previewPick"]
    .forEach((sel) => $(sel).addEventListener("input", updatePreview));
  $("#toStep3").addEventListener("click", () => {
    if (!$("#cName").value.trim()) { toast("Give the campaign a name.", "warn"); return; }
    if (!$("#cSubject").value.trim()) { toast("The subject line is empty.", "warn"); return; }
    if (!$("#cBody").value.trim()) { toast("The message body is empty.", "warn"); return; }
    if (!$("#cAccount").value) { toast("Choose the Gmail account that should send it.", "warn"); return; }
    renderReview();
    goStep(3);
  });
  $("#backTo2").addEventListener("click", () => goStep(2));
  $("#createCampaign").addEventListener("click", createCampaign);

  // campaigns (event delegation)
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(
      "button[data-campaign-start], button[data-campaign-pause], button[data-campaign-cancel]," +
      " button[data-campaign-delete], button[data-campaign-open], button[data-campaign-retry]");
    if (!btn) return;
    if (btn.dataset.campaignStart) campaignAction(btn.dataset.campaignStart, "start", btn);
    else if (btn.dataset.campaignPause) campaignAction(btn.dataset.campaignPause, "pause", btn);
    else if (btn.dataset.campaignCancel) {
      if (window.confirm("Cancel this campaign? Unsent recipients will be left untouched.")) {
        campaignAction(btn.dataset.campaignCancel, "cancel", btn);
      }
    } else if (btn.dataset.campaignRetry) {
      withBusy(btn, () => api(`/api/campaigns/${btn.dataset.campaignRetry}/retry-failed`,
        { method: "POST", body: {} }).then(() => { toast("Failed messages re-queued.", "ok"); renderDrawer(); }));
    } else if (btn.dataset.campaignDelete) deleteCampaign(btn.dataset.campaignDelete, btn);
    else if (btn.dataset.campaignOpen) openDrawer(btn.dataset.campaignOpen);
  });

  // drawer
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#drawerBackdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  // history filters
  ["#hStatus", "#hCampaign", "#hAccount"].forEach((sel) =>
    $(sel).addEventListener("change", () => { state.history.page = 1; loadHistory(); }));
  let searchTimer;
  $("#hSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.history.page = 1; loadHistory(); }, 350);
  });
  $("#hPrev").addEventListener("click", () => { state.history.page = Math.max(1, state.history.page - 1); loadHistory(); });
  $("#hNext").addEventListener("click", () => { state.history.page += 1; loadHistory(); });
}

function handleUrlParams() {
  const params = new URLSearchParams(location.search);
  if (params.get("connected")) {
    toast(`Gmail account ${params.get("connected")} connected.`, "ok", 8000);
    history.replaceState({}, "", "/");
  }
  if (params.get("oauth_error")) {
    toast(`Google sign-in failed: ${params.get("oauth_error")}`, "error", 12000);
    history.replaceState({}, "", "/");
  }
}

async function init() {
  wireEvents();
  handleUrlParams();
  await loadAccounts();
  await Promise.all([loadOverview(), loadCampaigns()]);
  fillHistoryFilters();
  showView("overview");
  startPolling();
}

document.addEventListener("DOMContentLoaded", init);
