# Najda

**Emergency alerts for road accidents, even without internet.**

Najda lets a driver, a witness or a bystander report a road accident in a few taps. The exact position, how serious the
situation is and, if the person shared it, their medical file reach a control center. The control center picks the nearest
hospital and sends an ambulance. When the phone has no internet, the same alert travels as a coded SMS.

<p align="center">
  <img src="docs/screenshots/app-home.jpg" width="19%" alt="Home screen with the SOS button" />
  <img src="docs/screenshots/app-crash-detected.jpg" width="19%" alt="Automatic crash detection countdown" />
  <img src="docs/screenshots/app-question.jpg" width="19%" alt="Yes / no triage question" />
  <img src="docs/screenshots/app-follow-up.jpg" width="19%" alt="Alert follow-up with timeline and hospital" />
  <img src="docs/screenshots/app-offline-sms.jpg" width="19%" alt="Offline SMS mode" />
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-map.jpg" width="49%" alt="Dispatcher dashboard: incident map" />
  <img src="docs/screenshots/dashboard-sms-alert.jpg" width="49%" alt="A new red alert received by SMS" />
</p>

## Features

**Phone app**
- One-tap **SOS**, for yourself or for someone else at the scene.
- **Automatic crash detection** from the phone's motion sensors, with a 10-second "Are you OK?" countdown.
- Short **yes / no triage questions** (answer by tap or by voice) that give a color: red, yellow or green.
- Optional **medical file**: blood group, conditions, allergies (with free-text "other"), emergency contact and photo.
- **Offline mode**: with no internet the app opens the Messages app with the alert already written; one tap sends it.
- Live **follow-up**: sent, received, hospital chosen, ambulance sent.
- Illustrated **first-aid steps** with read-aloud, and a **scene photo** (picked from the gallery) analysed by AI.
- Arabic and French, right-to-left aware.

**Control-center dashboard**
- Live map and incident list, with a counter by triage color and a filter by status or color.
- Victim file, answers, flags and a printable **victim badge**.
- Hospital proposals with travel time and free beds; **validate and send** the ambulance in one click.
- **AI scene analysis** (crash type, vehicles, airbag, probable injuries) and an AI note for the hospital.
- **Final report** exportable to PDF.

**Backend**
- REST + WebSocket API: reports, duplicate detection, hospital recommendation and routing.
- **SMS gateway link**: decodes alerts received by SMS and sends acknowledgement texts back.
- **AI layer** (local model through Ollama) that never blocks an alert: if the AI is off or slow, everything else still works.

## How it works

```
 iPhone / Android app ──── internet ───────────────┐
        │                                           ▼
        │ no internet                       ┌──────────────┐        ┌──────────────┐
        ▼                                   │ nadja        │ ◄────► │ dash         │
   coded SMS ──► Android SMS gateway ─────► │ Django API   │  live  │ dispatcher   │
                   (webhook, https tunnel)  │ + WebSocket  │        │ dashboard    │
        ▲                                   └──────┬───────┘        └──────────────┘
        └──────────── ACK text ◄───────────────────┘
                                       Ollama (AI vision) · OSRM (routes) · Cloudinary (photos)
```

## Repository layout

| Folder | What it is | Stack |
|---|---|---|
| [`app/`](app) | Phone app for victims, witnesses and bystanders | Expo SDK 58, React Native 0.88, expo-router, Zustand |
| [`dash/`](dash) | Dispatcher dashboard | React 18, Vite, Tailwind 4, Leaflet, Zustand |
| [`nadja/`](nadja) | Backend API, SMS gateway link, AI layer | Django 5.2, Django REST Framework, Channels + Daphne |
| [`design/`](design) | Design assets and notes | Figma exports |
| [`docs/`](docs) | Screenshots used in this README | |

## Quick start

Requirements: Node.js 22, Python 3.12, and for the phone app the **Expo Go** app. Optional: Ollama (AI) and an Android phone
with the *SMS Gateway for Android* app (offline SMS).

```bash
git clone https://github.com/Aymen-Guerrouf/car-crash-najda.git
cd car-crash-najda
```

**1. Backend**

