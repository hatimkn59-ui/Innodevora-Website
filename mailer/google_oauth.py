"""Google OAuth 2.0 for a local dashboard (Desktop-app client, loopback redirect).

Flow
----
1. ``build_authorize_url`` -> browser -> Google consent screen
2. ``/oauth2/callback`` on this dashboard validates ``state`` and exchanges the
   code (PKCE) for tokens
3. tokens are stored encrypted in the ``accounts`` table
4. ``get_access_token`` transparently refreshes expired access tokens

Only the minimum scope (gmail.send) is requested by default.  The Sheets
scope is requested later through ``build_authorize_url(..., extra_scopes=...)``
so users who never touch Google Sheets are never asked for it.

No password or app-password is ever collected for Gmail accounts.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time
import urllib.parse
from dataclasses import dataclass

import requests

import db
import security
from config import (
    AUTH_ENDPOINT,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_REDIRECT_URI,
    REVOKE_ENDPOINT,
    SCOPE_GMAIL_SEND,
    TOKEN_ENDPOINT,
)


class OAuthError(RuntimeError):
    """Raised when an OAuth flow or token refresh fails."""


@dataclass
class PendingAuth:
    state: str
    code_verifier: str
    scopes: list[str]
    pkce_required: bool = True


_pending: dict[str, PendingAuth] = {}
_pending_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# PKCE helpers
# --------------------------------------------------------------------------- #
def _pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


# --------------------------------------------------------------------------- #
# authorization request
# --------------------------------------------------------------------------- #
def build_authorize_url(scopes: list[str], extra_scopes: list[str] | None = None,
                        login_hint: str | None = None, prompt: str | None = "consent") -> str:
    """Create an authorization URL and remember the pending state."""
    if not GOOGLE_CLIENT_ID:
        raise OAuthError(
            "GOOGLE_OAUTH_CLIENT_ID is not configured. Copy mailer/.env.example to "
            "mailer/.env, fill in your Google OAuth client ID/secret, then restart "
            "the dashboard. See mailer/README.md for the Google Cloud steps."
        )
    all_scopes = list(scopes)
    for scope in extra_scopes or []:
        if scope not in all_scopes:
            all_scopes.append(scope)

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(32)
    with _pending_lock:
        _pending[state] = PendingAuth(state=state, code_verifier=verifier, scopes=all_scopes)

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(all_scopes),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if prompt:
        params["prompt"] = prompt
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


def pop_pending(state: str) -> PendingAuth:
    with _pending_lock:
        auth = _pending.pop(state, None)
    if auth is None:
        raise OAuthError("This sign-in link expired or was already used. Please start again.")
    return auth


# --------------------------------------------------------------------------- #
# token exchange / refresh
# --------------------------------------------------------------------------- #
def _token_request(payload: dict) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise OAuthError("GOOGLE_OAUTH_CLIENT_ID is not configured (see .env / .env.example).")
    data = {"client_id": GOOGLE_CLIENT_ID, **payload}
    if GOOGLE_CLIENT_SECRET:
        data["client_secret"] = GOOGLE_CLIENT_SECRET
    try:
        resp = requests.post(TOKEN_ENDPOINT, data=data, timeout=30)
    except requests.RequestException as exc:
        raise OAuthError(f"Could not reach Google's token endpoint: {exc}") from exc
    body = {}
    try:
        body = resp.json()
    except ValueError:
        pass
    if resp.status_code != 200:
        error = body.get("error", f"HTTP {resp.status_code}")
        desc = body.get("error_description", resp.text[:200])
        if error in {"invalid_grant", "invalid_client"}:
            raise OAuthError(
                "Google rejected the refresh token (account must be reconnected): "
                f"{desc or error}"
            )
        raise OAuthError(f"Token request failed: {error} {desc}")
    return body


def exchange_code(code: str, code_verifier: str) -> dict:
    return _token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": OAUTH_REDIRECT_URI,
            "code_verifier": code_verifier,
        }
    )


def refresh_tokens(account: dict) -> dict:
    refresh_token = security.decrypt(account.get("refresh_token_enc") or "")
    if not refresh_token:
        raise OAuthError("No refresh token stored for this account - reconnect it.")
    tokens = _token_request(
        {"grant_type": "refresh_token", "refresh_token": refresh_token}
    )
    # Google only returns refresh_token on re-consent; keep the old one then.
    tokens.setdefault("refresh_token", refresh_token)
    _store_tokens(account, tokens)
    return tokens


def revoke(account: dict) -> None:
    token = security.decrypt(account.get("refresh_token_enc") or "")
    if not token:
        return
    try:
        requests.post(REVOKE_ENDPOINT, data={"token": token}, timeout=15)
    except requests.RequestException:
        pass  # revocation is best effort; the local row is removed either way


def _store_tokens(account: dict, tokens: dict) -> None:
    expires_in = float(tokens.get("expires_in", 3600))
    db.execute(
        """UPDATE accounts
              SET refresh_token_enc = ?,
                  access_token_enc = ?,
                  token_expiry = ?,
                  updated_at = ?
            WHERE id = ?""",
        (
            security.encrypt(tokens.get("refresh_token", "")),
            security.encrypt(tokens.get("access_token", "")),
            time.time() + max(60.0, expires_in - 60.0),
            time.time(),
            account["id"],
        ),
    )


# --------------------------------------------------------------------------- #
# per-account access token (thread safe, refreshes on demand)
# --------------------------------------------------------------------------- #
_account_locks: dict[int, threading.Lock] = {}
_account_locks_guard = threading.Lock()


def _lock_for(account_id: int) -> threading.Lock:
    with _account_locks_guard:
        lock = _account_locks.get(account_id)
        if lock is None:
            lock = threading.Lock()
            _account_locks[account_id] = lock
        return lock


def get_access_token(account: dict) -> str:
    """Return a valid access token, refreshing it if expired or missing."""
    with _lock_for(account["id"]):
        fresh = db.one("SELECT * FROM accounts WHERE id = ?", (account["id"],))
        if not fresh:
            raise OAuthError("Account no longer exists.")
        if fresh["status"] == "disconnected":
            raise OAuthError("This account is disconnected.")
        cached = security.decrypt(fresh.get("access_token_enc") or "")
        if cached and float(fresh.get("token_expiry") or 0) > time.time():
            return cached
        tokens = refresh_tokens(fresh)
        access = tokens.get("access_token")
        if not access:
            raise OAuthError("Google returned no access token.")
        return access


def account_scopes(account: dict) -> list[str]:
    return [s for s in (account.get("scopes") or "").split() if s]


def has_scope(account: dict, scope: str) -> bool:
    return scope in account_scopes(account)


def mark_auth_error(account_id: int, reason: str) -> None:
    db.execute(
        """UPDATE accounts SET status='auth_error', status_reason=?, last_error=?,
                  updated_at=? WHERE id=?""",
        (reason, reason, time.time(), account_id),
    )
    db.log_event("error", f"account:{account_id}", reason)


def default_scopes() -> list[str]:
    # openid/email are only used to display which Google account was connected;
    # gmail.send is the single permission that lets us send mail.
    return ["openid", "email", SCOPE_GMAIL_SEND]


def fetch_userinfo(access_token: str) -> dict:
    """Return {email, name, picture} for the connected Google account."""
    try:
        resp = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
    except requests.RequestException as exc:
        raise OAuthError(f"Could not verify the Google account: {exc}") from exc
    if resp.status_code != 200:
        raise OAuthError(f"Google userinfo call failed (HTTP {resp.status_code}).")
    try:
        return resp.json()
    except ValueError as exc:
        raise OAuthError("Google userinfo returned a non-JSON response.") from exc
