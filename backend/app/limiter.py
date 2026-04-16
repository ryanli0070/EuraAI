from slowapi import Limiter
from slowapi.util import get_remote_address

# Per-IP throttle. Tuned for one student per IP; tighten if abuse appears.
limiter = Limiter(key_func=get_remote_address)
