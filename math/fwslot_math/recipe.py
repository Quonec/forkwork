"""Recipe collection (GDD 10.3-10.4). Shared by the server engine and the simulator.

Rules:
- Points come from WINNING cells (a cell on several winning lines counts once) and from every AI on screen.
- One point goes to the first stage (in order) that is incomplete and whose set contains the symbol.
  Wild and AI points go to the first incomplete stage of any kind. A point with no eligible stage is lost
  (config recipe.unassigned_points = "lost"), or goes to the first incomplete stage ("first_incomplete").
- Processing order inside a spin: pay symbols in config order, then wilds, then AI.
- When all stages are full the recipe completes: reward by position in the 3-recipe cycle, progress resets,
  and the remaining points of the same spin go into the new recipe.
"""
from dataclasses import dataclass, field

from .model import Model


class Recipe:
    def __init__(self, model: Model, mode: str = "base"):
        cfg = model.config["recipe"]
        need_key = "need_base" if mode == "base" else "need_rush"
        self.need = [st[need_key] for st in cfg["stages"]]
        self.n_stages = len(self.need)
        n_sym = len(model.symbols)
        sets = [{model.idx(s) for s in st["symbols"]} for st in cfg["stages"]]
        self.stages_for = [[i for i, st in enumerate(sets) if sym in st] for sym in range(n_sym)]
        self.pay_order = [model.idx(s["id"]) for s in model.config["symbols"] if s["role"] == "pay"]
        self.wild = model.wild
        self.wild_points = cfg["wild_points"]
        self.ai_points = cfg["ai_points_base"] if mode == "base" else cfg["ai_points_rush"]
        self.rewards = cfg["cycle_rewards"]
        self.all_stages = list(range(self.n_stages))
        # "lost": a point with no eligible stage is lost; "first_incomplete": it goes to the first incomplete stage
        self.overflow = cfg.get("unassigned_points", "lost")
        if self.overflow == "first_incomplete":
            self.stages_for = [st + [i for i in self.all_stages if i not in st] for st in self.stages_for]

    def new_state(self) -> "RecipeState":
        return RecipeState(progress=[0] * self.n_stages)

    def apply(self, state: "RecipeState", win_counts, ai_count: int) -> list:
        """win_counts[symbol] = winning cells of that symbol this spin. Returns rewards of recipes completed."""
        units = [(self.stages_for[s], win_counts[s]) for s in self.pay_order if win_counts[s]]
        if win_counts[self.wild]:
            units.append((self.all_stages, win_counts[self.wild] * self.wild_points))
        if ai_count:
            units.append((self.all_stages, ai_count * self.ai_points))
        completed = []
        progress, need = state.progress, self.need
        for stages, n in units:
            for _ in range(n):
                for i in stages:
                    if progress[i] < need[i]:
                        progress[i] += 1
                        state.points_added += 1
                        break
                else:
                    state.points_lost += 1
                    continue
                if progress == need:
                    completed.append(self.rewards[state.cycle])
                    state.cycle = (state.cycle + 1) % len(self.rewards)
                    state.completed += 1
                    progress[:] = [0] * self.n_stages
        return completed


@dataclass
class RecipeState:
    progress: list
    cycle: int = 0            # position in the reward cycle (0 = next recipe gets reward #1)
    completed: int = 0
    points_added: int = 0
    points_lost: int = 0
    extra: dict = field(default_factory=dict)
