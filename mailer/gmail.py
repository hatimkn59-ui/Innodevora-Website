"""Gmail REST API client: build MIME messages, send, classify errors.

Error taxonomy (used by the worker to decide retry vs. stop):

  auth          -> token refresh failed / permission missing -> reconnect account
  rate_limit    -> transient per-user throttling -> back off, then pause
  quota         -> hard daily send limit reached -> pause account permanently
                  for the day; the campaign pauses (no silent account hopping)
  transient     -> 5xx / network -> retry with exponential backoff
  permanent     -> malformed address etc. -> mark the single message failed
"""

from __future__ import annotations

import base64
import re
from email.message import EmailMessage
from email.utils import formataddr

import requests

from config import GMAIL_API


class GmailSendError(Exception):
    def __init__(self, kind: str, detail: str, status: int = 0, reason: str = ""):
        super().__init__(detail)
        self.kind = kind          # auth | rate_limit | quota | transient | permanent
        self.detail = detail
        self.status = status
        self.reason = reason      # Google's machine-readable reason, if any


def build_mime(*, to: str, subject: str, body: str, from_email: str,
               from_name: str = "", reply_to: str = "", html: bool = False) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name or from_email, from_email))
    if reply_to:
        msg["Reply-To"] = reply_to
    # Helps receivers identify legitimate one-to-one outreach threads.
    msg["X-Mailer"] = "local-gmail-mailmerge/1.0"
    if html:
        msg.set_content(_html_to_text(body))
        msg.add_alternative(body, subtype="html")
    else:
        msg.set_content(body)
    return msg


def _html_to_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def encode_mime(msg: EmailMessage) -> str:
    raw = msg.as_bytes()
    return base64.urlsafe_b64encode(raw).decode("ascii")


def send_message(access_token: str, mime_b64: str, *, request_timeout: int = 30) -> str:
    """POST the message to Gmail.  Returns the Gmail message id.

    A returned id means **Gmail accepted the request**, not that mail was
    delivered to the recipient - the API cannot confirm delivery.
    """
    try:
        resp = requests.post(
            f"{GMAIL_API}/messages/send",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={"raw": mime_b64},
            timeout=request_timeout,
        )
    except requests.RequestException as exc:
        raise GmailSendError("transient", f"Network error calling Gmail API: {exc}") from exc

    if resp.status_code == 200:
        try:
            return resp.json().get("id", "")
        except ValueError:
            return ""

    detail, reason = _parse_error(resp)
    raise GmailSendError(classify(resp.status_code, reason, detail), detail,
                         status=resp.status_code, reason=reason)


def _parse_error(resp: requests.Response) -> tuple[str, str]:
    reason = ""
    try:
        body = resp.json()
        err = body.get("error", {})
        reason = err.get("status", "") or ""
        messages = err.get("errors", []) or []
        if messages and isinstance(messages, list):
            reason = messages[0].get("reason", "") or reason
        detail = err.get("message") or resp.text[:300]
    except ValueError:
        detail = resp.text[:300]
    return detail, reason


def classify(status: int, reason: str, detail: str) -> str:
    reason_l = (reason or "").lower()
    detail_l = (detail or "").lower()

    if status == 401:
        return "auth"
    if "daily limit" in detail_l or "dailylimitexceeded" in reason_l or "quotaexceeded" in reason_l:
        return "quota"
    if status == 403 and ("rate" in reason_l or "quota" in reason_l or "userratelimit" in reason_l):
        return "rate_limit"
    if status == 429:
        return "rate_limit"
    if status in (403, 401) and "insufficient" in detail_l and "permission" in detail_l:
        return "auth"
    if status >= 500:
        return "transient"
    if status >= 400:
        return "permanent"
    return "transient"


def is_blocked_reason(reason: str, detail: str) -> bool:
    """True when Gmail says the account itself must stop sending."""
    blob = f"{reason} {detail}".lower()
    return any(
        token in blob
        for token in (
            "daily limit",
            "dailylimitexceeded",
            "quotaexceeded",
            "ratelimitexceeded",
            "userratelimitexceeded",
            "account has exceeded",
        )
    )
