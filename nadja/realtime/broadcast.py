"""
Broadcast helper (plan §Phase 0 step 6).

Every realtime event to the dashboard/incident groups goes through this:
{"type": "<event>", "data": {...}, "ts": "<iso8601>"}
"""

import asyncio
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone


logger = logging.getLogger(__name__)

# The server's event loop, registered by the websocket consumers when a client connects.
# InMemoryChannelLayer only wakes its consumers safely from THAT loop: a plain background thread
# (the AI tasks) calling async_to_sync would run the send on a private loop and the dashboard would
# never be woken. So sends from other threads are handed to the server loop.
_server_loop: asyncio.AbstractEventLoop | None = None


def register_server_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _server_loop
    _server_loop = loop


def broadcast(event_type: str, data: dict, group: str = "dashboard") -> None:
    """Send an event to a channel layer group. Safe to call from any sync thread."""
    layer = get_channel_layer()
    message = {
        "type": "broadcast_event",
        "payload": {"type": event_type, "data": data, "ts": timezone.now().isoformat()},
    }
    loop = _server_loop
    if loop is not None and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(layer.group_send(group, message), loop)
        try:
            future.result(timeout=5)
        except Exception:  # never let a dead websocket layer break the alert pipeline
            logger.warning("broadcast %s to %s failed", event_type, group, exc_info=True)
        return
    async_to_sync(layer.group_send)(group, message)


def broadcast_to_incident(incident_short_id: str, event_type: str, data: dict) -> None:
    """Convenience for status.updated -> the reporting phone (plan §5.4)."""
    broadcast(event_type, data, group=f"incident_{incident_short_id.upper()}")
