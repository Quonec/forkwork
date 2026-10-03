"""Vectorized base-game simulator (no bonuses yet).

Usage (from the math/ folder):
    python -m fwslot_math.sim --spins 1000000 --seed 1
    python -m fwslot_math.sim --spins 1000000 --seed 1 --report reports/base.json
"""
import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import numpy as np

from .exact import exact_line_rtp, exact_symbol_count_dist
from .model import REELS, Model, load_model

# win buckets in x TOTAL bet; a spin falls in the first bucket whose upper bound it does not exceed
BUCKETS = [("0", 0.0), ("<=1x", 1.0), ("1-5x", 5.0), ("5-20x", 20.0), ("20-100x", 100.0), (">100x", float("inf"))]


def line_pays_runs(model: Model, syms: np.ndarray) -> tuple:
    """syms: (n, 5) symbol indices on one payline -> (pay in line bets, paid run length). Same rules as
    engine.evaluate_line, including the tie-break: leading wilds win only if they pay strictly more."""
    pt, wild = model.paytable, model.wild
    is_wild = syms == wild
    w = np.cumprod(is_wild, axis=1).sum(axis=1)
    target = syms[np.arange(len(syms)), np.minimum(w, REELS - 1)]
    match = (syms == target[:, None]) | is_wild
    run = np.cumprod(match, axis=1).sum(axis=1)
    pay_wild, pay_sym = pt[wild, w], pt[target, run]
    use_sym = pay_sym > pay_wild
    pay = np.where(use_sym, pay_sym, pay_wild)
    return pay, np.where(pay > 0, np.where(use_sym, run, w), 0)


def line_pays(model: Model, syms: np.ndarray) -> np.ndarray:
    return line_pays_runs(model, syms)[0]


def screens(model: Model, stops: np.ndarray) -> np.ndarray:
    """stops (n, 5) -> grid (n, 5, rows) of symbol indices."""
    n = len(stops)
    grid = np.empty((n, REELS, model.rows), dtype=np.int64)
    for r, strip in enumerate(model.strips):
        for row in range(model.rows):
            grid[:, r, row] = strip[(stops[:, r] + row) % len(strip)]
    return grid


def spin_details(model: Model, stops: np.ndarray, with_counts: bool = True) -> tuple:
    """-> (win in line bets, scatters, ai, win_counts (n, n_symbols) or None).
    win_counts = winning cells per symbol, each cell counted once even if on several winning lines."""
    n = len(stops)
    grid = screens(model, stops)
    total = np.zeros(n)
    reel_idx = np.arange(REELS)
    mask = np.zeros(grid.shape, dtype=bool) if with_counts else None
    for line in model.lines:
        pay, run = line_pays_runs(model, grid[:, reel_idx, line])
        total += pay
        if with_counts:
            for r in range(REELS):
                mask[:, r, line[r]] |= run > r
    flat = grid.reshape(n, -1)
    counts = None
    if with_counts:
        flat_mask = mask.reshape(n, -1)
        counts = np.stack([((flat == s) & flat_mask).sum(axis=1) for s in range(len(model.symbols))], axis=1)
    return total, (flat == model.scatter).sum(axis=1), (flat == model.ai).sum(axis=1), counts


def spin_wins(model: Model, stops: np.ndarray) -> tuple:
    return spin_details(model, stops, with_counts=False)[:3]


def simulate(model: Model, spins: int, seed: int, chunk: int = 200_000) -> dict:
    rng = np.random.Generator(np.random.PCG64(seed))
    lengths = [len(s) for s in model.strips]
    n_lines = model.n_lines
    s_win = s_win2 = 0.0
    hits = trig = ai_sum = 0
    max_win = 0.0
    buckets = np.zeros(len(BUCKETS), dtype=np.int64)
    bounds = np.array([b for _, b in BUCKETS])
    done = 0
    while done < spins:
        n = min(chunk, spins - done)
        stops = np.stack([rng.integers(0, L, size=n) for L in lengths], axis=1)
        win_lb, scat, ai = spin_wins(model, stops)
        win_x = win_lb / n_lines  # x total bet
        s_win += win_x.sum()
        s_win2 += (win_x ** 2).sum()
        hits += int((win_x > 0).sum())
        trig += int((scat >= 3).sum())
        ai_sum += int(ai.sum())
        max_win = max(max_win, float(win_x.max()))
        buckets += np.bincount(np.searchsorted(bounds, win_x, side="left"), minlength=len(BUCKETS))
        done += n
    mean = s_win / spins
    sd = (s_win2 / spins - mean ** 2) ** 0.5
    return {
        "spins": spins,
        "seed": seed,
        "rtp": mean,
        "rtp_ci95": 1.96 * sd / spins ** 0.5,
        "sd_x_total_bet": sd,
        "hit_frequency": hits / spins,
        "scatter_trigger_frequency": trig / spins,
        "ai_per_spin": ai_sum / spins,
        "max_win_x": max_win,
        "buckets": {name: int(c) / spins for (name, _), c in zip(BUCKETS, buckets)},
    }


def full_report(model: Model, spins: int, seed: int) -> dict:
    t0 = time.perf_counter()
    sim = simulate(model, spins, seed)
    t_sim = time.perf_counter() - t0
    exact = exact_line_rtp(model)
    scat = exact_symbol_count_dist(model, model.scatter)
    return {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "strip_lengths": [len(s) for s in model.strips],
        "exact": {
            "line_rtp": exact["rtp"],
            "rtp_by_symbol": exact["by_symbol"],
            "scatter_trigger_frequency": float(scat[3:].sum()),
        },
        "sim": sim,
        "sim_seconds": round(t_sim, 2),
        "check": {
            "rtp_diff_vs_exact": sim["rtp"] - exact["rtp"],
            "rtp_within_ci95": bool(abs(sim["rtp"] - exact["rtp"]) <= sim["rtp_ci95"]),
        },
    }


def print_report(rep: dict) -> None:
    ex, sim = rep["exact"], rep["sim"]
    print(f"strips: {rep['strip_lengths']}  spins: {sim['spins']:,}  seed: {sim['seed']}  time: {rep['sim_seconds']} s")
    print(f"line RTP   exact {ex['line_rtp']:.4%}   sim {sim['rtp']:.4%} +/- {sim['rtp_ci95']:.4%}   "
          f"within CI95: {rep['check']['rtp_within_ci95']}")
    print(f"hit frequency {sim['hit_frequency']:.2%} (1 in {1 / sim['hit_frequency']:.2f})")
    print(f"scatter 3+   exact 1 in {1 / ex['scatter_trigger_frequency']:.1f}   "
          f"sim 1 in {1 / max(sim['scatter_trigger_frequency'], 1e-12):.1f}")
    print(f"AI per spin {sim['ai_per_spin']:.3f}   sd {sim['sd_x_total_bet']:.3f}x   max win {sim['max_win_x']:.1f}x")
    print("buckets: " + "  ".join(f"{k}: {v:.2%}" for k, v in sim["buckets"].items()))
    print("RTP by symbol: " + "  ".join(f"{k} {v:.2%}" for k, v in ex["rtp_by_symbol"].items()))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--spins", type=int, default=1_000_000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--report", type=Path, help="write JSON report here")
    args = ap.parse_args()
    rep = full_report(load_model(), args.spins, args.seed)
    print_report(rep)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
