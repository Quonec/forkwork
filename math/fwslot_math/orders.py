"""'Orders for the evening' bonus (GDD 5 / 10.6) + full RTP budget.

An order = a Chef's Rush round with its own spins and start multiplier (n0), whose result is clamped to the
order's range [floor_x, ceiling_x] (customer's ranges: the floor is topped up, reaching the ceiling completes
the order). Risk: with probability `success_probability` the order is accepted and played; otherwise the
player gets `fail_x` ("tip"). All five orders must have the SAME expected value (decision 1A): success
probabilities are solved from  p * E[clamped round] + (1 - p) * fail_x = target_ev.

Budget: RTP = base (lines + recipe rewards) + Rush-from-recipe EV / spins-per-Rush + Truck Pick on paid and recipe free spins (exact, truck.py; inside the Rush it is part of the Rush EV) + target_ev / spins-per-Orders.
target_ev is solved so that the default profile (88%) is hit exactly.

Usage (from math/):
    python -m fwslot_math.orders --tune            # choose spins / n0 per order (slow, ~3 min)
    python -m fwslot_math.orders --report reports/budget.json
"""
import argparse
import json
from datetime import datetime
from pathlib import Path

import numpy as np

from .model import Model, load_model
from .rush import RushRules, simulate_rush, summarize
from .sim_recipe import simulate_recipe
from .truck import rtp_share as truck_rtp_share


def clamp_order(wins: np.ndarray, floor_x: float, ceiling_x: float) -> np.ndarray:
    return np.clip(wins, floor_x, ceiling_x)


def order_success(model: Model, opt: dict, rounds: int, seed: int) -> np.ndarray:
    """Outcomes of ACCEPTED orders. Optional 'dinner' (Chef's Dinner, decision 1B): with probability q the order
    becomes a dinner - win x multiplier, range [floor*multiplier, dinner ceiling] - the only route to 5000x."""
    rules = RushRules(model, base_spins=opt["spins"], start_n=opt["start_n"], mechanic=opt.get("mechanic"))
    raw = simulate_rush(model, rounds, seed, rules)["wins"]
    out = clamp_order(raw, opt["floor_x"], opt["ceiling_x"])
    dinner = opt.get("dinner")
    if dinner:
        rng = np.random.Generator(np.random.PCG64(seed + 99_991))
        hit = rng.random(rounds) < dinner["probability"]
        k = dinner["multiplier"]
        out[hit] = clamp_order(raw[hit] * k, opt["floor_x"] * k, dinner["ceiling_x"])
    return out


def solve_probability(target: float, ev_success: float, fail_x: float) -> float:
    """p with p * ev_success + (1 - p) * fail_x = target. Raises if impossible (p outside 0..1)."""
    if ev_success <= fail_x:
        raise ValueError("success EV must exceed the fail payout")
    p = (target - fail_x) / (ev_success - fail_x)
    if not 0.0 < p <= 1.0:
        raise ValueError(f"no valid probability: target {target:.2f}, success EV {ev_success:.2f}, fail {fail_x} -> p {p:.3f}")
    return p


# success probability that matches the customer's risk labels (GDD 5)
RISK_P = {"low": 0.90, "medium": 0.35, "high": 0.10, "very_high": 0.05}


def tune(model: Model, target: float, rounds: int = 40_000) -> dict:
    """For each order: among (spins, n0) whose clamped EV >= target, prefer success probability close to the
    order's risk level (RISK_P), then most outcomes inside the range (least clamping)."""
    cache = {}                                   # one (spins, n0) grid per distinct mechanic
    picks = {}
    for opt in model.config["orders"]["options"]:
        mech = opt.get("mechanic")
        key = json.dumps(mech, sort_keys=True)
        if key not in cache:
            cache[key] = {}
            for spins in (3, 4, 5, 6, 7, 8, 10, 12, 15):
                for n0 in (0, 1, 2, 3, 4, 6, 8, 10, 12):
                    rules = RushRules(model, base_spins=spins, start_n=n0, mechanic=mech)
                    cache[key][(spins, n0)] = simulate_rush(model, rounds, 101, rules)["wins"]
        raw = cache[key]
        lo, hi = opt["floor_x"], opt["ceiling_x"]
        cands = []
        for (spins, n0), w in raw.items():
            ev = clamp_order(w, lo, hi).mean()
            if ev < target:
                continue
            inside = ((w >= lo) & (w <= hi)).mean()
            p = (target - opt["fail_x"]) / (ev - opt["fail_x"])
            score = inside - 4.0 * abs(p - RISK_P[opt["risk"]])
            cands.append((score, spins, n0, ev, inside, p))
        cands.sort(reverse=True)
        picks[opt["id"]] = cands[:3]
    return picks


