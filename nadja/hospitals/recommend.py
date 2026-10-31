"""Hospital recommendation. Phase 1: nearest active hospital (plan §7 Phase 1).
Phase 5 replaces this with the capability/ETA scoring of plan §8.3."""

from django.conf import settings

from .geo import haversine_km
from .models import Hospital


def estimate_eta_min(km: float) -> int:
    """Fallback ETA from plan §8.3: haversine x 1.4 detour at 50 km/h."""
    return max(1, round(km * 1.4 / 50 * 60))


def recommend_hospital(incident) -> dict | None:
    ranked = sorted(
        (
            (haversine_km(incident.lat, incident.lng, h.lat, h.lng), h)
            for h in Hospital.objects.filter(active=True)
        ),
        key=lambda t: t[0],
    )
    if not ranked:
        return None
    km, best = ranked[0]
    eta = estimate_eta_min(km)
    alternatives = [
        {
            "hospital_id": h.id,
            "score": None,
            "eta_min": estimate_eta_min(k),
            "reason": f"{estimate_eta_min(k)} min · {h.beds_available} beds",
        }
        for k, h in ranked[1:3]
    ]
    return {
        "hospital": best,
        "eta_min": eta,
        "reason": f"Nearest · {eta} min · {best.beds_available} beds",
        "alternatives": alternatives,
    }
