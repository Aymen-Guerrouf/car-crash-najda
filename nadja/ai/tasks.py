"""Background AI work (plan §7 Phase 5, backend step 3). Nothing here may block an HTTP response
or break the alert: every failure ends in a template brief / a `ai.vision.failed` event."""

import json
import logging
import threading
import time

from django.conf import settings
from django.db import close_old_connections, connection
from django.utils import timezone

from realtime.broadcast import broadcast

from . import client, context, fallbacks, prompts, vision as vision_pipeline
from .models import AiCall

logger = logging.getLogger(__name__)

_gen_lock = threading.Lock()
_generation: dict[str, int] = {}  # incident id -> latest requested brief generation
MAX_BRIEF_CHARS = 900


# --- plumbing -------------------------------------------------------------------------------
def _spawn(fn, *args) -> None:
    if not settings.AI_BACKGROUND_TASKS:
        return
    if settings.AI_RUN_INLINE:  # tests
        fn(*args)
        return
    threading.Thread(target=_thread_main, args=(fn, args), daemon=True, name=f"ai-{fn.__name__}").start()


def _thread_main(fn, args) -> None:
    try:
        fn(*args)
    except Exception:  # a background thread must never die silently or take the server with it
        logger.exception("AI task %s crashed", fn.__name__)
    finally:
        close_old_connections()
        connection.close()


def _reason(exc: Exception) -> str:
    if isinstance(exc, client.AiError):
        return exc.reason
    if isinstance(exc, ValueError):
        return "bad_output"
    return "error"


def _record(**kw) -> None:
    try:
        AiCall.objects.create(**kw)
    except Exception:  # metrics must never break the flow
        logger.exception("could not record AiCall")


def _ms(since: float) -> int:
    return int((time.monotonic() - since) * 1000)


# --- vision ---------------------------------------------------------------------------------
def start_vision(report_id) -> None:
    _spawn(_run_vision, str(report_id))


def _run_vision(report_id: str) -> None:
    from incidents.models import Report
    from incidents.serializers import IncidentSummarySerializer
    from incidents.services import aggregate_incident

    report = Report.objects.select_related("incident").filter(pk=report_id).first()
    if report is None or not report.photo:
        return
    incident = report.incident
    started = time.monotonic()
    used = None
    try:
        with report.photo.open("rb") as f:
            raw_image = f.read()
        vision, used = vision_pipeline.analyze_scene(raw_image)
    except Exception as exc:
        reason = _reason(exc)
        logger.warning("vision failed for report %s: %s (%s)", report_id, reason, exc)
        _record(kind="VISION", ok=False, error=reason, ms=_ms(started), report=report, incident=incident,
                provider=getattr(used, "provider", ""), prompt_version=prompts.VISION_PROMPT_VERSION)
        broadcast("ai.vision.failed", {"report_id": report_id, "reason": reason})
        start_brief(incident.id)
        return

    ms = _ms(started)
    Report.objects.filter(pk=report_id).update(ai_vision=vision, ai_vision_ms=ms)
    incident.refresh_from_db()
    aggregate_incident(incident)  # injuries are derived from usable vision results
    incident.save()
    _record(kind="VISION", ok=True, ms=ms, report=report, incident=incident, provider=used.provider,
            model=used.model, prompt_version=prompts.VISION_PROMPT_VERSION)
    broadcast("ai.vision.done", {
        "report_id": report_id, "incident_id": str(incident.id), "ai_vision": vision, "ms": ms,
        "photo": report.photo.url,
    })
    incident = type(incident).objects.select_related("hospital").prefetch_related("reports").get(pk=incident.pk)
    broadcast("incident.updated", IncidentSummarySerializer(incident).data)
    start_brief(incident.id)


# --- brief ----------------------------------------------------------------------------------
def start_brief(incident_id) -> None:
    """Request a (re)generation. Bursts of requests collapse: only the latest generation writes."""
    if not settings.AI_BACKGROUND_TASKS:
        return
    key = str(incident_id)
    with _gen_lock:
        _generation[key] = gen = _generation.get(key, 0) + 1
    _spawn(_run_brief, key, gen)


def _is_stale(key: str, gen: int) -> bool:
    with _gen_lock:
        return _generation.get(key) != gen


def numbers_grounded(text: str, ctx: dict) -> bool:
    """Hallucination guard: every number in the AI text must exist in the facts we gave it."""
    import re

    allowed = context.numbers_in(context.prompt_json(ctx))
    return all(n in allowed for n in re.findall(r"\d+", text))


def _run_brief(key: str, gen: int) -> None:
    from incidents.models import Incident
    from incidents.serializers import IncidentSummarySerializer

    if not settings.AI_RUN_INLINE and settings.AI_BRIEF_DEBOUNCE_S > 0:
        time.sleep(settings.AI_BRIEF_DEBOUNCE_S)
    if _is_stale(key, gen):
        return

    incident = Incident.objects.select_related("hospital").prefetch_related("reports").filter(pk=key).first()
    if incident is None:
        return
    ctx = context.build_context(incident)
    prompt = prompts.brief_prompt(json.dumps(context.prompt_json(ctx), ensure_ascii=False))

    started = time.monotonic()
    first_token_ms = None
    pieces: list[str] = []
    source, error, used = "AI", "", None
    try:
        stream = client.open_stream(prompt)
        for seq, piece in enumerate(stream):
            if _is_stale(key, gen):
                return  # a newer brief supersedes this one; say nothing
            if first_token_ms is None:
                first_token_ms = _ms(started)
            pieces.append(piece)
            broadcast("ai.brief.chunk", {"incident_id": key, "seq": seq, "text": piece})
        used = stream.used
        text = "".join(pieces).strip()
        if not text or len(text) > MAX_BRIEF_CHARS:
            raise client.AiBadOutput("empty or oversized brief")
        if not numbers_grounded(text, ctx):
            raise client.AiBadOutput("brief contains numbers that are not in the facts")
        invented = context.ungrounded_preparations(text, ctx["allowed_preparations"])
        if invented:
            raise client.AiBadOutput(f"brief asks for preparations the facts do not justify: {invented}")
    except Exception as exc:
        error = _reason(exc)
        logger.warning("AI brief failed for incident %s: %s (%s) -> template", key, error, exc)
        text, source = fallbacks.template_brief(incident), "TEMPLATE"

    if _is_stale(key, gen):
        return
    total_ms = _ms(started)
    first_token_ms = first_token_ms if source == "AI" else total_ms
    Incident.objects.filter(pk=key).update(er_brief=text, er_brief_source=source, updated_at=timezone.now())
    _record(kind="BRIEF", ok=source == "AI", error=f"fallback:{error}" if error else "", ms=total_ms,
            first_token_ms=first_token_ms, incident=incident, provider=getattr(used, "provider", ""),
            model=getattr(used, "model", ""), prompt_version=prompts.BRIEF_PROMPT_VERSION)
    broadcast("ai.brief.done", {"incident_id": key, "text": text, "source": source,
                                "first_token_ms": first_token_ms, "total_ms": total_ms})
    fresh = Incident.objects.select_related("hospital").prefetch_related("reports").get(pk=key)
    broadcast("incident.updated", IncidentSummarySerializer(fresh).data)


# --- warm-up --------------------------------------------------------------------------------
def warm_async() -> None:
    _spawn(client.warm)
