"""Independent re-check of a journal record (dispute tool). Everything is recomputed from what was recorded:
reel stops -> screens -> line wins -> multipliers -> recipe points -> totals -> cents. A record that was edited
afterwards (a grid cell, a win amount, a balance) fails at least one check. What it can NOT prove: that the stops
were drawn fairly (that is the RNG's job: SystemRandom / secrets) - it proves the outcome follows from the stops.
"""
import numpy as np

from fwslot_math.engine import evaluate_line, window
from fwslot_math.rush import RushRules, evaluate_rush_grid, rush_recipe_step

EPS = 1e-7


def _idx(model, grid):
    return [[model.idx(s) for s in col] for col in grid]


def _names(model, grid):
    return [[model.symbols[int(s)] for s in col] for col in grid]


def _line_wins_x(model, grid_idx, wild_x=1.0):
    """Recomputed {line: x_total_bet} for a grid (wild_x multiplies lines whose paid run contains a Wild)."""
    out = {}
    for i, line in enumerate(model.lines):
        syms = [grid_idx[r][line[r]] for r in range(5)]
        sym, run, pay = evaluate_line(model, syms)
        if pay > 0 and i < model.n_lines:
            has_wild = any(s == model.wild for s in syms[:run])
            out[i] = pay / model.n_lines * (wild_x if has_wild else 1.0)
    return out


class Report:
    def __init__(self):
        self.checks = []

    def add(self, name, ok, detail=""):
        self.checks.append({"name": name, "ok": bool(ok), "detail": detail})
        return ok

    @property
    def ok(self):
        return all(c["ok"] for c in self.checks)

    def as_dict(self):
        return {"ok": self.ok, "checks": self.checks}


def _check_screen(model, rep, label, stops, grid):
    expected = _names(model, window(model, stops))
    return rep.add(f"{label}: reel stops produce the recorded screen", expected == grid)


def _check_line_wins(model, rep, label, grid, wins, scale=1.0):
    rec = {w["line"]: w["x"] for w in wins}
    calc = {i: x * scale for i, x in _line_wins_x(model, _idx(model, grid)).items()}
    same = set(rec) == set(calc) and all(abs(rec[i] - calc[i]) < EPS for i in rec)
    return rep.add(f"{label}: line wins recomputed from the screen", same,
                   "" if same else f"recorded {sum(rec.values()):.6f}x, recomputed {sum(calc.values()):.6f}x")


def _check_truck(model, rep, tag, trucks, tp):
    """Truck Pick record of one screen: present exactly when 3+ trucks were on it, count and prizes come from the table."""
    need = int(model.config["truck_pick"]["trigger_trucks"])
    tables = model.config["truck_pick"]["tables"]
    ok = rep.add(f"{tag}: truck pick triggered exactly by {need}+ trucks on the screen", (tp is not None) == (trucks >= need))
    if tp is not None:
        table = tables[str(min(trucks, max(int(k) for k in tables)))]["values"]
        ok &= rep.add(f"{tag}: truck count matches the screen", tp["count"] == trucks)
        ok &= rep.add(f"{tag}: truck prize and decoys come from the table of that truck count",
                      all(v in table for v in [tp["prize_x"], *tp["decoys_x"]]) and len(tp["decoys_x"]) == 2)
    return ok


