# Golden Hour Copilot — Backend

> **Frontend team: start with [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md)** (endpoints, events, flows) and `openapi.json`.

Django 5 (LTS) + Django REST Framework + Django Channels (Daphne, ASGI).
Implements the backend lane of the [implementation plan](./Golden_Hour_Copilot_Implementation_Plan.md).

## Stack

| Piece | Choice |
|---|---|
| API | Django REST Framework (JSON, `/api/`) |
| Realtime | Django Channels + Daphne (native WebSockets, no socket.io) |
| Channel layer | `InMemoryChannelLayer` — **exactly one server process** |
| DB | SQLite (dev & demo) |
| AI / routing / SMS | added in Phases 5 / 1 / 3 |

## Apps

- `config/` — settings, root URLs, ASGI entrypoint, websocket routing
- `incidents/` — Incident & Report (Phase 1), health + ping endpoints
- `hospitals/` — Hospital model + fixtures, routing score (Phase 1/5)
- `sms/` — GH1 codec, webhook, ACK gateway (Phase 3)
- `ai/` — provider wrapper, prompts, background threads (Phase 5)
- `realtime/` — WebSocket consumers + `broadcast()` helper

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in secrets (gitignored)
python manage.py migrate
python manage.py runserver    # daphne is first in INSTALLED_APPS → ASGI + WS
```

Run tests:

```bash
pytest
```

## API docs / manual testing

Run the server (`DEBUG=true python manage.py runserver`), load hospitals once
(`python manage.py loaddata hospitals`), then open:

- Swagger UI (try requests in the browser): <http://localhost:8000/api/docs/>
- ReDoc: <http://localhost:8000/api/redoc/> · raw schema: `/api/schema/`
- Admin (inspect incidents/reports): `/admin/` (`python manage.py createsuperuser`)

## Triage (Phase 2)

`incidents/triage.py` holds the witness and victim trees of plan §8.2. On every
`POST`/`PATCH /api/reports/` the server re-evaluates the stored answers:
- triage = **worse** of phone vs server (it never lowers a triage; mismatches are logged
  on logger `incidents.triage`), flags = phone flags + the tree's flag;
- `answers_code` (e.g. `W0B1F1`) is computed server-side; a client-sent value is ignored;
- `AUTO` reports are always `RED` + `UNRESPONSIVE`;
- `answers` must use the 9 known question ids with `yes|no|unknown`.
- PATCH sends the **full** answers list (replace, not append).

## AI layer (Phase 5)

Photo → vision card, and a streamed ER brief. Full design: `AI_Layer_Guide.md`. **The alert never depends on it**:
with `AI_PROVIDER` empty (or the model down/slow) everything works and the brief is the 7-line template.

- `ai/client.py` — the only provider-aware module (Ollama local model, `fake` for tests, optional backup).
- `ai/tasks.py` — background threads: `POST /api/reports/{id}/photo/` (202) → vision → injuries merged into the incident
  (only if confidence ≥ 0.4) → brief (debounced 1.5 s, stale runs dropped, numbers not in the facts ⇒ template).
- Events on `/ws/dashboard/`: `ai.vision.done|failed`, `ai.brief.chunk` (ordered by `seq`), `ai.brief.done`
  (`source` AI|TEMPLATE, `first_token_ms`, `total_ms`), `incident.updated`.
- `GET /api/metrics/` — p50/p95 of alert / vision / brief latencies from the `AiCall` table. `GET /api/health/?warm=1` loads the model.
- Local model setup: `ollama pull qwen2.5vl:3b`, then in `.env`: `AI_PROVIDER=ollama`, `AI_VISION_MODEL=qwen2.5vl:3b`,
  and on a CPU-only machine `AI_VISION_TIMEOUT_S=90`, `AI_VISION_MAX_PX=640`. Keep one model loaded (empty `AI_TEXT_MODEL` reuses the vision model).
- Check the provider: `python manage.py ai_eval --ping`. Evaluate on your photos (targets of plan §9.2):
  `python manage.py ai_eval photos/ --labels photos/labels.csv` (columns `filename,is_accident,collision_type,airbag`).
- Scene photos are served from `/media/` (random file names) — demo scope only.

## Witness flow, duplicates, dispatch (Phase 4)

- **Duplicates (§8.4):** a report with a *new* `short_id` is merged into the closest open incident within
  `DEDUP_RADIUS_M` (300 m) created in the last `DEDUP_WINDOW_MIN` (10 min); the response returns the existing
  `short_id` (`merged: true`) so the phone switches to it. `force_new: true` ("it's a different accident") skips this.
  Applies to HTTP and SMS reports. `POST /api/incidents/nearby-check/` lets the app ask first.
- **Alias:** `Report.reported_short_id` keeps the phone's own id, so later updates from a merged phone (and its
  `GET /incidents/by-short/{id}/`, and `status.updated` pushes) still reach the right incident.
- **Dispatch:** `POST /api/incidents/{id}/dispatch/` (`hospital_id` optional = recommended one) → `DISPATCHED`,
  operator's hospital is kept from then on, `status.updated` to the phone(s), `incident.updated` to the dashboard,
  SMS to reporters who wrote by SMS. Idempotent. `POST /api/incidents/{id}/resolve/` (`by`: OPERATOR | REPORTER).
- **Multiple victims:** send one report per victim with the same `short_id` (counts are max-merged per category), or
  one report with `victim_counts`; `is_mci` + flag `MCI` at 5+ victims in total.
- Incident summaries carry `channels` and `report_count` (badges).

## Offline SMS channel (Phase 3)

Phone (no data) → coded `GH1;…` SMS → Android gateway app → webhook → same pipeline as HTTP → ACK SMS back.

- Webhook URL to configure in the gateway app (event "SMS received"):
  `https://<backend>/api/sms/webhook/<SMS_WEBHOOK_TOKEN>/` (403 if the token is wrong or unset).
