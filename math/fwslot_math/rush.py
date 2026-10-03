"""Chef's Rush free-spins round (GDD 6 / 10.5), vectorized over many independent rounds.

Rules of one Rush spin (config `chefs_rush`):
  1. Reels spin (base reel set for now).
  2. Every AI on screen turns `ai_converts_random_cells_to_wild` random cells into Wild
     (only cells that are not AI, Scatter or already Wild).
  3. Line wins as in the base game; a line whose PAID run contains a Wild pays x `wild_min_multiplier`.
  4. The whole spin win is multiplied by M = 1 + 0.5 * n (n = recipes completed earlier in this round,
     capped at n_max). M of a spin is taken BEFORE recipes completed on that spin.
  5. Recipe points: every winning cell 1 point (each cell once), every AI on screen `ai_points_rush` points.
     A Rush recipe needs sum(need_rush) points (5). With recipe.unassigned_points == "first_incomplete"
     every point lands in some stage, so completed recipes = (carry + points) // 5 - checked against
     recipe.Recipe in tests. The unfinished recipe carries over to the next spin.
  6. `ai_count_for_extra_spin` or more AI on screen -> +1 spin, total spins capped at `max_total_spins`.
  7. Round win is capped at win_cap_x_total_bet; reaching the cap ends the round.
  8. Truck Pick works inside the Rush too: 3+ trucks on a Rush screen pay a flat prize from the truck table (added to the spin win, not
     multiplied by M or the order mechanics; Chef's Dinner multiplies it like every other win of the round).
Order mechanics (config orders.options[].mechanic, decision 1 A/B/E):
  spin_multiplier - every spin draws a multiplier from `values` with `weights` (on top of M and Wild x2);
  sticky_wilds    - every Wild that appears stays on its cell until the round ends;
  wild_reel       - instead of 1 random cell, an AI turns its whole reel into Wild.
"""
import numpy as np

from .model import REELS, Model
from .sim import line_pays_runs, screens
from .truck import draw_prizes


class RushRules:
    def __init__(self, model: Model, **override):
        cfg = dict(model.config["chefs_rush"])
        cfg.update(override)
        rcfg = model.config["recipe"]
        if rcfg.get("unassigned_points") != "first_incomplete" or rcfg["wild_points"] != 1:
            raise ValueError("vectorized Rush recipe assumes unassigned_points=first_incomplete and wild_points=1")
        self.spins = int(cfg["base_spins"])
        self.start_n = int(cfg.get("start_n", 0))
        self.wild_mult = float(cfg["wild_min_multiplier"])
        self.n_max = int(cfg["n_max"])
        self.converts = int(cfg["ai_converts_random_cells_to_wild"])
        self.ai_extra = int(cfg["ai_count_for_extra_spin"])
        self.max_spins = int(cfg["max_total_spins"])
        self.recipe_points = int(cfg.get("recipe_points", sum(st["need_rush"] for st in rcfg["stages"])))
        self.ai_points = int(rcfg["ai_points_rush"])
        self.cap = float(model.config["win_cap_x_total_bet"])
        # order mechanics (decision 1 A/B/E): None | spin_multiplier | sticky_wilds | wild_reel
        mech = cfg.get("mechanic") or {}
        self.mechanic = mech.get("type")
        if self.mechanic not in (None, "spin_multiplier", "sticky_wilds", "wild_reel"):
            raise ValueError(f"unknown mechanic {self.mechanic}")
        self.spin_mult_values = np.array(mech.get("values", [1.0]), dtype=float)
        w = np.array(mech.get("weights", [1.0]), dtype=float)
        self.spin_mult_weights = w / w.sum()


def rush_recipe_step(carry, points, recipe_points: int):
    """-> (recipes completed, new carry). Works on ints or numpy arrays."""
    total = carry + points
    return total // recipe_points, total % recipe_points


def convert_ai_to_wild(model: Model, grid: np.ndarray, converts: int, rng: np.random.Generator) -> np.ndarray:
    """grid (n, 5, rows) -> copy where each AI turned `converts` random eligible cells into Wild."""
    n = len(grid)
    flat = grid.reshape(n, -1).copy()
    ai = (flat == model.ai).sum(axis=1)
    eligible = (flat != model.ai) & (flat != model.scatter) & (flat != model.wild) & (flat != model.truck)
    k = np.minimum(ai * converts, eligible.sum(axis=1))
    if k.any():
        keys = rng.random(flat.shape)
        keys[~eligible] = 2.0
        order = np.argsort(keys, axis=1)
        rows = np.arange(n)
        for j in range(flat.shape[1]):
            take = j < k
            if not take.any():
                break
            flat[rows[take], order[take, j]] = model.wild
    return flat.reshape(grid.shape)


def convert_ai_reels(model: Model, grid: np.ndarray) -> np.ndarray:
    """Secret AI order: every reel that shows an AI becomes Wild from top to bottom (the AI cell included)."""
    out = grid.copy()
    out[(grid == model.ai).any(axis=2)] = model.wild
    return out