def verify_rush(model, rep, label, rnd, rules, win_scale=1.0, stop_at=None):
    """rnd: {"spins": [...], "total_x", "start_multiplier"} as written by rounds.play_rush_round."""
    limit = min(rules.cap, stop_at) if stop_at is not None else rules.cap
    n, carry, left, played, total = rules.start_n, 0, rules.spins, 0, 0.0
    held = set()
    ok_all = True
    for k, sp in enumerate(rnd["spins"], 1):
        tag = f"{label} spin {k}"
        pre = _names(model, window(model, sp["stops"]))
        sticky = {tuple(c) for c in sp["sticky"]}
        conv = {(c[0], c[1]): c[2] for c in sp["converted"]}
        ok_all &= rep.add(f"{tag}: held wilds are exactly the wilds of earlier spins", sticky == held)
        expect = [col[:] for col in pre]
        for r, row in sticky:
            expect[r][row] = "wild"
        ai = sum(c.count("ai") for c in expect)                      # AI counted after sticky wilds are placed
        orig_ok = all(expect[r][row] == o for (r, row), o in conv.items())
        for (r, row) in conv:
            expect[r][row] = "wild"
        ok_all &= rep.add(f"{tag}: screen follows from stops + sticky + AI conversions", expect == sp["grid"] and orig_ok)
        wild_x = rules.wild_mult
        win_lb, cells, _ = evaluate_rush_grid(model, np.array([_idx(model, sp["grid"])]), wild_x)
        mult = 1.0 + 0.5 * min(n, rules.n_max)
        smult = float(sp.get("spin_multiplier", 1.0))
        if rules.mechanic != "spin_multiplier":
            ok_all &= rep.add(f"{tag}: no spin multiplier outside the Rush Hour order", smult == 1.0)
        elif smult not in [float(v) for v in rules.spin_mult_values]:
            ok_all &= rep.add(f"{tag}: spin multiplier is one of the allowed values", False, f"x{smult}")
        spin_x = float(win_lb[0]) / model.n_lines * mult * smult * win_scale
        ok_all &= _check_truck(model, rep, tag, sum(c.count("truck") for c in pre), sp.get("truck"))
        if sp.get("truck"):
            spin_x += sp["truck"]["prize_x"] * win_scale
        ok_all &= rep.add(f"{tag}: multiplier x{mult:g} follows from recipes completed so far", abs(sp["multiplier"] - mult) < EPS)
        ok_all &= rep.add(f"{tag}: win recomputed from the screen", abs(sp["spin_x"] - spin_x) < EPS,
                          f"recorded {sp['spin_x']:.6f}x, recomputed {spin_x:.6f}x")
        new, carry = rush_recipe_step(carry, int(cells[0]) + ai * rules.ai_points, rules.recipe_points)
        ok_all &= rep.add(f"{tag}: recipes completed", int(sp["recipes_done"]) == int(new) and sp["recipe_points"] == carry)
        n += int(new)
        played += 1
        left -= 1
        extra = bool(ai >= rules.ai_extra and played + left < rules.max_spins)
        left += int(extra)
        ok_all &= rep.add(f"{tag}: extra spin rule", bool(sp["extra_spin"]) == extra)
        total = min(total + spin_x, limit)
        ok_all &= rep.add(f"{tag}: running total", abs(sp["total_x"] - total) < EPS)
        held = held | {(r, row) for r in range(5) for row in range(3) if sp["grid"][r][row] == "wild"} \
            if rules.mechanic == "sticky_wilds" else held
        if total >= limit:
            break
    finished = left <= 0 or total >= limit
    ok_all &= rep.add(f"{label}: round played to its end (spins left {max(left, 0)})", finished)
    ok_all &= rep.add(f"{label}: round total", abs(rnd["total_x"] - total) < EPS, f"recorded {rnd['total_x']:.6f}x, recomputed {total:.6f}x")
    return total


def verify_spin_record(model, rec):
    rep = Report()
    sp = rec["spin"]
    cap = float(model.config["win_cap_x_total_bet"])
    lines = int(rec.get("lines", model.total_lines))             # records from before the lines setting were played on all of them
    rep.add("lines switched on are within 1..%d and match the model used" % model.total_lines,
            1 <= lines <= model.total_lines and lines == model.n_lines)
    _check_screen(model, rep, "paid spin", sp["stops"], sp["grid"])
    _check_line_wins(model, rep, "paid spin", sp["grid"], sp["wins"])
    lines_x = sum(w["x"] for w in sp["wins"])
    instant = sum(r["instant_x"] for r in sp["rewards"])
    rep.add("paid spin: win = line wins + recipe instant payouts", abs(sp["win_x"] - (lines_x + instant)) < EPS)
    bonus = 0.0
    for r in sp["rewards"]:
        if "free_spin" in r:
            fs = r["free_spin"]
            _check_screen(model, rep, "free spin", fs["stops"], fs["grid"])
            _check_line_wins(model, rep, "free spin", fs["grid"], fs["wins"], scale=fs["multiplier"])
            rep.add("free spin: win = line wins x multiplier", abs(fs["win_x"] - sum(w["x"] for w in fs["wins"])) < EPS)
            bonus += fs["win_x"]
            _check_truck(model, rep, "free spin", sum(c.count("truck") for c in fs["grid"]), fs.get("truck"))
            if fs.get("truck"):
                bonus += fs["truck"]["prize_x"]
        if "rush" in r:
            rules = RushRules(model)
            bonus += verify_rush(model, rep, "Chef's Rush", r["rush"], rules)
    tp = sp.get("truck")
    _check_truck(model, rep, "paid spin", sum(c.count("truck") for c in sp["grid"]), tp)
    if tp is not None:
        bonus += tp["prize_x"]
    rep.add("bonus total", abs(sp["bonus_x"] - bonus) < EPS)
    total = min(sp["win_x"] + sp["bonus_x"], cap)
    rep.add("credited = min(win + bonus, cap)", abs(rec["credited_x"] - total) < EPS)
    rep.add("win in cents = floor(credited x bet)", rec["win_cents"] == int(total * rec["bet"] + 1e-9))
    charged = rec.get("charged", rec["bet"])                         # older records: always the bet
    rep.add("charged = bet, or nothing for a free spin", charged == (0 if rec.get("free") else rec["bet"]))
    rep.add("balance: before - charged + win = after", rec["balance_before"] - charged + rec["win_cents"] == rec["balance_after"])
    return rep.as_dict()


