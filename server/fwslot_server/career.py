"""Ranks and win-streak rewards ("the chef's career"). Pure rules, no storage: the game service keeps one `career` dict per
player and per wallet (demo play and real TON play have separate careers, so play money can never feed real rewards).

XP      one point per 0.20 wagered (a paid round); free spins give none.
Ranks   Dishwasher -> Prep Cook -> Line Cook -> Sous-Chef -> Chef de Cuisine -> Executive Chef -> Master Chef.
Streak  consecutive PAID rounds that pay something (a round = a spin with its bonuses and its order). A round that pays nothing
        resets it; free spins neither extend nor break it. Milestones: 3 wins +25 XP; 5 wins a free spin; 7 wins two; 10 wins three
        and the streak starts again.
Reward  a FREE SPIN TOKEN: one paid spin at a fixed bet that is not charged (its win is paid as usual). The token's bet is the bet of
        the round that earned it, at most TOKEN_MAX_BET_CENTS, so the cost of a token is bounded. A rank-up also gives tokens.
Budget  tokens are promotional spend, NOT part of the RTP of the game profiles. They are bounded: at most TOKENS_PER_DAY earned per
        day and MAX_TOKENS held, and the operator can switch the rewards off (rewards_enabled=False): ranks and streak counters still run.
"""
import time

RANKS = [
    {"n": 1, "name": "Dishwasher", "xp": 0},
    {"n": 2, "name": "Prep Cook", "xp": 100},
    {"n": 3, "name": "Line Cook", "xp": 500},
    {"n": 4, "name": "Sous-Chef", "xp": 2_000},
    {"n": 5, "name": "Chef de Cuisine", "xp": 8_000},
    {"n": 6, "name": "Executive Chef", "xp": 30_000},
    {"n": 7, "name": "Master Chef", "xp": 100_000},
]
XP_UNIT_CENTS = 20
STREAK_STEPS = [
    {"at": 3, "xp": 25},
    {"at": 5, "tokens": 1},
    {"at": 7, "tokens": 2},
    {"at": 10, "tokens": 3, "reset": True},
]
RANK_UP_TOKENS = {2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3}
TOKEN_MAX_BET_CENTS = 100
TOKENS_PER_DAY = 10
MAX_TOKENS = 20


def new_career() -> dict:
    return {"xp": 0, "rank": 1, "streak": 0, "best_streak": 0, "rounds": 0, "tokens": [], "day": "", "tokens_today": 0,
            "dishes": 0}


def ensure(c: dict) -> dict:
    """Fills missing keys of an older record (forward compatible)."""
    for k, v in new_career().items():
        c.setdefault(k, v)
    return c


def add_dishes(c: dict, n: int) -> None:
    """The profile shelf: recipes finished in paid rounds of this wallet (the plates the player has collected)."""
    c["dishes"] = int(c.get("dishes", 0)) + max(0, int(n))


def rank_for(xp: int) -> dict:
    cur = RANKS[0]
    for r in RANKS:
        if xp >= r["xp"]:
            cur = r
    return cur


def day_of(ts: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))


def view(c: dict) -> dict:
    """What the client shows: rank, XP bar, streak, tokens."""
    cur = rank_for(c["xp"])
    nxt = next((r for r in RANKS if r["n"] == cur["n"] + 1), None)
    streak_next = next((s["at"] for s in STREAK_STEPS if s["at"] > c["streak"]), None)
    return {"rank": cur["n"], "rank_name": cur["name"], "xp": c["xp"], "xp_from": cur["xp"], "xp_to": nxt["xp"] if nxt else None,
            "streak": c["streak"], "best_streak": c["best_streak"], "streak_next": streak_next,
            "tokens": [{"bet": t["bet"], "src": t["src"]} for t in c["tokens"]], "max_rank": nxt is None,
            "dishes": int(c.get("dishes", 0))}


def _grant(c: dict, bet: int, src: str, day: str, force: bool = False) -> bool:
    if c["day"] != day:
        c["day"], c["tokens_today"] = day, 0
    if not force and (c["tokens_today"] >= TOKENS_PER_DAY or len(c["tokens"]) >= MAX_TOKENS):
        return False
    c["tokens"].append({"bet": int(min(bet, TOKEN_MAX_BET_CENTS)), "src": src, "day": day})
    if not force:
        c["tokens_today"] += 1
    return True


def apply_round(c: dict, bet: int, won: bool, free: bool, day: str, rewards: bool = True) -> list:
    """One finished PAID round. Mutates `c`, returns the events to tell the player and to journal:
    {"type": "streak", "streak": n, "xp": +xp, "tokens": +n, "capped": bool, "cycle": bool} and {"type": "rank_up", "rank": n, "name": ..., "tokens": +n}."""
    ensure(c)
    if free:
        return []
    events = []
    c["rounds"] += 1
    old_rank = rank_for(c["xp"])["n"]
    c["xp"] += max(0, bet // XP_UNIT_CENTS)
    if won:
        c["streak"] += 1
        c["best_streak"] = max(c["best_streak"], c["streak"])
        step = next((s for s in STREAK_STEPS if s["at"] == c["streak"]), None)
        if step and rewards:
            got = 0
            for _ in range(step.get("tokens", 0)):
                got += _grant(c, bet, f"streak{step['at']}", day)
            c["xp"] += step.get("xp", 0)
            events.append({"type": "streak", "streak": c["streak"], "xp": step.get("xp", 0), "tokens": got,
                           "capped": got < step.get("tokens", 0), "cycle": bool(step.get("reset"))})
        if step and step.get("reset"):
            c["streak"] = 0
    else:
        c["streak"] = 0
    new_rank = rank_for(c["xp"])
    for n in range(old_rank + 1, new_rank["n"] + 1):                 # a big bet can jump several ranks at once
        got = 0
        if rewards:
            for _ in range(RANK_UP_TOKENS.get(n, 0)):
                got += _grant(c, bet, f"rank{n}", day)
        events.append({"type": "rank_up", "rank": n, "name": next(r["name"] for r in RANKS if r["n"] == n), "tokens": got})
    c["rank"] = new_rank["n"]
    return events


def take_token(c: dict, bet: int) -> dict:
    """The oldest token, if it is worth exactly `bet`. Raises ValueError with a readable reason."""
    if not c["tokens"]:
        raise ValueError("you have no free spins")
    if c["tokens"][0]["bet"] != bet:
        raise ValueError(f"the free spin is worth a bet of {c['tokens'][0]['bet'] / 100:.2f}")
    return c["tokens"].pop(0)


def admin_grant(c: dict, bet: int, day: str) -> None:
    ensure(c)
    _grant(c, bet, "admin", day, force=True)
