"""Local Gmail mail-merge dashboard - Flask application and JSON API.

Run:
    python app.py            (http://127.0.0.1:8200)

The server binds to 127.0.0.1 by default so the dashboard and the stored
OAuth tokens never leave this machine.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory
from werkzeug.utils import secure_filename

import db
import gmail
import google_oauth
import imports as imports_mod
import security
import templating
import worker
from config import (
    DEFAULT_ACCOUNT_DAILY_LIMIT,
    DEFAULT_CAMPAIGN_DAILY_MAX,
    DEFAULT_RATE_DELAY_SEC,
    GOOGLE_CLIENT_ID,
    HOST,
    MIN_RATE_DELAY_SEC,
    OAUTH_REDIRECT_URI,
    PORT,
    SCOPE_GMAIL_SEND,
    SCOPE_SHEETS_READONLY,
    UPLOAD_DIR,
)

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # 8 MB CSV uploads


# --------------------------------------------------------------------------- #
# security middleware: only accept state-changing requests from this origin
# --------------------------------------------------------------------------- #
_ALLOWED_ORIGINS = {
    f"http://127.0.0.1:{PORT}",
    f"http://localhost:{PORT}",
    f"http://[::1]:{PORT}",
}


@app.before_request
def _guard_state_changing_requests():
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    origin = request.headers.get("Origin")
    if origin and origin.rstrip("/") not in _ALLOWED_ORIGINS:
        return jsonify({"error": "Cross-origin request rejected."}), 403
    return None


@app.errorhandler(worker.BusyError)
def _busy(err):
    return jsonify({"error": str(err)}), 409


@app.errorhandler(worker.CampaignError)
def _campaign_error(err):
    return jsonify({"error": str(err)}), 400


@app.errorhandler(imports_mod.ImportError_)
def _import_error(err):
    return jsonify({"error": str(err)}), 400


@app.errorhandler(imports_mod.SheetsScopeRequired)
def _sheets_scope(err):
    return jsonify({"error": str(err), "code": "sheets_scope_required"}), 403


@app.errorhandler(google_oauth.OAuthError)
def _oauth_error(err):
    return jsonify({"error": str(err)}), 400


def _body() -> dict:
    return request.get_json(silent=True) or {}


def _ok(**kwargs):
    return jsonify(kwargs)


# --------------------------------------------------------------------------- #
# frontend
# --------------------------------------------------------------------------- #
@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return _ok(ok=True, running=worker.sender.is_running)


# --------------------------------------------------------------------------- #
# overview
# --------------------------------------------------------------------------- #
@app.get("/api/overview")
def overview():
    accounts = db.query("SELECT * FROM accounts ORDER BY email")
    for acc in accounts:
        acc.pop("refresh_token_enc", None)
        acc.pop("access_token_enc", None)

    today = time.strftime("%Y-%m-%d")
    sent_total = db.scalar("SELECT COUNT(*) FROM messages WHERE status='sent'")
    pending_total = db.scalar("SELECT COUNT(*) FROM messages WHERE status='pending'")
    failed_total = db.scalar("SELECT COUNT(*) FROM messages WHERE status='failed'")
    skipped_total = db.scalar("SELECT COUNT(*) FROM messages WHERE status='skipped'")
    recipients_total = db.scalar("SELECT COUNT(*) FROM imports")
    rows_imported = db.scalar(
        "SELECT COALESCE(SUM((SELECT COUNT(*) FROM json_each(imports.rows_json))),0) FROM imports"
    )
    campaigns = db.query(
        """SELECT c.id, c.name, c.status, c.status_reason, c.total_count, c.sent_count,
                  c.failed_count, c.skipped_count, c.finished_at, c.started_at,
                  a.email AS account_email
             FROM campaigns c LEFT JOIN accounts a ON a.id = c.account_id
            ORDER BY c.created_at DESC"""
    )
    for camp in campaigns:
        camp["pending_count"] = max(
            0, (camp["total_count"] or 0) - (camp["sent_count"] or 0)
            - (camp["failed_count"] or 0) - (camp["skipped_count"] or 0)
        )
        camp["progress"] = (
            round(100.0 * ((camp["sent_count"] or 0) + (camp["failed_count"] or 0)
                           + (camp["skipped_count"] or 0)) / camp["total_count"], 1)
            if camp["total_count"] else 0.0
        )

    sent_today = 0
    for acc in accounts:
        fresh = db.one("SELECT daily_sent, daily_limit FROM accounts WHERE id=?", (acc["id"],))
        acc["daily_sent"] = fresh["daily_sent"] if fresh else 0
        acc["daily_limit"] = fresh["daily_limit"] if fresh else acc["daily_limit"]
        if acc.get("daily_sent_date") == today:
            sent_today += acc["daily_sent"]

    return _ok(
        accounts={
            "total": len(accounts),
            "connected": sum(1 for a in accounts if a["status"] == "connected"),
            "attention": sum(1 for a in accounts if a["status"] in {"auth_error", "quota_exceeded"}),
        },
        recipients={"imports": recipients_total, "rows": rows_imported},
        messages={"sent": sent_total, "pending": pending_total, "failed": failed_total,
                  "skipped": skipped_total, "sent_today": sent_today},
        campaigns=campaigns,
        sender=worker.sender.status(),
        recent_events=db.query(
            "SELECT ts, level, scope, message FROM events ORDER BY ts DESC, id DESC LIMIT 12"
        ),
    )


# --------------------------------------------------------------------------- #
# Gmail accounts (OAuth 2.0)
# --------------------------------------------------------------------------- #
def _public_account(row: dict) -> dict:
    fresh = db.one(
        """SELECT id, email, display_name, status, status_reason, scopes, daily_limit,
                  daily_sent, daily_sent_date, last_sent_at, last_error, connected_at, updated_at
             FROM accounts WHERE id=?""",
        (row["id"],),
    ) or row
    scopes = google_oauth.account_scopes(fresh)
    return {
        "id": fresh["id"],
        "email": fresh["email"],
        "display_name": fresh.get("display_name") or "",
        "status": fresh["status"],
        "status_reason": fresh.get("status_reason"),
        "scopes": scopes,
        "can_send": SCOPE_GMAIL_SEND in scopes,
        "can_read_sheets": SCOPE_SHEETS_READONLY in scopes,
        "daily_limit": fresh["daily_limit"],
        "daily_sent": fresh["daily_sent"],
        "daily_remaining": max(0, fresh["daily_limit"] - fresh["daily_sent"]),
        "resets_at_midnight": True,
        "last_sent_at": fresh.get("last_sent_at"),
        "last_error": fresh.get("last_error"),
        "connected_at": fresh.get("connected_at"),
        "sending_today": db.scalar(
            """SELECT COUNT(*) FROM messages m
                 WHERE m.account_id=? AND m.status='sent'
                   AND date(m.sent_at,'unixepoch','localtime') = date('now','localtime')""",
            (fresh["id"],),
        ),
    }


@app.get("/api/accounts")
def accounts_list():
    rows = db.query("SELECT * FROM accounts ORDER BY email")
    return _ok(accounts=[_public_account(r) for r in rows],
               configured=bool(GOOGLE_CLIENT_ID),
               redirect_uri=OAUTH_REDIRECT_URI)


@app.post("/api/accounts/connect")
def accounts_connect():
    if not GOOGLE_CLIENT_ID:
        return jsonify({
            "error": "Google OAuth is not configured yet. Copy mailer/.env.example to "
                     "mailer/.env, set GOOGLE_OAUTH_CLIENT_ID and "
                     "GOOGLE_OAUTH_CLIENT_SECRET, then restart the dashboard "
                     "(full steps in mailer/README.md).",
            "code": "not_configured",
        }), 400
    body = _body()
    extra = [SCOPE_SHEETS_READONLY] if body.get("with_sheets") else []
    login_hint = (body.get("login_hint") or "").strip()
    url = google_oauth.build_authorize_url(
        google_oauth.default_scopes(), extra_scopes=extra, login_hint=login_hint or None
    )
    return _ok(authorize_url=url)


@app.post("/api/accounts/<int:account_id>/authorize-sheets")
def accounts_authorize_sheets(account_id):
    if not GOOGLE_CLIENT_ID:
        return jsonify({"error": "Google OAuth is not configured (see mailer/.env).",
                        "code": "not_configured"}), 400
    account = db.one("SELECT * FROM accounts WHERE id=?", (account_id,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    if google_oauth.has_scope(account, SCOPE_SHEETS_READONLY):
        return _ok(authorize_url=None, already_granted=True)
    url = google_oauth.build_authorize_url(
        google_oauth.default_scopes(),
        extra_scopes=[SCOPE_SHEETS_READONLY],
        login_hint=account["email"],
    )
    return _ok(authorize_url=url)


@app.get("/oauth2/callback")
def oauth_callback():
    error = request.args.get("error")
    if error:
        return redirect("/?oauth_error=" + (request.args.get("error_description") or error))
    try:
        auth = google_oauth.pop_pending(request.args.get("state", ""))
        code = request.args.get("code", "")
        if not code:
            raise google_oauth.OAuthError("Google did not return an authorization code.")
        tokens = google_oauth.exchange_code(code, auth.code_verifier)
        access = tokens.get("access_token", "")
        userinfo = google_oauth.fetch_userinfo(access)
        email = (userinfo.get("email") or "").strip().lower()
        if not email:
            raise google_oauth.OAuthError("Could not read the e-mail of the connected account.")
    except google_oauth.OAuthError as exc:
        return redirect("/?oauth_error=" + str(exc))

    now = time.time()
    existing = db.one("SELECT * FROM accounts WHERE email=?", (email,))
    scopes = set(auth.scopes)
    if existing:
        scopes |= set(google_oauth.account_scopes(existing))

    if existing:
        db.execute(
            """UPDATE accounts
                  SET scopes=?, status='connected', status_reason=NULL,
                      refresh_token_enc=?, access_token_enc=?, token_expiry=?,
                      display_name=COALESCE(NULLIF(display_name,''), ?), updated_at=?
                WHERE id=?""",
            (" ".join(sorted(scopes)),
             security.encrypt(tokens.get("refresh_token", "") or
                              security.decrypt(existing.get("refresh_token_enc") or "")),
             security.encrypt(tokens.get("access_token", "")),
             now + max(60.0, float(tokens.get("expires_in", 3600)) - 60.0),
             userinfo.get("name") or "", now, existing["id"]),
        )
        account_id = existing["id"]
        db.log_event("info", f"account:{account_id}",
                     f"Account {email} reconnected (scopes: {len(scopes)}).")
    else:
        cur = db.get_conn().execute(
            """INSERT INTO accounts (email, display_name, status, scopes,
                                     refresh_token_enc, access_token_enc, token_expiry,
                                     daily_limit, daily_sent_date, connected_at, updated_at)
               VALUES (?,?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (email, userinfo.get("name") or "", " ".join(sorted(scopes)),
             security.encrypt(tokens.get("refresh_token", "")),
             security.encrypt(tokens.get("access_token", "")),
             now + max(60.0, float(tokens.get("expires_in", 3600)) - 60.0),
             DEFAULT_ACCOUNT_DAILY_LIMIT, time.strftime("%Y-%m-%d"), now, now),
        )
        db.get_conn().commit()
        account_id = cur.lastrowid
        db.log_event("info", f"account:{account_id}", f"Gmail account {email} connected.")

    return redirect(f"/?connected={email}")


