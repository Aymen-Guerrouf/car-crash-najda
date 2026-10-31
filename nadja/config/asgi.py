"""
ASGI entrypoint for Golden Hour Copilot (plan §3, Phase 0 step 7).

- "http" -> Django (REST API, admin, media)
- "websocket" -> Channels URLRouter (dashboard + incident groups)

Dev:  `python manage.py runserver` (daphne is first in INSTALLED_APPS)
Prod: daphne -b 0.0.0.0 -p $PORT config.asgi:application
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialise Django before importing anything else that touches ORM/apps.
django_asgi_app = get_asgi_application()

from config.routing import websocket_urlpatterns  # noqa: E402

# NOTE (hackathon scope): no origin validator like AllowedHostsOriginValidator —
# the phone (Expo Go) and the dashboard (browser) connect from different hosts,
# and no Origin header is sent from React Native websockets. Revisit if we ever
# add auth to the websocket layer.
application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
