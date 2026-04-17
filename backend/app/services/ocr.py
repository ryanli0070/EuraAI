"""OCR service: handwritten math image -> LaTeX string.

Uses Pix2Text (free, local) by default. If accuracy on iPad-Pencil handwriting
is too low in real use, swap this module for a Mathpix HTTP call (POST
https://api.mathpix.com/v3/text with MATHPIX_APP_ID / MATHPIX_APP_KEY).
Keep the recognize() signature stable so callers don't change.
"""
from __future__ import annotations

import io
import logging
from typing import Optional

from PIL import Image

logger = logging.getLogger(__name__)

# Cap input width before OCR. Pix2Text upsamples internally; larger inputs
# don't help accuracy and just slow inference.
_MAX_WIDTH = 1600

_p2t = None  # lazily set by warm()


def _patch_rapidocr_config() -> None:
    # cnstd 1.2.7.1 doesn't pass `model_root_dir` to rapidocr>=3, which then
    # crashes in Path(None). Fill it in from `model_path` if missing.
    try:
        from rapidocr.inference_engine.onnxruntime import main as _ort_main
    except Exception:
        return
    _orig_init = _ort_main.OrtInferSession.__init__

    def _init(self, cfg):
        if cfg.get("model_root_dir") is None:
            mp = cfg.get("model_path")
            if mp:
                from pathlib import Path as _P
                cfg["model_root_dir"] = str(_P(mp).parent)
        return _orig_init(self, cfg)

    _ort_main.OrtInferSession.__init__ = _init


def warm() -> None:
    """Cold-load Pix2Text models. Call from FastAPI lifespan startup so the
    first /api/check request doesn't pay the multi-second init cost."""
    global _p2t
    if _p2t is not None:
        return
    _patch_rapidocr_config()
    from pix2text import Pix2Text  # heavy import — keep lazy
    logger.info("warming pix2text models (first run downloads weights)")
    _p2t = Pix2Text.from_config(enable_table=False)
    logger.info("pix2text ready")


def _preprocess(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    if img.width > _MAX_WIDTH:
        ratio = _MAX_WIDTH / img.width
        img = img.resize((_MAX_WIDTH, int(img.height * ratio)))
    return img


def recognize(image_bytes: bytes) -> str:
    """Return LaTeX (with $...$ / $$...$$ markers for inline / display) for the
    handwriting in the image. Empty string if nothing recognizable."""
    if _p2t is None:
        warm()
    assert _p2t is not None
    img = _preprocess(image_bytes)
    result = _p2t.recognize(img, file_type="text_formula", return_text=True)
    return str(result).strip()
