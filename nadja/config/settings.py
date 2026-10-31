"""
Golden Hour Copilot — Django settings.

All deployment-specific values come from environment variables
(see .env.example and §14.1 of the implementation plan). A local `.env`
is loaded if present; platform env vars (Render/Railway) are never
overridden by it.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env", override=False)


def _env_list(name: str) -> list[str]:
    """Comma-separated env var -> list of non-empty stripped items."""
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


# --- Core -------------------------------------------------------------------
# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-for-production")

DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS")
if DEBUG:
    ALLOWED_HOSTS = list({*ALLOWED_HOSTS, "localhost", "127.0.0.1", "testserver"})


# --- Application definition ---------------------------------------------------
INSTALLED_APPS = [
    # daphne must be FIRST: makes `runserver` serve the ASGI app (websockets).
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "channels",
    # Golden Hour apps
    "incidents",
    "hospitals",
    "sms",
    "ai",
    "realtime",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # before CommonMiddleware
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --- Channels ---------------------------------------------------------------
# InMemoryChannelLayer: simplest that works — REQUIRES exactly one server
# process (see plan §3). Swap to channels_redis only if we scale out.
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}


# --- Database ----------------------------------------------------------------
# SQLite for dev & demo; Postgres optional later (plan §3).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# --- REST framework / OpenAPI -------------------------------------------------
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Golden Hour Copilot API",
    "DESCRIPTION": "Backend contracts of plan §5.3. Websocket events (§5.4) are not part of OpenAPI: "
    "connect to /ws/dashboard/ and /ws/incident/<short_id>/.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {"TriageEnum": "incidents.enums.Triage.choices"},
}


# --- CORS --------------------------------------------------------------------
# Prod: set CORS_ALLOWED_ORIGINS (dashboard frontends). Dev: allow all.
CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_ALL_ORIGINS = DEBUG


# --- Password validation -------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# --- Misc --------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"  # everything is stored/exchanged in UTC (plan §5.3)
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# Uploaded photos
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"


# --- Golden Hour app settings -------------------------------------------------
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
DEDUP_RADIUS_M = int(os.environ.get("DEDUP_RADIUS_M", "300"))
DEDUP_WINDOW_MIN = int(os.environ.get("DEDUP_WINDOW_MIN", "10"))

# SMS gateway (Phase 3) — webhook token must match the URL of the phone sender
SMS_WEBHOOK_TOKEN = os.environ.get("SMS_WEBHOOK_TOKEN", "")

# AI layer (Phase 5). AI_PROVIDER: "" (off: template brief only) | "ollama" (local model, no key) | "fake" (tests).
# Never hardcode keys in git, always from env.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "http://localhost:11434")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_BACKUP_PROVIDER = os.environ.get("AI_BACKUP_PROVIDER", "")
AI_BACKUP_BASE_URL = os.environ.get("AI_BACKUP_BASE_URL", "")
AI_BACKUP_API_KEY = os.environ.get("AI_BACKUP_API_KEY", "")
AI_BACKUP_VISION_MODEL = os.environ.get("AI_BACKUP_VISION_MODEL", "")
AI_BACKUP_TEXT_MODEL = os.environ.get("AI_BACKUP_TEXT_MODEL", "")
AI_VISION_MODEL = os.environ.get("AI_VISION_MODEL", "")
AI_TEXT_MODEL = os.environ.get("AI_TEXT_MODEL", "")  # empty -> reuse AI_VISION_MODEL (one model in RAM)
AI_VISION_TIMEOUT_S = float(os.environ.get("AI_VISION_TIMEOUT_S", "8"))  # CPU-only local model: raise (e.g. 90)
AI_BRIEF_TIMEOUT_S = float(os.environ.get("AI_BRIEF_TIMEOUT_S", "10"))
AI_NUM_CTX = int(os.environ.get("AI_NUM_CTX", "4096"))  # model context window; smaller = less RAM (2048 fits a 640px photo)
AI_VISION_MAX_PX = int(os.environ.get("AI_VISION_MAX_PX", "1024"))  # CPU-only local model: try 640
AI_VISION_GATE = os.environ.get("AI_VISION_GATE", "true").lower() == "true"  # yes/no crash check before the analysis
AI_VISION_MIN_CONFIDENCE = float(os.environ.get("AI_VISION_MIN_CONFIDENCE", "0.4"))
AI_BRIEF_DEBOUNCE_S = float(os.environ.get("AI_BRIEF_DEBOUNCE_S", "1.5"))
AI_PHOTO_MAX_BYTES = int(os.environ.get("AI_PHOTO_MAX_BYTES", str(300 * 1024)))
# Kill switch for all background AI work (template brief included). Tests turn it off by default.
AI_BACKGROUND_TASKS = os.environ.get("AI_BACKGROUND_TASKS", "true").lower() == "true"
AI_RUN_INLINE = False  # tests only: run tasks synchronously in the caller

SMS_GATEWAY_API_URL = os.environ.get("SMS_GATEWAY_API_URL", "")
SMS_GATEWAY_USER = os.environ.get("SMS_GATEWAY_USER", "")
SMS_GATEWAY_PASS = os.environ.get("SMS_GATEWAY_PASS", "")
# Dual-SIM gateway phone: which SIM sends the replies (1 or 2). 0 = the phone's default SIM.
SMS_GATEWAY_SIM_NUMBER = int(os.environ.get("SMS_GATEWAY_SIM_NUMBER", "0") or 0)

# Profile pictures (Cloudinary). Leave empty to disable: the endpoint answers 503.
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")
PROFILE_PHOTO_MAX_BYTES = int(os.environ.get("PROFILE_PHOTO_MAX_BYTES", str(2 * 1024 * 1024)))
