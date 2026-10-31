"""Central configuration for the Gmail mail-merge dashboard.

All secrets live in environment variables / a local .env file that is never
committed and never sent to the browser.  See .env.example.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


# --- server ---------------------------------------------------------------
HOST = os.getenv("DASHBOARD_HOST", "127.0.0.1").strip() or "127.0.0.1"
PORT = _int("DASHBOARD_PORT", 8200)
DEBUG = os.getenv("DASHBOARD_DEBUG", "").strip().lower() in {"1", "true", "yes"}

# --- storage --------------------------------------------------------------
DATA_DIR = Path(os.getenv("MAILER_DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "mailer.db"
KEY_PATH = DATA_DIR / "secret.key"
LOG_DIR = DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# --- Google OAuth 2.0 (Desktop app client) --------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
OAUTH_REDIRECT_URI = os.getenv(
    "OAUTH_REDIRECT_URI", f"http://127.0.0.1:{PORT}/oauth2/callback"
).strip()

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"

# Minimum scope: send mail only.  The Sheets scope is requested separately
# (incremental authorization) only when a spreadsheet source is used.
SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send"
SCOPE_SHEETS_READONLY = "https://www.googleapis.com/auth/spreadsheets.readonly"

# --- sending policy -------------------------------------------------------
# Conservative defaults.  Personal Gmail accounts have a *per-account* daily
# send limit (500/day for regular Gmail, 2000/day for Google Workspace) plus
# shorter "burst" limits and per-recipient limits.  These knobs cap us well
# below the ceiling so an account is never pushed into its hard limit.
DEFAULT_RATE_DELAY_SEC = _float("DEFAULT_RATE_DELAY_SEC", 8.0)
MIN_RATE_DELAY_SEC = 2.0
DEFAULT_ACCOUNT_DAILY_LIMIT = _int("DEFAULT_ACCOUNT_DAILY_LIMIT", 150)
DEFAULT_CAMPAIGN_DAILY_MAX = _int("DEFAULT_CAMPAIGN_DAILY_MAX", 60)
MAX_SEND_ATTEMPTS = _int("MAX_SEND_ATTEMPTS", 4)
MAX_CONSECUTIVE_PERMANENT_FAILURES = _int("MAX_CONSECUTIVE_PERMANENT_FAILURES", 5)
