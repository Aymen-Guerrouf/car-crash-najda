"""WebSocket URL routing (plan §5.4)."""

from django.urls import re_path

from realtime import consumers

websocket_urlpatterns = [
    # wss://<backend>/ws/dashboard/  — all operator dashboards (group "dashboard")
    re_path(r"^ws/dashboard/$", consumers.DashboardConsumer.as_asgi()),
    # wss://<backend>/ws/incident/<short_id>/  — status updates for one incident
    re_path(r"^ws/incident/(?P<short_id>[0-9A-Za-z]{6})/$", consumers.IncidentConsumer.as_asgi()),
]
