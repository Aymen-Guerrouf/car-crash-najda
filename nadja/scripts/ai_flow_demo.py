#!/usr/bin/env python
"""Manual end-to-end check of the AI flow (what you would do in Swagger + wscat, in one command).

    python scripts/ai_flow_demo.py path/to/crash.jpg [--base http://localhost:8000] [--timeout 180]

Connects to the dashboard websocket, posts a report, uploads the photo (shrunk to <= 300 KB / 640 px),
then prints every event with the seconds elapsed since the upload, until the brief is done.
"""

import argparse
import io
import json
import sys
import time
import uuid

import httpx
import websocket  # websocket-client
from PIL import Image


def shrink(path: str, max_px: int = 640) -> bytes:
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_px, max_px))
    for quality in (70, 55, 40, 30):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality)
        if buf.tell() <= 300 * 1024:
            return buf.getvalue()
    sys.exit("could not shrink the photo under 300 KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--timeout", type=float, default=180, help="seconds to wait for ai.brief.done")
    args = ap.parse_args()

    ws = websocket.create_connection(args.base.replace("http", "ws", 1) + "/ws/dashboard/", timeout=args.timeout)
    http = httpx.Client(base_url=args.base, timeout=30)

    health = http.get("/api/health/").json()
    print("backend ok:", health["ok"])

    short_id = uuid.uuid4().hex[:6].upper()
    report = http.post("/api/reports/", json={
        "client_id": str(uuid.uuid4()), "short_id": short_id, "role": "WITNESS", "lat": 35.1902, "lng": -0.6301,
        "triage": "RED", "flags": ["FIRE"], "victim_counts": {"RED": 1, "YELLOW": 1, "GREEN": 0}, "force_new": True,
        "profile": {"blood": "O+", "age": 34, "sex": "M", "conditions": ["DIA"], "allergies": ["PEN"]},
    })
    report.raise_for_status()
    rid = report.json()["report_id"]
    print(f"report {rid} created (short_id {short_id}); hospital: {report.json()['hospital']}")

    data = shrink(args.photo)
    t0 = time.monotonic()
    up = http.post(f"/api/reports/{rid}/photo/", files={"photo": ("scene.jpg", data, "image/jpeg")})
    print(f"photo {len(data) // 1024} KB uploaded -> HTTP {up.status_code} {up.json()} in {time.monotonic() - t0:.2f}s\n")
    if up.status_code != 202:
        sys.exit("upload failed")

    brief = []
    while True:
        try:
            event = json.loads(ws.recv())
        except websocket.WebSocketTimeoutException:
            sys.exit(f"\nno ai.brief.done after {args.timeout:.0f}s (model too slow, or out of memory? see the server log)")
        elapsed = time.monotonic() - t0
        kind, d = event["type"], event["data"]
        if kind == "ai.vision.done":
            v = d["ai_vision"]
            print(f"[{elapsed:6.1f}s] ai.vision.done  {d['ms']} ms  {v['collision_type']} conf={v['confidence']} "
                  f"airbag={v['airbag_deployed']} injuries={v['likely_injuries']} low_confidence={v['low_confidence']}\n"
                  f"           {v['summary_fr']}")
        elif kind == "ai.vision.failed":
            print(f"[{elapsed:6.1f}s] ai.vision.failed  reason={d['reason']}")
        elif kind == "ai.brief.chunk":
            if not brief:
                print(f"[{elapsed:6.1f}s] first brief chunk")
            brief.append(d["text"])
        elif kind == "ai.brief.done":
            print(f"[{elapsed:6.1f}s] ai.brief.done  source={d['source']} first_token={d['first_token_ms']} ms total={d['total_ms']} ms\n")
            print(d["text"])
            break
        elif kind == "incident.updated":
            print(f"[{elapsed:6.1f}s] incident.updated  injuries={d['injuries']} brief_source={d['er_brief_source'] or '-'}")
    print("\nmetrics:", http.get("/api/metrics/").json())


if __name__ == "__main__":
    main()