- Outgoing ACK: `POST $SMS_GATEWAY_API_URL` with `{"message","phoneNumbers":[..]}` + Basic auth
  (`SMS_GATEWAY_USER` / `SMS_GATEWAY_PASS`) — format of *SMS Gateway for Android*; adapt `sms/gateway.py::_post` for another app.
- Codec: `sms/codec.py`, shared vectors in `contracts/sms_vectors.json` (**copy to the frontend repo**; it now has error codes + `decode_only` vectors).
- The webhook always answers 200 once authenticated; bad SMS are stored in `SmsLog.error`. Identical deliveries are idempotent (client_id = uuid5(short_id + text)) but are re-ACKed.
- First real run: check the raw body in the server log (`SMS webhook body: …`) and adapt `sms/services.py::extract_sms` if the gateway's shape differs.
- Manual test without a phone: Swagger `POST /api/sms/webhook/{token}/` with `{"message":"GH1;7A3F9K;35.1902,-0.6301;W;R;R1Y1G0;W0B1F1;FB+FI;-","phoneNumber":"+213550000000"}`.

## Endpoints (Phase 0 + 1)

| Method & path | Purpose |
|---|---|
| `GET /api/health/` (`?warm=1` before demo) | liveness / warm-up |
| `POST /api/ping/` | phone → dashboard end-to-end wiring test (broadcasts `ping` on the dashboard websocket) |
| `POST /api/reports/` | submit an SOS report (idempotent on `client_id`, merges on `short_id`) |
| `PATCH /api/reports/{id}/` | live update of triage/answers/flags/counts |
| `GET /api/incidents/?open=1` | open incidents (dashboard) |
| `GET /api/incidents/{id}/` · `/by-short/{short_id}/` | incident + reports + hospital |
| `POST /api/incidents/nearby-check/` | open incident near a point? (witness duplicate prompt) |
| `POST /api/incidents/{id}/dispatch/` · `/resolve/` | operator dispatch · resolve (operator or reporter) |
| `POST /api/reports/{id}/photo/` | scene photo → background AI analysis (202) |
| `GET /api/metrics/` | latency p50/p95 (alert, vision, brief) |
| `GET /api/hospitals/` | hospitals |
| `POST /api/profile-photo/` | multipart `photo` → Cloudinary → `{url}`; send it as `profile.photo_url` in the report (needs `CLOUDINARY_*` in `.env`, else 503) |
| `POST /api/sms/webhook/{token}/` | Android gateway → incident (channel SMS) + ACK |
| `GET /api/sms/logs/?limit=50` | SMS log, raw + decoded |
| `GET /api/docs/` | Swagger UI |
| `WS /ws/dashboard/` | dashboard group: receives every broadcast event |
| `WS /ws/incident/<short_id>/` | per-phone incident status group |

Event envelope: `{"type": "<event>", "data": {...}, "ts": "<iso8601>"}` (plan §5.4).

## Deploy (Render / Railway)

- Start command: `daphne -b 0.0.0.0 -p $PORT config.asgi:application` — **1 instance only**
  (in-memory channel layer).
- `release`/migration command: `python manage.py migrate` (Render release phase builds it from the Procfile).
- Set env vars from `.env.example` (never commit the real `.env`).
- Python version: 3.12.

## Contracts

- REST + WebSocket contracts: plan §5 (source of truth, shared with the two frontend apps).
- `contracts/sms_vectors.json` must stay **byte-identical** with the frontend repo copy;
  both codecs (`sms/codec.py`, TS `smsCodec.ts`) must pass it in Phase 3.
