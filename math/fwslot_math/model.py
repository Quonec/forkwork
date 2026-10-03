"""Loads the game config and reel strips into index-based arrays shared by all math code."""
import json
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np

MATH_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = MATH_DIR / "config" / "game_config.draft.json"
DEFAULT_REELS = MATH_DIR / "config" / "reels_base.draft.json"
REELS = 5


@dataclass(frozen=True)
class Model:
    symbols: tuple            # symbol ids, position = symbol index
    wild: int
    scatter: int
    ai: int
    truck: int
    paytable: np.ndarray      # (n_symbols, 6): pay in LINE BETS for a run of length 0..5
    lines: np.ndarray         # (n_lines, 5): row index per reel
    strips: tuple             # per reel: np.ndarray of symbol indices
    rows: int
    config: dict = field(default_factory=dict, compare=False, repr=False)   # raw game config
    active_lines: int = 0     # lines the player has switched on (the first N of `lines`); 0 = all of them

    @property
    def total_lines(self) -> int:
        return len(self.lines)

    @property
    def n_lines(self) -> int:
        """Lines that PAY. Wins are divided by it, because the total bet is one line bet x n_lines."""
        return self.active_lines or len(self.lines)

    def with_lines(self, n: int) -> "Model":
        """The same game with only the first n lines paying. Recipe points, Scatter, AI and trucks still read all the lines
        (see engine.evaluate_spin), so the bonus frequency and with it the RTP do not depend on n."""
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= len(self.lines):
            raise ValueError(f"lines must be a whole number from 1 to {len(self.lines)}")
        return replace(self, active_lines=0 if n == len(self.lines) else n)

    def idx(self, symbol_id: str) -> int:
        return self.symbols.index(symbol_id)


def build_strip(counts: dict) -> list:
    """Spread symbols evenly (smooth weighted round robin). Deterministic; each symbol appears exactly `count` times."""
    items = [(s, c) for s, c in counts.items() if c > 0]
    total = sum(c for _, c in items)
    current = {s: 0 for s, _ in items}
    strip = []
    for _ in range(total):
        for s, c in items:
            current[s] += c
        best = max(items, key=lambda it: current[it[0]])[0]
        current[best] -= total
        strip.append(best)
    return strip


def apply_profile(cfg: dict, profile: str) -> tuple:
    """RTP profile (difficulty mode): returns (config with the profile's Rush spins / order probabilities /
    buy price merged in, line-pay scale). Profiles live in cfg["profiles"][<percent>]."""
    cfg = json.loads(json.dumps(cfg))   # deep copy
    prof = cfg.get("profiles", {}).get(str(profile))
    if prof is None:
        return cfg, 1.0
    cfg["chefs_rush"]["base_spins"] = prof["rush_spins"]
    for opt in cfg["orders"]["options"]:
        opt["success_probability"] = prof["success_probability"].get(opt["id"])
    cfg["bonus_buy"]["price_x_total_bet"] = prof.get("bonus_buy_price_x")
    cfg["active_profile"] = str(profile)
    return cfg, float(prof["lines_scale"])


def load_model(config_path=DEFAULT_CONFIG, reels_path=DEFAULT_REELS, profile=None, lines_scale=None) -> Model:
    """profile: RTP profile key ("88", "92", ...), default = rtp_default_percent.
    lines_scale: explicit line-pay multiplier (overrides the profile's), used while calibrating profiles."""
    cfg = json.loads(Path(config_path).read_text(encoding="utf-8"))
    reels_cfg = json.loads(Path(reels_path).read_text(encoding="utf-8"))
    cfg, scale = apply_profile(cfg, profile if profile is not None else cfg.get("rtp_default_percent"))
    if lines_scale is not None:
        scale = float(lines_scale)
    cfg["active_lines_scale"] = scale

    symbols = tuple(s["id"] for s in cfg["symbols"])
    n_lines = cfg["lines"]
    rows = cfg["grid"]["rows"]

    # config pays are in x TOTAL bet; one line bet = total / n_lines, so pay in line bets = value * n_lines.
    # The profile's lines_scale multiplies every line pay (RTP of lines is linear in it).
    paytable = np.zeros((len(symbols), REELS + 1))
    for sid, pays in cfg["paytable_x_total_bet"].items():
        if sid.startswith("_"):
            continue
        for run, value in zip((3, 4, 5), pays):
            paytable[symbols.index(sid), run] = value * n_lines * scale

    lines = np.array(cfg["paylines_rows_top0_mid1_bottom2"], dtype=np.int64)
    if lines.shape != (n_lines, REELS):
        raise ValueError(f"paylines shape {lines.shape}, expected ({n_lines}, {REELS})")

    reel_counts = reels_cfg["reels"]
    if len(reel_counts) != REELS:
        raise ValueError(f"{len(reel_counts)} reels in reel config, expected {REELS}")
    strips = []
    for counts in reel_counts:
        unknown = set(counts) - set(symbols)
        if unknown:
            raise ValueError(f"unknown symbols in reel config: {unknown}")
        strips.append(np.array([symbols.index(s) for s in build_strip(counts)], dtype=np.int64))

    return Model(
        symbols=symbols,
        wild=symbols.index("wild"),
        scatter=symbols.index("scatter"),
        ai=symbols.index("ai"),
        truck=symbols.index("truck"),
        paytable=paytable,
        lines=lines,
        strips=tuple(strips),
        rows=rows,
        config=cfg,
    )
