"""One paid spin, fully resolved: base win, recipe progress and rewards (instant, free spin x2, Chef's Rush).
Shared by the demo exporter and the server, so both produce identical outcomes for identical random numbers.
Orders are NOT resolved here: the spin only says `orders_triggered`; the player's choice resolves them later.
"""
from .engine import evaluate_spin, random_stops
from .model import Model
from .recipe import Recipe, RecipeState
from .rounds import play_rush_round
from .truck import draw_prize


def line_wins(model: Model, res: dict, scale: float = 1.0) -> list:
    n = model.n_lines
    return [{"line": w["line"], "symbol": w["symbol"], "count": w["count"], "x": w["pay_line_bets"] / n * scale,
             "cells": [list(c) for c in w["cells"]]} for w in res["wins"]]


def resolve_paid_spin(model: Model, recipe: Recipe, state: RecipeState, py_rng, np_rng) -> dict:
    """py_rng: random.Random-like (reel stops); np_rng: numpy Generator (bonus rounds).
    Mutates `state` (recipe progress of this player and bet). Win values are x TOTAL bet."""
    n_lines = model.n_lines
    res = evaluate_spin(model, random_stops(model, py_rng))
    spin = {"stops": [int(s) for s in res["stops"]], "grid": res["grid"], "wins": line_wins(model, res),
            "scatters": res["scatters"], "ai": res["ai"]}
    win_x = res["total_line_bets"] / n_lines
    orders_triggered = res["scatters"] >= 3
    queue = recipe.apply(state, res["win_counts"], res["ai"])
    rewards = []
    bonus_x = 0.0
    while queue:
        r = queue.pop(0)
        item = {"recipe_in_cycle": r["recipe_in_cycle"], "instant_x": r.get("instant_payout_x_total_bet", 0)}
        win_x += item["instant_x"]
        mult = r.get("bonus_free_spin_multiplier")
        if mult:
            fs = evaluate_spin(model, random_stops(model, py_rng))
            item["free_spin"] = {"stops": [int(s) for s in fs["stops"]], "grid": fs["grid"], "wins": line_wins(model, fs, mult), "multiplier": mult,
                                 "win_x": fs["total_line_bets"] / n_lines * mult}
            bonus_x += item["free_spin"]["win_x"]
            ftrucks = int(fs["trucks"])
            if ftrucks >= int(model.config["truck_pick"]["trigger_trucks"]):        # Truck Pick works in the free spin too (flat prize, not x multiplier)
                fprize = draw_prize(model, ftrucks, py_rng)
                item["free_spin"]["truck"] = {"count": ftrucks, "prize_x": fprize, "decoys_x": [draw_prize(model, ftrucks, py_rng) for _ in range(2)]}
                bonus_x += fprize
            orders_triggered = orders_triggered or fs["scatters"] >= 3
            queue.extend(recipe.apply(state, fs["win_counts"], fs["ai"]))
        if r.get("trigger") == "chefs_rush":
            item["rush"] = play_rush_round(model, np_rng)
            bonus_x += item["rush"]["total_x"]
        rewards.append(item)
    trucks = int(res["trucks"])
    if trucks >= int(model.config["truck_pick"]["trigger_trucks"]):          # Truck Pick: prize drawn now, the player's pick is cosmetic
        prize = draw_prize(model, trucks, py_rng)
        decoys = [draw_prize(model, trucks, py_rng) for _ in range(2)]
        spin["truck"] = {"count": trucks, "prize_x": prize, "decoys_x": decoys}
        bonus_x += prize
    spin["win_x"] = win_x
    spin["bonus_x"] = bonus_x                 # free spin + Rush, credited after the animations
    spin["recipe"] = list(state.progress)
    spin["rewards"] = rewards
    spin["orders_triggered"] = orders_triggered
    return spin


def order_meta(model: Model) -> list:
    return [{"id": o["id"], "name": o["id"].upper(), "name_ru": o["name_ru"], "risk": o["risk"],
             "floor_x": o["floor_x"], "ceiling_x": o["ceiling_x"], "fail_x": o["fail_x"],
             "success_probability": o["success_probability"], "spins": o["spins"],
             "start_multiplier": 1.0 + 0.5 * o["start_n"], "dinner": o.get("dinner"), "mechanic": o.get("mechanic")}
            for o in model.config["orders"]["options"]]


def game_meta(model: Model) -> dict:
    """Everything the client needs to draw the game AND to disclose its rules (paytable, RTP, odds)."""
    cfg = model.config
    scale = float(cfg.get("active_lines_scale", 1.0))
    rush = cfg["chefs_rush"]
    return {
        "rtp_percent": float(cfg.get("active_profile") or cfg["rtp_default_percent"]),
        "paytable_x_total_bet": {sid: [round(v * scale, 4) for v in pays]
                                 for sid, pays in cfg["paytable_x_total_bet"].items() if not sid.startswith("_")},
        "bonus_buy_price_x": cfg["bonus_buy"]["price_x_total_bet"],
        "profiles": [{"id": p, "rtp": float(p), "rush_spins": cfg["profiles"][p]["rush_spins"]}
                     for p in sorted(cfg.get("profiles", {}))],
        "recipe_rewards": cfg["recipe"]["cycle_rewards"],
        "scatter_trigger": cfg["orders"]["trigger_scatters"],
        "rush_rules": {"wild_x": rush["wild_min_multiplier"], "n_max": rush["n_max"], "ai_converts": rush["ai_converts_random_cells_to_wild"],
                       "extra_spin_ai": rush["ai_count_for_extra_spin"], "max_spins": rush["max_total_spins"]},
        "profile": cfg.get("active_profile"),
        "reels": 5,
        "rows": model.rows,
        "n_lines": model.total_lines,
        "min_lines": 1,
        "symbols": list(model.symbols),
        "stages": [{"id": s["id"], "name": s["id"].upper(), "need": s["need_base"]} for s in cfg["recipe"]["stages"]],
        "orders": order_meta(model),
        "truck_pick": {"trigger": cfg["truck_pick"]["trigger_trucks"],
                       "prizes": {k: t["values"] for k, t in cfg["truck_pick"]["tables"].items()}},
        "rush": {"spins": cfg["chefs_rush"]["base_spins"], "recipe_points": 5},
        "max_win_x": cfg["win_cap_x_total_bet"],
    }
