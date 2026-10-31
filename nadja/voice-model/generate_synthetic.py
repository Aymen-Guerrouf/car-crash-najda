#!/usr/bin/env python
"""Generate synthetic yes / no / other clips with text-to-speech voices (Edge TTS, incl. Algerian Arabic ar-DZ).

    python voice-model/generate_synthetic.py zips/ [--quick] [--voices ar-DZ-AminaNeural,fr-FR-HenriNeural]
                                             [--preview preview/] [--cache cache/] [--seed 7]

Writes one `speaker_SYN*.zip` per voice in the SAME format as the recording page, with meta.synthetic = true, so
`prepare_dataset.py` treats them as train-only (never validation/test). They add variety; they do not replace
real people, and a model must always be judged on real speakers.

Why the clips are not left clean: TTS audio is digitally silent around the word and always loud and clear. A model
could learn "perfect silence + clean voice = synthetic = yes/no". So every clip gets a random gain (the two real devices
differ by ~22 dB), a random noise floor (SNR 8-40 dB) and is placed in a 1.0 s window like the real clips.

Needs network (Edge TTS is an unofficial client of Microsoft's online service: check its terms before relying on it).
Darija words are written in Arabic script; a TTS voice misreads Latin transliterations.
"""

import argparse
import asyncio
import hashlib
import io
import json
import random
import sys
import wave
import zipfile
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000
CLIP_SAMPLES = 16000
MIN_RMS = 0.007            # prepare_dataset rejects word clips below 0.005 rms; stay clearly above it

# ---- what the voices say ------------------------------------------------------------------------------------
WORDS = {
    "ar": {
        "yes": ["إيه", "ايه", "آه", "واه", "نعم", "إي", "إيه إيه"],
        "no": ["لا", "لالا", "لا لا", "ماشي", "لأ"],
        # includes look-alikes (واحد ~ واه, وين ~ إيه...) as hard negatives
        "other": ["مرحبا", "شكرا", "طاولة", "سيارة", "كتاب", "ماء", "غدا", "بيت", "الله", "أنا", "هنا", "الطريق",
                  "إسعاف", "تعبان", "واحد", "اثنان", "وين", "وقت", "يالله", "صباح الخير"],
    },
    "fr": {
        "yes": ["oui", "ouais", "oui oui"],
        "no": ["non", "non non", "nan"],
        "other": ["bonjour", "merci", "voiture", "maison", "demain", "allô", "ambulance", "attendez", "un", "deux",
                  "ici", "vite", "pourquoi", "monsieur", "madame", "accident"],
    },
}
VOICES = [  # (edge-tts short name, language group)
    ("ar-DZ-AminaNeural", "ar"), ("ar-DZ-IsmaelNeural", "ar"), ("ar-MA-JamalNeural", "ar"), ("ar-MA-MounaNeural", "ar"),
    ("ar-TN-HediNeural", "ar"), ("ar-TN-ReemNeural", "ar"), ("ar-EG-SalmaNeural", "ar"), ("ar-EG-ShakirNeural", "ar"),
    ("ar-SA-HamedNeural", "ar"), ("ar-SA-ZariyahNeural", "ar"),
    ("fr-FR-DeniseNeural", "fr"), ("fr-FR-HenriNeural", "fr"), ("fr-FR-RemyMultilingualNeural", "fr"),
    ("fr-CA-SylvieNeural", "fr"), ("fr-BE-GerardNeural", "fr"), ("fr-CH-ArianeNeural", "fr"),
]
RATES = ["-15%", "+0%", "+15%"]
PITCHES = ["-6Hz", "+0Hz", "+6Hz"]


