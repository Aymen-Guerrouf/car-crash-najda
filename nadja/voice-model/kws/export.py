"""Export the trained model for the phone app: fold BatchNorm into the convolutions, quantise weights to int8
(per output channel), write `voice_model.json`, and write `voice_parity_vectors.json` so the TypeScript port can prove
it computes the same features and logits as this Python reference.

    python -m kws.export runs/final/model.pt DATASET_DIR --out export/
"""

import argparse
import base64
import io
import json
import wave
from pathlib import Path

import numpy as np
import torch

from . import features as F
from .data import CLASS_ID, CLASSES, load_dataset
from .infer import forward, load_model, softmax
from .model import BLOCKS, KWSNet

# Chosen with `python -m kws.sweep` on the 8-speaker leave-one-out run: 0.9 gave ~95% precision at ~22% coverage
# (0.85 gave 85%, and no setting reached 98%). Re-run the sweep after any retraining.
GATE_P_MIN = 0.90
GATE_MARGIN = 0.30


def fold_bn(weight: torch.Tensor, bn: torch.nn.BatchNorm2d):
    """conv(no bias) + BN -> conv with bias."""
    gamma, beta, mean, var = bn.weight.detach(), bn.bias.detach(), bn.running_mean, bn.running_var
    scale = gamma / torch.sqrt(var + bn.eps)
    return (weight.detach() * scale.reshape(-1, 1, 1, 1)).numpy(), (beta - mean * scale).numpy()


def quantise(w: np.ndarray):
    """Symmetric int8, one scale per output channel. Returns (int8 array, scales)."""
    flat = w.reshape(w.shape[0], -1)
    scale = np.maximum(np.abs(flat).max(axis=1), 1e-12) / 127.0
    q = np.clip(np.round(flat / scale[:, None]), -127, 127).astype(np.int8)
    return q.reshape(w.shape), scale.astype(np.float32)


def layer_json(kind, w, b, **extra):
    q, scale = quantise(w)
    return {"type": kind, **extra, "w": base64.b64encode(q.tobytes()).decode(), "scale": [float(s) for s in scale],
            "bias": [float(v) for v in b]}


def export_model(model: KWSNet) -> dict:
    model.eval()
    layers = []
    w, b = fold_bn(model.conv1.weight, model.bn1)
    layers.append(layer_json("conv", w, b, k=3, stride=[2, 2], pad=1, **{"in": 1, "out": 32}, groups=1, relu=True))
    for block, (cin, cout, stride) in zip(model.blocks, BLOCKS):
        w, b = fold_bn(block.dw.weight, block.bn1)
        layers.append(layer_json("conv", w, b, k=3, stride=[stride, stride], pad=1, **{"in": cin, "out": cin}, groups=cin, relu=True))
        w, b = fold_bn(block.pw.weight, block.bn2)
        layers.append(layer_json("conv", w, b, k=1, stride=[1, 1], pad=0, **{"in": cin, "out": cout}, groups=1, relu=True))
    layers.append({"type": "gap"})
    fw = model.fc.weight.detach().numpy()
    layers.append(layer_json("dense", fw, model.fc.bias.detach().numpy(), **{"in": fw.shape[1], "out": fw.shape[0]}, k=1))
    return {"version": 1, "spec": F.SPEC, "classes": CLASSES, "input": [1, F.N_MELS, F.N_FRAMES], "layers": layers,
            "gate": {"p_min": GATE_P_MIN, "margin": GATE_MARGIN}}


def wav_b64(x: np.ndarray) -> str:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(np.round(np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return base64.b64encode(buf.getvalue()).decode()


def parity_vectors(model_json: dict, clips, n=10, seed=3) -> dict:
    """n fixed clips (spread over classes and real/synthetic) with expected features and logits."""
    rng = np.random.default_rng(seed)
    runtime = load_model(model_json)
    picks = []
    for cls in range(len(CLASSES)):
        pool = [c for c in clips if c.y == cls]
        picks += [pool[i] for i in rng.choice(len(pool), size=min(len(pool), n // 3 + (cls == 0)), replace=False)]
    out = []
    for c in picks[:n]:
        pcm = np.round(np.clip(F.fix_length(c.x), -1, 1) * 32767).astype("<i2")      # exactly what the WAV carries
        x = pcm.astype(np.float32) / 32768.0
        feat = F.features(x)
        logits = forward(runtime, feat)
        out.append({"label": CLASSES[c.y], "kind": c.kind, "wav_b64": wav_b64(x), "features_sum": float(feat.sum()),
                    "features_head": [float(v) for v in feat[:2, :10].ravel()], "features_tail": [float(v) for v in feat[-2:, -10:].ravel()],
                    "logits": [float(v) for v in logits], "probs": [float(v) for v in softmax(logits)]})
    return {"note": "Python reference for the TypeScript port. Tolerances: features 1e-3, logits 1e-2.", "spec": F.SPEC,
            "classes": CLASSES, "clips": out}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("weights")
    ap.add_argument("dataset")
    ap.add_argument("--out", default="export")
    args = ap.parse_args(argv)
    model = KWSNet()
    model.load_state_dict(torch.load(args.weights, map_location="cpu"))
    spec = export_model(model)
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    (out / "voice_model.json").write_text(json.dumps(spec))
    clips = load_dataset(args.dataset)
    (out / "voice_parity_vectors.json").write_text(json.dumps(parity_vectors(spec, clips), indent=0))

    # how much did folding + int8 change the predictions? (on up to 300 clips)
    runtime = load_model(spec)
    sample = clips[:: max(1, len(clips) // 300)]
    feats = np.stack([F.features(c.x) for c in sample])
    with torch.no_grad():
        ref = torch.softmax(model(torch.from_numpy(feats)[:, None]), 1).numpy()
    q = np.stack([softmax(forward(runtime, f)) for f in feats])
    print(f"exported {len(json.dumps(spec)) // 1024} KB; int8 vs float: max prob diff {np.abs(ref - q).max():.4f}, "
          f"same top class on {(ref.argmax(1) == q.argmax(1)).mean() * 100:.1f}% of {len(sample)} clips")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
