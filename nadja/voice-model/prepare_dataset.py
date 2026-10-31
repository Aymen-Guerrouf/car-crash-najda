#!/usr/bin/env python
"""Turn the ZIP files sent by speakers (collector/index.html) into one validated, speaker-split dataset
ready to upload to Kaggle as a private dataset.

    python voice-model/prepare_dataset.py zips/ dataset/ [--seed 7] [--min-rms 0.005] [--force]

Output (dataset/):
    yes/ no/ other/        <speaker>_<clip>.wav   (16 kHz mono 16-bit, 1.0 s)
    clips.csv              path,class,kind,speaker,split,env,distance,prompt
    speakers.csv           speaker,split,env,distance,accent,n_yes,n_no,n_other
    rejected.csv           zip,file,reason

The split is BY SPEAKER (never by clip): a model judged on voices it trained on looks better than it is.
Pure standard library on purpose (runs anywhere, including a fresh Kaggle notebook).
"""

import argparse
import array
import csv
import hashlib
import io
import json
import re
import sys
import wave
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

SAMPLE_RATE = 16000
CLIP_FRAMES = 16000
FRAME_TOLERANCE = 320          # +-20 ms
CLASSES = ("yes", "no", "other")
SILENCE_MAX_RATIO = 0.5    # a silence take must be < 50% of the speaker's median speech level
SPEAKER_RE = re.compile(r"^[A-Za-z0-9]{4,16}$")
FILE_RE = re.compile(r"^(yes|no|other)_(\d{3})\.wav$")
SPLIT_FRACTIONS = (("train", 0.70), ("val", 0.15), ("test", 0.15))
MIN_SPEAKERS_WARNING = 20


class Rejected(Exception):
    pass


def read_wav(data: bytes):
    """-> (samples as list of ints, rate, channels, width). Raises Rejected for non-WAV."""
    try:
        with wave.open(io.BytesIO(data)) as w:
            channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            raw = w.readframes(frames)
    except (wave.Error, EOFError) as exc:
        raise Rejected(f"not a valid WAV ({exc})")
    if width != 2:
        return [], rate, channels, width
    samples = array.array("h")
    samples.frombytes(raw)
    return samples, rate, channels, width


def rms_of(samples) -> float:
    if not len(samples):
        return 0.0
    return (sum(s * s for s in samples) / len(samples)) ** 0.5 / 32768.0


def check_clip(data: bytes, cls: str, kind: str, min_rms: float) -> float:
    """Validates one clip against the spec; returns its RMS. Raises Rejected(reason)."""
    samples, rate, channels, width = read_wav(data)
    if rate != SAMPLE_RATE:
        raise Rejected(f"sample rate {rate} != {SAMPLE_RATE}")
    if channels != 1:
        raise Rejected(f"{channels} channels, mono required")
    if width != 2:
        raise Rejected(f"{8 * width}-bit, 16-bit required")
    if abs(len(samples) - CLIP_FRAMES) > FRAME_TOLERANCE:
        raise Rejected(f"duration {len(samples) / SAMPLE_RATE:.2f}s, 1.0s required")
    level = rms_of(samples)
    if kind != "silence" and level < min_rms:
        raise Rejected(f"too quiet (rms {level:.4f} < {min_rms}) for a '{cls}' clip, probably a failed take")
    if sum(1 for s in samples if abs(s) >= 32700) / len(samples) > 0.05:
        raise Rejected("clipped (more than 5% of samples at full scale)")
    return level


def assign_splits(speakers, seed: int) -> dict:
    """Deterministic speaker-level split 70/15/15. With >= 3 speakers every split gets at least one."""
    ordered = sorted(speakers, key=lambda s: hashlib.sha1(f"{seed}:{s}".encode()).hexdigest())
    n = len(ordered)
    if n < 3:
        return {s: "train" for s in ordered}
    n_val = max(1, round(n * SPLIT_FRACTIONS[1][1]))
    n_test = max(1, round(n * SPLIT_FRACTIONS[2][1]))
    splits = {}
    for i, s in enumerate(ordered):
        splits[s] = "test" if i < n_test else "val" if i < n_test + n_val else "train"
    return splits