```bash
cd nadja
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create nadja/.env (see "Configuration" below)
python manage.py migrate
python manage.py loaddata hospitals
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

API docs open at <http://localhost:8000/api/docs/>.

**2. Dashboard**

```bash
cd dash
npm install
# create dash/.env (see "Configuration" below)
npm run dev          # http://localhost:5173
```

**3. Phone app**

```bash
cd app
npm install
# create app/.env (see "Configuration" below)
npx expo start --clear
```

Scan the QR code with Expo Go. The phone and the computer must be on the same network.

### Configuration

The repository contains **no `.env` files**. Create them yourself and never commit them.

| File | Variables |
|---|---|
| `nadja/.env` | `DEBUG`, `ALLOWED_HOSTS`, `DJANGO_SECRET_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_VISION_MODEL`, `AI_VISION_TIMEOUT_S`, `AI_BRIEF_TIMEOUT_S`, `AI_VISION_MAX_PX`, `AI_NUM_CTX`, `SMS_WEBHOOK_TOKEN`, `SMS_GATEWAY_API_URL`, `SMS_GATEWAY_USER`, `SMS_GATEWAY_PASS`, `SMS_GATEWAY_SIM_NUMBER` |
| `dash/.env` | `VITE_API_URL`, `VITE_WS_URL`, `VITE_USE_MOCK`, `VITE_TILE_URL`, `VITE_MAP_CENTER`, `VITE_MAP_ZOOM`, `VITE_OSRM_URL` |
| `app/.env` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SMS_GATEWAY_NUMBER`, `EXPO_PUBLIC_RESET_ON_LAUNCH` |

Minimal local values: `DEBUG=true`, `ALLOWED_HOSTS=*`, a long random `DJANGO_SECRET_KEY` for the backend;
`VITE_API_URL=http://localhost:8000` and `VITE_WS_URL=ws://localhost:8000/ws/dashboard/` for the dashboard;
`EXPO_PUBLIC_API_URL=http://<your-computer-ip>:8000` for the app. Leave `AI_PROVIDER` empty to switch the AI off.

### Local AI (optional)

```bash
ollama pull qwen2.5vl:3b
```

Then set `AI_PROVIDER=ollama` and `AI_VISION_MODEL=qwen2.5vl:3b` in `nadja/.env`. About 4 GB of free RAM is needed; on a
CPU-only machine raise `AI_VISION_TIMEOUT_S` (for example `90`).

### Offline SMS (optional)

1. On an Android phone with a SIM, install *SMS Gateway for Android*, turn on **Local server** and put its address and
   credentials in `nadja/.env` (`SMS_GATEWAY_*`). Put the SIM number in `EXPO_PUBLIC_SMS_GATEWAY_NUMBER` in `app/.env`.
2. The gateway only accepts https webhooks, so expose the backend with a tunnel, for example
   `cloudflared tunnel --url http://localhost:8000`.
3. In the gateway app add a webhook for the **sms:received** event pointing to
   `https://<tunnel-address>/api/sms/webhook/<SMS_WEBHOOK_TOKEN>/`. Repeat this each time the tunnel restarts.

## The SMS format

Offline alerts are one compact, GSM-7 safe text (160 characters for one SMS, 306 when a profile photo reference is added):

```
GH1;<id>;<lat>,<lng>;<role>;<triage>;<counts>;<answers>;<flags>;<profile>
GH1;Q8Z21M;35.2011,-0.6412;A;R;R1Y0G0;-;UN;O+/DIA.OTH/PEN/-/-/-/THYROID/-
```

The profile part carries blood group, conditions, allergies, age and sex, name, a short profile-photo reference and the
free-text "other" illness or allergy. The gateway answers with an acknowledgement such as
`GH OK B1DW0H: EPH ROUIBA, ETA 9 min. Ambulance alertee. Appelez le 14 si besoin.`

## Triage

The app and the server each compute a color from the yes / no answers; the more serious one is kept and a color is never lowered.

| Color | Rule of thumb |
|---|---|
| **Red** | Witness: not breathing, breathing very fast, no response or heavy bleeding. Victim: heavy bleeding or cannot move. Any automatic crash alert. |
| **Yellow** | Witness: responds, no heavy bleeding. Victim: took a blow to the head. |
| **Green** | Witness: the person can walk. Victim: no bleeding, can move, no blow to the head. |
| **Unknown** | Alert sent before the questions were answered. |

## Disclaimer

Najda helps rescuers get ready. It does not replace the emergency services: in a life-threatening situation call the
emergency number first (14 in Algeria). The AI analysis is an aid, not a medical diagnosis.
