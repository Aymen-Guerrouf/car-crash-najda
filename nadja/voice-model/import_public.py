#!/usr/bin/env python
"""Turn a public keyword dataset (one folder per spoken word) into train-only zips that `prepare_dataset.py` accepts.

    python voice-model/import_public.py SOURCE_DIR zips/ --name GSC \\
        --other-all --exclude yes,no --noise _silence_,_background_noise_

    python voice-model/import_public.py SOURCE_DIR zips/ --name ASC --yes <folder> --no <folder> --other-all

Every clip is converted to the clip spec (16 kHz mono 16-bit, the loudest 1.0 s) and written into zips of at most 999
clips per class, marked `"source": "public"`. prepare_dataset keeps public clips in TRAINING only: validation and test
stay your own Darija speakers. The folder name decides the label:
  --yes / --no     folders whose words mean yes / no (only if the dataset really has them, e.g. Arabic na'am / la)
  --other-all      every other folder is the 'other' class (other words: the model must NOT answer yes/no to them)
  --exclude        folders to skip entirely (e.g. English yes/no: wrong language, would teach a misleading label)
  --noise          folders of background noise / silence ('other', kind 'noise': also used to mix noise in training)
"""

import argparse
import hashlib
import io
import json
import sys
import wave
import zipfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from generate_synthetic import crop_loudest, resample_fft, to_wav_bytes  # noqa: E402  (same spec, one implementation)

AUDIO_EXT = {".wav", ".flac", ".ogg", ".mp3"}
PER_ZIP = 999
NOISE_CHUNK_S = 1.0


def read_audio(path: Path):
    """-> (mono float32, sample_rate). WAV via the stdlib; other formats via soundfile if installed."""
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path)) as w:
                width, ch, rate, n = w.getsampwidth(), w.getnchannels(), w.getframerate(), w.getnframes()
                raw = w.readframes(n)
            if width == 2:
                x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
                return (x.reshape(-1, ch).mean(axis=1) if ch > 1 else x), rate
        except wave.Error:
            pass
    import soundfile as sf

    x, rate = sf.read(str(path), dtype="float32", always_2d=True)
    return x.mean(axis=1), rate


def to_clips(x: np.ndarray, rate: int, kind: str):
    """A word -> one 1.0 s clip (loudest second). A long noise recording -> several 1.0 s chunks."""
    x = resample_fft(x, rate, 16000)
    if kind == "noise" and len(x) > 2 * 16000:
        step = int(NOISE_CHUNK_S * 16000)
        return [x[i:i + 16000] for i in range(0, len(x) - 16000 + 1, step)]
    return [crop_loudest(x)]


def collect(root: Path, args):
    """-> list of (class, kind, label_folder, relative path)"""
    yes, no = set(args.yes or []), set(args.no or [])
    exclude, noise = set(args.exclude or []), set(args.noise or [])
    items = []
    for path in sorted(p for p in root.rglob("*") if p.suffix.lower() in AUDIO_EXT):
        label = path.parent.name
        if label in exclude:
            continue
        if label in yes:
            items.append(("yes", "yes", label, path))
        elif label in no:
            items.append(("no", "no", label, path))
        elif label in noise:
            items.append(("other", "noise", label, path))
        elif args.other_all:
            items.append(("other", "word", label, path))
    return items


def write_zips(clips, out: Path, name: str):
    """clips: [(class, kind, prompt, wav bytes)] -> speaker_PUB<name><nnn>.zip files, <= 999 per class each."""
    out.mkdir(parents=True, exist_ok=True)
    by_class = {"yes": [], "no": [], "other": []}
    for c in clips:
        by_class[c[0]].append(c)
    n_zips = max(1, max((len(v) + PER_ZIP - 1) // PER_ZIP for v in by_class.values()))
    written = []
    for z in range(n_zips):
        sid = f"PUB{name}{z + 1:03d}"[:16].upper()
        meta = {"speaker_id": sid, "env": "public", "distance": "", "accent": name, "source": "public",
                "sample_rate": 16000, "clip_seconds": 1.0, "clips": []}
        path = out / f"speaker_{sid}.zip"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as zf:
            for cls, items in by_class.items():
                for i, (_, kind, prompt, wav) in enumerate(items[z * PER_ZIP:(z + 1) * PER_ZIP], start=1):
                    fname = f"{cls}_{i:03d}.wav"
                    zf.writestr(fname, wav)
                    meta["clips"].append({"file": fname, "class": cls, "kind": kind, "prompt": prompt})
            zf.writestr("meta.json", json.dumps(meta, ensure_ascii=False, indent=0))
        written.append(path)
    return written


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--name", required=True, help="short tag for the dataset, letters/digits (e.g. GSC, ASC)")
    split = lambda s: [x for x in s.split(",") if x]  # noqa: E731
    ap.add_argument("--yes", type=split)
    ap.add_argument("--no", type=split)
    ap.add_argument("--exclude", type=split)
    ap.add_argument("--noise", type=split)
    ap.add_argument("--other-all", action="store_true")
    ap.add_argument("--max-per-label", type=int, default=0,
                    help="cap files per 'other' word folder (0 = all). yes/no and noise folders are never capped")
    args = ap.parse_args(argv)
    if not args.name.isalnum():
        raise SystemExit("--name must be letters/digits")

    items = collect(Path(args.source_dir), args)
    if args.max_per_label:
        kept, count = [], {}
        for it in items:
            if it[0] != "other" or it[1] != "word":           # never cap yes/no (the scarce classes) or noise
                kept.append(it)
                continue
            count[it[2]] = count.get(it[2], 0) + 1
            if count[it[2]] <= args.max_per_label:
                kept.append(it)
        items = kept
    clips, failed, seen = [], 0, set()
    for cls, kind, label, path in items:
        try:
            x, rate = read_audio(path)
            for chunk in to_clips(x, rate, kind):
                if np.sqrt(np.mean(chunk ** 2)) < 1e-4:          # digital silence carries nothing
                    continue
                wav = to_wav_bytes(np.clip(chunk, -1, 1))
                digest = hashlib.sha1(wav).hexdigest()
                if digest not in seen:
                    seen.add(digest)
                    clips.append((cls, kind, label, wav))
        except Exception:
            failed += 1
    zips = write_zips(clips, Path(args.out_dir), args.name)
    counts = {c: sum(1 for k in clips if k[0] == c) for c in ("yes", "no", "other")}
    labels = sorted({k[2] for k in clips})
    print(f"{args.name}: {len(clips)} clips -> {len(zips)} zip(s) {counts}; {len(labels)} source labels; {failed} unreadable files")
    return 0 if clips else 1


if __name__ == "__main__":
    sys.exit(main())
