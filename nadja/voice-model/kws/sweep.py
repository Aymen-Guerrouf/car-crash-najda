"""Tune the on-device confidence gate from saved leave-one-speaker-out probabilities (no retraining).

    python -m kws.sweep runs/loso/loso_probs.npz [--noisy] [--min-precision 0.98]
"""

import argparse

import numpy as np

from .evaluate import YES, NO, gated_predictions, summarize

GRID_P = (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95)
GRID_MARGIN = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)


def sweep(probs, labels, kinds, p_grid=GRID_P, m_grid=GRID_MARGIN):
    """[(p_min, margin, precision, coverage_yes, coverage_no, false_accept, wrong_suggestions)]"""
    rows = []
    labels = np.asarray(labels)
    for p in p_grid:
        for m in m_grid:
            pred = gated_predictions(probs, p, m)
            yn = np.isin(pred, (YES, NO))
            correct = ((pred == labels) & yn).sum()
            n_yes, n_no = (labels == YES).sum(), (labels == NO).sum()
            oth = labels == 0
            rows.append({
                "p_min": p, "margin": m,
                "precision": float(correct / yn.sum()) if yn.sum() else None,
                "coverage_yes": float(((pred == YES) & (labels == YES)).sum() / n_yes),
                "coverage_no": float(((pred == NO) & (labels == NO)).sum() / n_no),
                "false_accept": float(np.isin(pred[oth], (YES, NO)).sum() / oth.sum()),
                "wrong_per_clip": float((yn & (pred != labels)).sum() / len(labels)),
            })
    return rows


def best(rows, min_precision):
    """Highest coverage among gates that reach `min_precision`; None if no gate does."""
    ok = [r for r in rows if r["precision"] is not None and r["precision"] >= min_precision and r["false_accept"] <= 0.01]
    return max(ok, key=lambda r: min(r["coverage_yes"], r["coverage_no"]), default=None)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("npz")
    ap.add_argument("--noisy", action="store_true")
    ap.add_argument("--min-precision", type=float, default=0.98)
    args = ap.parse_args(argv)
    d = np.load(args.npz)
    probs = d["probs_noisy" if args.noisy else "probs_clean"]
    rows = sweep(probs, d["labels"], d["kinds"])
    print(f"{'p_min':>6} {'margin':>7} {'precision':>10} {'cov yes':>8} {'cov no':>7} {'false-acc':>10} {'wrong/clip':>11}")
    for r in rows:
        if r["margin"] in (0.0, 0.3):
            pr = "n/a" if r["precision"] is None else f"{100 * r['precision']:.0f}%"
            print(f"{r['p_min']:>6} {r['margin']:>7} {pr:>10} {100 * r['coverage_yes']:>7.0f}% {100 * r['coverage_no']:>6.0f}% {100 * r['false_accept']:>9.1f}% {100 * r['wrong_per_clip']:>10.1f}%")
    b = best(rows, args.min_precision)
    print(f"\nbest gate with precision >= {args.min_precision:.0%} and false-accept <= 1%:", b or "NONE reaches it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