def budget_report(model: Model, base_spins: int = 1_000_000, bonus_rounds: int = 300_000, seed: int = 1,
                  target_rtp: float = None) -> dict:
    cfg = model.config
    if target_rtp is None:
        target_rtp = float(cfg.get("active_profile", cfg["rtp_default_percent"])) / 100.0
    base = simulate_recipe(model, base_spins, seed)
    rush = simulate_rush(model, bonus_rounds, seed + 1)
    rush_ev = float(rush["wins"].mean())
    rtp_base = base["rtp_total_without_bonuses"]
    rtp_rush = rush_ev / base["spins_per_chefs_rush"]
    rtp_truck = truck_rtp_share(model) * (1.0 + base["free_spins_played"] / base["spins"])   # paid spins + the recipe free spins (Rush spins are inside the Rush EV)
    target_ev = (target_rtp - rtp_base - rtp_rush - rtp_truck) * base["spins_per_orders"]

    orders = []
    for k, opt in enumerate(cfg["orders"]["options"]):
        w = order_success(model, opt, bonus_rounds, seed + 10 + k)
        ev_s = float(w.mean())
        p = solve_probability(target_ev, ev_s, opt["fail_x"])
        inside = float(((w > opt["floor_x"]) & (w < opt["ceiling_x"])).mean())
        orders.append({
            "id": opt["id"], "spins": opt["spins"], "start_n": opt["start_n"],
            "range_x": [opt["floor_x"], opt["ceiling_x"]], "fail_x": opt["fail_x"],
            "success_ev_x": ev_s, "success_probability": p,
            "share_at_floor": float((w <= opt["floor_x"]).mean()), "share_at_ceiling": float((w >= opt["ceiling_x"]).mean()),
            "share_inside": inside, "order_ev_x": p * ev_s + (1 - p) * opt["fail_x"],
            "success": summarize(w),
        })
    rtp_orders = target_ev / base["spins_per_orders"]
    total = rtp_base + rtp_rush + rtp_truck + rtp_orders
    return {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "target_rtp": target_rtp,
        "lines_scale": cfg.get("active_lines_scale", 1.0),
        "rush_spins": RushRules(model).spins,
        "base": base,
        "rush": summarize(rush["wins"], {"avg_spins": float(rush["spins"].mean()), "avg_recipes": float(rush["recipes"].mean()),
                                         "rtp_share": rtp_rush}),
        "truck_rtp_share": rtp_truck,
        "orders_target_ev_x": target_ev,
        "orders_rtp_share": rtp_orders,
        "orders": orders,
        "rtp_total": total,
        "bonus_buy_price_x": target_ev / target_rtp,
    }


def solve_lines_scale(target_rtp: float, order_ev: float, rush_spins: int, ref: dict) -> float:
    """Line pays scale lambda so that  lambda * (lines + recipe free spin + Rush/f_rush) + recipe instant
    + order_ev / f_orders = target. Everything except recipe instant payouts and orders is linear in lambda
    (orders are fixed by the equal-EV target). ref = measurements at lambda = 1 (see measure_reference)."""
    linear = ref["lines"] + ref["recipe_free_spin"] + ref["rush_ev"][rush_spins] / ref["spins_per_rush"]
    return (target_rtp - ref["recipe_instant"] - ref.get("truck_rtp", 0.0) - order_ev / ref["spins_per_orders"]) / linear


def measure_reference(rush_spins_list, base_spins=1_000_000, bonus_rounds=300_000, seed=1) -> dict:
    """Everything solve_lines_scale needs, measured once with unscaled pays (no profile)."""
    from .exact import exact_line_rtp
    m1 = load_model(profile="none", lines_scale=1.0)
    base = simulate_recipe(m1, base_spins, seed)
    rush_ev = {}
    for s in rush_spins_list:
        rush_ev[s] = float(simulate_rush(m1, bonus_rounds, seed + 1, RushRules(m1, base_spins=s))["wins"].mean())
    return {
        "lines": exact_line_rtp(m1)["rtp"],
        "truck_rtp": truck_rtp_share(m1) * (1.0 + base["free_spins_played"] / base["spins"]),
        "recipe_instant": base["rtp_recipe_instant"],
        "recipe_free_spin": base["rtp_recipe_free_spin"],
        "spins_per_rush": base["spins_per_chefs_rush"],
        "spins_per_orders": base["spins_per_orders"],
        "rush_ev": rush_ev,
    }


