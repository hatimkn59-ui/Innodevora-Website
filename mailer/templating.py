"""Template rendering + recipient field helpers.

Templates use ``{{column}}`` placeholders that are filled from the recipient
row (CSV columns / spreadsheet columns).  Keys are matched case-insensitively
with ``_`` and ``-`` treated as spaces, so ``{{job title}}``, ``{{Job_Title}}``
and ``{{JobTitle}}`` all work.
"""

from __future__ import annotations

import re

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}$")
_VAR_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def normalize_key(key: str) -> str:
    return re.sub(r"[\s_\-]+", " ", str(key).strip().lower())


def normalize_row(row: dict) -> dict:
    return {normalize_key(k): ("" if v is None else str(v).strip()) for k, v in row.items()}


def render(template: str, row: dict) -> tuple[str, list[str]]:
    """Render ``{{var}}`` placeholders.  Returns (text, missing_var_names)."""
    normalized = normalize_row(row)
    missing: list[str] = []

    def _sub(match: re.Match) -> str:
        key = normalize_key(match.group(1))
        value = normalized.get(key, "")
        if value == "" and key not in missing:
            missing.append(key)
        return value

    return _VAR_RE.sub(_sub, template or ""), missing


def variables_used(*templates: str) -> list[str]:
    """Distinct variable names referenced by any of the given templates."""
    found: list[str] = []
    for template in templates:
        for match in _VAR_RE.finditer(template or ""):
            key = normalize_key(match.group(1))
            if key and key not in found:
                found.append(key)
    return found


def is_valid_email(value: str) -> bool:
    return bool(value) and bool(EMAIL_RE.match(value.strip()))


# --- standard column mapping ------------------------------------------------
# Heuristic guesses so the UI can pre-fill the mapping table.
EMAIL_ALIASES = ("email", "e-mail", "mail", "email address", "e mail", "recipient",
                 "empfänger", "emailadresse")
NAME_ALIASES = ("name", "full name", "recipient name", "contact", "contact name",
                "vorname", "ansprechpartner", "ansprechpartnerin")
COMPANY_ALIASES = ("company", "firma", "employer", "unternehmen", "betrieb", "organisation")
TITLE_ALIASES = ("job title", "job", "position", "stelle", "titel", "jobtitle",
                 "job title ", "rollenbezeichnung")
URL_ALIASES = ("url", "source", "quelle", "link", "job url", "joburl")


def guess_mapping(headers: list[str]) -> dict[str, str]:
    """Guess which columns are the email / name / company / job title / url."""
    mapping = {"email": "", "name": "", "company": "", "job_title": "", "url": ""}
    normalized = {normalize_key(h): h for h in headers}

    def _pick(field: str, aliases: tuple[str, ...]) -> None:
        if mapping[field]:
            return
        for alias in aliases:
            if alias in normalized:
                mapping[field] = normalized[alias]
                return
        for key, original in normalized.items():
            if any(alias in key for alias in aliases):
                mapping[field] = original
                return

    _pick("email", EMAIL_ALIASES)
    _pick("name", NAME_ALIASES)
    _pick("company", COMPANY_ALIASES)
    _pick("job_title", TITLE_ALIASES)
    _pick("url", URL_ALIASES)
    return mapping
