"""Exports a deterministic replay of REAL spins for the client demo mode (no server running).
Each paid spin is resolved by play.resolve_paid_spin (same code as the server). When Orders trigger, the spin
carries one pre-played outcome for EACH of the five orders (the server plays only the chosen one).
Bonus wins are NOT part of win_x; the client adds them when the bonus ends.

Usage (from math/):
    python -m fwslot_math.export_spins --spins 2000 --seed 1 --out ../client/data/spins_demo.json
"""
import argparse
import json
import random
from pathlib import Path

import numpy as np

from .model import load_model
from .play import game_meta, resolve_paid_spin
from .recipe import Recipe
from .rounds import play_order


def export_spins(spins: int, seed: int, profile=None) -> dict:
    model = load_model(profile=profile)
    recipe = Recipe(model, "base")
    state = recipe.new_state()
    rng = random.Random(seed)
    bonus_rng = np.random.Generator(np.random.PCG64(seed + 1_000_003))
    out = []
    for _ in range(spins):
        spin = resolve_paid_spin(model, recipe, state, rng, bonus_rng)
        if spin["orders_triggered"]:
            spin["orders"] = {opt["id"]: play_order(model, opt, bonus_rng) for opt in model.config["orders"]["options"]}
        out.append(spin)
    meta = game_meta(model)
    meta.update({"note": "DEMO replay of real math-core spins (draft config); not a server", "seed": seed})
    return {"meta": meta, "spins": out}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--spins", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--profile", default=None)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    data = export_spins(args.spins, args.seed, args.profile)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    s = data["spins"]
    rush = sum(1 for x in s for r in x["rewards"] if "rush" in r)
    orders = sum(1 for x in s if "orders" in x)
    print(f"{len(s)} spins -> {args.out}  ({args.out.stat().st_size / 1e6:.2f} MB, Rush rounds {rush}, Orders triggers {orders})")


if __name__ == "__main__":
    main()