def rush_spin_grid(model: Model, rules: "RushRules", grid: np.ndarray, sticky, rng: np.random.Generator) -> tuple:
    """Applies the round's mechanics to fresh screens. grid (n,5,rows); sticky (n,15) bool or None.
    Returns (final grid, AI count BEFORE any conversion, spin multiplier per row).
    Order: sticky wilds are placed first, AI count is taken, then AI conversions."""
    n = len(grid)
    if sticky is not None:
        flat = grid.reshape(n, -1)
        flat[sticky] = model.wild
    ai = (grid.reshape(n, -1) == model.ai).sum(axis=1)
    if rules.mechanic == "wild_reel":
        grid = convert_ai_reels(model, grid)
    else:
        grid = convert_ai_to_wild(model, grid, rules.converts, rng)
    if rules.mechanic == "spin_multiplier":
        smult = rng.choice(rules.spin_mult_values, size=n, p=rules.spin_mult_weights)
    else:
        smult = np.ones(n)
    return grid, ai, smult


def evaluate_rush_grid(model: Model, grid: np.ndarray, wild_mult: float) -> tuple:
    """-> (win in LINE BETS with wild multiplier on the active lines, winning cells count over ALL lines, ai count) per grid (no M applied)."""
    n = len(grid)
    reel_idx = np.arange(REELS)
    total = np.zeros(n)
    mask = np.zeros(grid.shape, dtype=bool)
    pos = np.arange(REELS)[None, :]
    for i, line in enumerate(model.lines):
        syms = grid[:, reel_idx, line]
        pay, run = line_pays_runs(model, syms)
        has_wild = ((syms == model.wild) & (pos < run[:, None])).any(axis=1)
        if i < model.n_lines:                 # only the lines switched on pay; the recipe points count the cells of all lines
            total += pay * np.where(has_wild, wild_mult, 1.0)
        for r in range(REELS):
            mask[:, r, line[r]] |= run > r
    flat = grid.reshape(n, -1)
    return total, mask.reshape(n, -1).sum(axis=1), (flat == model.ai).sum(axis=1)


def simulate_rush(model: Model, rounds: int, seed: int, rules: RushRules = None, chunk: int = 100_000) -> dict:
    """Plays `rounds` independent Rush rounds. Returns per-round arrays (wins in x total bet etc.)."""
    rules = rules or RushRules(model)
    rng = np.random.Generator(np.random.PCG64(seed))
    lengths = [len(s) for s in model.strips]
    wins = np.zeros(rounds)
    spins_played = np.zeros(rounds, dtype=np.int64)
    recipes = np.zeros(rounds, dtype=np.int64)
    capped = np.zeros(rounds, dtype=bool)
    for start in range(0, rounds, chunk):
        m = min(chunk, rounds - start)
        n = np.full(m, rules.start_n, dtype=np.int64)
        carry = np.zeros(m, dtype=np.int64)
        left = np.full(m, rules.spins, dtype=np.int64)
        played = np.zeros(m, dtype=np.int64)
        total = np.zeros(m)
        done_recipes = np.zeros(m, dtype=np.int64)
        active = np.ones(m, dtype=bool)
        sticky = np.zeros((m, REELS * model.rows), dtype=bool) if rules.mechanic == "sticky_wilds" else None
        while active.any():
            idx = np.nonzero(active)[0]
            stops = np.stack([rng.integers(0, L, size=len(idx)) for L in lengths], axis=1)
            scr = screens(model, stops)
            trucks = (scr.reshape(len(idx), -1) == model.truck).sum(axis=1)          # counted on the fresh screen, before any conversion
            grid, ai, smult = rush_spin_grid(model, rules, scr,
                                             None if sticky is None else sticky[idx], rng)
            win_lb, cells, _ = evaluate_rush_grid(model, grid, rules.wild_mult)
            if sticky is not None:
                sticky[idx] |= grid.reshape(len(idx), -1) == model.wild
            mult = 1.0 + 0.5 * np.minimum(n[idx], rules.n_max)
            total[idx] += win_lb / model.n_lines * mult * smult + draw_prizes(model, trucks, rng)      # Truck Pick: a flat prize, no multipliers
            new, carry[idx] = rush_recipe_step(carry[idx], cells + ai * rules.ai_points, rules.recipe_points)
            n[idx] += new
            done_recipes[idx] += new
            played[idx] += 1
            left[idx] -= 1
            extra = (ai >= rules.ai_extra) & (played[idx] + left[idx] < rules.max_spins)
            left[idx] += extra
            hit_cap = total[idx] >= rules.cap
            total[idx] = np.minimum(total[idx], rules.cap)
            active[idx] = (left[idx] > 0) & ~hit_cap
            capped[start + idx[hit_cap]] = True
        wins[start:start + m] = total
        spins_played[start:start + m] = played
        recipes[start:start + m] = done_recipes
    return {"wins": wins, "spins": spins_played, "recipes": recipes, "capped": capped}


def summarize(wins: np.ndarray, extra: dict = None) -> dict:
    q = np.percentile(wins, [10, 50, 90, 99, 99.9])
    out = {
        "rounds": int(len(wins)),
        "ev_x": float(wins.mean()),
        "ev_ci95": float(1.96 * wins.std() / np.sqrt(len(wins))),
        "sd_x": float(wins.std()),
        "p10": float(q[0]), "p50": float(q[1]), "p90": float(q[2]), "p99": float(q[3]), "p999": float(q[4]),
        "max_x": float(wins.max()),
    }
    if extra:
        out.update(extra)
    return out
