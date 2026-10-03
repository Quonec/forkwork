"""Exact (enumerated) math for the base game, used to cross-check the simulator.

Line RTP: every stop is equally likely and reels are independent, so on any payline the symbol
on reel r is distributed exactly like reel r's symbol frequencies. Enumerating all symbol
combinations (<= 11^5) gives the exact expected pay of one line in line bets, which equals
the base-game line RTP (each line costs one line bet).
"""
from itertools import product

import numpy as np

from .engine import evaluate_line
from .model import Model


def symbol_probs(model: Model) -> list:
    out = []
    for strip in model.strips:
        counts = np.bincount(strip, minlength=len(model.symbols))
        out.append(counts / len(strip))
    return out


def exact_line_rtp(model: Model) -> dict:
    probs = symbol_probs(model)
    nonzero = [[(s, p) for s, p in enumerate(reel) if p > 0] for reel in probs]
    total = 0.0
    by_symbol = {s: 0.0 for s in model.symbols}
    for combo in product(*nonzero):
        p = 1.0
        for _, q in combo:
            p *= q
        sym, _, pay = evaluate_line(model, [s for s, _ in combo])
        if pay:
            total += p * pay
            by_symbol[model.symbols[sym]] += p * pay
    return {"rtp": total, "by_symbol": {k: v for k, v in by_symbol.items() if v}}


def exact_symbol_count_dist(model: Model, symbol: int) -> np.ndarray:
    """P(exactly k copies of `symbol` visible on the whole screen), k = 0..reels*rows."""
    dist = np.array([1.0])
    for strip in model.strips:
        n = len(strip)
        per_reel = np.zeros(model.rows + 1)
        for stop in range(n):
            k = sum(1 for row in range(model.rows) if strip[(stop + row) % n] == symbol)
            per_reel[k] += 1
        dist = np.convolve(dist, per_reel / n)
    return dist
