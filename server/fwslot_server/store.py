"""Player state: accounts (nickname + password hash), demo wallet in integer cents, recipe progress per profile and bet
level, pending order choice, best single win, stats. JSON file with atomic replace, so a crash never leaves a half-written
file. In production this becomes a database and the wallet becomes the casino's wallet API."""
import json
import os
import time
from pathlib import Path

from . import career

START_BALANCE_CENTS = 100_000
VERSION = 3


def new_player(nickname: str, pw, now: float) -> dict:
    p = {"nickname": nickname, "pw": pw, "status": "active", "created": now, "last_login": None,
         "balance": START_BALANCE_CENTS, "progress": {}, "pending_order": None, "gamble": None, "best_win": None,
         "stats": {"rounds": 0, "wagered": 0, "won": 0, "adjusted": 0}}
    return ensure_fields(p)


def ensure_fields(p: dict) -> dict:
    """Adds what older records lack. Demo and real money are separate: balance / stats / best win / career each exist twice."""
    p.setdefault("gamble", None)
    p.setdefault("real_balance", 0)
    p.setdefault("stats_real", {"rounds": 0, "wagered": 0, "won": 0, "adjusted": 0})
    p.setdefault("best_win_real", None)
    w = p.setdefault("wallet", {})
    for k, v in (("code", None), ("age_ok", None), ("deposited", 0), ("withdrawn", 0), ("turnover", 0), ("dust_nano", 0)):
        w.setdefault(k, v)
    c = p.setdefault("career", {})
    for mode in ("demo", "real"):
        career.ensure(c.setdefault(mode, career.new_career()))
    return p


class Store:
    def __init__(self, path=None, clock=time.time):
        self.path = Path(path) if path else None
        self.clock = clock
        self.data = {"version": VERSION, "players": {}, "admin": None}
        if self.path and self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))
        self.migrate()

    def migrate(self) -> None:
        """v1 players had no password (open dev accounts). They are kept for the record but can not log in:
        renamed legacy_<name>, status 'legacy', hidden from the rating; an admin can give them a password."""
        self.data.setdefault("admin", None)
        moved = 0
        for key in list(self.data["players"]):
            p = self.data["players"][key]
            if "pw" in p:
                continue
            new_key = f"legacy_{key}"
            p.update({"nickname": new_key, "pw": None, "status": "legacy", "created": self.clock(), "last_login": None})
            p.setdefault("best_win", None)
            p.setdefault("stats", {"rounds": 0, "wagered": 0, "won": 0, "adjusted": 0})
            p["legacy"] = True                              # its balance has no journal behind it: the books check skips it
            self.data["players"][new_key] = self.data["players"].pop(key)
            moved += 1
        for p in self.data["players"].values():
            ensure_fields(p)
        self.data["version"] = VERSION
        self.migrated = moved

    @property
    def players(self) -> dict:
        return self.data["players"]

    def save(self) -> None:
        if not self.path:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)
