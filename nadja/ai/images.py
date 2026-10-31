"""Shrink photos before the model sees them: the image is the dominant latency cost."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError


def prepare_for_model(data: bytes, max_px: int, quality: int = 75) -> bytes:
    """Decode, fix orientation, downscale so the longest side <= max_px, re-encode as a plain JPEG
    (re-encoding also drops EXIF/GPS). Raises ValueError for non-images."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((max_px, max_px), Image.LANCZOS)
            out = io.BytesIO()
            img.save(out, "JPEG", quality=quality)
            return out.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"not an image: {exc}") from exc
