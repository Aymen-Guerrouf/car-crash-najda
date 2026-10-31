"""Duplicate detection (plan §8.4)."""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from hospitals.geo import haversine_km

from .enums import OPEN_STATUSES
from .models import Incident


def find_open_incident_near(lat: float, lng: float) -> Incident | None:
    """Closest open incident within DEDUP_RADIUS_M created in the last DEDUP_WINDOW_MIN minutes."""
    since = timezone.now() - timedelta(minutes=settings.DEDUP_WINDOW_MIN)
    best, best_m = None, None
    for incident in Incident.objects.filter(status__in=OPEN_STATUSES, created_at__gte=since):
        meters = haversine_km(lat, lng, incident.lat, incident.lng) * 1000
        if meters <= settings.DEDUP_RADIUS_M and (best_m is None or meters < best_m):
            best, best_m = incident, meters
    return best
