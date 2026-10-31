# Nadjda offline voice model (yes / no / other) — data collection and dataset

Plan: `AI_Layer_Guide.md` §11 and implementation plan Phase 7. This folder covers **step 1: collecting data**.
Training (Kaggle notebook), export and the TypeScript port come next.

## 1. Collect recordings

`collector/index.html` is a single page (no backend, no dependency). Each speaker records ~35 short clips
(10 yes, 10 no, 15 other: silence, noise, random words), then downloads `speaker_<ID>.zip` and sends it to you.
Nothing is uploaded anywhere; no name is stored, only a random id.

Serve it (the microphone needs `https://` or `localhost`):

```bash
cd voice-model/collector && python -m http.server 8080      # open http://localhost:8080 on your laptop
```
For friends' phones you need HTTPS: use GitHub Pages (push this folder) or a tunnel
(`npx cloudflared tunnel --url http://localhost:8080` / `ngrok http 8080`).

Tell every speaker:
- say the word **naturally**, the way they would answer "Are you breathing?" / "Can you walk?";
- different people, ages, accents; **some in a car, in the street, with the phone at arm's length**;
- redo a take if the page warns "very quiet" or "too loud".

Targets: **25+ speakers**, ideally 40; at least 8 of them in car/street/noisy places. Edit the word lists at
the top of the script in `index.html` to change what is asked.

## 2. Build the dataset

Put all received zips in one folder, then:

```bash
python voice-model/prepare_dataset.py zips/ dataset/
```
It validates every clip (16 kHz, mono, 16-bit, 1.0 s, not silent, not clipped, no duplicates), splits **by speaker**
70/15/15 (deterministic, `--seed 7` — do not change it once you train), and writes `clips.csv`, `speakers.csv`,
`rejected.csv`. Read the `WARNING:` lines it prints: too few speakers, no noisy recordings, too few clips...

Upload `dataset/` to Kaggle as a **private** dataset (`nadjda-voice-v1`).

## 2b. Add public speakers (train-only)

Real people from open datasets add voices without recruiting anyone. They are **train-only**: validation and test stay
your own Darija speakers. The best fit found so far is the **Arabic Speech Commands Dataset** (CC BY 4.0, Zenodo
record 4662481): 30 contributors x 10 takes of 40 keywords, 1 s at 16 kHz, including **نعم (yes) and لا (no)**, plus 8
real background-noise recordings.

```bash
# unzip the dataset somewhere of its own, then:
python voice-model/import_public.py <dataset>/dataset_and_noise_root public_zips/ --name ASC \
    --yes yes --no no --exclude ok --noise background_noise --other-all --max-per-label 80
cp public_zips/*.zip all/        # next to the speaker zips, then run prepare_dataset.py as usual
```
`--exclude ok`: موافق ("I agree") is an affirmative, so labelling it 'other' would be misleading. `--max-per-label` caps only
the 'other' words; yes/no and noise are never capped. Train with `--p-public 0.4` to draw public clips 40% of the time.
Synthetic TTS voices are not used any more: in tests they did not help (real-only beat real+synthetic).

## 3. Tests

```bash
node --test voice-model/tests/wav.test.mjs     # browser audio code (wav encoder, crop, zip)
python -m pytest voice-model                   # dataset script + the zip made by the browser code
```

## Clip spec (must match the app later)

16 kHz, mono, 16-bit PCM WAV, exactly 1.0 s = the loudest second of a 2 s take (`wav.js::cropLoudest`).
The app has to apply the same crop before computing features.
