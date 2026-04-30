"""SQLite store for marketing-site waitlist signups.
Email is the natural key — UNIQUE so the same address can't be re-recorded."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# Co-located with the existing checks DB so deploys only mount one data dir.
_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "eura_checks.sqlite3"


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS signups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            email TEXT NOT NULL UNIQUE,
            source TEXT
        )
        """
    )
    return conn


def add(email: str, source: str | None = None) -> bool:
    """Returns True if newly inserted, False if email was already on the list.
    Raises sqlite3.Error on actual DB failure so the caller can return 500."""
    with _conn() as conn:
        try:
            conn.execute(
                "INSERT INTO signups (email, source) VALUES (?, ?)",
                (email, source),
            )
            return True
        except sqlite3.IntegrityError:
            return False


def count() -> int:
    with _conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM signups")
        return int(cur.fetchone()[0])
