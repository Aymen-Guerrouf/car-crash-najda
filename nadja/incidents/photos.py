"""Profile picture upload to Cloudinary."""

import io
import uuid

import cloudinary
import cloudinary.uploader
from django.conf import settings
from PIL import Image, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
CLOUDINARY_HOST = "https://res.cloudinary.com/"


class PhotoError(Exception):
    def __init__(self, code: str, detail: str, status: int = 400):
        super().__init__(detail)
        self.code, self.detail, self.status = code, detail, status


def is_configured() -> bool:
    return all(
        (settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET)
    )


def allowed_photo_prefix() -> str:
    """URLs accepted in profile.photo_url: only our own Cloudinary account."""
    name = settings.CLOUDINARY_CLOUD_NAME
    return f"{CLOUDINARY_HOST}{name}/" if name else CLOUDINARY_HOST


def validate_image(data: bytes, max_bytes: int | None = None) -> str:
    """Size + real-image check. Returns the Pillow format ("JPEG", "PNG", "WEBP")."""
    max_bytes = settings.PROFILE_PHOTO_MAX_BYTES if max_bytes is None else max_bytes
    if len(data) > max_bytes:
        raise PhotoError("photo_too_large", f"Max {max_bytes // 1024} KB.", 413)
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
            img.verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise PhotoError("invalid_image", "File is not a valid image.")
    if fmt not in ALLOWED_FORMATS:
        raise PhotoError("invalid_image", "Only JPEG, PNG or WEBP.")
    return fmt


def upload_profile_photo(data: bytes) -> dict:
    """Validate then upload; returns {"url", "public_id"}. Cropped to a 400x400 face-centred square."""
    if not is_configured():
        raise PhotoError("cloudinary_not_configured", "Set the CLOUDINARY_* variables.", 503)
    validate_image(data)
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    try:
        result = cloudinary.uploader.upload(
            data,
            folder="golden-hour/profiles",
            public_id=uuid.uuid4().hex,
            resource_type="image",
            transformation=[{"width": 400, "height": 400, "crop": "fill", "gravity": "face"}],
            timeout=8,
        )
    except Exception as exc:  # cloudinary raises its own Error/HTTP errors
        raise PhotoError("upload_failed", f"Cloudinary upload failed: {exc}", 502)
    return {"url": result["secure_url"], "public_id": result["public_id"]}
