"""SQLite log of every /api/check request, for debugging quality regressions.
Keyed by image sha256 so we can re-run an exact prior input later.
Not analytics — schema is intentionally minimal."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "eura_checks.sqlite3"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            image_hash TEXT NOT NULL,
            latex TEXT,
            hint TEXT,
            status TEXT,
            step_index INTEGER
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS checks_hash_idx ON checks(image_hash)")
    return conn


def record(*, image_hash: str, latex: str, hint: str, status: str, step_index: int) -> None:
    """Best-effort insert. Logging must never break the request path."""
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO checks (image_hash, latex, hint, status, step_index) "
                "VALUES (?, ?, ?, ?, ?)",
                (image_hash, latex, hint, status, step_index),
            )
    except Exception:
        logger.exception("failed to log check (non-fatal)")
