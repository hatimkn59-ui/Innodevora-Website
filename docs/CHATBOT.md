# Innodevora AI Assistant and Lead Dashboard

This document explains how the AI sales assistant works, how to operate it, and
how to deploy it. It is written for the Innodevora owner and for whoever
maintains the website.

The implementation lives in this repository and is shipped as a single Node.js
process. There is no bundler, no frontend framework, no external database and no
third-party npm dependency. The website, chat API, SQLite database and admin
dashboard are served by the same process.

---

## 1. What was added

| Area | Location | Purpose |
| --- | --- | --- |
| Company knowledge | `knowledge/INNODEVORA.md` | Editable, server-side source of approved company facts |
| Chat widget | `assets/chat/` | Visitor-facing assistant, consent cards, streaming and history |
| Privacy notice | `privacy/index.html`, `assets/privacy.css` | Visitor-facing data notice |
| API and routing | `server/app.js`, `server/index.js` | HTTP server, static files, chat and admin APIs |
| AI provider client | `server/ai.js`, `server/prompts.js` | Server-side model calls, hidden metadata, fallback mode |
| Chat orchestration | `server/chat-service.js` | Consent, redaction, summaries, lead scoring, deletion |
| Knowledge loader | `server/knowledge.js` | Caching, change detection, versioning, retrieval |
| Lead logic | `server/profile.js` | Profile merging, PII handling, scoring and status rules |
| Database | `server/db.js` | SQLite schema, migrations, retention, audit |
| Sessions and CSRF | `server/sessions.js` | Visitor/admin sessions and secure cookies |
| Admin service | `server/admin-service.js` | Login, search, export, status changes, deletion, audit |
| Admin dashboard | `admin/` | Responsive lead dashboard and login screen |
| Tests | `tests/` | Security, knowledge, scoring, consent and HTTP integration tests |
| Security helpers | `server/security.js` | Scrypt, hashing, cookies, redaction, CSV safety |
| Retention cleanup | `server/db.js` | Automatic purge plus admin-triggered purge |

The assistant is optional. A visitor can use the whole public website without
opening it.

---

## 2. Quick start

Requirements: Node.js 24 or newer. The project uses the built-in
`node:sqlite` module and has been verified on Node 26.

```bash
# 1. Install nothing: there are no npm dependencies.
#    npm install is harmless but not required.

# 2. Create the local environment file.
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3. Start the full stack (site + chat API + admin API).
npm start
```

Open:

- Website: `http://127.0.0.1:3000/`
- Admin dashboard: `http://127.0.0.1:3000/admin/`
- Health check: `http://127.0.0.1:3000/api/health`

Do not open `index.html` with a static file server. The chat needs the Node API,
cookies and CSRF tokens. `npm start` is the supported preview.

On first start the process creates:

- `data/innodevora-chat.db` (SQLite, WAL mode)
- `data/ip-hash-salt` (random salt for non-reversible IP hashes)
- the database schema, indexes and retention settings

Both paths are ignored by Git. Back them up together if you care about leads.

---

## 3. Initial admin setup

The admin dashboard is unavailable until an administrator exists. Generate a
password hash locally:

```bash
npm run admin:hash
```

The command asks for a password without echoing it, then prints a line like:

```text
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...
```

Put that line in `.env`. Set a username and leave `ADMIN_PASSWORD` empty:

```dotenv
ADMIN_USERNAME=owner
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...
ADMIN_PASSWORD=
ADMIN_ROLE=owner
```

Restart the server. The first start seeds the `admin_users` table. The plain
password is never stored or written to disk.

Important: the initial reconciliation only runs when the `admin_users` table is
empty. If an administrator already exists, changing `ADMIN_PASSWORD_HASH` in
`.env` does not rotate the existing password. For a production rotation, update
the `password_hash` through a controlled local operation or start from an empty
database only when that is acceptable. Never commit `.env` or the database.

Roles:

- `owner`: all actions, including export, deletion, retention and purge.
- `admin`: same write capabilities as owner.
- `viewer`: read-only leads, conversations and audit views; export and writes are
  rejected by the server.

The dashboard stores the role in the database. Changing `ADMIN_ROLE` after the
first seed does not change an existing administrator.

---

## 4. Editing the company knowledge

