from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key(request: Request) -> str:
    """Throttle per authenticated user when we have one, else per IP.

    `request.state.user_id` is set by `app.auth.get_current_user`, which runs
    as a dependency on protected routes *before* slowapi's wrapper invokes
    this key function. Unauthenticated paths (e.g. /api/health) fall through
    to IP-based throttling.
    """
    uid = getattr(request.state, "user_id", None)
    if isinstance(uid, str) and uid:
        return f"user:{uid}"
    return get_remote_address(request)


limiter = Limiter(key_func=_key)