# ---- signal processing (numpy only) -----------------------------------------------------------------------
def resample_fft(x: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    if from_rate == to_rate or len(x) == 0:
        return x.astype(np.float32)
    n, m = len(x), int(round(len(x) * to_rate / from_rate))
    spectrum = np.fft.rfft(x)
    out = np.zeros(m // 2 + 1, dtype=complex)
    k = min(len(spectrum), len(out))
    out[:k] = spectrum[:k]
    return (np.fft.irfft(out, m) * (m / n)).astype(np.float32)


def trim_to_speech(x: np.ndarray, threshold: float = 0.03) -> np.ndarray:
    """Drop the leading/trailing digital silence TTS adds."""
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    if peak == 0:
        return x
    idx = np.nonzero(np.abs(x) >= threshold * peak)[0]
    return x[idx[0]: idx[-1] + 1]


def crop_loudest(x: np.ndarray, length: int = CLIP_SAMPLES, hop: int = 160) -> np.ndarray:
    """Same rule as collector/wav.js::cropLoudest: the loudest `length` samples, or the word centred in a window."""
    if len(x) <= length:
        out = np.zeros(length, dtype=np.float32)
        start = (length - len(x)) // 2
        out[start: start + len(x)] = x
        return out
    sq = np.concatenate(([0.0], np.cumsum(x.astype(np.float64) ** 2)))
    starts = np.arange(0, len(x) - length + 1, hop)
    energy = sq[starts + length] - sq[starts]
    best = int(starts[int(np.argmax(energy))])
    return x[best: best + length].astype(np.float32)


def make_clip(audio: np.ndarray, sample_rate: int, rng: random.Random) -> np.ndarray:
    """TTS audio -> a realistic-ish 1.0 s, 16 kHz clip (random level, noise floor)."""
    x = resample_fft(audio.astype(np.float32), sample_rate, SAMPLE_RATE)
    x = crop_loudest(trim_to_speech(x))
    peak = float(np.max(np.abs(x)))
    if peak > 0:
        target_peak = 10 ** rng.uniform(np.log10(0.05), np.log10(0.7))    # real devices: peak 0.06 ... 0.65
        x = x * (target_peak / peak)
    signal_rms = float(np.sqrt(np.mean(x ** 2))) or 1e-4
    if signal_rms < MIN_RMS:                       # short words at the lowest gain would fail prepare_dataset's level check
        x = x * (MIN_RMS / signal_rms)
        signal_rms = MIN_RMS
    snr_db = rng.uniform(8, 40)
    noise_rms = signal_rms / (10 ** (snr_db / 20))
    noise = np.random.default_rng(rng.randrange(2 ** 32)).normal(0, noise_rms, CLIP_SAMPLES).astype(np.float32)
    return np.clip(x + noise, -1.0, 1.0)


def to_wav_bytes(x: np.ndarray) -> bytes:
    pcm = np.round(np.clip(x, -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def decode_audio(data: bytes):
    import soundfile as sf

    audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return audio.mean(axis=1), rate


# ---- plan / fetch -----------------------------------------------------------------------------------------------
def make_plan(voices, quick=False):
    """[(voice, lang, cls, kind, text, rate, pitch)] — yes/no vary rate AND pitch, other words only the rate."""
    rates = ["-15%", "+15%"] if quick else RATES
    pitches = ["+0Hz"] if quick else PITCHES
    plan = []
    for voice, lang in voices:
        for cls in ("yes", "no"):
            for text in WORDS[lang][cls]:
                plan += [(voice, lang, cls, cls, text, r, p) for r in rates for p in pitches]
        words = WORDS[lang]["other"][:6] if quick else WORDS[lang]["other"]
        plan += [(voice, lang, "other", "word", text, r, "+0Hz") for text in words for r in rates]
    return plan


def speaker_id(voice: str, taken: set) -> str:
    locale, _, name = voice.split("-", 2)[0], None, voice.split("-", 2)[2]
    country = voice.split("-")[1]
    name = name.replace("Neural", "").replace("Multilingual", "")
    sid = f"SYN{locale}{country}{name}"[:16].upper()
    while sid in taken:
        sid = (sid[:15] + str(len(taken) % 10)).upper()
    taken.add(sid)
    return sid


async def fetch_audio(text, voice, rate, pitch, cache: Path | None, retries=3) -> bytes:
    key = hashlib.sha1(f"{voice}|{rate}|{pitch}|{text}".encode()).hexdigest()
    if cache:
        hit = cache / f"{key}.mp3"
        if hit.exists():
            return hit.read_bytes()
    import edge_tts

    last = None
    for attempt in range(retries):
        try:
            data = b""
            async for chunk in edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).stream():
                if chunk["type"] == "audio":
                    data += chunk["data"]
            if not data:
                raise RuntimeError("empty audio")
            if cache:
                cache.mkdir(parents=True, exist_ok=True)
                (cache / f"{key}.mp3").write_bytes(data)
            return data
        except Exception as exc:  # network hiccup / rate limit: back off and retry
            last = exc
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"TTS failed for {voice} {text!r}: {last}")


async def generate(plan, cache, concurrency, seed, fetch=fetch_audio):
    """-> {voice: [(cls, kind, text, wav_bytes)]}, failures"""
    sem = asyncio.Semaphore(concurrency)
    results, failures = {}, []

    async def one(item):
        voice, lang, cls, kind, text, rate, pitch = item
        async with sem:
            try:
                data = await fetch(text, voice, rate, pitch, cache)
                audio, rate_hz = decode_audio(data)
            except Exception as exc:
                failures.append((voice, text, str(exc)[:80]))
                return None
        rng = random.Random(f"{seed}|{voice}|{text}|{rate}|{pitch}")
        return voice, (cls, kind, text, to_wav_bytes(make_clip(audio, rate_hz, rng)))

    for out in await asyncio.gather(*(one(i) for i in plan)):
        if out:
            results.setdefault(out[0], []).append(out[1])
    return results, failures


def write_zip(path: Path, sid: str, voice: str, clips) -> int:
    counters, files, meta_clips = {}, [], []
    seen = set()
    for cls, kind, text, wav in sorted(clips, key=lambda c: (c[0], c[2])):
        digest = hashlib.sha1(wav).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        counters[cls] = counters.get(cls, 0) + 1
        if counters[cls] > 999:
            break
        name = f"{cls}_{counters[cls]:03d}.wav"
        files.append((name, wav))
        meta_clips.append({"file": name, "class": cls, "kind": kind, "prompt": text})
    meta = {"speaker_id": sid, "env": "synthetic", "distance": "", "accent": voice, "synthetic": True,
            "sample_rate": SAMPLE_RATE, "clip_seconds": 1.0, "clips": meta_clips}
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        for name, wav in files:
            z.writestr(name, wav)
        z.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=1))
    return len(files)


