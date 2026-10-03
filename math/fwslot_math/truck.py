"""Truck Pick bonus (v0.33.0; the code first shipped unlabelled inside the v0.30.3 archive): 3+ food trucks anywhere on a paid spin open a pick-a-van game.

The prize is drawn from the table of the truck count BEFORE the player picks, so the pick itself is cosmetic
(every van hides an independent draw of the same table; the picked van shows the real prize). Prize in x TOTAL bet.
RTP of the bonus per SPIN = P(3+ trucks) * E[prize | count], exact. It works on every spin of the game (paid, recipe free spin, Chef's Rush,
order rounds), so the total adds up through the number of such spins per paid spin (see orders.budget_report).
"""
import numpy as np

from .exact import exact_symbol_count_dist
from .model import Model


def tables(model: Model) -> dict:
    """{trucks: (values, probabilities)} for every truck count that has a table."""
    out = {}
    for k, t in model.config["truck_pick"]["tables"].items():
        w = np.array(t["weights"], dtype=float)
        out[int(k)] = (np.array(t["values"], dtype=float), w / w.sum())
    return out


def expected_prize(model: Model, trucks: int) -> float:
    values, p = tables(model)[min(max(trucks, model.config["truck_pick"]["trigger_trucks"]), max(tables(model)))]
    return float(values @ p)


def rtp_share(model: Model) -> float:
    """Exact RTP the bonus adds (fraction of the total bet per paid spin)."""
    dist = exact_symbol_count_dist(model, model.truck)
    need = int(model.config["truck_pick"]["trigger_trucks"])
    return float(sum(dist[k] * expected_prize(model, k) for k in range(need, len(dist))))


def trigger_frequency(model: Model) -> float:
    need = int(model.config["truck_pick"]["trigger_trucks"])
    return float(exact_symbol_count_dist(model, model.truck)[need:].sum())


def draw_prize(model: Model, trucks: int, rng) -> float:
    """One prize (x total bet). rng: random.Random-like (the server's SystemRandom)."""
    t = tables(model)
    values, p = t[min(trucks, max(t))]
    return float(values[_pick(p, rng)])


def _pick(p, rng) -> int:
    r = rng.random()
    acc = 0.0
    for i, q in enumerate(p):
        acc += q
        if r < acc:
            return i
    return len(p) - 1


def draw_prizes(model: Model, trucks: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Vectorized: prize (x total bet) per screen for an array of truck counts; 0 below the trigger. Used by the Rush simulator."""
    need = int(model.config["truck_pick"]["trigger_trucks"])
    t = tables(model)
    top = max(t)
    out = np.zeros(len(trucks))
    for k in range(need, top + 1):
        sel = (trucks == k) if k < top else (trucks >= top)
        if sel.any():
            values, p = t[k]
            out[sel] = rng.choice(values, size=int(sel.sum()), p=p)
    return out
