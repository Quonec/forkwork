"""Reference (plain Python) spin evaluation. This is the code the server runs per spin;
the vectorized simulator in sim.py is checked against it in tests."""
import secrets

from .model import REELS, Model

_system_rng = secrets.SystemRandom()


def random_stops(model: Model, rng=None) -> list:
    rng = rng or _system_rng
    return [rng.randrange(len(strip)) for strip in model.strips]


def window(model: Model, stops) -> list:
    """grid[reel][row] = symbol index visible at that cell."""
    return [
        [int(strip[(stop + row) % len(strip)]) for row in range(model.rows)]
        for strip, stop in zip(model.strips, stops)
    ]


def evaluate_line(model: Model, syms) -> tuple:
    """Left-to-right line win. Returns (symbol, run_length, pay_in_line_bets); (-1, 0, 0.0) if no win.

    Wild substitutes for pay symbols only (scatter and ai break the line).
    Leading wilds pay either as wilds or as the first real symbol - whichever pays more.
    """
    pt, wild = model.paytable, model.wild
    w = 0
    while w < REELS and syms[w] == wild:
        w += 1
    best = (wild, w, float(pt[wild, w]))
    if w < REELS:
        target = syms[w]
        n = w
        while n < REELS and syms[n] in (target, wild):
            n += 1
        pay = float(pt[target, n])
        if pay > best[2]:
            best = (target, n, pay)
    return best if best[2] > 0 else (-1, 0, 0.0)


def evaluate_spin(model: Model, stops) -> dict:
    grid = window(model, stops)
    wins = []
    win_cells = set()                       # cells of winning lines among ALL lines: the recipe does not depend on the lines switched on
    for i, line in enumerate(model.lines):
        sym, run, pay = evaluate_line(model, [grid[r][line[r]] for r in range(REELS)])
        if pay > 0:
            cells = [(r, int(line[r])) for r in range(run)]
            win_cells.update(cells)
            if i < model.n_lines:           # only the lines switched on are paid and shown
                wins.append({"line": i, "symbol": model.symbols[sym], "count": run, "pay_line_bets": pay, "cells": cells})
    win_counts = [0] * len(model.symbols)   # winning cells per symbol (each cell once) - feeds the recipe
    for r, row in win_cells:
        win_counts[grid[r][row]] += 1
    flat = [s for reel in grid for s in reel]
    return {
        "stops": list(stops),
        "grid": [[model.symbols[s] for s in reel] for reel in grid],
        "wins": wins,
        "total_line_bets": sum(w["pay_line_bets"] for w in wins),
        "win_counts": win_counts,
        "scatters": flat.count(model.scatter),
        "ai": flat.count(model.ai),
        "trucks": flat.count(model.truck),
    }
