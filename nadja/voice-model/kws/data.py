"""Dataset loading and the augmenting sampler (needs torch for the Dataset class)."""

import csv
import wave
from pathlib import Path

import numpy as np

from . import augment, features as F

CLASSES = ["other", "yes", "no"]
CLASS_ID = {c: i for i, c in enumerate(CLASSES)}
P_REAL = 0.6                                         # share of real-voice samples in training
CLASS_PROBS = {"other": 0.4, "yes": 0.3, "no": 0.3}


class Clip:
    __slots__ = ("x", "y", "speaker", "kind", "split", "synthetic", "path", "source")

    def __init__(self, x, y, speaker, kind, split, synthetic, path, source=None):
        self.x, self.y, self.speaker, self.kind, self.split, self.synthetic, self.path = x, y, speaker, kind, split, synthetic, path
        self.source = source or ("synthetic" if synthetic else "recorded")

    @property
    def train_only(self) -> bool:
        return self.source != "recorded"


def read_wav(path) -> np.ndarray:
    with wave.open(str(path)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0


def load_dataset(root) -> list[Clip]:
    root = Path(root)
    clips = []
    with open(root / "clips.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            clips.append(Clip(read_wav(root / r["path"]), CLASS_ID[r["class"]], r["speaker"], r["kind"], r["split"],
                              bool(int(r.get("synthetic") or 0)), r["path"], r.get("source") or None))
    return clips


GROUP = {"recorded": "real", "synthetic": "synthetic", "public": "public"}


def pools(clips):
    """Index the training clips by (real|synthetic|public, class id)."""
    out = {(g, c): [] for g in ("real", "synthetic", "public") for c in range(len(CLASSES))}
    for c in clips:
        out[(GROUP[c.source], c.y)].append(c)
    return out


def noise_banks(clips):
    ambient = [c.x for c in clips if c.source in ("recorded", "public") and c.kind in ("silence", "noise")]
    babble = [c.x for c in clips if c.y == 0 and c.kind == "word"]
    return ambient, babble


try:
    import torch
    from torch.utils.data import Dataset

    class AugmentedDataset(Dataset):
        """Endless-style sampler: each item is a freshly augmented clip, drawn with fixed real/synthetic and class
        proportions so the many synthetic clips never drown the few real ones."""

        def __init__(self, train_clips, n_samples, seed=0, augment=True, p_real=P_REAL, voices=False, p_public=0.0):
            self.pools, self.n, self.seed, self.augment, self.epoch = pools(train_clips), n_samples, seed, augment, 0
            self.p_real, self.voices, self.p_public = p_real, voices, p_public
            self.ambient, self.babble = noise_banks(train_clips)
            self.has_real = any(self.pools[("real", c)] for c in range(3))

        def __len__(self):
            return self.n

        def __getitem__(self, i):
            rng = np.random.default_rng((self.seed, self.epoch, i))
            cls = CLASS_ID[str(rng.choice(list(CLASS_PROBS), p=list(CLASS_PROBS.values())))]
            if self.p_public and self.pools[("public", cls)] and rng.random() < self.p_public:
                group = "public"                       # a public-dataset speaker (only exists for classes we imported)
            else:
                group = "real" if (self.has_real and rng.random() < self.p_real) else "synthetic"
            pool = self.pools[(group, cls)] or next(
                (self.pools[(g, cls)] for g in ("real", "public", "synthetic") if self.pools[(g, cls)]), [])
            clip = pool[int(rng.integers(len(pool)))]
            x = augment.waveform(clip.x, rng, self.ambient, self.babble, self.voices) if self.augment else F.fix_length(clip.x)
            feat = F.features(x)
            if self.augment:
                feat = augment.spec_augment(feat, rng)
            return torch.from_numpy(feat)[None], cls

        def set_epoch(self, epoch):
            self.epoch = epoch
except ImportError:  # numpy-only environments can still import the helpers above
    AugmentedDataset = None
