"""Server-side Supabase admin calls that require the service-role key.

The service-role key bypasses RLS and must never reach the browser, so these
calls live on the backend. Only the account-deletion endpoint uses them. We hit
the Supabase Storage + Auth-admin REST APIs directly with httpx rather than
pulling in the full supabase-py client for a couple of requests.
"""
from __future__ import annotations

import logging

import httpx

from app import config

logger = logging.getLogger(__name__)

# Buckets the app writes per-user objects into, keyed by `{user_id}/...`.
_BUCKETS = ("drawings", "thumbnails")


def is_configured() -> bool:
    """True when the service-role key is set; the delete endpoint checks this."""
    return bool(config.SUPABASE_SERVICE_ROLE_KEY)


def _headers() -> dict[str, str]:
    key = config.SUPABASE_SERVICE_ROLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


async def _delete_user_storage(client: httpx.AsyncClient, user_id: str) -> None:
    """Remove every object under `{user_id}/` in each bucket. Best-effort:
    a Storage hiccup must not block the account deletion itself."""
    for bucket in _BUCKETS:
        try:
            listing = await client.post(
                f"{config.SUPABASE_URL}/storage/v1/object/list/{bucket}",
                headers=_headers(),
                json={"prefix": f"{user_id}/", "limit": 1000},
            )
            listing.raise_for_status()
            names = [
                f"{user_id}/{obj['name']}"
                for obj in listing.json()
                if obj.get("name") and obj["name"] != ".emptyFolderPlaceholder"
            ]
            if names:
                removed = await client.request(
                    "DELETE",
                    f"{config.SUPABASE_URL}/storage/v1/object/{bucket}",
                    headers=_headers(),
                    json={"prefixes": names},
                )
                removed.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("storage cleanup failed for %s/%s: %s", bucket, user_id, exc)


async def delete_user(user_id: str) -> None:
    """Permanently delete an auth user and all their data.

    Deleting the `auth.users` row cascades to the app's Postgres tables via FK,
    but `storage.objects` has no FK to `auth.users`, so the blobs are removed
    explicitly first.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        await _delete_user_storage(client, user_id)
        resp = await client.delete(
            f"{config.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
