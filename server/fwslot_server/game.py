"""Authoritative game service (no HTTP here, so it is easy to test).

Accounts: nickname + password (scrypt). Money is kept in integer cents. A paid spin is charged, resolved by
fwslot_math.play.resolve_paid_spin and its win (base + recipe rewards + free spin + Chef's Rush) is credited at once,
floored to the cent. If Orders trigger, the choice is stored as `pending_order` on the player - it survives a reconnect -
and no new spin is accepted until the player chooses. The total of one paid spin never exceeds win_cap_x_total_bet.
Recipe progress is kept per player, RTP profile and bet level.
Every paid spin and order is written to the journal with the complete outcome, so any round can be replayed and re-verified.

Double-up ("guess the van"): after a credit the player may risk exactly that win on a fair 50/50 guess between two vans
(left / right). The win is already in the balance, so a lost guess takes it back and a won guess adds the same amount again.
The van is drawn by the SERVER (py_rng = SystemRandom in production) AFTER the pick arrives; the client only sends 0 or 1. The offer
exists only for the LAST credit (spin or order or a won guess), at most GAMBLE_MAX_STEPS in a row, never above the round cap, is
dropped by the next spin / login / logout, can be switched off (gamble_enabled=False, run.py --no-gamble) and does not touch the
rating. A fair 50/50 pays back exactly what it takes (EV = 1), so the RTP of every profile stays what it is.
"""
import random
import secrets
import threading
import time

import numpy as np

from fwslot_math.model import load_model
from fwslot_math.play import game_meta, resolve_paid_spin
from fwslot_math.recipe import Recipe, RecipeState
from fwslot_math.rounds import play_order

from . import career, ton, verify
from .accounts import (AccountError, Throttle, hash_password, nick_key, validate_nickname, validate_password,
                       verify_password)
from .errors import GameError
from .journal import Journal
from .store import Store, ensure_fields, new_player
from .wallet import WalletConfig, WalletMixin

BET_LEVELS_CENTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
DEFAULT_BET_CENTS = 100
LINE_BET_CENTS = [1, 2, 5, 10, 25, 50, 100, 250, 500]     # bet per line; the total bet = this x the lines switched on
MAX_LINES = 20
SESSION_TTL = 12 * 3600
ADMIN_TTL = 2 * 3600
MAX_ADJUST_CENTS = 100_000_000
LEADERBOARD_SIZE = 10
MODES = ("demo", "real")
BAL = {"demo": "balance", "real": "real_balance"}       # which player field holds the balance of a wallet
GAMBLE_VANS = 2              # left / right: a 1-in-2 guess that pays x2 is exactly fair
GAMBLE_MAX_STEPS = 3         # at most three doublings in a row
_DUMMY_PW = hash_password("dummy-password-for-timing")


def check_bet(bet, lines) -> None:
    """The total bet of a spin on `lines` lines: a whole number of cents that is a bet per line from LINE_BET_CENTS times the lines.
    On all 20 lines the older total-bet levels (BET_LEVELS_CENTS) stay valid too."""
    if isinstance(lines, bool) or not isinstance(lines, int) or not 1 <= lines <= MAX_LINES:
        raise GameError(f"lines must be a whole number from 1 to {MAX_LINES}")
    if isinstance(bet, bool) or not isinstance(bet, int):
        raise GameError("bet must be a whole number of cents")
    if lines == MAX_LINES and bet in BET_LEVELS_CENTS:
        return
    if bet % lines == 0 and bet // lines in LINE_BET_CENTS:
        return
    if lines == MAX_LINES:
        raise GameError(f"bet must be one of {BET_LEVELS_CENTS}")
    raise GameError(f"on {lines} lines the bet must be {lines} x one of {LINE_BET_CENTS} cents")


def credit_cents(x: float, bet_cents: int) -> int:
    """Win of x total bets in cents, floored (never pays a fraction of a cent too much)."""
    return int(x * bet_cents + 1e-9)


class RateLimit:
    """At most `max_events` per `window` seconds per key (used for registrations)."""

    def __init__(self, max_events, window, clock=time.monotonic):
        self.max_events, self.window, self.clock = max_events, window, clock
        self._events = {}

    def hit(self, key, what="registrations from this address") -> None:
        now = self.clock()
        ev = [t for t in self._events.get(key, []) if now - t < self.window]
        if len(ev) >= self.max_events:
            raise AccountError(f"too many {what}, try again later", 429)
        ev.append(now)
        self._events[key] = ev