Open `knowledge/INNODEVORA.md` and edit the Markdown. The server reads it from
disk, not from the browser.

- The file is loaded server-side and cached by modification time and size.
- A change is picked up automatically on the next request; no restart is needed.
- Each version is identified by a SHA-256 prefix (for example
  `8c4a7a7ae01ac8ff`) and returned by `/api/health` and the admin overview.
- Missing, empty or oversized files degrade gracefully. The assistant says the
  knowledge source is unavailable rather than inventing facts.
- Raw Markdown is never exposed by an API or a static route.
- The loader keeps a small amount of core sections and adds sections relevant to
  the visitor's current question.

When information is unknown, write a placeholder exactly like:

```markdown
[OWNER INPUT REQUIRED: confirm the legal entity name, postal address and hosting provider.]
```

The system prompt instructs the model to treat a line beginning with
`[OWNER INPUT REQUIRED` as missing information, never as a fact. Do not replace a
placeholder with a guess. Do not put API keys, passwords, private client data or
personal data in this file.

The demo testimonial and Trustpilot-style content on the website is fictional
preview content. The knowledge file explicitly forbids citing it as real proof.

---

## 5. AI provider configuration

The server calls an OpenAI-compatible `chat/completions` endpoint. The browser
never sees the provider key and never calls the provider directly.

```dotenv
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your-server-side-key
AI_MODEL=gpt-4.1-mini
AI_TIMEOUT_MS=45000
AI_MAX_OUTPUT_TOKENS=700
AI_TEMPERATURE=0.3
AI_KEYLESS_DEMO=false
```

- HTTPS is required, except for a local provider on `localhost`, `127.0.0.1` or
  `::1`.
- URLs containing embedded credentials are rejected.
- `AI_API_KEY` stays on the server. It is never included in HTML, JSON, logs or
  error messages sent to visitors.
- In development, `AI_KEYLESS_DEMO=true` enables a deterministic, conservative
  fallback for UI testing. It is not a language model and must not be used as a
  production salesperson.
- In production, keyless demo defaults to `false`. With no provider configured,
  chat requests return a graceful `503 AI_UNAVAILABLE` message and the rest of
  the site keeps working.
- Provider failures stream a safe fallback when nothing has been sent yet. If a
  partial answer was already shown, the visitor sees a retry message.
- The system prompt and hidden metadata are controlled by the server. The model
  receives a per-request nonce for hidden profile metadata; visitors cannot forge
  that metadata because the nonce is random and stripped before display.

The assistant is instructed to answer in the visitor's language, keep answers
short, avoid inventing prices or availability, refuse requests for secrets and
treat visitor messages as untrusted data rather than instructions.

---

## 6. Consent and personal data

### Before consent

The visitor can discuss a project anonymously. The server stores:

- the conversation and anonymous project context (interests, project type,
  budget range, timeline);
- a random visitor identifier and a session identifier;
- a salted, non-reversible IP hash for rate limiting and abuse prevention.

Direct identifiers such as email addresses and phone numbers are redacted from
stored messages before consent. A free-form project description is not written to
the contact profile before consent. The assistant is not allowed to add name,
email, company, role or country to the profile until consent is recorded.

### Consent

The consent card is the only way consent is recorded. Typing “yes” in chat does
not call the consent endpoint and does not flip the server field.

When consent is granted:

- `visitors.consent_status` becomes `1` and `consent_at` is set;
- a `consent_events` row is written;
- an audit event is written;
- subsequent messages can populate contact fields.

When consent is withdrawn:

- name, email, company, role, country and free-form project description are
  cleared;
- stored messages and conversation summaries are redacted;
- the lead score is recalculated without contact details;
- a consent event and an audit event are written.

`Delete my data` in the options menu deletes the visitor, sessions,
conversations, messages and consent events through foreign-key cascades. A fresh
anonymous visitor is created so the chat can continue.

Visitors can also email `contact@innodevora.com`. The public privacy notice
explains the choices, retention and rights.

### What is never inferred

The server does not infer identity, company, country or budget from IP address,
browser, device, language or metadata. IP hashes are used only for rate limiting
and abuse prevention. They are salted with a server secret and cannot be reversed
from the database alone.

---

## 7. Lead scoring and statuses

Scoring is configured in `.env`:

```dotenv
LEAD_WEIGHT_PROJECT_TYPE=10
LEAD_WEIGHT_DESCRIPTION=10
LEAD_WEIGHT_BUDGET=20
LEAD_WEIGHT_TIMELINE=15
LEAD_WEIGHT_QUOTE=15
LEAD_WEIGHT_CONTACT=15
LEAD_WEIGHT_COMPANY=5
LEAD_WEIGHT_REPEAT=5
LEAD_QUALIFIED_THRESHOLD=45
```

The score is capped at 100 and every point has a human-readable reason stored in
`lead_score_reasons`. Contact and company points are only awarded when consent is
recorded. A long conversation or several interests can award the engagement
points.

Automatic statuses:

- `new`: no meaningful signal yet.
- `exploring`: project interest without enough qualification.
- `qualified`: score at or above the threshold.
- `quote_requested`: explicit quote, price, estimate or proposal request.
- `human_requested`: explicit request for a human, call, email follow-up or
  contact.

Manual statuses are preserved by automatic logic: `contacted`, `proposal_sent`,
`won`, `lost`, `archived`. An administrator can set any valid status from the
lead detail view.

A budget mention alone is not treated as a quote request. It adds budget points;
an explicit quote, price or estimate request sets `quote_requested`.

---

## 8. Data model

All tables are created and migrated automatically in `server/db.js`.

| Table | Contents |
| --- | --- |
| `visitors` | Profile, anonymous project context, consent, lead score and status |
| `visitor_sessions` | Hashed visitor session token, CSRF token, expiry, IP hash |
| `conversations` | Conversation status, summary, consent prompt flag |
| `messages` | User, assistant and system messages with a redaction flag |
| `consent_events` | Grant/withdraw history |
| `admin_users` | Scrypt password hash, role, disabled flag |
| `admin_sessions` | Hashed admin token, CSRF token, expiry |
| `audit_logs` | Admin and visitor security-relevant actions |
| `app_settings` | Runtime retention and assistant settings |
| `ai_usage` | Provider request metadata: mode, status, latency, error code |
| `rate_limits` | Persisted rate-limit windows |

The database is local SQLite in WAL mode with foreign keys and a busy timeout.
It is suitable for one Node process. Do not run multiple app instances against
the same SQLite file on different machines or expect horizontal scaling without
moving to a shared database.

Useful queries (read-only, run while the server is stopped or with care):

```sql
SELECT lead_status, COUNT(*) FROM visitors GROUP BY lead_status;
SELECT id, lead_score, lead_status, last_seen FROM visitors
ORDER BY lead_score DESC LIMIT 20;
SELECT action, created_at FROM audit_logs ORDER BY id DESC LIMIT 50;
```

---

## 9. Admin dashboard

Open `/admin/` and sign in with the configured username and password.

Features:

- overview counters: total visitors, consented leads, qualified leads, new this
  week, average score, messages and conversations;
- search across name, email, company, project type, project description,
  summary and role;
- filter by status and consent;
- sort by last seen, first seen, score or status;
- paginated leads with score, consent, status and message count;
- lead detail with profile, conversations, messages, consent history and score
  reasons;
- status updates for owner/admin;
- CSV export with UTF-8 BOM, CSV-injection protection and an audit event;
- delete a lead (owner/admin) with audit;
- assistant control (owner/admin): pause or enable the visitor chatbot;
- assistant instructions: welcome message, additional owner guidance and
  suggested questions;
- assistant health: provider mode, knowledge version, 24-hour request counts,
  fallback/error counts, average latency and last request;
- recent conversations with links to the visitor transcript and lead profile;
- recent AI error metadata (never message content);
- audit log view;
- retention settings and manual purge (owner/admin).

The additional instructions are appended to the built-in system prompt as
owner-approved data. They cannot override the non-negotiable safety, privacy,
consent, anti-invention or human-escalation rules.

The dashboard is served with `Cache-Control: no-store`, a strict
`default-src 'none'` CSP and no CORS headers. API data is authenticated by an
HttpOnly, SameSite=Strict, Secure (on HTTPS) cookie. CSRF tokens are required for
all state-changing requests.

The login page is public by design. It contains no lead data. Every data endpoint
requires a valid admin session with a role check where applicable.

---

## 10. Security model