def calibrate_profiles(plan: dict, order_ev: float, base_spins=1_000_000, bonus_rounds=200_000) -> dict:
    """plan: {"88": rush_spins, ...}. Returns {profile: report} with lambda solved per profile."""
    ref = measure_reference(sorted(set(plan.values())), base_spins, bonus_rounds)
    out = {"reference": ref, "profiles": {}}
    for prof, spins in plan.items():
        lam = solve_lines_scale(float(prof) / 100.0, order_ev, spins, ref)
        m = load_model(profile="none", lines_scale=lam)
        m.config["chefs_rush"]["base_spins"] = spins
        out["profiles"][prof] = budget_report(m, base_spins, bonus_rounds, seed=7, target_rtp=float(prof) / 100.0)
    return out


def print_report(r: dict) -> None:
    b = r["base"]
    print(f"BASE  lines {b['rtp_lines']:.2%} + recipe {b['rtp_recipe_instant'] + b['rtp_recipe_free_spin']:.2%} = {b['rtp_total_without_bonuses']:.2%}"
          f"   Rush 1/{b['spins_per_chefs_rush']:.1f}   Orders 1/{b['spins_per_orders']:.1f}")
    ru = r["rush"]
    print(f"RUSH  EV {ru['ev_x']:.2f}x +-{ru['ev_ci95']:.2f}  P10/P50/P90/P99 {ru['p10']:.0f}/{ru['p50']:.0f}/{ru['p90']:.0f}/{ru['p99']:.0f}"
          f"  max {ru['max_x']:.0f}  recipes {ru['avg_recipes']:.2f}  -> {ru['rtp_share']:.2%} RTP")
    print(f"TRUCK PICK  {r['truck_rtp_share']:.2%} RTP")
    print(f"ORDERS target EV {r['orders_target_ev_x']:.2f}x -> {r['orders_rtp_share']:.2%} RTP")
    for o in r["orders"]:
        s = o["success"]
        print(f"  {o['id']:7s} spins {o['spins']:2d} n0 {o['start_n']:2d} range {o['range_x'][0]:>4}-{o['range_x'][1]:<5} "
              f"success EV {o['success_ev_x']:7.2f}  p {o['success_probability']:6.1%}  fail {o['fail_x']}x  "
              f"floor {o['share_at_floor']:.0%} inside {o['share_inside']:.0%} ceiling {o['share_at_ceiling']:.0%}  EV {o['order_ev_x']:.2f}")
    print(f"TOTAL RTP {r['rtp_total']:.3%}   Bonus Buy price {r['bonus_buy_price_x']:.1f}x total bet")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tune", action="store_true")
    ap.add_argument("--target-ev", type=float, default=13.3, help="order EV used while tuning")
    ap.add_argument("--report", type=Path)
    ap.add_argument("--calibrate", type=Path, help="calibrate profiles 88/92/94/96 (Rush 7/8/9/10 spins), write JSON")
    ap.add_argument("--order-ev", type=float, default=17.0, help="equal order EV used by --calibrate")
    args = ap.parse_args()
    if args.calibrate:
        res = calibrate_profiles({"88": 7, "92": 8, "94": 9, "96": 10}, args.order_ev)
        for prof, r in res["profiles"].items():
            print(f"\n######## PROFILE {prof}%  lines scale {r['lines_scale']:.4f}  Rush spins {r['rush_spins']}")
            print_report(r)
        args.calibrate.parent.mkdir(parents=True, exist_ok=True)
        args.calibrate.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"calibration -> {args.calibrate}")
        return
    model = load_model()
    if args.tune:
        for oid, cands in tune(model, args.target_ev).items():
            print(oid, [f"spins {s} n0 {n} EV {ev:.1f} inside {ins:.0%} p {p:.1%}" for _, s, n, ev, ins, p in cands])
        return
    r = budget_report(model)
    print_report(r)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
