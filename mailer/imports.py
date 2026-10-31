"""Recipient imports: CSV upload and Google Sheets.

Both sources produce a row in the ``imports`` table (a frozen snapshot), so a
campaign is reproducible and a spreadsheet edited mid-campaign cannot cause
duplicate or missing sends.
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.parse

import requests

import db
import templating
from config import SHEETS_API

DELIMITER_CANDIDATES = (",", ";", "\t", "|")


class ImportError_(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #
def parse_csv(content: str) -> tuple[list[str], list[dict]]:
    """Parse CSV/TSV text into (headers, rows).  Handles ; and tab files too."""
    if content.startswith("﻿"):
        content = content[1:]
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    sample = content[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="".join(DELIMITER_CANDIDATES))
    except csv.Error:
        dialect = csv.excel
        for delim in DELIMITER_CANDIDATES:
            if delim in sample:
                dialect = csv.excel
                dialect.delimiter = delim
                break

    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not reader.fieldnames:
        raise ImportError_("The CSV file has no header row.")
    headers = [str(h or "").strip() for h in reader.fieldnames]
    if not any(headers):
        raise ImportError_("The CSV header row is empty.")

    rows: list[dict] = []
    for raw in reader:
        row = {}
        for key, value in (raw or {}).items():
            if key is None:
                continue
            row[str(key).strip()] = (value or "").strip()
        if any(row.values()):
            rows.append(row)
    if not rows:
        raise ImportError_("The CSV file contains no data rows.")
    return headers, rows


# --------------------------------------------------------------------------- #
# validation / normalisation shared by both sources
# --------------------------------------------------------------------------- #
def validate_rows(headers: list[str], rows: list[dict], mapping: dict[str, str]) -> dict:
    """Normalise rows, dedupe, and flag invalid addresses.

    Returns {"rows": [...], "invalid": int, "duplicates": int, "skipped": {email: reason}}
    """
    email_col = mapping.get("email") or ""
    if not email_col or email_col not in headers:
        # fall back to a header that looks like an email column
        guess = templating.guess_mapping(headers).get("email", "")
        if guess:
            email_col = guess
        else:
            raise ImportError_("No e-mail column selected - pick the column that holds addresses.")

    seen: set[str] = set()
    clean: list[dict] = []
    invalid = 0
    duplicates = 0
    for row in rows:
        email = str(row.get(email_col, "") or "").strip().lower()
        email = re.sub(r"^(mailto:)", "", email)
        if not email:
            invalid += 1
            continue
        if not templating.is_valid_email(email):
            invalid += 1
            continue
        if email in seen:
            duplicates += 1
            continue
        seen.add(email)
        record = {str(k).strip(): ("" if v is None else str(v).strip()) for k, v in row.items()}
        record["_email"] = email
        clean.append(record)

    return {"rows": clean, "invalid": invalid, "duplicates": duplicates,
            "headers": headers, "email_col": email_col}


def store_import(kind: str, name: str, headers: list[str], rows: list[dict],
                 source_ref: str, account_id: int | None = None,
                 invalid: int = 0, duplicates: int = 0) -> int:
    with db._write_lock:
        cur = db.get_conn().execute(
            """INSERT INTO imports (kind, name, headers_json, rows_json,
                                    invalid_count, duplicate_count, source_ref, account_id)
               VALUES (?,?,?,?,?,?,?,?)""",
            (kind, name, json.dumps(headers, ensure_ascii=False),
             json.dumps(rows, ensure_ascii=False), invalid, duplicates,
             source_ref, account_id),
        )
        db.get_conn().commit()
        import_id = cur.lastrowid
    db.log_event("info", "import",
                 f"Imported {len(rows)} recipient(s) from {kind} '{name}'",
                 {"import_id": import_id, "invalid": invalid, "duplicates": duplicates})
    return import_id


def get_import(import_id: int) -> dict | None:
    row = db.one("SELECT * FROM imports WHERE id = ?", (import_id,))
    if row:
        row["headers"] = json.loads(row["headers_json"] or "[]")
        row["rows"] = json.loads(row["rows_json"] or "[]")
    return row


# --------------------------------------------------------------------------- #
# Google Sheets
# --------------------------------------------------------------------------- #
class SheetsScopeRequired(RuntimeError):
    """Raised when the chosen account has no spreadsheet read permission."""


def _api_get(account: dict, url: str, params: dict | None = None):
    import google_oauth  # local import to avoid a cycle

    access = google_oauth.get_access_token(account)
    try:
        resp = requests.get(
            url, params=params,
            headers={"Authorization": f"Bearer {access}"}, timeout=30,
        )
    except requests.RequestException as exc:
        raise ImportError_(f"Network error calling Google Sheets: {exc}") from exc

    if resp.status_code == 401:
        # token may have just expired -> refresh once and retry
        access = google_oauth.get_access_token(dict(account, token_expiry=0))
        resp = requests.get(url, params=params,
                            headers={"Authorization": f"Bearer {access}"}, timeout=30)
    if resp.status_code == 403:
        try:
            message = resp.json().get("error", {}).get("message", resp.text[:200])
        except ValueError:
            message = resp.text[:200]
        if "has not been granted" in message or "insufficient" in message.lower():
            raise SheetsScopeRequired(message)
        raise ImportError_(f"Sheets API denied the request: {message}")
    if resp.status_code >= 400:
        try:
            message = resp.json().get("error", {}).get("message", resp.text[:200])
        except ValueError:
            message = resp.text[:200]
        raise ImportError_(f"Sheets API error (HTTP {resp.status_code}): {message}")
    try:
        return resp.json()
    except ValueError as exc:
        raise ImportError_("Sheets API returned a non-JSON response.") from exc


def spreadsheet_title(account: dict, spreadsheet_id: str) -> str:
    data = _api_get(account, f"{SHEETS_API}/{spreadsheet_id}",
                    {"fields": "properties.title"})
    return data.get("properties", {}).get("title", spreadsheet_id)


def list_sheets(account: dict, spreadsheet_id: str) -> list[dict]:
    data = _api_get(account, f"{SHEETS_API}/{spreadsheet_id}",
                    {"fields": "sheets.properties"})
    sheets = []
    for sheet in data.get("sheets", []):
        props = sheet.get("properties", {})
        sheets.append({
            "title": props.get("title", ""),
            "sheet_id": props.get("sheetId", 0),
            "rows": props.get("gridProperties", {}).get("rowCount", 0),
            "columns": props.get("gridProperties", {}).get("columnCount", 0),
        })
    return sheets


def read_values(account: dict, spreadsheet_id: str, range_ref: str) -> list[list[str]]:
    encoded = urllib.parse.quote(range_ref, safe="")
    data = _api_get(account, f"{SHEETS_API}/{spreadsheet_id}/values/{encoded}",
                    {"majorDimension": "ROWS", "valueRenderOption": "UNFORMATTED_VALUE"})
    values = data.get("values", []) or []
    return [[("" if cell is None else str(cell)).strip() for cell in row] for row in values]


def rows_from_values(values: list[list[str]]) -> tuple[list[str], list[dict]]:
    if not values:
        raise ImportError_("That worksheet range is empty.")
    headers = [h or f"column_{i + 1}" for i, h in enumerate(values[0])]
    rows: list[dict] = []
    for raw in values[1:]:
        row = {}
        for i, header in enumerate(headers):
            row[header] = raw[i] if i < len(raw) else ""
        if any(row.values()):
            rows.append(row)
    if not rows:
        raise ImportError_("That worksheet has headers but no data rows.")
    return headers, rows


def import_sheet(account: dict, spreadsheet_id: str, range_ref: str) -> tuple[list[str], list[dict]]:
    values = read_values(account, spreadsheet_id, range_ref)
    return rows_from_values(values)
