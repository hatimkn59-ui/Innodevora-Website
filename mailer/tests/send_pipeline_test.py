"""End-to-end test of the sending pipeline with a stubbed Gmail API.

No network access and no Google account are needed: the Gmail send call and
the access-token lookup are replaced with fakes, everything else (database,
templates, worker, quota logic, resume) runs for real.

Run:   python tests/send_pipeline_test.py
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
from pathlib import Path

# isolate all data before the app modules are imported
_TMP = tempfile.mkdtemp(prefix="mailer-test-")
os.environ["MAILER_DATA_DIR"] = _TMP

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config         # noqa: E402
import db            # noqa: E402
import gmail         # noqa: E402
import google_oauth  # noqa: E402
import worker        # noqa: E402
from app import app  # noqa: E402

# --------------------------------------------------------------------------- #
# fake Gmail
# --------------------------------------------------------------------------- #
SENT_LOG: list[str] = []
FAIL_KIND: dict[str, str] = {}      # recipient -> forced error kind


def fake_token(account, *args, **kwargs):
    return "fake-access-token"


def fake_send(access_token, mime_b64, **kwargs):
    import base64
    raw = base64.urlsafe_b64decode(mime_b64 + "==").decode("utf-8", "ignore")
    to_line = next((line for line in raw.splitlines() if line.lower().startswith("to:")), "")
    recipient = to_line.split(":", 1)[-1].strip().lower()
    forced = FAIL_KIND.get(recipient)
    if forced == "quota":
        raise gmail.GmailSendError("quota", "Daily Limit for Sending Exceeded", 403, "dailylimitexceeded")
    if forced == "permanent":
        raise gmail.GmailSendError("permanent", "Invalid To header", 400, "invalidArgument")
    SENT_LOG.append(recipient)
    return f"fake-msg-id-{len(SENT_LOG)}"


google_oauth.get_access_token = fake_token
gmail.send_message = fake_send
worker.google_oauth.get_access_token = fake_token
worker.gmail.send_message = fake_send
config.MIN_RATE_DELAY_SEC = 0.01   # keep the test fast; production default is 2s

client = app.test_client()

CSV_SAMPLE = (
    "email,name,company,job title\n"
    "driver.one@spedition-a.de,Anna Weber,Spedition A,Berufskraftfahrer\n"
    "driver.two@spedition-b.de,,Spedition B,Lkw-Fahrer\n"          # missing name on purpose
    "not-an-email,Max,Spedition C,Driver\n"                        # invalid address
    "driver.one@spedition-a.de,Anna Weber,Spedition A,Berufskraftfahrer\n"  # duplicate
    "driver.three@spedition-d.de,Lisa Schulz,Spedition D,Transportleitung\n"
)


def csv_for(emails: list[str]) -> str:
    """A complete CSV (every row has name/company/job title)."""
    lines = ["email,name,company,job title"]
    for i, email in enumerate(emails, 1):
        lines.append(f"{email},Contact {i},Company {i},Berufskraftfahrer")
    return "\n".join(lines) + "\n"


def wait_for_campaign(campaign_id: int, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        campaign = client.get(f"/api/campaigns/{campaign_id}").get_json()["campaign"]
        if campaign["status"] != "running":
            return campaign
        time.sleep(0.2)
    raise AssertionError("campaign did not finish in time")


def make_account(email: str, daily_limit: int = 100) -> int:
    now = time.time()
    with db._write_lock:
        cur = db.get_conn().execute(
            """INSERT INTO accounts (email, display_name, status, scopes, refresh_token_enc,
                                     token_expiry, daily_limit, daily_sent_date, connected_at, updated_at)
               VALUES (?, ?, 'connected', ?, 'enc', 0, ?, ?, ?, ?)""",
            (email, "Test User", "openid email https://www.googleapis.com/auth/gmail.send",
             daily_limit, time.strftime("%Y-%m-%d"), now, now),
        )
        db.get_conn().commit()
        return cur.lastrowid


def upload_csv(text: str) -> dict:
    resp = client.post("/api/imports/csv",
                       data={"file": (io.BytesIO(text.encode("utf-8")), "test.csv")},
                       content_type="multipart/form-data")
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()["payload"]


def create_campaign(import_id: int, account_id: int, name: str, skip_existing: bool = True) -> dict:
    resp = client.post("/api/campaigns", json={
        "name": name,
        "import_id": import_id,
        "account_id": account_id,
        "sender_name": "Test Sender",
        "subject_template": "Job enquiry - {{job title}} at {{company}}",
        "body_template": "Hello {{name}},\n\nWe are {{company}}.\n\nBest regards",
        "skip_existing": skip_existing,
        "rate_delay_sec": 2,
        "max_per_day": 100,
    })
    assert resp.status_code == 200, resp.get_json()
    campaign = resp.get_json()["campaign"]
    # keep the test fast; the API clamps the delay to >= 2s for real sending
    db.execute("UPDATE campaigns SET rate_delay_sec=0.05 WHERE id=?", (campaign["id"],))
    return campaign


def check(label: str, condition: bool, extra: str = "") -> None:
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}" + (f" - {extra}" if extra else ""))
    if not condition:
        raise AssertionError(label)


def main() -> int:
    print("1) import CSV (validation + dedupe)")
    imp = upload_csv(CSV_SAMPLE)
    check("invalid + duplicate rows removed",
          imp["row_count"] == 3 and imp["invalid_count"] == 1 and imp["duplicate_count"] == 1,
          f"rows={imp['row_count']} invalid={imp['invalid_count']} dupes={imp['duplicate_count']}")
    check("column mapping guessed",
          imp["mapping"]["email"] == "email" and imp["mapping"]["job_title"] == "job title")

    print("2) campaign requires a valid sender account")
    resp = client.post("/api/campaigns", json={"name": "x", "import_id": imp["import_id"],
                                               "account_id": 999, "subject_template": "s",
                                               "body_template": "b"})
    check("unknown account rejected", resp.status_code == 400)

    print("3) first campaign: personalization, skipping, sending")
    SENT_LOG.clear()
    account_id = make_account("sender.test@gmail.com")
    campaign = create_campaign(imp["import_id"], account_id, "Batch 1")
    check("3 messages created", campaign["total_count"] == 3 and campaign["pending_count"] == 3)

    preview = client.get(f"/api/campaigns/{campaign['id']}/preview?limit=3").get_json()["previews"]
    check("personalization fills company/title",
          any("Spedition A" in p["subject"] and "Anna Weber" in p["body"] for p in preview),
          preview[0]["subject"])
    check("missing variable is detected", any(p["missing"] == ["name"] for p in preview))

    client.post(f"/api/campaigns/{campaign['id']}/start")
    done = wait_for_campaign(campaign["id"])
    check("campaign completed", done["status"] == "completed", done.get("status_reason") or "")
    check("2 sent, 1 skipped (missing name)",
          done["sent_count"] == 2 and done["skipped_count"] == 1,
          f"sent={done['sent_count']} skipped={done['skipped_count']}")
    check("no duplicate API calls", SENT_LOG == sorted(set(SENT_LOG)) and len(SENT_LOG) == 2, str(SENT_LOG))
    check("account daily counter",
          db.one("SELECT daily_sent FROM accounts WHERE id=?", (account_id,))["daily_sent"] == 2)

    print("4) skip_existing prevents re-emailing")
    SENT_LOG.clear()
    campaign2 = create_campaign(imp["import_id"], account_id, "Batch 2", skip_existing=True)
    check("already-emailed recipients skipped up front", campaign2["skipped_count"] == 2
          and campaign2["pending_count"] == 1, f"skipped={campaign2['skipped_count']}")
    client.post(f"/api/campaigns/{campaign2['id']}/start")
    done2 = wait_for_campaign(campaign2["id"])
    check("nothing was re-sent", done2["sent_count"] == 0 and not SENT_LOG,
          f"sent={done2['sent_count']} api_calls={len(SENT_LOG)}")
    check("start is refused twice", client.post(f"/api/campaigns/{campaign2['id']}/start").status_code == 400)

    print("5) quota error pauses account + campaign, resume sends each once")
    imp2 = upload_csv(csv_for(["q.one@spedition-x.de", "q.two@spedition-y.de", "q.three@spedition-z.de"]))
    account_id2 = make_account("sender.two@gmail.com")
    FAIL_KIND["q.one@spedition-x.de"] = "quota"
    SENT_LOG.clear()
    campaign3 = create_campaign(imp2["import_id"], account_id2, "Batch 3", skip_existing=False)
    client.post(f"/api/campaigns/{campaign3['id']}/start")
    paused = wait_for_campaign(campaign3["id"])
    check("quota pauses the campaign", paused["status"] == "paused", paused.get("status_reason") or "")
    check("account marked quota_exceeded",
          db.one("SELECT status FROM accounts WHERE id=?", (account_id2,))["status"] == "quota_exceeded")
    check("nothing wrongly marked sent", paused["sent_count"] == 0 and not SENT_LOG)

    FAIL_KIND.clear()
    client.post(f"/api/accounts/{account_id2}/resume")
    client.post(f"/api/campaigns/{campaign3['id']}/start")
    done3 = wait_for_campaign(campaign3["id"])
    check("resume completes the campaign", done3["status"] == "completed", done3.get("status_reason") or "")
    check("each recipient sent exactly once",
          done3["sent_count"] == 3 and len(SENT_LOG) == len(set(SENT_LOG)) == 3, str(SENT_LOG))

    print("6) self-imposed daily cap stops the account")
    imp3 = upload_csv(csv_for(["cap.one@a.de", "cap.two@b.de", "cap.three@c.de"]))
    account_id3 = make_account("sender.three@gmail.com", daily_limit=2)
    campaign4 = create_campaign(imp3["import_id"], account_id3, "Batch 4", skip_existing=False)
    client.post(f"/api/campaigns/{campaign4['id']}/start")
    done4 = wait_for_campaign(campaign4["id"])
    check("campaign paused at the cap", done4["status"] == "paused" and done4["sent_count"] == 2,
          f"status={done4['status']} sent={done4['sent_count']}")
    check("reason names the cap", "daily cap" in (done4.get("status_reason") or "").lower(),
          done4.get("status_reason") or "")

    print("7) history")
    history = client.get("/api/history?status=sent").get_json()
    check("history lists sent messages", history["total"] >= 7, f"total={history['total']}")
    check("every history row has a sender account", all(r["account_email"] for r in history["history"]))

    print("8) cancel leaves nothing unsent")
    imp4 = upload_csv(csv_for(["c.one@a.de", "c.two@b.de", "c.three@c.de"]))
    account_id4 = make_account("sender.four@gmail.com")
    campaign5 = create_campaign(imp4["import_id"], account_id4, "Batch 5", skip_existing=False)
    client.post(f"/api/campaigns/{campaign5['id']}/cancel")
    cancelled = client.get(f"/api/campaigns/{campaign5['id']}").get_json()["campaign"]
    check("cancel skips pending recipients", cancelled["status"] == "cancelled"
          and cancelled["skipped_count"] == 3, f"status={cancelled['status']}")

    print("9) crash recovery")
    db.execute("UPDATE messages SET status='sending' WHERE campaign_id=? AND status='pending'",
               (campaign4["id"],))
    db._recovery_done = False
    db.recover_interrupted()
    stuck = db.scalar("SELECT COUNT(*) FROM messages WHERE campaign_id=? AND status='pending'",
                      (campaign4["id"],))
    check("in-flight message returns to pending", stuck == 1, f"pending={stuck}")

    print("10) secrets never leak to the API")
    accounts = client.get("/api/accounts").get_json()["accounts"]
    check("no token fields in account payload",
          all("refresh_token" not in a and "access_token" not in a for a in accounts))

    print(f"\nAll checks passed.  Test data dir: {_TMP}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as exc:
        print(f"\nFAILED: {exc}")
        sys.exit(1)