def main(argv=None, fetch=fetch_audio):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out_dir")
    ap.add_argument("--voices", help="comma-separated Edge TTS voice names (default: all of VOICES)")
    ap.add_argument("--quick", action="store_true", help="1 voice (ar-DZ-AminaNeural), fewer variants: a fast test")
    ap.add_argument("--cache", default=None, help="folder to cache downloaded audio (default: <out_dir>/.tts_cache)")
    ap.add_argument("--preview", help="also write a few WAV files to listen to (check pronunciation yourself!)")
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args(argv)

    known = dict(VOICES)
    if args.voices:
        voices = [(v.strip(), known.get(v.strip(), "ar" if v.strip().startswith("ar") else "fr")) for v in args.voices.split(",")]
    elif args.quick:
        voices = [VOICES[0]]
    else:
        voices = VOICES
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = Path(args.cache) if args.cache else out_dir / ".tts_cache"
    plan = make_plan(voices, args.quick)
    print(f"{len(voices)} voices, {len(plan)} clips to synthesise (cached ones are free)...")
    results, failures = asyncio.run(generate(plan, cache, args.concurrency, args.seed, fetch))

    taken, total = set(), 0
    for voice, _ in voices:
        clips = results.get(voice, [])
        if not clips:
            print(f"  {voice}: NO clips (voice unavailable?)")
            continue
        sid = speaker_id(voice, taken)
        n = write_zip(out_dir / f"speaker_{sid}.zip", sid, voice, clips)
        by = {c: sum(1 for k in clips if k[0] == c) for c in ("yes", "no", "other")}
        print(f"  {voice:<30} {sid:<18} {n:>4} clips  (yes {by['yes']}, no {by['no']}, other {by['other']})")
        total += n
    if args.preview:
        prev = Path(args.preview)
        prev.mkdir(parents=True, exist_ok=True)
        for voice, clips in results.items():
            for cls in ("yes", "no"):
                for i, (c, _, text, wav) in enumerate([k for k in clips if k[0] == cls][:2]):
                    (prev / f"{voice}_{cls}_{i}.wav").write_bytes(wav)
        print(f"preview WAVs in {prev}/ : LISTEN to them, especially the Darija words")
    if failures:
        print(f"WARNING: {len(failures)} clips failed (e.g. {failures[0]})")
    print(f"total {total} synthetic clips")
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
