"""OCR service — wraps Pix2Text to convert an image to LaTeX."""
from __future__ import annotations

from pathlib import Path

# TODO(phase 3): warm the model at startup via app lifespan hook
# _p2t: Pix2Text | None = None


def image_to_latex(image_bytes: bytes) -> str:
    """Convert raw PNG/JPEG bytes to a LaTeX string.

    Phase 3 implementation:
    - Pre-process: enforce white background, downscale to max 1600 px wide.
    - Run Pix2Text and return the recognised LaTeX.
    - Raise ValueError if no math region is detected.
    """
    # TODO(phase 3): replace stub with real P2T call
    raise NotImplementedError("OCR service not yet implemented (Phase 3)")