- **No key in the browser.** All AI calls are server-side.
- **Sessions**: random 32-byte tokens; only SHA-256 hashes are stored; cookies are
  HttpOnly, SameSite=Strict and Secure on HTTPS.
- **Passwords**: scrypt with a random salt and encoded parameters; constant-time
  verification.
- **CSRF**: per-session random token, constant-time compared, required for chat,
  consent, reset, deletion, admin status changes, assistant settings, retention
  and purge.
- **Origin checks**: state-changing API requests must match the incoming Host
  header. Cross-origin requests are rejected before body processing.
- **Rate limits**: persisted per IP and per visitor, plus admin login limits.
  Limits are configurable and return `Retry-After`.
- **Input limits**: JSON content type, 32 KB admin/consent bodies, 24 KB chat
  bodies, maximum message length, control-character stripping, field length
  limits.
- **SQL**: prepared statements throughout; no string interpolation of values.
  Sort and status values are allow-listed.
- **XSS**: the widget and dashboard render untrusted message and lead text with
  `textContent`, not HTML. The site CSP restricts scripts to self and connect to
  self.
- **No raw Markdown**: `/knowledge`, `/server`, `/data`, `/tests`, `/scripts`,
  `/docs`, `/admin` source and dotfiles are blocked by the static server.
- **SSRF**: provider URL is validated, HTTPS-only except explicit local
  providers, and credentials in URLs are rejected.
- **Audit**: logins, failed logins, rate limiting, consent, deletion, status
  changes, exports, retention changes and purges are recorded. Chat content is
  not written to audit logs.
- **Retention**: expired sessions and rate-limit windows are removed hourly.
  Conversations older than the conversation retention period are deleted.
  Visitors older than the visitor retention period are deleted with cascades.
- **Abuse resistance**: per-request CSRF, origin checks, rate limits, body caps,
  redaction of sensitive numbers and an instruction that refuses secrets.

Security headers include `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, a restrictive `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, HSTS on HTTPS and
CSP appropriate to the page type.

---

## 11. Retention

Defaults:

- visitor profiles: 180 days after last activity;
- conversations: 365 days after last update;
- visitor sessions: 30 days;
- admin sessions: 12 hours;
- rate-limit rows: until their window expires.

Admins can change visitor and conversation retention in the dashboard between 1
and 3650 days. The values are stored in `app_settings` and override `.env`
defaults. A purge can be triggered manually. The cleanup runs at startup and
hourly.

The public privacy notice currently states the default 180/365-day values. If
you change retention materially, update `privacy/index.html` and the privacy
metadata in `server/chat-service.js` so visitors see accurate information. The
bootstrap payload also returns `privacy.retentionDays` (visitor retention).

---

## 12. Deployment

See `docs/DEPLOYMENT.md` for the current production status, the Render
Blueprint (`render.yaml`), the Docker image and the exact verification steps.
The project is not deployed just because the repository contains those files.

### Single-process layout

Run one Node process behind a TLS-terminating reverse proxy (Caddy, nginx,
Traefik, a platform router, etc.). Serve the public site and `/admin/` from the
same origin. Do not split the API onto another origin unless you also redesign
the cookie table, CSRF/origin rules and CORS policy.

