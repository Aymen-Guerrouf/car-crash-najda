"""Train / evaluate the yes-no-other model.

    python -m kws.train DATASET_DIR --mode loso   --out runs/loso      # leave one REAL speaker out, repeat (7 speakers)
    python -m kws.train DATASET_DIR --mode split  --out runs/split     # train split -> validate -> test split
    python -m kws.train DATASET_DIR --mode final  --out runs/final     # train on ALL real + synthetic, then export

Runs on CPU in minutes (tiny model). On Kaggle the same command works unchanged.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from . import features as F
from .data import AugmentedDataset, load_dataset
from .evaluate import meets_gates, meets_helper_gates, summarize
from .model import KWSNet, count_macs, count_parameters


def _fit(model, clips, epochs, samples_per_epoch, batch, lr, seed, workers, log, p_real, voices, weight_decay, tag="", p_public=0.0):
    ds = AugmentedDataset(clips, samples_per_epoch, seed=seed, p_real=p_real, voices=voices, p_public=p_public)
    loader = DataLoader(ds, batch_size=batch, shuffle=False, num_workers=workers, persistent_workers=workers > 0)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=epochs * len(loader), pct_start=0.15)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    for epoch in range(epochs):
        ds.set_epoch(epoch)
        model.train()
        running, seen, correct = 0.0, 0, 0
        for x, y in loader:
            opt.zero_grad()
            out = model(x)
            loss = loss_fn(out, y)
            loss.backward()
            opt.step()
            sched.step()
            running += float(loss.detach()) * len(y); seen += len(y); correct += int((out.argmax(1) == y).sum())
        if epoch == 0 or (epoch + 1) % 5 == 0 or epoch == epochs - 1:
            log(f"    {tag}epoch {epoch + 1:>3}/{epochs}  loss {running / seen:.3f}  train-acc {correct / seen:.3f}")


def train_model(train_clips, epochs=20, samples_per_epoch=1600, batch=64, lr=3e-3, seed=0, workers=0, log=print,
                p_real=0.6, voices=False, dropout=0.1, weight_decay=1e-2, pretrain_epochs=0, p_public=0.0):
    """pretrain_epochs > 0: first learn on the SYNTHETIC clips only, then fine-tune on the REAL clips only
    (a different recipe from mixing them in every batch)."""
    torch.manual_seed(seed)
    np.random.seed(seed)
    model = KWSNet(dropout=dropout)
    real = [c for c in train_clips if not c.synthetic]
    synth = [c for c in train_clips if c.synthetic]
    if pretrain_epochs and synth and real:
        _fit(model, synth, pretrain_epochs, samples_per_epoch, batch, lr, seed, workers, log, 0.0, False, weight_decay, "pretrain ")
        _fit(model, real, epochs, samples_per_epoch, batch, lr * 0.5, seed + 1, workers, log, 1.0, voices, weight_decay, "finetune ")
    else:
        _fit(model, train_clips, epochs, samples_per_epoch, batch, lr, seed, workers, log, p_real, voices, weight_decay, p_public=p_public)
    return model


@torch.no_grad()
def predict(model, clips, noise_snr_db=None, seed=123):
    """Class probabilities [N,3] for un-augmented clips; optionally mixed with colored noise at a fixed SNR."""
    from . import augment

    model.eval()
    rng = np.random.default_rng(seed)
    feats = []
    for c in clips:
        x = F.fix_length(c.x)
        if noise_snr_db is not None:
            x = augment.mix_at_snr(x, augment.colored_noise(len(x), rng), noise_snr_db)
        feats.append(F.features(x))
    logits = model(torch.from_numpy(np.stack(feats))[:, None])
    return torch.softmax(logits, dim=1).numpy()


def evaluate_clips(model, clips):
    labels, kinds = np.array([c.y for c in clips]), [c.kind for c in clips]
    out = {"clean": summarize(predict(model, clips), labels, kinds)}
    out["noisy_10dB"] = summarize(predict(model, clips, noise_snr_db=10), labels, kinds)
    return out


def _plain(o):
    """json fallback: numpy scalars -> python (a report must never be lost at the end of a long run)."""
    if isinstance(o, np.generic):
        return o.item()
    raise TypeError(f"not serialisable: {type(o)}")


def fmt(m):
    f = lambda v: "  n/a" if v is None else f"{100 * v:5.1f}%"  # noqa: E731
    return (f"precision {f(m['yes_no_precision'])}  coverage yes {f(m['yes_recall'])} no {f(m['no_recall'])}  "
            f"false-accept {f(m['false_accept'])}  acc {f(m['accuracy_ungated'])}  (n {m['n']['yes']}/{m['n']['no']}/{m['n']['other']})")


def train_kwargs(args):
    return dict(seed=args.seed, workers=args.workers, p_real=getattr(args, "p_real", 0.6), voices=getattr(args, "voices", False),
                dropout=getattr(args, "dropout", 0.1), pretrain_epochs=getattr(args, "pretrain", 0),
                p_public=getattr(args, "p_public", 0.0))


def run_loso(clips, args, log=print):
    real = sorted({c.speaker for c in clips if not c.train_only})
    if getattr(args, "folds", None):
        real = [s for s in real if s in args.folds]
    folds = {}
    all_probs, all_labels, all_kinds, all_noisy, all_speakers = [], [], [], [], []
    for s in real:
        t0 = time.time()
        train = [c for c in clips if c.speaker != s]
        held = [c for c in clips if c.speaker == s]
        log(f"[{s}] train on {len(train)} clips ({sum(1 for c in train if not c.synthetic)} real), test on {len(held)}")
        model = train_model(train, args.epochs, args.samples, log=log, **train_kwargs(args))
        folds[s] = evaluate_clips(model, held)
        log(f"[{s}] clean: {fmt(folds[s]['clean'])}   ({time.time() - t0:.0f}s)")
        log(f"[{s}] noisy: {fmt(folds[s]['noisy_10dB'])}")
        all_probs.append(predict(model, held)); all_noisy.append(predict(model, held, noise_snr_db=10))
        all_labels += [c.y for c in held]; all_kinds += [c.kind for c in held]; all_speakers += [c.speaker for c in held]
    arrays = {"probs_clean": np.concatenate(all_probs), "probs_noisy": np.concatenate(all_noisy), "labels": np.array(all_labels),
              "kinds": np.array(all_kinds), "speakers": np.array(all_speakers)}
    pooled = {"clean": summarize(np.concatenate(all_probs), np.array(all_labels), all_kinds),
              "noisy_10dB": summarize(np.concatenate(all_noisy), np.array(all_labels), all_kinds)}
    return {"_arrays": arrays, "mode": "loso", "folds": folds, "pooled": pooled, "gates_clean": meets_gates(pooled["clean"]), "gates_noisy": meets_gates(pooled["noisy_10dB"]),
            "helper_gates_clean": meets_helper_gates(pooled["clean"]), "helper_gates_noisy": meets_helper_gates(pooled["noisy_10dB"])}


def run_split(clips, args, log=print):
    train = [c for c in clips if c.split == "train"]
    test = [c for c in clips if c.split == "test" and not c.train_only]
    val = [c for c in clips if c.split == "val" and not c.train_only]
    log(f"train {len(train)} clips, val {len(val)}, test {len(test)}")
    model = train_model(train, args.epochs, args.samples, log=log, **train_kwargs(args))
    out = {"mode": "split", "val": evaluate_clips(model, val) if val else None, "test": evaluate_clips(model, test) if test else None}
    return out, model


def run_final(clips, args, log=print):
    log(f"final model: {len(clips)} clips ({sum(1 for c in clips if not c.synthetic)} real)")
    return train_model(clips, args.epochs, args.samples, log=log, **train_kwargs(args))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dataset")
    ap.add_argument("--mode", choices=["loso", "split", "final"], default="loso")
    ap.add_argument("--out", default="runs/out")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--samples", type=int, default=1600, help="augmented samples per epoch")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--p-real", type=float, default=0.6, help="share of real clips in each batch (rest synthetic)")
    ap.add_argument("--voices", action="store_true", help="virtual speakers: random pitch/vocal-tract shifts of real clips")
    ap.add_argument("--dropout", type=float, default=0.1)
    ap.add_argument("--pretrain", type=int, default=0, help="epochs on synthetic only, then --epochs fine-tuning on real only")
    ap.add_argument("--p-public", type=float, default=0.0, help="chance to draw a public-dataset clip for a class that has them")
    ap.add_argument("--folds", help="comma-separated real speaker ids for loso (default: all)")
    args = ap.parse_args(argv)
    args.p_real = args.p_real
    args.folds = args.folds.split(",") if args.folds else None
    torch.set_num_threads(max(1, args.workers))
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    clips = load_dataset(args.dataset)
    print(f"{len(clips)} clips, {len({c.speaker for c in clips if not c.train_only})} real speakers; "
          f"model {count_parameters(KWSNet()):,} params, {count_macs():,} MACs")
    model = None
    if args.mode == "loso":
        report = run_loso(clips, args)
    elif args.mode == "split":
        report, model = run_split(clips, args)
    else:
        model = run_final(clips, args)
        report = {"mode": "final"}
    if model is not None:
        torch.save(model.state_dict(), out / "model.pt")
    arrays = report.pop("_arrays", None)
    if arrays:
        np.savez(out / "loso_probs.npz", **arrays)         # lets kws.sweep tune the confidence gate without retraining
    (out / "report.json").write_text(json.dumps(report, indent=1, default=_plain))
    if args.mode == "loso":
        print("\n== pooled over held-out real speakers (gated) ==")
        for k in ("clean", "noisy_10dB"):
            print(f"{k:<11} {fmt(report['pooled'][k])}")
        for k in ("helper_gates_clean", "helper_gates_noisy", "gates_clean", "gates_noisy"):
            print(k, "PASS" if report[k]["passed"] else "NOT MET", {c: ("ok" if v else "FAIL") for c, v in report[k]["checks"].items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
