"""Background campaign runner: one campaign at a time, strict per-account caps.

Design rules that matter for a personal-Gmail workflow:

* exactly one sending thread exists at a time (no concurrent jobs, no
  double-sends);
* messages are claimed atomically (``pending`` -> ``sending``) and only become
  ``sent`` after Gmail returns a message id - interrupted jobs resume without
  duplicates;
* a quota / rate-limit / auth error pauses the *account* and the *campaign*
  with a human-readable reason.  We never hop to a different account to keep
  pushing mail past a block.
"""

from __future__ import annotations

import json
import random
import threading
import time
from datetime import date

import config
import db
import gmail
import google_oauth
import templating
from config import (
    MAX_CONSECUTIVE_PERMANENT_FAILURES,
    MAX_SEND_ATTEMPTS,
)


class BusyError(RuntimeError):
    pass


class CampaignError(RuntimeError):
    pass


def _now() -> float:
    return time.time()


def _account_fresh(account_id: int) -> dict | None:
    return db.one("SELECT * FROM accounts WHERE id = ?", (account_id,))


def _ensure_daily_window(account: dict) -> dict:
    """Reset the daily counter when the local date rolls over."""
    today = date.today().isoformat()
    if account.get("daily_sent_date") != today:
        db.execute(
            "UPDATE accounts SET daily_sent=0, daily_sent_date=?, updated_at=? WHERE id=?",
            (today, _now(), account["id"]),
        )
        account = dict(account, daily_sent=0, daily_sent_date=today)
    return account


def _sent_today(campaign_id: int) -> int:
    return db.scalar(
        """SELECT COUNT(*) FROM messages
            WHERE campaign_id=? AND status='sent'
              AND date(sent_at, 'unixepoch', 'localtime') = date('now','localtime')""",
        (campaign_id,),
    )


def _refresh_progress(campaign_id: int) -> None:
    db.execute(
        """UPDATE campaigns SET
               sent_count    = (SELECT COUNT(*) FROM messages WHERE campaign_id=? AND status='sent'),
               failed_count  = (SELECT COUNT(*) FROM messages WHERE campaign_id=? AND status='failed'),
               skipped_count = (SELECT COUNT(*) FROM messages WHERE campaign_id=? AND status='skipped'),
               updated_at = ?
           WHERE id = ?""",
        (campaign_id, campaign_id, campaign_id, _now(), campaign_id),
    )


def claim_next(campaign_id: int) -> dict | None:
    """Atomically move the oldest pending message to 'sending'."""
    with db._write_lock:
        conn = db.get_conn()
        row = conn.execute(
            "SELECT * FROM messages WHERE campaign_id=? AND status='pending' ORDER BY id LIMIT 1",
            (campaign_id,),
        ).fetchone()
        if row is None:
            return None
        cur = conn.execute(
            "UPDATE messages SET status='sending', error=NULL WHERE id=? AND status='pending'",
            (row["id"],),
        )
        conn.commit()
        return dict(row) if cur.rowcount else None