Example production environment:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
SITE_ORIGIN=https://www.innodevora.com
TRUST_PROXY=true
COOKIE_SECURE=auto
DATA_DIR=/var/lib/innodevora/data
DATABASE_PATH=/var/lib/innodevora/data/innodevora-chat.db
KNOWLEDGE_PATH=/var/lib/innodevora/knowledge/INNODEVORA.md
ADMIN_USERNAME=owner
ADMIN_PASSWORD_HASH=scrypt$...
ADMIN_PASSWORD=
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=...
AI_MODEL=gpt-4.1-mini
AI_KEYLESS_DEMO=false
```

Start command:

```bash
npm start
```

`HOST=127.0.0.1` requires the reverse proxy on the same machine. If the platform
routes directly to the container, bind `0.0.0.0` and put TLS in front of it.

### Reverse proxy requirements

- Preserve the original `Host` header, or ensure the proxy forwards the public
  hostname in `Host`. Same-origin checks compare the `Origin` header host with
  `Host`.
- Set `X-Forwarded-For` and `TRUST_PROXY=true` only when the proxy is trusted.
- Terminate TLS and redirect HTTP to HTTPS.
- Do not cache `/api/*`, `/admin/*` or the privacy/legal pages aggressively.
- Allow Server-Sent Events: disable proxy buffering for `/api/chat`
  (`X-Accel-Buffering: no` is already sent).
- Keep the app's cookie names and paths at `/`.

### Persistent storage and backup

Persist:

- the SQLite database;
- the `data` directory, including `ip-hash-salt`;
- `knowledge/INNODEVORA.md` if it is mounted or generated separately.

Back up the database with SQLite's online backup mechanism or by stopping the
process and copying the `.db`, `-wal` and `-shm` files together. A lone `.db`
copy while WAL is active may be incomplete.

### Health checks and monitoring

`GET /api/health` returns service status, knowledge availability and AI mode. It
does not require auth and does not expose keys or content. Use it as a liveness
check. Monitor:

- process restarts and 5xx rates;
- `AI_UNAVAILABLE` / `AI_PROVIDER_ERROR` in the admin **Assistant** diagnostics;
- SQLite disk space and backup age;
- admin login failures and rate limiting;
- knowledge status (`available`, `stale`, version);
- 24-hour request, fallback, error and latency totals in the admin
  **Assistant** view.

### Scaling limits

SQLite and persisted rate limits assume one application instance. For multiple
instances, replace SQLite with a shared database, move rate limiting to a shared
store and re-test session, retention and audit behavior. Do not simply run several
copies against one WAL file.

---

## 13. Testing and checks

```bash
npm run check   # syntax/JSON check
npm test        # Node test runner, 34 tests
npm run build   # required-file and syntax check
```

The tests cover:

- environment parsing, URL validation, clamping and production defaults;
- scrypt hashing, cookie flags, origin checks, IP hashing and PII redaction;
- knowledge loading, caching, version changes, missing/empty files;
- metadata sanitization, signal extraction, scoring, status derivation;
- full chat flow: bootstrap, CSRF, consent prompt, grant, withdrawal, reset and
  deletion;
- static protection, privacy/legal pages, admin login and role enforcement;
- CSV export, retention updates, audit events and expiry cleanup;
- rate limiting for chat and admin login.

There is no browser test in `npm test`. Before release, open the site and use the
widget on desktop and a narrow viewport, then sign in to the dashboard and verify
login, lead list, detail, status update, export, retention and deletion.

---

## 14. Operations checklist

Before going live:

- [ ] `NODE_ENV=production`.
- [ ] `SITE_ORIGIN` is the real HTTPS origin.
- [ ] TLS is terminated in front of the app.
- [ ] `COOKIE_SECURE=auto` or `true` on HTTPS.
- [ ] `AI_API_KEY` set and `AI_KEYLESS_DEMO=false`.
- [ ] `npm run admin:hash` completed and `ADMIN_PASSWORD_HASH` stored in the
      server environment, not in Git.
- [ ] `.env`, `data/` and database files are not served and are backed up.
- [ ] `knowledge/INNODEVORA.md` has no unresolved facts presented as confirmed.
- [ ] Privacy and legal pages reviewed, including retention values.
- [ ] `/api/health` returns `ok: true`.
- [ ] Admin login tested; viewer/admin write restrictions tested.
- [ ] Chat tested in demo then live mode, including provider failure behavior.
- [ ] Site CSP has no console errors from the widget.
- [ ] Reverse proxy does not buffer SSE and forwards the Host header.

Common issues:

- **Admin disabled on startup**: no admin row exists. Set
  `ADMIN_PASSWORD_HASH` (or `ADMIN_PASSWORD` for first-run local setup) and
  restart.
- **`AI_UNAVAILABLE`**: no API key and keyless demo is off. Set the key or enable
  demo only for local testing.
- **Login fails after changing the env hash**: the existing admin row is not
  reseeded. Use a controlled password rotation.
- **Session cookie not stored**: the site is on HTTPS but `COOKIE_SECURE` or the
  origin configuration is wrong, or the browser is blocking the cookie.
- **Rate limited**: wait for `Retry-After`, or adjust limits deliberately.
- **Knowledge unavailable**: check the file exists, is non-empty and under
  500 KB.
- **SQLite busy**: only one writer is expected. Check for a second process.