def ingest(zips_dir: Path, out_dir: Path, min_rms: float, seed: int, force: bool):
    """Returns (clips, rejected, speakers, splits). Synthetic speakers (meta.synthetic) are always 'train'."""
    clips, rejected, speakers, seen_hashes = [], [], {}, {}
    zip_paths = sorted(Path(zips_dir).glob("*.zip"))
    if not zip_paths:
        raise SystemExit(f"no .zip files in {zips_dir}")

    for zp in zip_paths:
        try:
            archive = zipfile.ZipFile(zp)
            bad = archive.testzip()
            if bad:
                raise zipfile.BadZipFile(f"corrupt member {bad}")
            meta = json.loads(archive.read("meta.json"))
        except (zipfile.BadZipFile, KeyError, ValueError) as exc:
            rejected.append((zp.name, "", f"unreadable zip or missing meta.json ({exc})"))
            continue
        speaker = str(meta.get("speaker_id", "")).upper()
        if not SPEAKER_RE.match(speaker):
            rejected.append((zp.name, "", f"bad speaker_id {speaker!r}"))
            continue
        if speaker in speakers and not force:
            rejected.append((zp.name, "", f"speaker {speaker} already ingested from {speakers[speaker]['zip']} (use --force to merge)"))
            continue
        synthetic = bool(meta.get("synthetic"))
        # where the voice comes from: our own recordings, TTS, or a public dataset (both of the latter: train-only)
        source = "synthetic" if synthetic else ("public" if meta.get("source") == "public" else "recorded")
        train_only = source != "recorded"
        info = {m["file"]: m for m in meta.get("clips", []) if isinstance(m, dict) and "file" in m}
        speakers.setdefault(speaker, {"zip": zp.name, "env": meta.get("env", ""), "distance": meta.get("distance", ""),
                                      "accent": meta.get("accent", ""), "synthetic": synthetic, "source": source,
                                      "train_only": train_only})

        # pass 1: validate each clip and measure its level
        candidates = []
        for name in sorted(n for n in archive.namelist() if n.endswith(".wav")):
            m = FILE_RE.match(name)
            if not m:
                rejected.append((zp.name, name, "file name must look like yes_001.wav"))
                continue
            cls = m.group(1)
            kind = (info.get(name) or {}).get("kind") or ("word" if cls == "other" else cls)
            data = archive.read(name)
            try:
                level = check_clip(data, cls, kind, min_rms)
            except Rejected as exc:
                rejected.append((zp.name, name, str(exc)))
                continue
            candidates.append({"name": name, "cls": cls, "kind": kind, "data": data, "rms": level})

        # pass 2: a "silence" take must be clearly quieter than this speaker's own speech (a talking background,
        # or someone answering instead of staying silent, would teach the model that speech is 'other')
        speech = [c["rms"] for c in candidates if c["cls"] in ("yes", "no")]
        if speech and not train_only:
            median = sorted(speech)[len(speech) // 2]
            for c in list(candidates):
                if c["kind"] == "silence" and c["rms"] > SILENCE_MAX_RATIO * median:
                    candidates.remove(c)
                    rejected.append((zp.name, c["name"], f"not silent (rms {c['rms']:.3f} > {SILENCE_MAX_RATIO} x speech median {median:.3f})"))

        for c in candidates:
            digest = hashlib.sha1(c["data"]).hexdigest()
            if digest in seen_hashes:
                rejected.append((zp.name, c["name"], f"duplicate of {seen_hashes[digest]}"))
                continue
            seen_hashes[digest] = f"{zp.name}:{c['name']}"
            rel = Path(c["cls"]) / f"{speaker}_{c['name']}"
            (out_dir / c["cls"]).mkdir(parents=True, exist_ok=True)
            (out_dir / rel).write_bytes(c["data"])
            clips.append({"path": rel.as_posix(), "class": c["cls"], "kind": c["kind"], "speaker": speaker,
                          "env": meta.get("env", ""), "distance": meta.get("distance", ""),
                          "prompt": (info.get(c["name"]) or {}).get("prompt", ""), "synthetic": int(synthetic), "source": source})

    kept_speakers = {c["speaker"] for c in clips}
    real = {s for s in kept_speakers if not speakers[s]["train_only"]}
    splits = assign_splits(real, seed)
    splits.update({s: "train" for s in kept_speakers - real})   # synthetic and public voices never reach val/test
    for c in clips:
        c["split"] = splits[c["speaker"]]
    return clips, rejected, {s: v for s, v in speakers.items() if s in kept_speakers}, splits


def write_outputs(out_dir: Path, clips, rejected, speakers, splits):
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "clips.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["path", "class", "kind", "speaker", "split", "synthetic", "source", "env", "distance", "prompt"])
        w.writeheader()
        w.writerows(sorted(clips, key=lambda c: c["path"]))
    counts = defaultdict(Counter)
    for c in clips:
        counts[c["speaker"]][c["class"]] += 1
    with open(out_dir / "speakers.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["speaker", "split", "synthetic", "source", "env", "distance", "accent", "n_yes", "n_no", "n_other"])
        for s in sorted(speakers):
            w.writerow([s, splits[s], int(speakers[s]["synthetic"]), speakers[s]["source"], speakers[s]["env"], speakers[s]["distance"], speakers[s]["accent"],
                        counts[s]["yes"], counts[s]["no"], counts[s]["other"]])
    with open(out_dir / "rejected.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["zip", "file", "reason"])
        w.writerows(rejected)


def summarize(clips, rejected, speakers, splits) -> list[str]:
    real = {s for s, v in speakers.items() if not v["train_only"]}
    synth = {s for s, v in speakers.items() if v["source"] == "synthetic"}
    public = {s for s, v in speakers.items() if v["source"] == "public"}
    lines = [f"real speakers: {len(real)}   synthetic voices: {len(synth)}   public groups: {len(public)}   "
             f"clips kept: {len(clips)}   rejected: {len(rejected)}"]
    by_split = defaultdict(Counter)
    for c in clips:
        by_split[c["split"]][c["class"]] += 1
    for name, _ in SPLIT_FRACTIONS:
        n_sp = sum(1 for s in real if splits[s] == name) + (len(synth) + len(public) if name == "train" else 0)
        cnt = by_split[name]
        lines.append(f"  {name:<5} {n_sp:>3} speakers   yes {cnt['yes']:>4}   no {cnt['no']:>4}   other {cnt['other']:>4}")
    envs = Counter(speakers[s]["env"] for s in real)
    lines.append("  real environments: " + ", ".join(f"{k or '?'}={v}" for k, v in sorted(envs.items())))
    warnings = []
    if len(real) < MIN_SPEAKERS_WARNING:
        warnings.append(f"only {len(real)} real speakers (aim for {MIN_SPEAKERS_WARNING}+): the test result will be unreliable")
    if len(real) < 3:
        warnings.append("fewer than 3 real speakers: everything real is in 'train', there is NO held-out test")
    real_total = Counter(c["class"] for c in clips if c["speaker"] in real)
    for cls in ("yes", "no"):
        if real_total[cls] < 200:
            warnings.append(f"only {real_total[cls]} real '{cls}' clips (aim for 250+)")
    all_total = Counter(c["class"] for c in clips)
    if all_total["other"] and all_total["other"] < 2 * max(all_total["yes"], all_total["no"], 1) * 0.5:
        warnings.append("few 'other' clips: add noise/silence/other words so silence is never read as yes/no")
    if not any(speakers[s]["env"] in ("car", "street", "noisy") for s in real):
        warnings.append("no noisy real recordings (car/street/noisy): real accidents are noisy")
    train_ys = sum(1 for c in clips if c["split"] == "train" and c["class"] in ("yes", "no"))
    synth_ys = sum(1 for c in clips if c["synthetic"] and c["class"] in ("yes", "no"))
    if train_ys and synth_ys / train_ys > 0.5:
        warnings.append(f"synthetic clips are {100 * synth_ys // train_ys}% of yes/no training data: real voices should dominate (cap them in training)")
    if rejected:
        reasons = Counter(r[2].split(" (")[0].split(",")[0][:40] for r in rejected)
        warnings.append("rejections: " + "; ".join(f"{k} x{v}" for k, v in reasons.most_common(4)) + "  (see rejected.csv)")
    return lines + [f"WARNING: {w}" for w in warnings]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("zips_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--seed", type=int, default=7, help="split seed (keep it fixed once you start training)")
    ap.add_argument("--min-rms", type=float, default=0.002, help="reject yes/no/other-word clips quieter than this")
    ap.add_argument("--force", action="store_true", help="allow a second zip from the same speaker id")
    args = ap.parse_args(argv)
    out_dir = Path(args.out_dir)
    clips, rejected, speakers, splits = ingest(Path(args.zips_dir), out_dir, args.min_rms, args.seed, args.force)
    write_outputs(out_dir, clips, rejected, speakers, splits)
    print("\n".join(summarize(clips, rejected, speakers, splits)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
