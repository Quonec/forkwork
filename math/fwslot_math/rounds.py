"""Step-by-step bonus rounds with a full record of every spin - what the server sends to the client.
Uses the same rule functions as the vectorized simulator (rush.py), so both follow identical rules;
tests also check that the per-round EV matches the vectorized one.
"""
import numpy as np

from .engine import evaluate_line
from .model import REELS, Model
from .rush import RushRules, evaluate_rush_grid, rush_recipe_step, rush_spin_grid
from .sim import screens
from .truck import draw_prize


def _names(model: Model, grid: np.ndarray) -> list:
    return [[model.symbols[int(s)] for s in col] for col in grid]


def play_rush_round(model: Model, rng: np.random.Generator, rules: RushRules = None,
                    win_scale: float = 1.0, stop_at: float = None) -> dict:
    """One Chef's Rush round. win_scale multiplies every spin win (Chef's Dinner x10); the round ends when the
    total reaches stop_at (order ceiling) or the global cap."""
    rules = rules or RushRules(model)
    limit = min(rules.cap, stop_at) if stop_at is not None else rules.cap
    n, carry, left, played, total = rules.start_n, 0, rules.spins, 0, 0.0
    sticky = np.zeros((1, REELS * model.rows), dtype=bool) if rules.mechanic == "sticky_wilds" else None
    spins = []
    while left > 0:
        stops = np.array([[int(rng.integers(0, len(s))) for s in model.strips]])
        before = screens(model, stops)
        held = [] if sticky is None else [[int(i) // model.rows, int(i) % model.rows] for i in np.nonzero(sticky[0])[0]]
        grid, ai_arr, smult_arr = rush_spin_grid(model, rules, before.copy(), sticky, rng)
        win_lb, cells, _ = evaluate_rush_grid(model, grid, rules.wild_mult)
        ai = int(ai_arr[0])                       # AI on screen before any conversion (points, extra spin)
        smult = float(smult_arr[0])
        mult = 1.0 + 0.5 * min(n, rules.n_max)
        g = grid[0]
        held_set = {(r, row) for r, row in held}
        # [reel, row, original symbol] of every cell an AI turned into Wild this spin (the client shows the morph);
        # cells held by sticky wilds are listed in "sticky", not here
        converted = [[r, row, model.symbols[int(before[0, r, row])]] for r in range(REELS) for row in range(model.rows)
                     if before[0, r, row] != g[r, row] and (r, row) not in held_set]
        wild_reels = sorted({r for r, _, _ in converted}) if rules.mechanic == "wild_reel" else []
        if sticky is not None:
            sticky |= grid.reshape(1, -1) == model.wild
        wins = []
        for i, line in enumerate(model.lines):
            syms = [int(g[r, line[r]]) for r in range(REELS)]
            sym, run, pay = evaluate_line(model, syms)
            if pay > 0 and i < model.n_lines:
                has_wild = any(s == model.wild for s in syms[:run])
                wins.append({"line": i, "symbol": model.symbols[sym], "count": run,
                             "wild_x2": has_wild, "cells": [[r, int(line[r])] for r in range(run)],
                             "x": pay / model.n_lines * (rules.wild_mult if has_wild else 1.0) * mult * smult * win_scale})
        spin_x = float(win_lb[0]) / model.n_lines * mult * smult * win_scale
        trucks = int((before.reshape(-1) == model.truck).sum())                 # on the fresh screen, before sticky wilds and conversions
        truck = None
        if trucks >= int(model.config["truck_pick"]["trigger_trucks"]):         # Truck Pick inside the Rush: flat prize, decoys for the other vans
            prize = draw_prize(model, trucks, rng)
            truck = {"count": trucks, "prize_x": prize, "decoys_x": [draw_prize(model, trucks, rng) for _ in range(2)]}
            spin_x += prize * win_scale
        new, carry = rush_recipe_step(carry, int(cells[0]) + ai * rules.ai_points, rules.recipe_points)
        n += int(new)
        played += 1
        left -= 1
        extra = bool(ai >= rules.ai_extra and played + left < rules.max_spins)
        left += int(extra)
        total = min(total + spin_x, limit)
        spins.append({"stops": [int(s) for s in stops[0]], "grid": _names(model, g), "converted": converted, "sticky": held, "wild_reels": wild_reels,
                      "spin_multiplier": smult, "wins": wins, "multiplier": mult,
                      "spin_x": spin_x, "total_x": total, "recipes_done": int(new), "recipe_points": int(carry),
                      "recipe_need": rules.recipe_points, "extra_spin": extra, **({"truck": truck} if truck else {})})
        if total >= limit:
            break
    return {"spins": spins, "total_x": total, "start_multiplier": 1.0 + 0.5 * min(rules.start_n, rules.n_max)}


def play_order(model: Model, opt: dict, rng: np.random.Generator) -> dict:
    """Acceptance draw, optional Chef's Dinner, the Rush round, then the floor/ceiling of the order."""
    accepted = bool(rng.random() < opt["success_probability"])
    if not accepted:
        return {"id": opt["id"], "accepted": False, "dinner": False, "round": None, "final_x": float(opt["fail_x"])}
    dinner = opt.get("dinner")
    is_dinner = bool(dinner and rng.random() < dinner["probability"])
    k = dinner["multiplier"] if is_dinner else 1.0
    floor_x = opt["floor_x"] * k
    ceiling_x = dinner["ceiling_x"] if is_dinner else opt["ceiling_x"]
    rules = RushRules(model, base_spins=opt["spins"], start_n=opt["start_n"], mechanic=opt.get("mechanic"))
    rnd = play_rush_round(model, rng, rules, win_scale=k, stop_at=ceiling_x)
    final = min(max(rnd["total_x"], floor_x), ceiling_x)
    return {"id": opt["id"], "accepted": True, "dinner": is_dinner, "round": rnd,
            "floor_x": floor_x, "ceiling_x": ceiling_x, "topped_up": rnd["total_x"] < floor_x, "final_x": final}