@app.post("/api/accounts/<int:account_id>/disconnect")
def accounts_disconnect(account_id):
    account = db.one("SELECT * FROM accounts WHERE id=?", (account_id,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    google_oauth.revoke(account)
    running = db.scalar(
        "SELECT COUNT(*) FROM campaigns WHERE account_id=? AND status='running'", (account_id,)
    )
    if running:
        return jsonify({"error": "Pause the running campaign for this account first."}), 409
    db.execute(
        """UPDATE accounts SET status='disconnected', status_reason='Disconnected by user',
                  refresh_token_enc=NULL, access_token_enc=NULL, token_expiry=0, updated_at=?
            WHERE id=?""",
        (time.time(), account_id),
    )
    db.execute(
        """UPDATE campaigns SET status='paused',
                  status_reason='Sender account was disconnected.', updated_at=?
            WHERE account_id=? AND status IN ('draft','ready')""",
        (time.time(), account_id),
    )
    db.log_event("warning", f"account:{account_id}", f"Account {account['email']} disconnected.")
    return _ok(disconnected=True)


@app.patch("/api/accounts/<int:account_id>")
def accounts_update(account_id):
    body = _body()
    account = db.one("SELECT * FROM accounts WHERE id=?", (account_id,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    fields, params = [], []
    if "daily_limit" in body:
        try:
            limit = int(body["daily_limit"])
        except (TypeError, ValueError):
            return jsonify({"error": "daily_limit must be a number."}), 400
        if not 1 <= limit <= 2000:
            return jsonify({"error": "daily_limit must be between 1 and 2000."}), 400
        fields.append("daily_limit=?")
        params.append(limit)
    if "display_name" in body:
        fields.append("display_name=?")
        params.append(str(body["display_name"])[:80])
    if fields:
        fields.append("updated_at=?")
        params.append(time.time())
        params.append(account_id)
        db.execute(f"UPDATE accounts SET {', '.join(fields)} WHERE id=?", params)
    return _ok(account=_public_account(account))


@app.post("/api/accounts/<int:account_id>/pause")
def accounts_pause(account_id):
    return _set_account_status(account_id, "paused", "Paused by user.")


@app.post("/api/accounts/<int:account_id>/resume")
def accounts_resume(account_id):
    return _set_account_status(account_id, "connected", None)


def _set_account_status(account_id: int, status: str, reason: str | None):
    account = db.one("SELECT * FROM accounts WHERE id=?", (account_id,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    if status == "connected" and not account.get("refresh_token_enc"):
        return jsonify({"error": "This account has no stored session - reconnect it."}), 400
    db.execute(
        """UPDATE accounts SET status=?, status_reason=?, daily_sent=CASE WHEN ?='connected'
                  THEN 0 ELSE daily_sent END, updated_at=? WHERE id=?""",
        (status, reason, status, time.time(), account_id),
    )
    db.log_event("info", f"account:{account_id}",
                 f"Account {account['email']} set to {status}.")
    return _ok(account=_public_account(account))


# --------------------------------------------------------------------------- #
# imports: CSV upload + Google Sheets
# --------------------------------------------------------------------------- #
def _import_payload(import_id: int) -> dict:
    row = imports_mod.get_import(import_id)
    if not row:
        return {}
    mapping = templating.guess_mapping(row["headers"])
    return {
        "import_id": row["id"],
        "kind": row["kind"],
        "name": row["name"],
        "source_ref": row.get("source_ref"),
        "headers": row["headers"],
        "sample": row["rows"][:5],
        "row_count": len(row["rows"]),
        "invalid_count": row["invalid_count"],
        "duplicate_count": row["duplicate_count"],
        "mapping": mapping,
        "created_at": row["created_at"],
    }


@app.post("/api/imports/csv")
def imports_csv():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file uploaded."}), 400
    raw = file.read()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "ignore")
    headers, rows = imports_mod.parse_csv(text)
    result = imports_mod.validate_rows(headers, rows, templating.guess_mapping(headers))
    import_id = imports_mod.store_import(
        "csv", Path(secure_filename(file.filename)).stem or "csv import",
        headers, result["rows"], source_ref=file.filename,
        invalid=result["invalid"], duplicates=result["duplicates"],
    )
    return _ok(payload=_import_payload(import_id))


@app.post("/api/imports/sheet")
def imports_sheet():
    body = _body()
    account = db.one("SELECT * FROM accounts WHERE id=?", (body.get("account_id") or 0,))
    if not account:
        return jsonify({"error": "Select a connected Gmail account first."}), 400
    spreadsheet_id = (body.get("spreadsheet_id") or "").strip()
    range_ref = (body.get("range") or "").strip()
    if not spreadsheet_id or not range_ref:
        return jsonify({"error": "Spreadsheet ID and worksheet/range are required."}), 400
    headers, rows = imports_mod.import_sheet(account, spreadsheet_id, range_ref)
    result = imports_mod.validate_rows(headers, rows, templating.guess_mapping(headers))
    title = imports_mod.spreadsheet_title(account, spreadsheet_id)
    import_id = imports_mod.store_import(
        "sheet", title or "Google Sheet", headers, result["rows"],
        source_ref=f"{spreadsheet_id}::{range_ref}", account_id=account["id"],
        invalid=result["invalid"], duplicates=result["duplicates"],
    )
    return _ok(payload=_import_payload(import_id))


@app.get("/api/imports/<int:import_id>")
def imports_get(import_id):
    payload = _import_payload(import_id)
    if not payload:
        return jsonify({"error": "Import not found."}), 404
    return _ok(payload=payload)


@app.get("/api/sheets/workbooks")
def sheets_workbooks():
    """List the sheet tabs of a spreadsheet so the user can pick a range."""
    account = db.one("SELECT * FROM accounts WHERE id=?", (request.args.get("account_id") or 0,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    spreadsheet_id = (request.args.get("spreadsheet_id") or "").strip()
    if not spreadsheet_id:
        return jsonify({"error": "spreadsheet_id is required."}), 400
    sheets = imports_mod.list_sheets(account, spreadsheet_id)
    return _ok(sheets=sheets, title=imports_mod.spreadsheet_title(account, spreadsheet_id))


@app.get("/api/sheets/preview")
def sheets_preview():
    account = db.one("SELECT * FROM accounts WHERE id=?", (request.args.get("account_id") or 0,))
    if not account:
        return jsonify({"error": "Account not found."}), 404
    spreadsheet_id = (request.args.get("spreadsheet_id") or "").strip()
    range_ref = (request.args.get("range") or "").strip()
    headers, rows = imports_mod.import_sheet(account, spreadsheet_id, range_ref)
    return _ok(headers=headers, sample=rows[:8], row_count=len(rows),
               mapping=templating.guess_mapping(headers))


# --------------------------------------------------------------------------- #
# campaigns
# --------------------------------------------------------------------------- #
def _campaign_summary(row: dict) -> dict:
    total = row["total_count"] or 0
    done = (row["sent_count"] or 0) + (row["failed_count"] or 0) + (row["skipped_count"] or 0)
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "status_reason": row.get("status_reason"),
        "account_id": row.get("account_id"),
        "account_email": row.get("account_email"),
        "import_id": row.get("import_id"),
        "total_count": total,
        "sent_count": row["sent_count"] or 0,
        "failed_count": row["failed_count"] or 0,
        "skipped_count": row["skipped_count"] or 0,
        "pending_count": max(0, total - done),
        "progress": round(100.0 * done / total, 1) if total else 0.0,
        "rate_delay_sec": row.get("rate_delay_sec"),
        "max_per_day": row.get("max_per_day"),
        "skip_existing": bool(row.get("skip_existing")),
        "sender_name": row.get("sender_name"),
        "reply_to": row.get("reply_to"),
        "subject_template": row.get("subject_template"),
        "body_template": row.get("body_template"),
        "body_format": row.get("body_format"),
        "column_map": json.loads(row.get("column_map_json") or "{}"),
        "created_at": row.get("created_at"),
        "started_at": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "updated_at": row.get("updated_at"),
    }


@app.get("/api/campaigns")
def campaigns_list():
    rows = db.query(
        """SELECT c.*, a.email AS account_email
             FROM campaigns c LEFT JOIN accounts a ON a.id = c.account_id
            ORDER BY c.created_at DESC"""
    )
    return _ok(campaigns=[_campaign_summary(r) for r in rows])


@app.post("/api/campaigns")
def campaigns_create():
    body = _body()
    name = (body.get("name") or "").strip()
    subject = (body.get("subject_template") or "").strip()
    template_body = body.get("body_template") or ""
    if not name:
        return jsonify({"error": "Campaign name is required."}), 400
    if not subject:
        return jsonify({"error": "Subject line is required."}), 400
    if not template_body.strip():
        return jsonify({"error": "Message body is required."}), 400
    if "{{" in subject and subject.count("{{") != subject.count("}}"):
        return jsonify({"error": "Unbalanced { } braces in the subject template."}), 400

    account = db.one("SELECT * FROM accounts WHERE id=?", (body.get("account_id") or 0,))
    if not account:
        return jsonify({"error": "Select the Gmail account that should send this campaign."}), 400
    if account["status"] != "connected":
        return jsonify({"error": f"Account {account['email']} is {account['status']} - fix it first."}), 400
    if not google_oauth.has_scope(account, SCOPE_GMAIL_SEND):
        return jsonify({"error": f"Account {account['email']} was not granted send permission."}), 400

    imp = imports_mod.get_import(body.get("import_id") or 0)
    if not imp:
        return jsonify({"error": "Import a recipient list first."}), 400

    mapping = dict(body.get("column_map") or {})
    mapping.setdefault("email", "")
    try:
        validated = imports_mod.validate_rows(imp["headers"], imp["rows"], mapping)
    except imports_mod.ImportError_ as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        delay = max(MIN_RATE_DELAY_SEC, float(body.get("rate_delay_sec", DEFAULT_RATE_DELAY_SEC)))
    except (TypeError, ValueError):
        delay = DEFAULT_RATE_DELAY_SEC
    try:
        max_per_day = int(body.get("max_per_day", DEFAULT_CAMPAIGN_DAILY_MAX))
    except (TypeError, ValueError):
        max_per_day = DEFAULT_CAMPAIGN_DAILY_MAX
    max_per_day = max(1, min(2000, max_per_day))

    skip_existing = bool(body.get("skip_existing", True))
    body_format = "html" if body.get("body_format") == "html" else "text"

    now_ts = time.time()
    with db._write_lock:
        conn = db.get_conn()
        cur = conn.execute(
            """INSERT INTO campaigns (name, status, import_id, account_id, sender_name, reply_to,
                                      subject_template, body_template, body_format,
                                      column_map_json, skip_existing, rate_delay_sec, max_per_day,
                                      total_count, created_at, updated_at)
               VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (name, imp["id"], account["id"],
             (body.get("sender_name") or account.get("display_name") or "").strip()[:80],
             (body.get("reply_to") or "").strip(), subject, template_body, body_format,
             json.dumps(mapping, ensure_ascii=False), int(skip_existing),
             delay, max_per_day, now_ts, now_ts),
        )
        campaign_id = cur.lastrowid

        already_emailed: dict[str, int] = {}
        if skip_existing:
            rows = conn.execute(
                """SELECT m.recipient_email, c.name FROM messages m
                     JOIN campaigns c ON c.id = m.campaign_id
                    WHERE m.status='sent'"""
            ).fetchall()
            already_emailed = {r[0]: r[1] for r in rows}

        inserted = 0
        skipped_existing = 0
        # mapped columns are exposed under canonical names so that
        # {{name}} / {{company}} / {{job title}} / {{url}} work even when the
        # source column is called something else ("title", "firma", ...)
        aliases = {
            "name": mapping.get("name") or "",
            "company": mapping.get("company") or "",
            "job title": mapping.get("job_title") or "",
            "url": mapping.get("url") or "",
        }
        for row in validated["rows"]:
            email = row["_email"]
            data = {k: v for k, v in row.items() if k != "_email"}
            for alias_key, column in aliases.items():
                if column and row.get(column):
                    data.setdefault(alias_key, row[column])
            if email in already_emailed:
                conn.execute(
                    """INSERT OR IGNORE INTO messages
                          (campaign_id, recipient_email, recipient_json, status, error, created_at)
                       VALUES (?,?,?,'skipped',?,?)""",
                    (campaign_id, email, json.dumps(data, ensure_ascii=False),
                     f"Already emailed in campaign '{already_emailed[email]}'.", now_ts),
                )
                skipped_existing += 1
                continue
            conn.execute(
                """INSERT OR IGNORE INTO messages
                      (campaign_id, recipient_email, recipient_json, status, created_at)
                   VALUES (?,?,?,'pending',?)""",
                (campaign_id, email, json.dumps(data, ensure_ascii=False), now_ts),
            )
            inserted += 1
        conn.execute("UPDATE campaigns SET total_count=?, updated_at=? WHERE id=?",
                     (db.scalar("SELECT COUNT(*) FROM messages WHERE campaign_id=?", (campaign_id,), 0),
                      now_ts, campaign_id))
        conn.commit()

    # keep the denormalised counters in sync (skipped rows are created here too)
    worker._refresh_progress(campaign_id)

    db.log_event("info", f"campaign:{campaign_id}",
                 f"Campaign '{name}' created with {inserted} pending recipient(s).",
                 {"skipped_existing": skipped_existing, "invalid": validated["invalid"]})
    campaign = db.one("SELECT c.*, a.email AS account_email FROM campaigns c "
                      "LEFT JOIN accounts a ON a.id=c.account_id WHERE c.id=?", (campaign_id,))
    return _ok(campaign=_campaign_summary(campaign),
               note=(f"{skipped_existing} recipient(s) skipped because they were already emailed "
                     f"in a previous campaign." if skipped_existing else None),
               invalid_rows=validated["invalid"])


@app.get("/api/campaigns/<int:campaign_id>")
def campaigns_get(campaign_id):
    row = db.one(
        """SELECT c.*, a.email AS account_email
             FROM campaigns c LEFT JOIN accounts a ON a.id = c.account_id
            WHERE c.id=?""",
        (campaign_id,),
    )
    if not row:
        return jsonify({"error": "Campaign not found."}), 404
    payload = _campaign_summary(row)
    payload["status_breakdown"] = {
        r["status"]: r["n"] for r in db.query(
            "SELECT status, COUNT(*) AS n FROM messages WHERE campaign_id=? GROUP BY status",
            (campaign_id,),
        )
    }
    payload["variables"] = templating.variables_used(
        row["subject_template"], row["body_template"]
    )
    imp = imports_mod.get_import(row["import_id"]) if row["import_id"] else None
    payload["source"] = {
        "kind": imp["kind"], "name": imp["name"], "row_count": len(imp["rows"]),
        "headers": imp["headers"], "source_ref": imp.get("source_ref"),
    } if imp else None
    payload["sender"] = worker.sender.status()
    return _ok(campaign=payload)


@app.get("/api/campaigns/<int:campaign_id>/messages")
def campaigns_messages(campaign_id):
    status = request.args.get("status", "")
    page = max(1, int(request.args.get("page", 1) or 1))
    per_page = min(200, max(5, int(request.args.get("per_page", 50) or 50)))
    where, params = ["campaign_id=?"], [campaign_id]
    if status in {"pending", "sending", "sent", "failed", "skipped"}:
        where.append("status=?")
        params.append(status)
    total = db.scalar(f"SELECT COUNT(*) FROM messages WHERE {' AND '.join(where)}", params, 0)
    rows = db.query(
        f"""SELECT id, recipient_email, recipient_json, status, error, attempts,
                   gmail_id, sent_at, account_id
              FROM messages WHERE {' AND '.join(where)}
             ORDER BY id LIMIT ? OFFSET ?""",
        params + [per_page, (page - 1) * per_page],
    )
    for row in rows:
        row["recipient"] = json.loads(row.pop("recipient_json") or "{}")
    return _ok(messages=rows, total=total, page=page, per_page=per_page)


@app.get("/api/campaigns/<int:campaign_id>/preview")
def campaigns_preview(campaign_id):
    row = db.one("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
    if not row:
        return jsonify({"error": "Campaign not found."}), 404
    limit = min(20, max(1, int(request.args.get("limit", 5) or 5)))
    messages = db.query(
        "SELECT recipient_email, recipient_json, status, error FROM messages "
        "WHERE campaign_id=? ORDER BY id LIMIT ?",
        (campaign_id, limit),
    )
    account = db.one("SELECT * FROM accounts WHERE id=?", (row["account_id"],))
    previews = []
    for message in messages:
        recipient = json.loads(message["recipient_json"] or "{}")
        subject, missing_s = templating.render(row["subject_template"], recipient)
        body, missing_b = templating.render(row["body_template"], recipient)
        previews.append({
            "to": message["recipient_email"],
            "from": f"{row.get('sender_name') or (account or {}).get('email','')} "
                    f"<{(account or {}).get('email', '')}>",
            "subject": subject,
            "body": body,
            "format": row["body_format"],
            "missing": sorted(set(missing_s + missing_b)),
            "status": message["status"],
        })
    return _ok(previews=previews)


@app.post("/api/campaigns/<int:campaign_id>/start")
def campaigns_start(campaign_id):
    worker.sender.start(campaign_id)
    campaign = db.one("SELECT c.*, a.email AS account_email FROM campaigns c "
                      "LEFT JOIN accounts a ON a.id=c.account_id WHERE c.id=?", (campaign_id,))
    return _ok(campaign=_campaign_summary(campaign), sender=worker.sender.status())


@app.post("/api/campaigns/<int:campaign_id>/pause")
def campaigns_pause(campaign_id):
    if worker.sender.campaign_id == campaign_id and worker.sender.is_running:
        worker.sender.pause("Paused by user.")
    else:
        db.execute(
            "UPDATE campaigns SET status='paused', status_reason='Paused by user.', updated_at=? "
            "WHERE id=? AND status='draft'", (time.time(), campaign_id)
        )
    campaign = db.one("SELECT c.*, a.email AS account_email FROM campaigns c "
                      "LEFT JOIN accounts a ON a.id=c.account_id WHERE c.id=?", (campaign_id,))
    return _ok(campaign=_campaign_summary(campaign), sender=worker.sender.status())


@app.post("/api/campaigns/<int:campaign_id>/cancel")
def campaigns_cancel(campaign_id):
    worker.sender.cancel(campaign_id)
    campaign = db.one("SELECT c.*, a.email AS account_email FROM campaigns c "
                      "LEFT JOIN accounts a ON a.id=c.account_id WHERE c.id=?", (campaign_id,))
    return _ok(campaign=_campaign_summary(campaign))


@app.delete("/api/campaigns/<int:campaign_id>")
def campaigns_delete(campaign_id):
    campaign = db.one("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
    if not campaign:
        return jsonify({"error": "Campaign not found."}), 404
    if worker.sender.campaign_id == campaign_id and worker.sender.is_running:
        return jsonify({"error": "Pause or cancel this campaign before deleting it."}), 409
    db.execute("DELETE FROM campaigns WHERE id=?", (campaign_id,))
    db.log_event("warning", f"campaign:{campaign_id}", f"Campaign '{campaign['name']}' deleted.")
    return _ok(deleted=True)


@app.post("/api/campaigns/<int:campaign_id>/retry-failed")
def campaigns_retry_failed(campaign_id):
    changed = db.execute(
        "UPDATE messages SET status='pending', error=NULL WHERE campaign_id=? AND status='failed'",
        (campaign_id,),
    )
    db.execute("UPDATE campaigns SET failed_count=0, status='draft', updated_at=? WHERE id=?",
               (time.time(), campaign_id))
    db.log_event("info", f"campaign:{campaign_id}", f"Re-queued {changed} failed message(s).")
    return _ok(requeued=changed)


# --------------------------------------------------------------------------- #
# history + events
# --------------------------------------------------------------------------- #
@app.get("/api/history")
def history():
    status = request.args.get("status", "")
    campaign_id = request.args.get("campaign_id", "")
    account_id = request.args.get("account_id", "")
    search = request.args.get("q", "").strip()
    page = max(1, int(request.args.get("page", 1) or 1))
    per_page = min(200, max(10, int(request.args.get("per_page", 40) or 40)))

    where, params = [], []
    if status in {"pending", "sending", "sent", "failed", "skipped"}:
        where.append("m.status=?")
        params.append(status)
    if campaign_id.isdigit():
        where.append("m.campaign_id=?")
        params.append(int(campaign_id))
    if account_id.isdigit():
        where.append("m.account_id=?")
        params.append(int(account_id))
    if search:
        where.append("(m.recipient_email LIKE ? OR c.name LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    total = db.scalar(
        f"SELECT COUNT(*) FROM messages m JOIN campaigns c ON c.id=m.campaign_id {clause}",
        params, 0,
    )
    rows = db.query(
        f"""SELECT m.id, m.recipient_email, m.status, m.error, m.attempts, m.gmail_id,
                   m.sent_at, m.account_id,
                   c.id AS campaign_id, c.name AS campaign_name, a.email AS account_email
              FROM messages m
              JOIN campaigns c ON c.id = m.campaign_id
         LEFT JOIN accounts a ON a.id = m.account_id
              {clause}
          ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
             LIMIT ? OFFSET ?""",
        params + [per_page, (page - 1) * per_page],
    )
    return _ok(history=rows, total=total, page=page, per_page=per_page)


@app.get("/api/events")
def events():
    limit = min(200, max(1, int(request.args.get("limit", 50) or 50)))
    rows = db.query("SELECT * FROM events ORDER BY ts DESC, id DESC LIMIT ?", (limit,))
    for row in rows:
        row["details"] = json.loads(row.pop("details_json") or "{}")
    return _ok(events=rows)


# --------------------------------------------------------------------------- #
# bootstrap + main
# --------------------------------------------------------------------------- #
def bootstrap() -> None:
    db.migrate()
    db.recover_interrupted()


bootstrap()


if __name__ == "__main__":
    print(f"  Gmail mail-merge dashboard -> http://{HOST}:{PORT}")
    if not GOOGLE_CLIENT_ID:
        print("  ! GOOGLE_OAUTH_CLIENT_ID is not set - account connection is disabled.")
        print("    Fix: edit mailer/.env  (GOOGLE_OAUTH_CLIENT_ID / _SECRET), then restart.")
        print("    How to get them: mailer/README.md -> 'Google Cloud setup'")
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
