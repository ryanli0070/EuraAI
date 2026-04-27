"""Whiteboard PNG preprocessing — downscale to bound vision API token cost."""
from __future__ import annotations

import io

from PIL import Image

from app import config


def preprocess(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if img.width > config.MAX_IMAGE_WIDTH:
        ratio = config.MAX_IMAGE_WIDTH / img.width
        img = img.resize((config.MAX_IMAGE_WIDTH, int(img.height * ratio)))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
