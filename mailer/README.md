# Gmail Mail-Merge Dashboard

A local dashboard for sending **personalized job-application e-mails** through your own
Gmail accounts, using the official **Gmail API + OAuth 2.0** (no SMTP passwords, no app
passwords, nothing entered into the browser).

Everything runs on `127.0.0.1`. OAuth refresh tokens are encrypted at rest with Fernet
(`data/secret.key`) and are never sent to the browser or written to logs.

---

## What it does

| Area | Features |
|---|---|
| **Overview** | connected accounts, recipients, sent / pending / failed, sent today, campaign progress, recent activity |
| **Gmail accounts** | connect up to 10 accounts (one at a time), per-account status, own daily cap, pause / resume / disconnect, scope display |
| **Campaigns** | import CSV **or** Google Sheets → column mapping → template with `{{variables}}` → live personalized preview → start / pause / resume / cancel / retry failed |
| **Email history** | recipient, campaign, sender account, status, timestamp, Gmail error details, filters + search + pagination |

Reliability rules built in:

* **One sending job at a time** — concurrent campaigns are refused (409).
* **No duplicate sends** — `(campaign, recipient)` is unique; interrupted jobs resume from
  the exact pending message after a restart (rows stuck in `sending` are recovered).
* **Quota respected** — rate limiting / daily-limit / auth errors **pause the account and
  the campaign** with a visible reason. The dashboard never rotates to another account to
  push mail past a block.
* **Honest status** — a message is only `sent` after Gmail returns a message id; that means
  *Gmail accepted it*, not that it was delivered to the recipient.
* **Pacing** — configurable delay + jitter between messages, per-account and per-campaign
  daily caps (defaults are conservative: 8 s apart, 150/account/day, 60/campaign/day).

---

## 1. Install

```powershell
cd mailer
pip install -r requirements.txt
copy .env.example .env      # then edit .env
```

## 2. Google Cloud setup (one time, ~5 minutes)

1. Open <https://console.cloud.google.com/> and create a project (e.g. `mail-merge-local`).
2. **APIs & Services → Library** → enable **Gmail API**.
   (Enable **Google Sheets API** too, only if you want to import recipients from Sheets.)
3. **APIs & Services → OAuth consent screen**
   * User type: **External**, publishing status: **Testing**.
   * Add your own Google addresses under **Test users** (in Testing mode only test users
     may sign in — this is the most common setup error).
   * Scopes are added automatically at runtime; you don't need to list them here.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   * Application type: **Desktop app**.
   * Download the JSON and copy two values into `mailer/.env`:
     * `client_id` → `GOOGLE_OAUTH_CLIENT_ID`
     * `client_secret` → `GOOGLE_OAUTH_CLIENT_SECRET`
   * `.env` is read **once at startup** — restart `python app.py` after editing it.
5. `OAUTH_REDIRECT_URI` must stay a loopback address: `http://127.0.0.1:8200/oauth2/callback`.

The app requests the **minimum scope** `gmail.send`. The Sheets scope
(`spreadsheets.readonly`) is requested *separately and only* when you import from Google
Sheets (incremental authorization).

## 3. Run

```powershell
cd mailer
python app.py
# open http://127.0.0.1:8200
```

## 4. Typical workflow

1. **Gmail accounts → Connect Gmail account** → approve in the Google window.
   Repeat for each of your accounts (each account has its own cap and status).
2. **Campaigns → New campaign** → import a CSV (`email,name,company,job title,url`…) or a
   Google Sheet, check the column mapping.
3. Write the subject/body with placeholders, e.g.
   `Job enquiry — {{job title}} at {{company}}`, watch the live preview.
4. Pick the sender account, the delay between sends and the campaign's daily cap →
   **Create campaign**.
5. Review the personalized preview → **Start**. Pause / resume / cancel at any time.
   Everything is resumable; already-sent recipients are never re-sent.

The CSV files already in the repo root (`emails_all.csv`, `emails_test.csv`, …) import
directly.

---

## Configuration reference

All settings live in `mailer/.env` (see `.env.example` for comments):

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | – | Desktop-app OAuth client from Google Cloud |
| `DASHBOARD_HOST` / `DASHBOARD_PORT` | `127.0.0.1` / `8200` | bind address (keep local) |
| `OAUTH_REDIRECT_URI` | `http://127.0.0.1:8200/oauth2/callback` | must match Google Cloud |
| `DEFAULT_RATE_DELAY_SEC` | `8` | delay between two e-mails |
| `DEFAULT_ACCOUNT_DAILY_LIMIT` | `150` | self-imposed per-account cap/day |
| `DEFAULT_CAMPAIGN_DAILY_MAX` | `60` | campaign cap/day |
| `MAX_SEND_ATTEMPTS` | `4` | retries for 5xx/network errors |
| `MAX_CONSECUTIVE_PERMANENT_FAILURES` | `5` | stop the campaign after this many rejections |
| `MAILER_DATA_DIR` | `mailer/data` | database, encrypted tokens, uploads |

## Storage

`mailer/data/` (created automatically, git-ignored):

* `mailer.db` — SQLite (WAL): accounts, imports, campaigns, messages, events
* `secret.key` — Fernet key that encrypts OAuth tokens (owner-only file)
* `logs/` — reserved for future file logs; structured events are stored in the DB

Delete `mailer/data` to reset the dashboard completely.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Missing required parameter: client_id" on Google's page | `GOOGLE_OAUTH_CLIENT_ID` is empty → fill `mailer/.env`, then **restart** `python app.py` (the dashboard now blocks this with a clear message instead of opening Google) |
| "redirect_uri_mismatch" | `OAUTH_REDIRECT_URI` must be exactly the loopback URI; the client must be **Desktop app** |
| "Access blocked: app has not been verified" | normal for Testing-mode apps → **Advanced → Go to (unsafe)**, or publish the app |
| "Sign-in is disabled for this app" / 403 invalid_client | add your address under **Test users** on the consent screen |
| `insufficientPermissions` on send | reconnect the account so it re-grants `gmail.send` |
| "has not been granted one or more of the requested scopes" when importing a Sheet | press **Load worksheets** once — the dashboard asks for the Sheets scope only then |
| Token suddenly invalid (`auth_error`) | Google revoked it (password change, 7-day test-mode expiry) → disconnect + reconnect the account |

## Limits & responsible use

Personal Gmail accounts are limited by Google (500 sent e-mails/day; 2000/day on Google
Workspace, plus shorter burst limits and per-recipient limits). This dashboard enforces
its own, lower caps and stops when Gmail says stop — it does **not** try to work around
Google's limits or anti-abuse controls. Job-application e-mails should be relevant,
personalized, and sent to genuinely appropriate contacts; bulk unsolicited mail can get
accounts suspended and may be unlawful (CAN-SPAM / GDPR).
