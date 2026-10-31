"""Shared enums (plan §5.1). Values must match packages/shared/enums.ts exactly."""

from django.db import models


class Triage(models.TextChoices):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"
    UNKNOWN = "UNKNOWN"


# Worst first; used to aggregate an incident's triage.
TRIAGE_SEVERITY = {Triage.RED: 3, Triage.YELLOW: 2, Triage.GREEN: 1, Triage.UNKNOWN: 0}


class Role(models.TextChoices):
    VICTIM = "VICTIM"
    WITNESS = "WITNESS"
    BYSTANDER = "BYSTANDER"
    AUTO = "AUTO"


class Channel(models.TextChoices):
    HTTP = "HTTP"
    SMS = "SMS"


class IncidentStatus(models.TextChoices):
    NEW = "NEW"
    VALIDATED = "VALIDATED"
    DISPATCHED = "DISPATCHED"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


OPEN_STATUSES = (IncidentStatus.NEW, IncidentStatus.VALIDATED, IncidentStatus.DISPATCHED)


class Flag(models.TextChoices):
    NOT_BREATHING = "NOT_BREATHING"
    AIRWAY = "AIRWAY"
    FAST_BREATHING = "FAST_BREATHING"
    UNRESPONSIVE = "UNRESPONSIVE"
    BLEEDING = "BLEEDING"
    CANNOT_MOVE = "CANNOT_MOVE"
    HEAD = "HEAD"
    CHECK_BLEEDING = "CHECK_BLEEDING"
    FIRE = "FIRE"
    SMOKE = "SMOKE"
    FUEL_LEAK = "FUEL_LEAK"
    TRAPPED = "TRAPPED"
    ROAD_BLOCKED = "ROAD_BLOCKED"
    MCI = "MCI"


class Injury(models.TextChoices):
    HEAD = "HEAD"
    NECK_SPINE = "NECK_SPINE"
    CHEST = "CHEST"
    ABDOMEN = "ABDOMEN"
    PELVIS = "PELVIS"
    LIMBS = "LIMBS"
    BURNS = "BURNS"


class Capability(models.TextChoices):
    TRAUMA = "TRAUMA"
    NEURO = "NEURO"
    THORACIC = "THORACIC"
    GENERAL_SURGERY = "GENERAL_SURGERY"
    ORTHO = "ORTHO"
    BURNS = "BURNS"
    ICU = "ICU"
    PEDIATRIC = "PEDIATRIC"


class BriefSource(models.TextChoices):
    AI = "AI"
    TEMPLATE = "TEMPLATE"
