"""
WebSocket consumers (plan §Phase 0 step 5, §5.4).

- DashboardConsumer: every operator dashboard joins the "dashboard" group and
  receives every broadcast event.
- IncidentConsumer: the phone's status screen joins "incident_<SHORT_ID>" and
  receives status updates for its own incident.
"""

import asyncio

from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .broadcast import register_server_loop


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    group_name = "dashboard"

    async def connect(self):
        register_server_loop(asyncio.get_running_loop())
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Channel-layer handler: broadcast() sends with type="broadcast_event".
    async def broadcast_event(self, event):
        await self.send_json(event["payload"])


class IncidentConsumer(AsyncJsonWebsocketConsumer):
    """One websocket per reporting phone, keyed by the incident short_id."""

    async def connect(self):
        short_id = self.scope["url_route"]["kwargs"]["short_id"].upper()
        self.group_name = f"incident_{short_id}"
        register_server_loop(asyncio.get_running_loop())
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group_name = getattr(self, "group_name", None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def broadcast_event(self, event):
        await self.send_json(event["payload"])

    # Phones don't send commands on this socket (status only comes from the API).
    async def receive_json(self, content):
        pass
