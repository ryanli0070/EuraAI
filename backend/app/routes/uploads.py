"""Shared upload helpers for routes that accept multipart file uploads."""
from __future__ import annotations

from fastapi import UploadFile

from app import config
from app.errors import FileTooLargeError

_CHUNK = 64 * 1024


async def read_with_limit(file: UploadFile, limit: int = config.MAX_UPLOAD_BYTES) -> bytes:
    """Read up to `limit` bytes from `file`. Raises FileTooLargeError as soon
    as the cap is exceeded, so we never load an oversized payload into memory."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise FileTooLargeError(f"upload exceeds {limit} bytes")
        chunks.append(chunk)
    return b"".join(chunks)