class GameService(WalletMixin):
    def __init__(self, store: Store = None, journal: Journal = None, py_rng=None, np_seed: int = None,
                 clock=time.time, throttle: Throttle = None, register_limit: RateLimit = None, gamble_enabled: bool = True,
                 rewards_enabled: bool = True, wallet: WalletConfig = None, ton_provider=None):
        self.store = store or Store()
        self.gamble_enabled = bool(gamble_enabled)
        self.rewards_enabled = bool(rewards_enabled)
        self.journal = journal or Journal()
        self.clock = clock
        self.lock = threading.RLock()
        self.models = {}
        self.sessions = {}
        self.admin_sessions = {}
        self.throttle = throttle or Throttle()
        self.register_limit = register_limit or RateLimit(20, 3600)
        self.send_limit = RateLimit(10, 60, clock=clock)           # deposit transactions relayed per player per minute
        self.py_rng = py_rng or random.SystemRandom()          # reel stops
        self._np_seed = np_seed                                  # tests only: deterministic bonus rounds
        self._np_calls = 0
        self.profiles = sorted(load_model().config["profiles"])
        self.wallet_cfg = wallet or WalletConfig()
        self.ton = ton_provider
        self.wallet_addr = None
        if self.wallet_cfg.enabled:
            if not self.wallet_cfg.address:
                raise ValueError("the TON wallet needs the operator's deposit address")
            self.wallet_addr = ton.parse_address(self.wallet_cfg.address)
            ton.check_network(self.wallet_addr, self.wallet_cfg.network)
            if self.ton is None:
                raise ValueError("the TON wallet needs a provider (mock or toncenter)")

    # ------------------------------------------------------------------ helpers
    def _model(self, profile: str):
        if profile not in self.models:
            m = load_model(profile=profile)
            self.models[profile] = (m, Recipe(m, "base"))
        return self.models[profile]

    def _np_rng(self) -> np.random.Generator:
        if self._np_seed is None:
            return np.random.Generator(np.random.PCG64(secrets.randbits(128)))
        self._np_calls += 1
        return np.random.Generator(np.random.PCG64(self._np_seed + self._np_calls))

    def _session(self, token) -> dict:
        s = self.sessions.get(token) if isinstance(token, str) else None
        if s is None or s["expires"] < self.clock():
            self.sessions.pop(token, None)
            raise GameError("session expired, please log in again")
        player = self.store.players.get(s["player"])
        if player is None or player["status"] != "active":
            self.sessions.pop(token, None)
            raise GameError("this account is blocked" if player and player["status"] == "blocked" else "session expired, please log in again")
        ensure_fields(player)                            # a record written by an older version gets the newer fields
        s["expires"] = self.clock() + SESSION_TTL
        return s

    def _drop_sessions(self, key: str) -> None:
        for t in [t for t, s in self.sessions.items() if s["player"] == key]:
            del self.sessions[t]

    @staticmethod
    def _progress_key(profile: str, bet: int, mode: str) -> str:
        return f"{profile}:{bet}" if mode == "demo" else f"{mode}:{profile}:{bet}"       # demo keys stay as they always were

    def _recipe_state(self, player: dict, profile: str, bet: int, mode: str = "demo") -> RecipeState:
        saved = player["progress"].get(self._progress_key(profile, bet, mode))
        _, recipe = self._model(profile)
        st = recipe.new_state()
        if saved:
            st.progress[:] = saved["progress"]
            st.cycle = saved["cycle"]
        return st

    def _save_recipe(self, player: dict, profile: str, bet: int, st: RecipeState, mode: str = "demo") -> None:
        player["progress"][self._progress_key(profile, bet, mode)] = {"progress": list(st.progress), "cycle": st.cycle}

    @staticmethod
    def _stats(player: dict, mode: str) -> dict:
        return player["stats"] if mode == "demo" else player["stats_real"]

    @staticmethod
    def _career(player: dict, mode: str) -> dict:
        return career.ensure(player["career"][mode])

    @staticmethod
    def _pending_view(player: dict):
        p = player.get("pending_order")
        return None if p is None else {"bet": p["bet"], "profile": p["profile"], "mode": p.get("mode", "demo")}

    @staticmethod
    def _note_win(player: dict, round_cents: int, bet: int, round_id: int, ts: float, mode: str = "demo") -> None:
        """Best single (one-round) win for the rating, per wallet. A round = a paid spin with all its bonuses and its order."""
        field = "best_win" if mode == "demo" else "best_win_real"
        best = player.get(field)
        if round_cents > 0 and (best is None or round_cents > best["cents"]):
            player[field] = {"cents": round_cents, "x": round(round_cents / bet, 2), "bet": bet, "round_id": round_id, "ts": ts}

    def gamble_config(self) -> dict:
        return {"enabled": self.gamble_enabled, "vans": GAMBLE_VANS, "max_steps": GAMBLE_MAX_STEPS, "multiplier": 2}

    def _offer(self, player: dict, amount: int, bet: int, profile: str, step: int, source_id: int, mode: str = "demo") -> None:
        """Opens the double-up offer for the last credit, or closes it: nothing won, switched off, last step reached, or the
        doubled win would pass the round cap (win_cap_x_total_bet x bet)."""
        m, _ = self._model(profile)
        cap = int(float(m.config["win_cap_x_total_bet"]) * bet + 1e-9)
        ok = (self.gamble_enabled and amount > 0 and step < GAMBLE_MAX_STEPS and amount * 2 <= cap and player[BAL[mode]] >= amount)
        player["gamble"] = ({"amount": amount, "bet": bet, "profile": profile, "step": step, "source_id": source_id, "mode": mode}
                            if ok else None)

    @staticmethod
    def _gamble_view(player: dict):
        g = player.get("gamble")
        return None if not g else {"amount": g["amount"], "step": g["step"], "max_steps": GAMBLE_MAX_STEPS, "bet": g["bet"],
                                   "mode": g.get("mode", "demo")}

    def _career_round(self, player: dict, key: str, mode: str, bet: int, won: bool, free: bool, round_id: int) -> list:
        """Ranks and win streaks after a finished paid round; every reward is also a journal record (audit)."""
        events = career.apply_round(self._career(player, mode), bet, won, free, career.day_of(self.clock()), self.rewards_enabled)
        for e in events:
            self.journal.append({"kind": "reward", "player": key, "nick": player["nickname"], "mode": mode, "round_id": round_id, **e})
        return events

    def _payload(self, token: str, key: str, profile: str) -> dict:
        player = self.store.players[key]
        mode = self.sessions[token]["mode"]
        m, _ = self._model(profile)
        return {
            "session": token, "nickname": player["nickname"], "profile": profile, "balance": player[BAL[mode]], "mode": mode,
            "wallets": {"demo": player["balance"], "real": player["real_balance"]},
            "bet_levels": BET_LEVELS_CENTS, "default_bet": DEFAULT_BET_CENTS, "meta": game_meta(m),
            "line_bet_levels": LINE_BET_CENTS, "max_lines": MAX_LINES,
            "recipe": list(self._recipe_state(player, profile, DEFAULT_BET_CENTS, mode).progress),
            "recipe_cycle": self._recipe_state(player, profile, DEFAULT_BET_CENTS, mode).cycle,
            "pending_order": self._pending_view(player), "gamble": self.gamble_config(), "gamble_offer": self._gamble_view(player),
            "career": career.view(self._career(player, mode)), "rewards_enabled": self.rewards_enabled,
            "wallet": self.wallet_public(player),
        }

    def _check_profile(self, profile) -> str:
        profile = str(profile) if profile is not None else self.profiles[0]
        if profile not in self.profiles:
            raise GameError(f"unknown profile {profile}; available {self.profiles}")
        return profile

    def _open(self, key: str, profile) -> dict:
        profile = self._check_profile(profile)
        self._drop_sessions(key)                         # one live session per account
        player = self.store.players[key]
        player["gamble"] = None                          # a new session starts without an open double-up offer
        pend = player.get("pending_order")
        mode = pend.get("mode", "demo") if pend else "demo"      # an order left open in real mode is finished in real mode
        token = secrets.token_urlsafe(24)
        self.sessions[token] = {"player": key, "profile": profile, "mode": mode, "expires": self.clock() + SESSION_TTL}
        return self._payload(token, key, profile)

    # ------------------------------------------------------------------ accounts
    def register(self, nickname, password, profile=None, client="local") -> dict:
        nick = validate_nickname(nickname)
        validate_password(password)
        self._check_profile(profile)                     # before anything is created: a refused request must change nothing
        key = nick_key(nick)
        self.register_limit.hit(client)
        pw = hash_password(password)                     # slow: outside the lock
        with self.lock:
            if key in self.store.players:
                raise AccountError("this nickname is already taken", 409)
            self.store.players[key] = new_player(nick, pw, self.clock())
            self.store.players[key]["last_login"] = self.clock()
            self.journal.append({"kind": "auth", "event": "register", "player": key, "nick": nick, "ip": client})
            payload = self._open(key, profile)
            self.store.save()
            return payload

    def login(self, nickname, password, profile=None, client="local") -> dict:
        if not isinstance(nickname, str) or not isinstance(password, str) or len(password) > 128 or len(nickname) > 64:
            raise AccountError("invalid nickname or password", 401)
        self._check_profile(profile)
        key = nick_key(nickname.strip())
        self.throttle.check(("nick", key), ("ip", client))
        with self.lock:
            player = self.store.players.get(key)
            pw = dict(player["pw"]) if player and player.get("pw") else None
        ok = verify_password(password, pw or _DUMMY_PW) and pw is not None      # same work for unknown accounts
        if not ok:
            self.throttle.fail(("nick", key), ("ip", client))
            with self.lock:
                self.journal.append({"kind": "auth", "event": "login_fail", "player": key, "ip": client})
            raise AccountError("invalid nickname or password", 401)
        with self.lock:
            player = self.store.players[key]
            if player["status"] != "active":
                self.journal.append({"kind": "auth", "event": "login_refused", "player": key, "ip": client, "status": player["status"]})
                raise AccountError("this account is blocked, contact support", 403)
            self.throttle.success(("nick", key), ("ip", client))
            player["last_login"] = self.clock()
            self.journal.append({"kind": "auth", "event": "login", "player": key, "nick": player["nickname"], "ip": client})
            payload = self._open(key, profile)
            self.store.save()
            return payload

    def set_profile(self, token: str, profile) -> dict:
        with self.lock:
            s = self._session(token)
            profile = str(profile)
            if profile not in self.profiles:
                raise GameError(f"unknown profile {profile}; available {self.profiles}")
            s["profile"] = profile
            return self._payload(token, s["player"], profile)

    def set_mode(self, token: str, mode) -> dict:
        """Switch between the DEMO wallet (play money) and the REAL wallet (TON). Real needs the wallet switched on by the operator
        and the player's age confirmation. Not while an order choice is open (it belongs to one wallet)."""
        if mode not in MODES:
            raise GameError(f"mode must be one of {list(MODES)}")
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            if mode == "real":
                self._need_wallet()
                if player["wallet"].get("age_ok") is None:
                    raise GameError("confirm that you are of legal age first")
            if player.get("pending_order"):
                raise GameError("finish the order you have open first")
            if s["mode"] != mode:
                player["gamble"] = None
                s["mode"] = mode
            return self._payload(token, s["player"], s["profile"])

    def logout(self, token: str) -> dict:
        with self.lock:
            s = self.sessions.pop(token, None) if isinstance(token, str) else None
            if s and s["player"] in self.store.players:
                self.store.players[s["player"]]["gamble"] = None
        return {"ok": True}

    # ------------------------------------------------------------------ game API
    def state(self, token: str, bet: int, lines: int = MAX_LINES) -> dict:
        check_bet(bet, lines)
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            mode = s["mode"]
            return {"balance": player[BAL[mode]], "mode": mode, "wallets": {"demo": player["balance"], "real": player["real_balance"]},
                    "recipe": list(self._recipe_state(player, s["profile"], bet, mode).progress),
                    "recipe_cycle": self._recipe_state(player, s["profile"], bet, mode).cycle,
                    "pending_order": self._pending_view(player), "gamble_offer": self._gamble_view(player),
                    "career": career.view(self._career(player, mode))}

    def spin(self, token: str, bet: int, free: bool = False, lines: int = MAX_LINES) -> dict:
        if not isinstance(free, bool):
            raise GameError("free must be true or false")
        if free:
            lines = MAX_LINES                            # a free spin is worth a fixed total bet and is played on all the lines
        check_bet(bet, lines)
        with self.lock:
            s = self._session(token)
            key = s["player"]
            player = self.store.players[key]
            mode = s["mode"]
            bk = BAL[mode]
            if player.get("pending_order"):
                raise GameError("an order choice is pending")
            if mode == "real":
                self._need_wallet()
                if bet > self.wallet_cfg.max_bet_cents:
                    raise GameError(f"the highest bet in real mode is {ton.ton_text(self.wallet_cfg.max_bet_cents)}")
            car = self._career(player, mode)
            if free:
                if not car["tokens"]:
                    raise GameError("you have no free spins")
                if car["tokens"][0]["bet"] != bet:
                    raise GameError(f"the free spin is worth a bet of {car['tokens'][0]['bet'] / 100:.2f}")
            charge = 0 if free else bet                  # a free spin is not charged, its win is paid as usual
            if player[bk] < charge:
                raise GameError("insufficient balance")
            player["gamble"] = None                      # starting a spin takes the last win as it is
            m, recipe = self._model(s["profile"])
            st = self._recipe_state(player, s["profile"], bet, mode)
            taken = car["tokens"].pop(0) if free else None
            try:
                spin = resolve_paid_spin(m.with_lines(lines), recipe, st, self.py_rng, self._np_rng())
            except Exception:
                if taken:
                    car["tokens"].insert(0, taken)
                raise
            total_x = min(spin["win_x"] + spin["bonus_x"], float(m.config["win_cap_x_total_bet"]))
            win = credit_cents(total_x, bet)
            before = player[bk]
            player[bk] = before - charge + win
            self._save_recipe(player, s["profile"], bet, st, mode)
            record = {"kind": "spin", "player": key, "nick": player["nickname"], "mode": mode, "profile": s["profile"], "bet": bet, "lines": lines,
                      "charged": charge, "free": free, "win_cents": win, "credited_x": total_x, "balance_before": before,
                      "balance_after": player[bk], "orders_pending": bool(spin["orders_triggered"]), "spin": dict(spin)}
            rid = self.journal.append(record)
            ts = self.journal.records[-1]["ts"]
            stt = self._stats(player, mode)
            stt["rounds"] += 1
            stt["wagered"] += charge
            stt["won"] += win
            career.add_dishes(car, len(spin.get("rewards", [])))          # profile shelf: one plate per finished recipe
            if mode == "real":
                player["wallet"]["turnover"] += charge
            events = []
            if spin["orders_triggered"]:
                player["pending_order"] = {"bet": bet, "profile": s["profile"], "credited_x": total_x, "round_id": rid,
                                           "round_win_cents": win, "mode": mode, "free": free, "lines": lines}
                spin["orders"] = {}                    # filled by choose_order
            else:
                self._note_win(player, win, bet, rid, ts, mode)
                self._offer(player, win, bet, s["profile"], 0, rid, mode)
                events = self._career_round(player, key, mode, bet, win > 0, free, rid)
            self.store.save()
            spin.update({"bet": bet, "lines": lines, "credited_x": total_x, "win_cents": win, "balance": player[bk], "round_id": rid, "mode": mode,
                         "free": free, "gamble_offer": self._gamble_view(player), "career": career.view(car), "career_events": events,
                         "recipe_cycle": st.cycle})
            return spin

    def choose_order(self, token: str, order_id: str) -> dict:
        with self.lock:
            s = self._session(token)
            key = s["player"]
            player = self.store.players[key]
            pending = player.get("pending_order")
            if not pending:
                raise GameError("no order to choose")
            mode = pending.get("mode", "demo")
            bk = BAL[mode]
            m, _ = self._model(pending["profile"])
            opt = next((o for o in m.config["orders"]["options"] if o["id"] == order_id), None)
            if opt is None:
                raise GameError(f"unknown order {order_id}")
            res = play_order(m.with_lines(int(pending.get("lines", MAX_LINES))), opt, self._np_rng())
            room = float(m.config["win_cap_x_total_bet"]) - pending["credited_x"]
            res["final_x_uncapped"] = res["final_x"]
            res["final_x"] = max(0.0, min(res["final_x"], room))
            win = credit_cents(res["final_x"], pending["bet"])
            before = player[bk]
            player[bk] += win
            rid = self.journal.append({"kind": "order", "player": key, "nick": player["nickname"], "mode": mode, "profile": pending["profile"],
                                       "bet": pending["bet"], "lines": int(pending.get("lines", MAX_LINES)), "spin_id": pending["round_id"], "order_id": order_id,
                                       "win_cents": win, "balance_before": before, "balance_after": player[bk], "result": res})
            self._stats(player, mode)["won"] += win
            round_win = pending["round_win_cents"] + win
            self._note_win(player, round_win, pending["bet"], pending["round_id"], self.journal.records[-1]["ts"], mode)
            player["pending_order"] = None
            self._offer(player, win, pending["bet"], pending["profile"], 0, rid, mode)
            events = self._career_round(player, key, mode, pending["bet"], round_win > 0, bool(pending.get("free")), rid)
            self.store.save()
            return {"result": res, "win_cents": win, "balance": player[bk], "round_id": rid, "mode": mode,
                    "gamble_offer": self._gamble_view(player), "career": career.view(self._career(player, mode)), "career_events": events}

    # ------------------------------------------------------------------ double-up
    def gamble(self, token: str, pick) -> dict:
        """Risk the open offer on a guess: pick 0 = left van, 1 = right van. The server draws the van now (after the pick)."""
        if isinstance(pick, bool) or not isinstance(pick, int) or not 0 <= pick < GAMBLE_VANS:
            raise GameError("pick must be 0 (left van) or 1 (right van)")
        with self.lock:
            s = self._session(token)
            key = s["player"]
            player = self.store.players[key]
            if not self.gamble_enabled:
                raise GameError("the double-up game is not available")
            offer = player.get("gamble")
            if not offer:
                raise GameError("there is no win to double")
            mode = offer.get("mode", "demo")
            bk = BAL[mode]
            amount = offer["amount"]
            if player[bk] < amount:                      # e.g. an admin lowered the balance: the offer is void
                player["gamble"] = None
                self.store.save()
                raise GameError("this win is no longer available to double")
            hidden = self.py_rng.randrange(GAMBLE_VANS)
            won = pick == hidden
            before = player[bk]
            player[bk] = before + amount if won else before - amount
            result = amount * 2 if won else 0
            rid = self.journal.append({"kind": "gamble", "player": key, "nick": player["nickname"], "mode": mode, "profile": offer["profile"],
                                       "bet": offer["bet"], "prev_id": offer["source_id"], "step": offer["step"],
                                       "stake_cents": amount, "pick": pick, "hidden": hidden, "won": won, "result_cents": result,
                                       "win_cents": result, "balance_before": before, "balance_after": player[bk]})
            st = self._stats(player, mode)
            st["gambles"] = st.get("gambles", 0) + 1
            st["gamble_net"] = st.get("gamble_net", 0) + (amount if won else -amount)
            if won:
                self._offer(player, result, offer["bet"], offer["profile"], offer["step"] + 1, rid, mode)
            else:
                player["gamble"] = None
            self.store.save()
            return {"won": won, "pick": pick, "hidden": hidden, "stake_cents": amount, "result_cents": result, "mode": mode,
                    "balance": player[bk], "round_id": rid, "gamble_offer": self._gamble_view(player)}

    def collect(self, token: str) -> dict:
        """Keep the win as it is (it is already in the balance): the offer is closed."""
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            player["gamble"] = None
            self.store.save()
            return {"balance": player[BAL[s["mode"]]], "gamble_offer": None}

    # ------------------------------------------------------------------ rating and history
    def _ranked(self, mode: str = "demo") -> list:
        field = "best_win" if mode == "demo" else "best_win_real"
        rows = [(p[field]["cents"], p[field]["ts"], k, p) for k, p in self.store.players.items()
                if p["status"] == "active" and p.get(field)]
        rows.sort(key=lambda r: (-r[0], r[1]))                 # biggest first; the earlier win ranks higher on a tie
        return rows

    def leaderboard(self, token=None, limit=LEADERBOARD_SIZE, mode=None) -> dict:
        """Top single (one-round) wins of one wallet (the session's, else demo), one row per player. `me` is added for a valid session."""
        with self.lock:
            s = self.sessions.get(token) if isinstance(token, str) else None
            if s and s["expires"] < self.clock():
                s = None
            mode = mode if mode in MODES else (s["mode"] if s else "demo")
            field = "best_win" if mode == "demo" else "best_win_real"
            ranked = self._ranked(mode)
            rows = [{"rank": i + 1, "nickname": p["nickname"], "win_cents": c, "x": p[field]["x"], "ts": ts,
                     "chef_rank": career.rank_for(self._career(p, mode)["xp"])["n"],
                     "dishes": int(self._career(p, mode).get("dishes", 0))}
                    for i, (c, ts, k, p) in enumerate(ranked[:max(1, min(int(limit), 50))])]
            out = {"rows": rows, "players": len(ranked), "mode": mode}
            if s:
                key = s["player"]
                me = next(((i + 1, p) for i, (c, ts, k, p) in enumerate(ranked) if k == key), None)
                p = self.store.players.get(key)
                out["me"] = {"rank": me[0] if me else None, "nickname": p["nickname"],
                             "win_cents": p[field]["cents"] if p and p.get(field) else 0,
                             "x": p[field]["x"] if p and p.get(field) else 0}
            return out

    @staticmethod
    def _brief(r: dict, with_nick=False) -> dict:
        out = {"id": r["id"], "ts": r["ts"], "kind": r["kind"], "mode": r.get("mode", "demo")}
        if with_nick:
            out["nick"] = r.get("nick")
        if r["kind"] == "spin":
            sp = r["spin"]
            out.update({"bet": r["bet"], "win_cents": r["win_cents"], "x": round(r["credited_x"], 2), "profile": r["profile"],
                        "bonus": [k for k in ("free_spin", "rush") for rw in sp["rewards"] if k in rw],
                        "orders": bool(r.get("orders_pending"))})
        elif r["kind"] == "order":
            res = r["result"]
            out.update({"bet": r["bet"], "win_cents": r["win_cents"], "x": round(res["final_x"], 2), "profile": r["profile"],
                        "order": r["order_id"], "accepted": res["accepted"], "dinner": res["dinner"], "spin_id": r["spin_id"]})
        elif r["kind"] == "gamble":
            out.update({"bet": r["bet"], "win_cents": r["win_cents"], "stake_cents": r["stake_cents"], "won": r["won"], "pick": r["pick"],
                        "hidden": r["hidden"], "step": r["step"], "prev_id": r["prev_id"], "profile": r["profile"],
                        "x": round(r["win_cents"] / r["bet"], 2)})
        else:
            out.update({k: v for k, v in r.items() if k not in ("id", "ts", "kind", "nick", "spin", "result")})
        return out

    def history(self, token: str, limit=20, before=None) -> dict:
        with self.lock:
            s = self._session(token)
            recs = self.journal.query(player=s["player"], kinds={"spin", "order", "gamble"}, before=before, limit=max(1, min(int(limit), 100)),
                                      mode=s["mode"])
            return {"rounds": [self._brief(r) for r in recs]}

    # ------------------------------------------------------------------ admin
    def ensure_admin(self, password: str = None):
        """Creates the admin credential on first start (returns the generated password once) or sets it when given."""
        with self.lock:
            if password:
                validate_password(password)
            elif self.store.data.get("admin"):
                return None
            else:
                password = secrets.token_urlsafe(12)
            self.store.data["admin"] = {"pw": hash_password(password)}
            self.store.save()
            return password

    def admin_login(self, password, client="local") -> dict:
        self.throttle.check(("admin", client), ("admin", "*"))
        rec = (self.store.data.get("admin") or {}).get("pw")
        ok = isinstance(password, str) and len(password) <= 128 and verify_password(password, rec or _DUMMY_PW) and rec is not None
        if not ok:
            self.throttle.fail(("admin", client), ("admin", "*"))
            with self.lock:
                self.journal.append({"kind": "admin", "action": "login_fail", "ip": client})
            raise AccountError("invalid admin password", 401)
        self.throttle.success(("admin", client), ("admin", "*"))
        with self.lock:
            token = secrets.token_urlsafe(32)
            self.admin_sessions[token] = {"expires": self.clock() + ADMIN_TTL}
            self.journal.append({"kind": "admin", "action": "login", "ip": client})
            return {"admin_token": token, "expires_in": ADMIN_TTL}

    def _admin(self, token) -> None:
        s = self.admin_sessions.get(token) if isinstance(token, str) else None
        if s is None or s["expires"] < self.clock():
            self.admin_sessions.pop(token, None)
            raise AccountError("admin session expired", 401)

    def _target(self, key) -> dict:
        if not isinstance(key, str) or key not in self.store.players:
            raise AccountError("no such account", 404)
        return ensure_fields(self.store.players[key])

    @staticmethod
    def _reason(reason) -> str:
        if not isinstance(reason, str) or not (3 <= len(reason.strip()) <= 200):
            raise AccountError("a reason of 3-200 characters is required")
        return reason.strip()

    def _summary(self, key: str, p: dict) -> dict:
        ensure_fields(p)
        return {"key": key, "nickname": p["nickname"], "status": p["status"], "balance": p["balance"], "created": p["created"],
                "last_login": p["last_login"], "rounds": p["stats"]["rounds"], "wagered": p["stats"]["wagered"],
                "won": p["stats"]["won"], "best_win": p.get("best_win"), "pending_order": p.get("pending_order") is not None,
                "online": any(s["player"] == key and s["expires"] >= self.clock() for s in self.sessions.values()),
                "real_balance": p["real_balance"], "real_rounds": p["stats_real"]["rounds"], "real_wagered": p["stats_real"]["wagered"],
                "deposited": p["wallet"]["deposited"], "withdrawn": p["wallet"]["withdrawn"], "age_ok": p["wallet"].get("age_ok") is not None,
                "rank": {m: career.rank_for(self._career(p, m)["xp"])["n"] for m in MODES},
                "tokens": {m: len(self._career(p, m)["tokens"]) for m in MODES}}

    def admin_accounts(self, token, query="", limit=200) -> dict:
        with self.lock:
            self._admin(token)
            q = nick_key(query) if isinstance(query, str) else ""
            rows = [self._summary(k, p) for k, p in self.store.players.items() if q in k]
            rows.sort(key=lambda r: (r["last_login"] or 0, r["created"]), reverse=True)
            return {"accounts": rows[:max(1, min(int(limit), 500))], "total": len(rows)}

    def admin_account(self, token, key) -> dict:
        with self.lock:
            self._admin(token)
            p = self._target(key)
            audit = [r for r in self.journal.query(kinds={"admin"}, limit=500) if r.get("target") == key][:20]
            return {"account": self._summary(key, p),
                    "rounds": [self._brief(r, True) for r in self.journal.query(player=key, kinds={"spin", "order", "gamble"}, limit=30)],
                    "audit": audit, "career": {m: career.view(self._career(p, m)) for m in MODES},
                    "rewards": [{k: v for k, v in r.items() if k != "nick"} for r in self.journal.query(player=key, kinds={"reward"}, limit=20)],
                    "withdrawals": [self._wd_view(w) for w in self._player_withdrawals(key)[:10]],
                    "wallet": {k: v for k, v in p["wallet"].items() if k != "code"} | {"code": p["wallet"].get("code")}}

    def _audit(self, action: str, key: str, **detail) -> int:
        return self.journal.append({"kind": "admin", "action": action, "target": key, **detail})

    def admin_set_status(self, token, key, status, reason) -> dict:
        with self.lock:
            self._admin(token)
            p = self._target(key)
            reason = self._reason(reason)
            if status not in ("active", "blocked"):
                raise AccountError("status must be 'active' or 'blocked'")
            if p["status"] == "legacy":
                raise AccountError("a legacy account needs a password reset first")
            self._audit("set_status", key, old=p["status"], new=status, reason=reason)
            p["status"] = status
            if status == "blocked":
                self._drop_sessions(key)
            self.store.save()
            return {"account": self._summary(key, p)}

    def admin_adjust(self, token, key, delta_cents, reason, wallet="demo") -> dict:
        with self.lock:
            self._admin(token)
            p = self._target(key)
            reason = self._reason(reason)
            if wallet not in MODES:
                raise AccountError("wallet must be 'demo' or 'real'")
            if isinstance(delta_cents, bool) or not isinstance(delta_cents, int) or delta_cents == 0 or abs(delta_cents) > MAX_ADJUST_CENTS:
                raise AccountError(f"delta must be a non-zero integer number of cents, at most {MAX_ADJUST_CENTS}")
            bk = BAL[wallet]
            if p[bk] + delta_cents < 0:
                raise AccountError("the balance can not go below zero")
            old = p[bk]
            p[bk] += delta_cents
            g = p.get("gamble")
            if g and g.get("mode", "demo") == wallet and p[bk] < g["amount"]:
                p["gamble"] = None                       # the doubled win is no longer covered by the balance
            self._stats(p, wallet)["adjusted"] = self._stats(p, wallet).get("adjusted", 0) + delta_cents
            self._audit("adjust_balance", key, old=old, new=p[bk], delta=delta_cents, reason=reason, wallet=wallet)
            self.store.save()
            return {"account": self._summary(key, p)}

    def _need_mode(self, wallet) -> str:
        if wallet not in MODES:
            raise AccountError("wallet must be 'demo' or 'real'")
        return wallet

    def admin_grant_token(self, token, key, wallet, bet_cents, reason) -> dict:
        """A free spin as a gift (support, compensation). Ignores the daily cap; audited."""
        with self.lock:
            self._admin(token)
            p = self._target(key)
            reason = self._reason(reason)
            wallet = self._need_mode(wallet)
            if isinstance(bet_cents, bool) or bet_cents not in BET_LEVELS_CENTS or bet_cents > career.TOKEN_MAX_BET_CENTS:
                raise AccountError(f"a free spin is worth a bet of at most {career.TOKEN_MAX_BET_CENTS / 100:.2f}, one of {BET_LEVELS_CENTS}")
            career.admin_grant(self._career(p, wallet), bet_cents, career.day_of(self.clock()))
            self._audit("grant_free_spin", key, wallet=wallet, bet=bet_cents, reason=reason)
            self.store.save()
            return {"account": self._summary(key, p)}

    def admin_revoke_token(self, token, key, wallet, index, reason) -> dict:
        with self.lock:
            self._admin(token)
            p = self._target(key)
            reason = self._reason(reason)
            wallet = self._need_mode(wallet)
            tokens = self._career(p, wallet)["tokens"]
            if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(tokens):
                raise AccountError("no such free spin")
            gone = tokens.pop(index)
            self._audit("revoke_free_spin", key, wallet=wallet, bet=gone["bet"], src=gone["src"], reason=reason)
            self.store.save()
            return {"account": self._summary(key, p)}

    def admin_settings(self, token, rewards=None, gamble=None) -> dict:
        """Operator switches that can be turned at run time (they return to the command-line values at a restart)."""
        with self.lock:
            self._admin(token)
            for name, val in (("rewards_enabled", rewards), ("gamble_enabled", gamble)):
                if val is None:
                    continue
                if not isinstance(val, bool):
                    raise AccountError(f"{name} must be true or false")
                if getattr(self, name) != val:
                    self._audit("setting", "-", name=name, old=getattr(self, name), new=val)
                    setattr(self, name, val)
            return {"rewards_enabled": self.rewards_enabled, "gamble_enabled": self.gamble_enabled,
                    "wallet_enabled": self.wallet_cfg.enabled, "ranks": career.RANKS, "streak_steps": career.STREAK_STEPS,
                    "rank_up_tokens": career.RANK_UP_TOKENS, "token_max_bet_cents": career.TOKEN_MAX_BET_CENTS,
                    "tokens_per_day": career.TOKENS_PER_DAY, "xp_unit_cents": career.XP_UNIT_CENTS}

    def admin_reset_password(self, token, key, reason) -> dict:
        with self.lock:
            self._admin(token)
            p = self._target(key)
            reason = self._reason(reason)
            temp = secrets.token_urlsafe(9)
            p["pw"] = hash_password(temp)
            if p["status"] == "legacy":
                p["status"] = "active"
            self._drop_sessions(key)
            self.throttle.success(("nick", key))
            self._audit("reset_password", key, reason=reason)
            self.store.save()
            return {"temporary_password": temp, "account": self._summary(key, p)}

    def admin_journal(self, token, player=None, kinds=None, min_win=None, before=None, limit=50) -> dict:
        with self.lock:
            self._admin(token)
            kinds = set(kinds) if kinds else None
            recs = self.journal.query(player=player or None, kinds=kinds, min_win=min_win, before=before, limit=max(1, min(int(limit), 200)))
            return {"records": [self._brief(r, True) for r in recs]}

    def admin_round(self, token, round_id) -> dict:
        with self.lock:
            self._admin(token)
            if isinstance(round_id, bool) or not isinstance(round_id, int):
                raise AccountError("round id must be an integer")
            rec = self.journal.get(round_id)
            if rec is None or rec["kind"] not in ("spin", "order", "gamble"):
                raise AccountError("no such round", 404)
            m, _ = self._model(rec["profile"])
            if rec["kind"] == "gamble":
                report = verify.verify_gamble_record(rec, self.journal.get(rec["prev_id"]), float(m.config["win_cap_x_total_bet"]),
                                                     GAMBLE_VANS, GAMBLE_MAX_STEPS)
                return {"record": rec, "verification": report, "linked_order_id": None, "previous_id": rec["prev_id"]}
            am = m.with_lines(int(rec.get("lines", MAX_LINES)))          # records from before the lines setting were played on all 20
            report = verify.verify_spin_record(am, rec) if rec["kind"] == "spin" else verify.verify_order_record(am, rec)
            linked = None
            if rec["kind"] == "spin" and rec.get("orders_pending"):
                linked = next((r["id"] for r in self.journal.records if r["kind"] == "order" and r.get("spin_id") == rec["id"]), None)
            return {"record": rec, "verification": report, "linked_order_id": linked}
