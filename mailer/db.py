"""SQLite storage layer: connection handling, schema, and safe migrations.

Connections are per-thread (SQLite objects are not thread-safe), WAL mode is
enabled so the background sending worker and the HTTP request handlers can
write concurrently.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any, Iterable

from config import DB_PATH

_local = threading.local()
_write_lock = threading.RLock()

SCHEMA_VERSION = 1

_MIGRATIONS: dict[int, list[str]] = {
    1: [
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            email             TEXT NOT NULL UNIQUE,
            display_name      TEXT,
            status            TEXT NOT NULL DEFAULT 'connected',
            status_reason     TEXT,
            scopes            TEXT NOT NULL DEFAULT '',
            refresh_token_enc TEXT,
            access_token_enc  TEXT,
            token_expiry      REAL NOT NULL DEFAULT 0,
            daily_limit       INTEGER NOT NULL DEFAULT 150,
            daily_sent        INTEGER NOT NULL DEFAULT 0,
            daily_sent_date   TEXT,
            last_sent_at      REAL,
            last_error        TEXT,
            connected_at      REAL NOT NULL DEFAULT (strftime('%s','now')),
            updated_at        REAL NOT NULL DEFAULT (strftime('%s','now'))
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS imports (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            kind           TEXT NOT NULL,
            name           TEXT NOT NULL,
            headers_json   TEXT NOT NULL DEFAULT '[]',
            rows_json      TEXT NOT NULL DEFAULT '[]',
            invalid_count  INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            source_ref     TEXT,
            account_id     INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            created_at     REAL NOT NULL DEFAULT (strftime('%s','now'))
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS campaigns (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            name              TEXT NOT NULL,
            status            TEXT NOT NULL DEFAULT 'draft',
            status_reason     TEXT,
            import_id         INTEGER REFERENCES imports(id) ON DELETE SET NULL,
            account_id        INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            sender_name       TEXT,
            reply_to          TEXT,
            subject_template  TEXT NOT NULL,
            body_template     TEXT NOT NULL,
            body_format       TEXT NOT NULL DEFAULT 'text',
            column_map_json   TEXT NOT NULL DEFAULT '{}',
            skip_existing     INTEGER NOT NULL DEFAULT 1,
            rate_delay_sec    REAL NOT NULL DEFAULT 8,
            max_per_day       INTEGER NOT NULL DEFAULT 60,
            total_count       INTEGER NOT NULL DEFAULT 0,
            sent_count        INTEGER NOT NULL DEFAULT 0,
            failed_count      INTEGER NOT NULL DEFAULT 0,
            skipped_count     INTEGER NOT NULL DEFAULT 0,
            error             TEXT,
            created_at        REAL NOT NULL DEFAULT (strftime('%s','now')),
            started_at        REAL,
            finished_at       REAL,
            updated_at        REAL NOT NULL DEFAULT (strftime('%s','now'))
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            recipient_email TEXT NOT NULL,
            recipient_json  TEXT NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'pending',
            error           TEXT,
            attempts        INTEGER NOT NULL DEFAULT 0,
            account_id      INTEGER,
            gmail_id        TEXT,
            sent_at         REAL,
            created_at      REAL NOT NULL DEFAULT (strftime('%s','now')),
            UNIQUE (campaign_id, recipient_email)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            ts           REAL NOT NULL,
            level        TEXT NOT NULL,
            scope        TEXT,
            message      TEXT NOT NULL,
            details_json TEXT
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_messages_campaign_status ON messages(campaign_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(recipient_email)",
        "CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC)",
    ],
}

# Sent once per process so crash-recovered rows are normalised exactly once.
_recovery_done = False
_recovery_lock = threading.Lock()


def connect(db_path=DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def get_conn() -> sqlite3.Connection:
    """One connection per thread (request handlers and the sender worker)."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = connect()
        _local.conn = conn
    return conn


def migrate() -> None:
    conn = connect()
    try:
        with _write_lock:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)"
            )
            row = conn.execute("SELECT version FROM schema_version").fetchone()
            current = row["version"] if row else 0
            for version in range(current + 1, SCHEMA_VERSION + 1):
                for stmt in _MIGRATIONS.get(version, []):
                    conn.execute(stmt)
                conn.execute("DELETE FROM schema_version")
                conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
            conn.commit()
    finally:
        conn.close()


def recover_interrupted() -> dict[str, int]:
    """Reset rows stuck in 'sending' after a crash/restart.

    A message is only marked 'sent' after Gmail accepted it, so a message that
    was in-flight when the process died is safely retried exactly once.
    """
    global _recovery_done
    with _recovery_lock:
        if _recovery_done:
            return {"messages": 0, "campaigns": 0}
        _recovery_done = True
    conn = get_conn()
    with _write_lock:
        cur = conn.execute(
            "UPDATE messages SET status='pending', error=NULL WHERE status='sending'"
        )
        msg_rows = cur.rowcount
        # A campaign left 'running' with no live worker would never finish.
        cur = conn.execute(
            """
            UPDATE campaigns
               SET status='paused',
                   status_reason='Interrupted by a restart - press Resume to continue.'
             WHERE status = 'running'
            """
        )
        camp_rows = cur.rowcount
        conn.commit()
    if msg_rows or camp_rows:
        log_event("warning", "recovery",
                  f"Recovered interrupted job: {msg_rows} message(s), {camp_rows} campaign(s)")
    return {"messages": msg_rows, "campaigns": camp_rows}


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def query(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    rows = get_conn().execute(sql, tuple(params)).fetchall()
    return [dict(r) for r in rows]


def one(sql: str, params: Iterable[Any] = ()) -> dict | None:
    row = get_conn().execute(sql, tuple(params)).fetchone()
    return dict(row) if row else None


def scalar(sql: str, params: Iterable[Any] = (), default=0):
    row = get_conn().execute(sql, tuple(params)).fetchone()
    if row is None:
        return default
    value = row[0]
    return default if value is None else value


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    with _write_lock:
        conn = get_conn()
        cur = conn.execute(sql, tuple(params))
        conn.commit()
        return cur.rowcount


def executescript(statements: list[str]) -> None:
    with _write_lock:
        conn = get_conn()
        for stmt in statements:
            conn.execute(stmt)
        conn.commit()


def now() -> float:
    return time.time()


def today() -> str:
    return time.strftime("%Y-%m-%d")


def log_event(level: str, scope: str, message: str, details: dict | None = None) -> None:
    try:
        execute(
            "INSERT INTO events (ts, level, scope, message, details_json) VALUES (?,?,?,?,?)",
            (now(), level, scope, message, json.dumps(details or {}, ensure_ascii=False)),
        )
    except Exception:  # never let logging break the caller
        pass
