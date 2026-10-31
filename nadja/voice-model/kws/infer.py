"""Reference inference of the exported model in plain numpy (no torch). The TypeScript port must produce the same
logits (within 1e-2) from the same features. Weights are int8 with per-output-channel scales; activations are float32.
"""

import base64
import json

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def load_model(path_or_dict) -> dict:
    spec = path_or_dict if isinstance(path_or_dict, dict) else json.loads(open(path_or_dict, encoding="utf-8").read())
    layers = []
    for layer in spec["layers"]:
        layer = dict(layer)
        if layer["type"] in ("conv", "dense"):
            q = np.frombuffer(base64.b64decode(layer["w"]), dtype=np.int8).astype(np.float32)
            scale = np.asarray(layer["scale"], dtype=np.float32)
            shape = (layer["out"], layer["in"] // layer.get("groups", 1), layer["k"], layer["k"]) if layer["type"] == "conv" else (layer["out"], layer["in"])
            layer["weights"] = q.reshape(shape) * scale.reshape((-1,) + (1,) * (len(shape) - 1))
            layer["bias_f"] = np.asarray(layer["bias"], dtype=np.float32)
        layers.append(layer)
    return {"spec": spec, "layers": layers, "classes": spec["classes"]}


def conv2d(x, w, b, stride, pad, groups):
    """x [C,H,W], w [O, C/groups, k, k] -> [O, H', W'] with the same padding/stride rule as torch (zero padding)."""
    k = w.shape[-1]
    xp = np.pad(x, ((0, 0), (pad, pad), (pad, pad)))
    win = sliding_window_view(xp, (k, k), axis=(1, 2))[:, ::stride[0], ::stride[1]]      # [C, H', W', k, k]
    if groups == 1:
        out = np.einsum("chwij,ocij->ohw", win, w, optimize=True)
    elif groups == x.shape[0] and w.shape[1] == 1:                                         # depthwise
        out = np.einsum("chwij,cij->chw", win, w[:, 0], optimize=True)
    else:
        raise ValueError("unsupported groups")
    return (out + b[:, None, None]).astype(np.float32)


def forward(model, feat) -> np.ndarray:
    """feat [40, 98] float32 (normalised log-mel) -> logits [n_classes]."""
    x = np.asarray(feat, dtype=np.float32)[None]
    for layer in model["layers"]:
        if layer["type"] == "conv":
            x = conv2d(x, layer["weights"], layer["bias_f"], layer["stride"], layer["pad"], layer.get("groups", 1))
            if layer.get("relu"):
                x = np.maximum(x, 0)
        elif layer["type"] == "gap":
            x = x.mean(axis=(1, 2))
        elif layer["type"] == "dense":
            x = layer["weights"] @ x + layer["bias_f"]
    return x.astype(np.float32)


def softmax(z) -> np.ndarray:
    e = np.exp(z - np.max(z))
    return e / e.sum()


def decide(probs, p_min=0.85, margin=0.30):
    """The on-device output gate: a class index only if confident, else None (no suggestion)."""
    order = np.argsort(probs)[::-1]
    top, second = probs[order[0]], probs[order[1]]
    return int(order[0]) if top >= p_min and top - second >= margin else None