def verify_order_record(model, rec):
    rep = Report()
    res = rec["result"]
    opt = next((o for o in model.config["orders"]["options"] if o["id"] == rec["order_id"]), None)
    if opt is None:
        rep.add("order exists in the game config", False)
        return rep.as_dict()
    if not res["accepted"]:
        rep.add("declined order pays exactly the tip", abs(res["final_x_uncapped"] - opt["fail_x"]) < EPS)
    else:
        k = float(opt["dinner"]["multiplier"]) if res["dinner"] else 1.0
        floor_x = opt["floor_x"] * k
        ceiling_x = opt["dinner"]["ceiling_x"] if res["dinner"] else opt["ceiling_x"]
        rep.add("order range matches the game config", res["floor_x"] == floor_x and res["ceiling_x"] == ceiling_x)
        rules = RushRules(model, base_spins=opt["spins"], start_n=opt["start_n"], mechanic=opt.get("mechanic"))
        total = verify_rush(model, rep, "order round", res["round"], rules, win_scale=k, stop_at=ceiling_x)
        final = min(max(total, floor_x), ceiling_x)
        rep.add("final = round total clamped to the order range", abs(res["final_x_uncapped"] - final) < EPS)
        rep.add("topped-up flag", bool(res["topped_up"]) == (total < floor_x))
    rep.add("final never exceeds the round cap room", res["final_x"] <= res["final_x_uncapped"] + EPS)
    rep.add("win in cents = floor(final x bet)", rec["win_cents"] == int(res["final_x"] * rec["bet"] + 1e-9))
    rep.add("balance: before + win = after", rec["balance_before"] + rec["win_cents"] == rec["balance_after"])
    return rep.as_dict()


def verify_gamble_record(rec, prev, cap_x, vans, max_steps):
    """Double-up record: the arithmetic and the chain of offers. The van itself can not be re-derived (it is drawn by the
    RNG), but every consequence of it is checked: win/loss follows from pick and hidden, the money moves by exactly the stake,
    the stake is exactly the credit the previous record created, the step count and the cap are respected."""
    rep = Report()
    pick, hidden, stake = rec.get("pick"), rec.get("hidden"), rec.get("stake_cents")
    ints = all(isinstance(v, int) and not isinstance(v, bool) for v in (pick, hidden, stake))
    rep.add("pick, van and stake are integers", ints)
    if not ints:
        return rep.as_dict()
    rep.add("pick and van are within the number of vans", 0 <= pick < vans and 0 <= hidden < vans)
    rep.add("win flag = (pick == van)", bool(rec["won"]) == (pick == hidden))
    rep.add("stake is positive", stake > 0)
    rep.add("step is within the allowed number of doublings", 0 <= rec["step"] < max_steps)
    rep.add("the doubled win stays within the round cap", stake * 2 <= int(cap_x * rec["bet"] + 1e-9))
    rep.add("result = double the stake on a win, nothing on a loss", rec["result_cents"] == (stake * 2 if rec["won"] else 0))
    rep.add("balance: before +/- stake = after", rec["balance_after"] == rec["balance_before"] + (stake if rec["won"] else -stake))
    rep.add("the previous record exists and belongs to the same player", prev is not None and prev.get("player") == rec["player"] and prev["id"] < rec["id"])
    if prev is not None:
        if prev["kind"] in ("spin", "order"):
            rep.add("first step: the stake is exactly the credit of the previous round", rec["step"] == 0 and prev["win_cents"] == stake)
        elif prev["kind"] == "gamble":
            rep.add("next step: the stake is exactly the previous doubled win", prev["won"] and prev["result_cents"] == stake and prev["step"] + 1 == rec["step"])
        else:
            rep.add("the previous record is a round", False, prev["kind"])
    return rep.as_dict()
