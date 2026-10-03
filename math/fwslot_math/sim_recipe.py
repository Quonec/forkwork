"""Base game + recipe collection + cycle rewards (Chef's Rush and Orders are counted, not played yet).

Usage (from the math/ folder):
    python -m fwslot_math.sim_recipe --spins 1000000 --seed 1
    python -m fwslot_math.sim_recipe --spins 1000000 --seed 1 --session 200     # progress lost every 200 spins
    python -m fwslot_math.sim_recipe --spins 1000000 --seed 1 --report reports/recipe.json
"""
import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np

from .model import Model, load_model
from .recipe import Recipe
from .sim import spin_details


def simulate_recipe(model: Model, spins: int, seed: int, session_len: int = 0, chunk: int = 200_000) -> dict:
    """session_len > 0: recipe progress and cycle are reset every `session_len` paid spins (progress kept
    only within a session, GDD decision 3-a). 0 = one endless session (steady state)."""
    recipe = Recipe(model, "base")
    rng = np.random.Generator(np.random.PCG64(seed))
    lengths = [len(s) for s in model.strips]
    n_lines = model.n_lines
    state = recipe.new_state()

    lines_x = instant_x = free_x = 0.0
    sum_x2 = 0.0                      # per paid spin, everything paid out because of it (for sd)
    orders = rush = free_spins = 0
    rewards_seen = [0] * len(recipe.rewards)
    completed_before = points_added = points_lost = 0
    spin_no = done = 0

    def one_free_spin():
        stops = np.stack([rng.integers(0, L, size=1) for L in lengths], axis=1)
        w, sc, a, c = spin_details(model, stops)
        return float(w[0]) / n_lines, int(sc[0]), int(a[0]), c[0].tolist()

    while done < spins:
        n = min(chunk, spins - done)
        stops = np.stack([rng.integers(0, L, size=n) for L in lengths], axis=1)
        w, sc, ai, cnt = spin_details(model, stops)
        win_x = (w / n_lines).tolist()
        sc, ai, cnt = sc.tolist(), ai.tolist(), cnt.tolist()
        for i in range(n):
            if session_len and spin_no % session_len == 0:
                completed_before += state.completed
                points_added += state.points_added
                points_lost += state.points_lost
                state = recipe.new_state()
            spin_no += 1
            spin_total = win_x[i]
            lines_x += win_x[i]
            if sc[i] >= 3:
                orders += 1
            queue = recipe.apply(state, cnt[i], ai[i])
            while queue:
                reward = queue.pop(0)
                rewards_seen[reward["recipe_in_cycle"] - 1] += 1
                pay = reward.get("instant_payout_x_total_bet", 0)
                instant_x += pay
                spin_total += pay
                if reward.get("trigger") == "chefs_rush":
                    rush += 1
                mult = reward.get("bonus_free_spin_multiplier")
                if mult:
                    free_spins += 1
                    fx, fsc, fai, fcnt = one_free_spin()
                    free_x += fx * mult
                    spin_total += fx * mult
                    if fsc >= 3:
                        orders += 1
                    queue.extend(recipe.apply(state, fcnt, fai))
            sum_x2 += spin_total * spin_total
        done += n

    completed = completed_before + state.completed
    points_added += state.points_added
    points_lost += state.points_lost
    rtp = (lines_x + instant_x + free_x) / spins
    return {
        "spins": spins,
        "seed": seed,
        "session_len": session_len,
        "rtp_lines": lines_x / spins,
        "rtp_recipe_instant": instant_x / spins,
        "rtp_recipe_free_spin": free_x / spins,
        "rtp_total_without_bonuses": rtp,
        "sd_x_total_bet": (sum_x2 / spins - rtp ** 2) ** 0.5,
        "recipes_completed": completed,
        "spins_per_recipe": spins / completed if completed else None,
        "rewards_by_cycle_position": rewards_seen,
        "chefs_rush_triggers": rush,
        "spins_per_chefs_rush": spins / rush if rush else None,
        "orders_triggers": orders,
        "spins_per_orders": spins / orders if orders else None,
        "free_spins_played": free_spins,
        "points_per_spin": points_added / spins,
        "points_lost_share": points_lost / max(points_added + points_lost, 1),
    }


def budget(res: dict, target_rtp: float, orders_ev_x: float) -> dict:
    """What is left for Chef's Rush once lines, recipe and Orders (at the agreed EV) are paid."""
    orders_rtp = orders_ev_x / res["spins_per_orders"] if res["spins_per_orders"] else 0.0
    left = target_rtp - res["rtp_total_without_bonuses"] - orders_rtp
    return {
        "target_rtp": target_rtp,
        "orders_ev_x": orders_ev_x,
        "orders_rtp": orders_rtp,
        "left_for_rush_rtp": left,
        "rush_avg_win_needed_x": left * res["spins_per_chefs_rush"] if res["spins_per_chefs_rush"] else None,
    }


def print_result(res: dict, b: dict) -> None:
    s = res["session_len"] or "endless"
    print(f"spins {res['spins']:,}  seed {res['seed']}  session {s}")
    print(f"RTP lines {res['rtp_lines']:.3%}  + recipe instant {res['rtp_recipe_instant']:.3%}  "
          f"+ recipe free spin {res['rtp_recipe_free_spin']:.3%}  = {res['rtp_total_without_bonuses']:.3%}  "
          f"(sd {res['sd_x_total_bet']:.2f}x)")
    print(f"recipe: 1 per {res['spins_per_recipe']:.1f} spins  points/spin {res['points_per_spin']:.3f}  "
          f"points lost {res['points_lost_share']:.1%}  cycle positions {res['rewards_by_cycle_position']}")
    print(f"Chef's Rush 1 in {res['spins_per_chefs_rush']:.1f}   Orders 1 in {res['spins_per_orders']:.1f}   "
          f"free spins played {res['free_spins_played']:,}")
    print(f"budget @ {b['target_rtp']:.0%}: Orders (EV {b['orders_ev_x']}x) {b['orders_rtp']:.2%}, "
          f"left for Rush {b['left_for_rush_rtp']:.2%} -> Rush must average {b['rush_avg_win_needed_x']:.1f}x")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--spins", type=int, default=1_000_000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--session", type=int, default=0, help="reset progress every N spins (0 = never)")
    ap.add_argument("--target", type=float, default=0.88)
    ap.add_argument("--orders-ev", type=float, default=15.0)
    ap.add_argument("--report", type=Path)
    args = ap.parse_args()
    res = simulate_recipe(load_model(), args.spins, args.seed, args.session)
    b = budget(res, args.target, args.orders_ev)
    print_result(res, b)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        rep = {"generated": datetime.now().isoformat(timespec="seconds"), "result": res, "budget": b}
        args.report.write_text(json.dumps(rep, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
