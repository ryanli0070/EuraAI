"""Account management routes."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app import supabase_admin
from app.auth import get_current_user
from app.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.delete("/account")
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict[str, bool]:
    """Permanently delete the caller's account and all their data.

    Required by App Store Review Guideline 5.1.1(v): an app offering account
    creation must let users initiate deletion from within the app. The caller is
    identified solely by their validated JWT — a user can only ever delete
    themselves.
    """
    if not supabase_admin.is_configured():
        logger.error("account deletion requested but SUPABASE_SERVICE_ROLE_KEY is unset")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account deletion is not configured on the server.",
        )
    try:
        await supabase_admin.delete_user(user_id)
    except Exception:
        logger.exception("account deletion failed for %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not delete the account. Please try again.",
        )
    return {"deleted": True}