class SenderService:
    """Singleton controller for the one background sending thread."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.campaign_id: int | None = None

    # --- state ------------------------------------------------------------ #
    @property
    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def status(self) -> dict:
        return {
            "running": self.is_running,
            "campaign_id": self.campaign_id,
        }

    # --- controls --------------------------------------------------------- #
    def start(self, campaign_id: int) -> None:
        with self._lock:
            if self.is_running:
                raise BusyError(
                    "Another campaign is already sending. Pause it first - "
                    "only one job runs at a time."
                )
            campaign = db.one("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
            if not campaign:
                raise CampaignError("Campaign not found.")
            if campaign["status"] in {"completed", "cancelled"}:
                raise CampaignError(f"This campaign is already {campaign['status']}.")
            if not campaign["account_id"]:
                raise CampaignError("No sender account is selected for this campaign.")

            account = _account_fresh(campaign["account_id"])
            if not account:
                raise CampaignError("The selected Gmail account no longer exists.")
            if account["status"] in {"disconnected", "auth_error"}:
                raise CampaignError(
                    f"Account {account['email']} needs attention: "
                    f"{account.get('status_reason') or account['status']}"
                )
            pending = db.scalar(
                "SELECT COUNT(*) FROM messages WHERE campaign_id=? AND status='pending'",
                (campaign_id,),
            )
            if pending == 0:
                raise CampaignError("No pending recipients left in this campaign.")

            self._stop.clear()
            self.campaign_id = campaign_id
            db.execute(
                """UPDATE campaigns
                      SET status='running', status_reason=NULL,
                          started_at=COALESCE(started_at, ?), finished_at=NULL, updated_at=?
                    WHERE id=?""",
                (_now(), _now(), campaign_id),
            )
            db.log_event("info", f"campaign:{campaign_id}",
                         f"Campaign '{campaign['name']}' started with {pending} pending message(s).")
            self._thread = threading.Thread(
                target=self._run, args=(campaign_id,), daemon=True, name=f"sender-{campaign_id}"
            )
            self._thread.start()

    def pause(self, reason: str = "Paused by user.") -> None:
        """Signal the running job to stop; it exits between messages."""
        campaign_id = self.campaign_id
        self._stop.set()
        if campaign_id and self.is_running:
            db.execute(
                "UPDATE campaigns SET status='paused', status_reason=?, updated_at=? WHERE id=?",
                (reason, _now(), campaign_id),
            )
            db.log_event("warning", f"campaign:{campaign_id}", f"Campaign paused: {reason}")

    def cancel(self, campaign_id: int) -> None:
        if self.is_running and self.campaign_id == campaign_id:
            self.pause("Cancelled by user.")
            # let the thread exit before finalising
            thread = self._thread
            if thread:
                thread.join(timeout=10)
        remaining = db.execute(
            """UPDATE messages SET status='skipped', error='Campaign cancelled'
                WHERE campaign_id=? AND status IN ('pending','sending')""",
            (campaign_id,),
        )
        _refresh_progress(campaign_id)
        db.execute(
            "UPDATE campaigns SET status='cancelled', finished_at=?, status_reason=?, updated_at=? WHERE id=?",
            (_now(), f"Cancelled - {remaining} unsent recipient(s) left untouched.", _now(), campaign_id),
        )
        db.log_event("warning", f"campaign:{campaign_id}", f"Campaign cancelled ({remaining} unsent).")

    # --- the loop --------------------------------------------------------- #
    def _run(self, campaign_id: int) -> None:
        try:
            self._loop(campaign_id)
        except Exception as exc:  # pragma: no cover - defensive
            db.log_event("error", f"campaign:{campaign_id}",
                         f"Sender crashed: {type(exc).__name__}: {exc}")
            db.execute(
                "UPDATE campaigns SET status='paused', status_reason=?, updated_at=? WHERE id=?",
                (f"Internal error: {exc}", _now(), campaign_id),
            )
        finally:
            with self._lock:
                self.campaign_id = None

    def _loop(self, campaign_id: int) -> None:
        consecutive_permanent = 0

        while not self._stop.is_set():
            campaign = db.one("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
            if not campaign:
                return

            message = claim_next(campaign_id)
            if message is None:
                _refresh_progress(campaign_id)
                db.execute(
                    "UPDATE campaigns SET status='completed', finished_at=?, "
                    "status_reason='All recipients processed.', updated_at=? WHERE id=?",
                    (_now(), _now(), campaign_id),
                )
                db.log_event("info", f"campaign:{campaign_id}", "Campaign completed.")
                return

            account = _account_fresh(campaign["account_id"])
            if not account:
                self._release(message, "Sender account was removed.")
                self._pause_campaign(campaign_id, "Sender account no longer exists.")
                return

            account = _ensure_daily_window(account)
            if account["status"] in {"disconnected", "auth_error"}:
                self._release(message, f"Account unavailable: {account['status']}")
                self._pause_campaign(
                    campaign_id,
                    f"Account {account['email']} is unavailable: "
                    f"{account.get('status_reason') or account['status']}",
                )
                return
            if account["status"] in {"paused", "quota_exceeded"}:
                self._release(message, "Account paused.")
                self._pause_campaign(
                    campaign_id,
                    f"Account {account['email']} is paused: "
                    f"{account.get('status_reason') or 'paused by user'}",
                )
                return

            if account["daily_sent"] >= account["daily_limit"]:
                self._mark_account_blocked(
                    account,
                    "quota",
                    f"Daily sending cap of {account['daily_limit']} reached "
                    f"(set in the dashboard). Resets at midnight.",
                )
                self._release(message, "Account daily cap reached.")
                self._pause_campaign(
                    campaign_id,
                    f"Account {account['email']} reached its daily cap "
                    f"({account['daily_limit']}). It resumes automatically after midnight.",
                )
                return

            sent_today = _sent_today(campaign_id)
            if campaign["max_per_day"] and sent_today >= campaign["max_per_day"]:
                self._release(message, "Campaign daily cap reached.")
                self._pause_campaign(
                    campaign_id,
                    f"Sent {sent_today} today - campaign cap is {campaign['max_per_day']}/day. "
                    f"Resume tomorrow or raise the cap.",
                )
                return

            # ---- render ---------------------------------------------------- #
            recipient = json.loads(message["recipient_json"] or "{}")
            subject, missing_s = templating.render(campaign["subject_template"], recipient)
            body, missing_b = templating.render(campaign["body_template"], recipient)
            missing = list(dict.fromkeys(missing_s + missing_b))
            recipient_email = message["recipient_email"]
            if missing or not subject.strip():
                reason = "Missing value(s) for: " + ", ".join(missing) if missing else "Subject is empty."
                self._fail(message, f"Skipped - {reason}", status="skipped")
                db.log_event("warning", f"campaign:{campaign_id}",
                             f"Skipped {recipient_email}: {reason}")
                _refresh_progress(campaign_id)
                continue

            # ---- send ------------------------------------------------------ #
            try:
                access = google_oauth.get_access_token(account)
                mime = gmail.build_mime(
                    to=recipient_email,
                    subject=subject,
                    body=body,
                    from_email=account["email"],
                    from_name=campaign.get("sender_name") or account.get("display_name") or "",
                    reply_to=campaign.get("reply_to") or "",
                    html=(campaign.get("body_format") == "html"),
                )
                gmail_id = gmail.send_message(access, gmail.encode_mime(mime))
            except google_oauth.OAuthError as exc:
                self._release(message, "Auth error")
                google_oauth.mark_auth_error(account["id"], str(exc))
                self._pause_campaign(
                    campaign_id,
                    f"Authentication failed for {account['email']} - reconnect the account. ({exc})",
                )
                return
            except gmail.GmailSendError as exc:
                if exc.kind == "auth":
                    self._release(message, "Auth error")
                    google_oauth.mark_auth_error(
                        account["id"],
                        f"Gmail rejected the credentials: {exc.detail[:180]}",
                    )
                    self._pause_campaign(
                        campaign_id,
                        f"Authentication failed for {account['email']} - reconnect the account.",
                    )
                    return

                if exc.kind == "quota" or (exc.kind == "rate_limit" and
                                           gmail.is_blocked_reason(exc.reason, exc.detail)):
                    attempts = message["attempts"] + 1
                    self._release(message, exc.detail[:300], attempts=attempts)
                    self._mark_account_blocked(account, exc.kind, exc.detail[:250])
                    self._pause_campaign(
                        campaign_id,
                        f"Gmail blocked sending from {account['email']} "
                        f"({exc.kind}): {exc.detail[:200]}",
                    )
                    return

                if exc.kind == "rate_limit":
                    attempts = message["attempts"] + 1
                    if attempts >= MAX_SEND_ATTEMPTS:
                        self._release(message, exc.detail[:300], attempts=attempts)
                        self._mark_account_blocked(
                            account, "paused",
                            f"Repeated rate limiting ({attempts} attempts).",
                        )
                        self._pause_campaign(
                            campaign_id,
                            f"Rate limited on {account['email']} after {attempts} attempts - "
                            f"paused to protect the account.",
                        )
                        return
                    self._release(message, exc.detail[:300], attempts=attempts)
                    wait = min(300, 30 * (2 ** (attempts - 1))) + random.uniform(0, 5)
                    db.log_event("warning", f"campaign:{campaign_id}",
                                 f"Rate limited - backing off {wait:.0f}s "
                                 f"(attempt {attempts}/{MAX_SEND_ATTEMPTS}).")
                    if self._stop.wait(wait):
                        return
                    continue

                if exc.kind == "transient":
                    attempts = message["attempts"] + 1
                    if attempts >= MAX_SEND_ATTEMPTS:
                        self._fail(message, f"Gmail error after {attempts} attempts: {exc.detail[:250]}")
                        consecutive_permanent += 1
                    else:
                        self._release(message, exc.detail[:300], attempts=attempts)
                        wait = min(120, 5 * (2 ** (attempts - 1))) + random.uniform(0, 3)
                        db.log_event("warning", f"campaign:{campaign_id}",
                                     f"Temporary error - retrying in {wait:.0f}s "
                                     f"(attempt {attempts}/{MAX_SEND_ATTEMPTS}).")
                        if self._stop.wait(wait):
                            return
                        continue
                else:  # permanent for this recipient
                    self._fail(message, f"Gmail rejected the message: {exc.detail[:250]}")
                    consecutive_permanent += 1

                _refresh_progress(campaign_id)
                if consecutive_permanent >= MAX_CONSECUTIVE_PERMANENT_FAILURES:
                    self._pause_campaign(
                        campaign_id,
                        f"Stopped after {consecutive_permanent} consecutive failures - "
                        f"check the recipient data and template.",
                    )
                    return
                continue

            # ---- success ---------------------------------------------------- #
            consecutive_permanent = 0
            with db._write_lock:
                conn = db.get_conn()
                conn.execute(
                    """UPDATE messages
                          SET status='sent', gmail_id=?, sent_at=?, error=NULL,
                              account_id=?, attempts=attempts+1
                        WHERE id=?""",
                    (gmail_id, _now(), account["id"], message["id"]),
                )
                conn.execute(
                    """UPDATE accounts
                          SET daily_sent = daily_sent + 1, daily_sent_date=?,
                              last_sent_at=?, last_error=NULL, updated_at=?
                        WHERE id=?""",
                    (date.today().isoformat(), _now(), _now(), account["id"]),
                )
                conn.commit()
            _refresh_progress(campaign_id)

            # polite, human-paced sending: delay + jitter between messages
            delay = max(config.MIN_RATE_DELAY_SEC, float(campaign["rate_delay_sec"] or 8.0))
            if self._stop.wait(delay + random.uniform(0, delay * 0.3)):
                return

    # --- helpers ---------------------------------------------------------- #
    @staticmethod
    def _release(message: dict, error: str, attempts: int | None = None) -> None:
        """Put a claimed message back to pending so it is never lost/duplicated."""
        db.execute(
            """UPDATE messages SET status='pending', error=?, attempts=COALESCE(?, attempts+1)
                WHERE id=? AND status='sending'""",
            (error[:500], attempts, message["id"]),
        )

    @staticmethod
    def _fail(message: dict, error: str, status: str = "failed") -> None:
        db.execute(
            "UPDATE messages SET status=?, error=?, attempts=attempts+1 WHERE id=?",
            (status, error[:500], message["id"]),
        )

    @staticmethod
    def _mark_account_blocked(account: dict, kind: str, reason: str) -> None:
        status = "quota_exceeded" if kind == "quota" else "paused"
        db.execute(
            """UPDATE accounts SET status=?, status_reason=?, last_error=?, updated_at=?
                WHERE id=?""",
            (status, reason[:300], reason[:300], _now(), account["id"]),
        )
        db.log_event("error", f"account:{account['id']}",
                     f"Account {account['email']} paused ({status}): {reason[:180]}")

    @staticmethod
    def _pause_campaign(campaign_id: int, reason: str) -> None:
        _refresh_progress(campaign_id)
        db.execute(
            "UPDATE campaigns SET status='paused', status_reason=?, updated_at=? WHERE id=?",
            (reason[:400], _now(), campaign_id),
        )
        db.log_event("warning", f"campaign:{campaign_id}", f"Campaign paused: {reason[:200]}")


sender = SenderService()
