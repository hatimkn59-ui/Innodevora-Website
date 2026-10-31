"""Secret handling: at-rest encryption for OAuth refresh/access tokens.

The Fernet key lives in a file next to the database (data/secret.key).  It is
generated on first run with restrictive permissions.  Tokens are encrypted
before they touch SQLite and are never returned to the browser or written to
logs.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from config import KEY_PATH

_fernet: Fernet | None = None

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}")
_BEARER_RE = re.compile(r"(ya29\.[A-Za-z0-9_\-\.]+)")


def _load_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = _ensure_key(KEY_PATH)
    _fernet = Fernet(key)
    return _fernet


def _ensure_key(path: Path) -> bytes:
    if path.exists():
        return path.read_bytes().strip()
    key = Fernet.generate_key()
    path.write_bytes(key)
    try:  # owner-only on POSIX; Windows ACLs are stricter by default anyway
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    return _load_fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _load_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise ValueError("Stored secret could not be decrypted (was secret.key replaced?)") from exc


def redact(text: str | None) -> str:
    """Strip bearer tokens / obvious credentials out of anything we log."""
    if not text:
        return ""
    text = _BEARER_RE.sub("[redacted-token]", text)
    text = re.sub(r"(client_secret=)[^&\s]+", r"\1[redacted]", text, flags=re.I)
    text = re.sub(r"(password\"?\s*[:=]\s*\")[^\"]+", r"\1[redacted]", text, flags=re.I)
    return text
