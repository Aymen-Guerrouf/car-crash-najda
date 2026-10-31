"""Evaluate the vision model on your own labelled photos (plan §9.2 test set, targets: >= 80 % collision type,
0 non-accident photos with high confidence) and/or check the provider is alive.

    python manage.py ai_eval --ping
    python manage.py ai_eval photos/ [--labels photos/labels.csv] [--max-px 640] [--limit 5] [--json out.json]

labels.csv columns: filename,is_accident,collision_type,airbag
    is_accident: 1/0   collision_type: FRONTAL|SIDE|REAR|ROLLOVER|PEDESTRIAN|MOTORCYCLE (blank for non-accidents)
    airbag: yes|no|(blank = unknown)
"""

import csv
import json
import statistics
import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ai import client, vision as vision_pipeline

HIGH_CONFIDENCE = 0.5
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def percentile(values, q):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(q * (len(values) - 1))))]


class Command(BaseCommand):
    help = "Evaluate the AI vision model on a folder of labelled photos, or ping the provider."

    def add_arguments(self, parser):
        parser.add_argument("directory", nargs="?")
        parser.add_argument("--labels", help="CSV (default: <directory>/labels.csv)")
        parser.add_argument("--max-px", type=int, help="override AI_VISION_MAX_PX")
        parser.add_argument("--limit", type=int, help="only the first N photos")
        parser.add_argument("--no-warmup", action="store_true", help="do not exclude a first warm-up call from timings")
        parser.add_argument("--ping", action="store_true", help="check the provider with a tiny text call, then exit")
        parser.add_argument("--json", help="also write the full results to this file")

    def handle(self, *args, **opts):
        self.out = self.stdout.write
        self.out(f"provider={settings.AI_PROVIDER or '(none)'} vision_model={settings.AI_VISION_MODEL or '-'} "
                 f"text_model={settings.AI_TEXT_MODEL or settings.AI_VISION_MODEL or '-'} base_url={settings.AI_BASE_URL}")
        if opts["ping"]:
            return self.ping()
        if not opts["directory"]:
            raise CommandError("give a photo directory, or use --ping")
        self.evaluate(opts)

    def ping(self):
        started = time.monotonic()
        first = None
        text = []
        try:
            for piece in client.stream_text("Réponds uniquement par le mot: OK", timeout=settings.AI_BRIEF_TIMEOUT_S):
                if first is None:
                    first = time.monotonic() - started
                text.append(piece)
        except client.AiError as exc:
            raise CommandError(f"provider not reachable / failed: {exc}")
        self.out(f"OK first_token={first * 1000:.0f} ms total={(time.monotonic() - started) * 1000:.0f} ms reply={''.join(text).strip()[:60]!r}")

    def evaluate(self, opts):
        folder = Path(opts["directory"])
        if not folder.is_dir():
            raise CommandError(f"{folder} is not a directory")
        labels_path = Path(opts["labels"]) if opts["labels"] else folder / "labels.csv"
        if not labels_path.exists():
            raise CommandError(f"labels file not found: {labels_path}")
        with open(labels_path, newline="", encoding="utf-8") as f:
            labels = {row["filename"]: row for row in csv.DictReader(f)}
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT and p.name in labels)
        if opts["limit"]:
            files = files[: opts["limit"]]
        if not files:
            raise CommandError("no photo in the folder matches labels.csv")
        if opts["max_px"]:
            settings.AI_VISION_MAX_PX = opts["max_px"]
        max_px = settings.AI_VISION_MAX_PX

        if not opts["no_warmup"]:
            self.out("warm-up call (excluded from timings)...")
            try:
                vision_pipeline.analyze_scene(files[0].read_bytes())
            except client.AiError as exc:
                self.out(f"  warm-up failed: {exc}")

        rows, times = [], []
        for path in files:
            lab = labels[path.name]
            is_accident = lab.get("is_accident", "1").strip() not in ("0", "false", "no")
            started = time.monotonic()
            row = {"file": path.name, "is_accident": is_accident, "ok": False}
            try:
                v, used = vision_pipeline.analyze_scene(path.read_bytes())
                row.update(ok=True, vision=v)
            except Exception as exc:
                row["error"] = getattr(exc, "reason", type(exc).__name__)
            row["ms"] = int((time.monotonic() - started) * 1000)
            if row["ok"]:
                times.append(row["ms"])
            rows.append(row)
            v = row.get("vision", {})
            self.out(f"  {path.name:<28} {row['ms']:>6} ms  {v.get('collision_type', row.get('error', '-')):<11} "
                     f"conf={v.get('confidence', '-')} airbag={v.get('airbag_deployed', '-')} gate={v.get('gate', '-')}")

        ok_rows = [r for r in rows if r["ok"]]
        accidents = [r for r in ok_rows if r["is_accident"]]
        non_acc = [r for r in ok_rows if not r["is_accident"]]
        collision_hits = [r for r in accidents if r["vision"]["collision_type"] == labels[r["file"]].get("collision_type", "").strip().upper()
                          and labels[r["file"]].get("collision_type", "").strip()]
        collision_total = [r for r in accidents if labels[r["file"]].get("collision_type", "").strip()]
        airbag_total = [r for r in accidents if labels[r["file"]].get("airbag", "").strip().lower() in ("yes", "no")]
        airbag_hits = [r for r in airbag_total if r["vision"]["airbag_deployed"] is (labels[r["file"]]["airbag"].strip().lower() == "yes")]
        false_alarms = [r for r in non_acc if r["vision"]["confidence"] >= HIGH_CONFIDENCE and r["vision"]["collision_type"] != "UNKNOWN"]

        def pct(a, b):
            return f"{100 * a / b:.0f} % ({a}/{b})" if b else "n/a"

        summary = {
            "photos": len(rows),
            "valid_output_rate": pct(len(ok_rows), len(rows)),
            "collision_type_accuracy": pct(len(collision_hits), len(collision_total)),
            "airbag_accuracy": pct(len(airbag_hits), len(airbag_total)),
            "non_accident_marked_confident": f"{len(false_alarms)} of {len(non_acc)}",
            "latency_ms_p50": int(statistics.median(times)) if times else None,
            "latency_ms_p95": percentile(times, 0.95),
            "max_px": max_px,
            "model": settings.AI_VISION_MODEL,
        }
        self.out("\n== summary ==")
        for k, v in summary.items():
            self.out(f"{k:<32} {v}")
        verdict = (collision_total and len(collision_hits) / len(collision_total) >= 0.8) and not false_alarms and len(ok_rows) == len(rows)
        self.out("targets (>= 80 % collision type, 0 confident non-accidents, all outputs valid): " + ("PASS" if verdict else "NOT MET"))
        if opts["json"]:
            Path(opts["json"]).write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False))
