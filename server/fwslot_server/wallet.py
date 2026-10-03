"""The real-money wallet in TON (a mixin of GameService: it shares the lock, the store, the journal and the sessions).

Money model. A player has two separate wallets: DEMO (play money, can never be withdrawn) and REAL (TON, in cents = 0.01 TON).
Every change of the real balance is one journal record, so the balance can always be re-derived (admin "reconcile").

Deposits   the player sends TON to the operator's address with his personal comment code (FW........); the server READS the chain
           through a provider and credits the transfer exactly once (a cursor on the logical time + a ledger of credited ids). Transfers below
           the minimum are ignored (spam), transfers whose comment matches nobody wait in "unmatched" for an admin.
Withdrawals the player asks for an amount and an address; the amount is taken from the balance AT ONCE (reserved), an admin pays it from
           the operator's own wallet and records the transaction hash, or rejects it (refund). The server holds no private key and
           sends nothing by itself. Rules: age confirmation, minimum / maximum, daily limit, wagering requirement, one open request cap.
"""
import re
import time
from dataclasses import dataclass

import base64
import binascii

from . import boc, ton, ton_wallet
from .accounts import AccountError
from .errors import GameError

_TX_HASH = re.compile(r"^[A-Za-z0-9+/=_-]{8,128}$")
MAX_OPEN_WITHDRAWALS = 3
MAX_OWN_WALLETS = 5                  # wallets one account may create (each new one replaces the saved address)


@dataclass
class WalletConfig:
    enabled: bool = False
    provider: str = "mock"              # "mock" | "toncenter"
    network: str = "mainnet"            # "mainnet" | "testnet"
    address: str = ""                   # the operator's deposit address (friendly or raw); required when enabled
    min_deposit_cents: int = 10         # 0.10 TON: smaller transfers are ignored (dust / spam)
    min_withdraw_cents: int = 100       # 1 TON
    max_withdraw_cents: int = 100_000   # 1 000 TON per request
    daily_withdraw_cents: int = 200_000  # 2 000 TON per player per 24 h
    max_bet_cents: int = 1_000          # 10.00 TON: the highest bet in real mode
    wager_mult: float = 1.0             # a player must wager at least this x his deposits before withdrawing
    confirm_seconds: int = 30           # a transfer is credited this long after it appeared on the chain
    server_create: bool = False         # wallets are made ON THE PLAYER'S DEVICE; True also lets the server make them (the words then cross the network)


class WalletMixin:
    # ------------------------------------------------------------------ setup helpers
    def _wallet_on(self) -> bool:
        return bool(self.wallet_cfg.enabled)

    def _need_wallet(self) -> None:
        if not self._wallet_on():
            raise GameError("the TON wallet is not enabled on this server")

    def _code_for(self, key: str, player: dict) -> str:
        w = player["wallet"]
        if not w.get("code"):
            codes = self.store.data.setdefault("codes", {})
            for _ in range(20):
                code = ton.new_comment_code()
                if code not in codes:
                    codes[code] = key
                    w["code"] = code
                    break
            else:                                                       # pragma: no cover - 32^8 codes
                raise GameError("could not issue a deposit code, try again")
        return w["code"]

    def wallet_public(self, player: dict) -> dict:
        c = self.wallet_cfg
        return {"enabled": c.enabled, "network": c.network, "age_ok": player["wallet"].get("age_ok") is not None,
                "max_bet_cents": c.max_bet_cents, "min_withdraw_cents": c.min_withdraw_cents}

    def _withdrawals(self) -> dict:
        return self.store.data.setdefault("withdrawals", {})

    def _wd_view(self, wd: dict) -> dict:
        return {k: wd[k] for k in ("id", "amount_cents", "address", "status", "created", "decided", "tx_hash", "note") if k in wd}

    # ------------------------------------------------------------------ player API
    def wallet_info(self, token: str) -> dict:
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            c = self.wallet_cfg
            out = {"enabled": c.enabled, "network": c.network, "mode": s.get("mode", "demo"), "real_balance": player["real_balance"],
                   "age_ok": player["wallet"].get("age_ok") is not None, "own_address": player["wallet"].get("own_address", ""),
                   "max_bet_cents": c.max_bet_cents, "min_withdraw_cents": c.min_withdraw_cents, "max_withdraw_cents": c.max_withdraw_cents,
                   "daily_withdraw_cents": c.daily_withdraw_cents, "min_deposit_cents": c.min_deposit_cents}
            if c.enabled:
                code = self._code_for(s["player"], player)
                addr = ton.to_friendly(self.wallet_addr["raw"], testnet=c.network == "testnet")
                w = player["wallet"]
                need = max(0, int(w["deposited"] * c.wager_mult) - w["turnover"])
                out.update({"deposit_address": addr, "deposit_comment": code, "deposit_link": ton.deep_link(addr, code),
                            "deposited_cents": w["deposited"], "withdrawn_cents": w["withdrawn"], "wager_left_cents": need,
                            "withdrawals": [self._wd_view(x) for x in self._player_withdrawals(s["player"])[:10]]})
            self.store.save()
            return out

    def _player_withdrawals(self, key: str) -> list:
        rows = [w for w in self._withdrawals().values() if w["player"] == key]
        rows.sort(key=lambda w: -w["id"])
        return rows

    def wallet_accept(self, token: str, accept) -> dict:
        """Age and legality confirmation, required once before real-money play (a licence requires more: KYC)."""
        if accept is not True:
            raise GameError("confirm with accept = true")
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            if player["wallet"].get("age_ok") is None:
                player["wallet"]["age_ok"] = self.clock()
                self.journal.append({"kind": "wallet", "event": "age_confirm", "player": s["player"], "nick": player["nickname"]})
                self.store.save()
            return {"age_ok": True}

    def wallet_create(self, token: str) -> dict:
        """Creates a personal TON wallet for the player: 24 words and the address. The words are returned ONCE and never kept (not in the
        store, not in the journal); only the address is saved. A new one replaces the saved address (funds stay in the old wallet, the player keeps its words), at most MAX_OWN_WALLETS."""
        self._need_wallet()
        if not self.wallet_cfg.server_create:
            raise GameError("wallets are created on your device; creating them on the server is switched off")
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            w = player["wallet"]
            if w.get("age_ok") is None:
                raise GameError("confirm your age first")
            if w.get("own_count", 0) >= MAX_OWN_WALLETS:
                raise GameError("the limit of wallets for one account is reached")
            made = ton_wallet.create(self.wallet_cfg.network)
            w["own_address"] = made["address"]
            w["own_count"] = w.get("own_count", 0) + 1
            self.journal.append({"kind": "wallet", "event": "own_wallet_created", "player": s["player"], "nick": player["nickname"],
                                 "address": made["address"]})
            self.store.save()
        return {"words": made["words"], "address": made["address"], "network": self.wallet_cfg.network}

    def wallet_register_own(self, token: str, address) -> dict:
        """Saves the address of the player's own wallet (made on his device, or any wallet he owns). Only the address is ever sent here."""
        self._need_wallet()
        try:
            addr = ton.parse_address(address)
            ton.check_network(addr, self.wallet_cfg.network)
        except ValueError as e:
            raise GameError(f"address: {e}")
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            w = player["wallet"]
            if w.get("age_ok") is None:
                raise GameError("confirm your age first")
            if w.get("own_count", 0) >= MAX_OWN_WALLETS:
                raise GameError("the limit of wallets for one account is reached")
            w["own_address"] = address.strip()
            w["own_count"] = w.get("own_count", 0) + 1
            self.journal.append({"kind": "wallet", "event": "own_wallet_linked", "player": s["player"], "nick": player["nickname"],
                                 "address": address.strip()})
            self.store.save()
        return {"address": address.strip()}

    def _own_raw(self, player: dict) -> str:
        own = player["wallet"].get("own_address")
        if not own:
            raise GameError("create or link your own wallet first")
        return ton.parse_address(own)["raw"]

    def wallet_own_info(self, token: str) -> dict:
        """Balance and seqno of the player's own wallet, read from the chain: all the app needs to sign a deposit."""
        self._need_wallet()
        with self.lock:
            s = self._session(token)
            player = self.store.players[s["player"]]
            raw = self._own_raw(player)
            own = player["wallet"]["own_address"]
            code = self._code_for(s["player"], player)
            self.store.save()
        try:
            st = self.ton.own_state(raw)
        except ton.ProviderError as e:
            raise GameError(f"could not read your wallet: {e}")
        c = self.wallet_cfg
        return {"address": own, "balance_nano": st["balance_nano"], "balance_cents": st["balance_nano"] // ton.NANO_PER_CENT, "seqno": st["seqno"],
                "active": st["active"], "network": c.network, "operator_address": ton.to_friendly(self.wallet_addr["raw"], testnet=c.network == "testnet"),
                "operator_raw": self.wallet_addr["raw"], "deposit_comment": code, "min_deposit_cents": c.min_deposit_cents}

    def wallet_send_boc(self, token: str, boc_b64) -> dict:
        """Relays a deposit that the player's own wallet signed on his device. The server never holds a key: it checks that the message really is
        'from your wallet, to the game, with your code, in a sane amount, not expired' and only then passes it on to the network."""
        self._need_wallet()
        if not isinstance(boc_b64, str) or not 8 <= len(boc_b64) <= 8192:
            raise GameError("the transaction is missing or too large")
        try:
            data = base64.b64decode(boc_b64, validate=True)
            t = boc.parse_transfer(data)
        except (binascii.Error, ValueError, boc.BocError):
            raise GameError("this is not a valid wallet transfer")
        c = self.wallet_cfg
        with self.lock:
            s = self._session(token)
            key = s["player"]
            player = self.store.players[key]
            w = player["wallet"]
            if w.get("age_ok") is None:
                raise GameError("confirm your age first")
            if t["wallet"] != self._own_raw(player):
                raise GameError("the transfer is not from your own wallet")
            if t["dest"] != self.wallet_addr["raw"]:
                raise GameError("a deposit must go to the game's address")
            if t["comment"] != self._code_for(key, player):
                raise GameError("the comment of the transfer must be your deposit code")
            if not c.min_deposit_cents * ton.NANO_PER_CENT <= t["amount_nano"] <= 1_000_000 * ton.NANO_PER_CENT:
                raise GameError("the amount is outside the allowed range for a deposit")
            now = self.clock()
            if not now + 5 <= t["valid_until"] <= now + 3600:
                raise GameError("the transaction has expired or is dated too far ahead; sign it again")
            self.send_limit.hit(key, "deposit transactions")
            self.journal.append({"kind": "wallet", "event": "deposit_sent", "player": key, "nick": player["nickname"],
                                 "amount_nano": t["amount_nano"], "seqno": t["seqno"], "wallet": w["own_address"]})
            self.store.save()
        try:
            self.ton.send_boc(data)
        except ton.ProviderError as e:
            raise GameError(f"the network did not accept the transaction: {e}")
        return {"ok": True, "seqno": t["seqno"], "amount_nano": t["amount_nano"]}

    def wallet_history(self, token: str, limit=30) -> dict:
        with self.lock:
            s = self._session(token)
            recs = self.journal.query(player=s["player"], kinds={"wallet"}, limit=max(1, min(int(limit), 100)))
            keep = ("id", "ts", "event", "amount_cents", "wd_id", "tx_hash", "balance_after", "note")
            return {"events": [{k: r[k] for k in keep if k in r} for r in recs if r["event"] != "age_confirm"]}

    def wallet_withdraw(self, token: str, amount_cents, address) -> dict:
        self._need_wallet()
        if isinstance(amount_cents, bool) or not isinstance(amount_cents, int):
            raise GameError("amount must be a whole number of cents")
        c = self.wallet_cfg
        try:
            addr = ton.parse_address(address)
            ton.check_network(addr, c.network)
        except ValueError as e:
            raise GameError(f"address: {e}")
        with self.lock:
            s = self._session(token)
            key = s["player"]
            player = self.store.players[key]
            w = player["wallet"]
            if w.get("age_ok") is None:
                raise GameError("confirm that you are of legal age first")
            if amount_cents < c.min_withdraw_cents:
                raise GameError(f"the minimum withdrawal is {ton.ton_text(c.min_withdraw_cents)}")
            if amount_cents > c.max_withdraw_cents:
                raise GameError(f"the maximum withdrawal is {ton.ton_text(c.max_withdraw_cents)}")
            if player.get("pending_order"):
                raise GameError("finish the order you have open first")
            if amount_cents > player["real_balance"]:
                raise GameError("insufficient real balance")
            need = int(w["deposited"] * c.wager_mult) - w["turnover"]
            if need > 0:
                raise GameError(f"play at least {ton.ton_text(need)} more before withdrawing (wagering requirement)")
            mine = self._player_withdrawals(key)
            if sum(1 for x in mine if x["status"] == "pending") >= MAX_OPEN_WITHDRAWALS:
                raise GameError("too many open withdrawals, wait for them to be processed")
            day_ago = self.clock() - 86400
            used = sum(x["amount_cents"] for x in mine if x["status"] in ("pending", "paid") and x["created"] >= day_ago)
            if used + amount_cents > c.daily_withdraw_cents:
                raise GameError(f"the daily limit is {ton.ton_text(c.daily_withdraw_cents)} (you have {ton.ton_text(max(0, c.daily_withdraw_cents - used))} left)")
            wds = self._withdrawals()
            wd_id = int(self.store.data.get("wd_seq", 0)) + 1
            self.store.data["wd_seq"] = wd_id
            before = player["real_balance"]
            player["real_balance"] = before - amount_cents
            player["gamble"] = None if (player.get("gamble") or {}).get("mode") == "real" else player.get("gamble")
            wds[str(wd_id)] = {"id": wd_id, "player": key, "nick": player["nickname"], "amount_cents": amount_cents, "address": address.strip(),
                               "raw": addr["raw"], "status": "pending", "created": self.clock()}
            self.journal.append({"kind": "wallet", "event": "withdraw_request", "player": key, "nick": player["nickname"], "wd_id": wd_id,
                                 "amount_cents": amount_cents, "address": address.strip(), "balance_before": before,
                                 "balance_after": player["real_balance"]})
            self.store.save()
            return {"withdrawal": self._wd_view(wds[str(wd_id)]), "real_balance": player["real_balance"]}

    def wallet_cancel(self, token: str, wd_id) -> dict:
        if isinstance(wd_id, bool) or not isinstance(wd_id, int):
            raise GameError("withdrawal id must be an integer")
        with self.lock:
            s = self._session(token)
            wd = self._withdrawals().get(str(wd_id))
            if wd is None or wd["player"] != s["player"]:
                raise GameError("no such withdrawal")
            return self._refund(wd, "withdraw_cancelled", None, by_admin=False)

    def _refund(self, wd: dict, event: str, reason, by_admin: bool) -> dict:
        """pending -> cancelled / rejected: the reserved amount goes back to the real balance. Only a pending request can move."""
        if wd["status"] != "pending":
            raise GameError(f"this withdrawal is already {wd['status']}")
        player = self.store.players[wd["player"]]
        before = player["real_balance"]
        player["real_balance"] = before + wd["amount_cents"]
        wd["status"] = "cancelled" if event == "withdraw_cancelled" else "rejected"
        wd["decided"] = self.clock()
        if reason:
            wd["note"] = reason
        self.journal.append({"kind": "wallet", "event": event, "player": wd["player"], "nick": wd["nick"], "wd_id": wd["id"],
                             "amount_cents": wd["amount_cents"], "note": reason, "balance_before": before, "balance_after": player["real_balance"]})
        self.store.save()
        return {"withdrawal": self._wd_view(wd), "real_balance": player["real_balance"]}

    # ------------------------------------------------------------------ deposits
    def scan_deposits(self) -> dict:
        """Reads the chain once and credits every new, confirmed transfer. Safe to call as often as you like: a credited transfer is
        remembered, so nothing is ever credited twice. Returns counters (also for the admin cabinet)."""
        if not self._wallet_on() or self.ton is None:
            return {"enabled": False}
        cursor = self.store.data.get("ton_cursor")
        try:
            rows = self.ton.incoming(cursor)
        except ton.ProviderError as e:
            return {"enabled": True, "error": str(e)}
        out = {"enabled": True, "credited": 0, "unmatched": 0, "ignored": 0, "waiting": 0, "duplicate": 0}
        with self.lock:
            cursor = self.store.data.get("ton_cursor")                  # re-read: a parallel scan may have moved it
            codes = self.store.data.setdefault("codes", {})
            seen = self.store.data.setdefault("ton_seen", {})
            for tx in sorted(rows, key=lambda t: t["lt"]):                # oldest first: the cursor only moves forward
                if cursor is not None and tx["lt"] <= cursor:
                    continue
                if self.clock() - tx["utime"] < self.wallet_cfg.confirm_seconds:
                    out["waiting"] += 1
                    break                                                 # younger ones wait too
                cursor = tx["lt"]
                self.store.data["ton_cursor"] = cursor
                if tx["id"] in seen:
                    out["duplicate"] += 1
                    continue
                if tx["amount_nano"] < self.wallet_cfg.min_deposit_cents * ton.NANO_PER_CENT:
                    out["ignored"] += 1
                    continue
                code = "".join(tx["comment"].upper().split())
                key = codes.get(code)
                if key is None or key not in self.store.players:
                    self._park(tx)
                    out["unmatched"] += 1
                else:
                    self._credit(key, tx, "deposit")
                    out["credited"] += 1
            self.store.save()
        return out

    def _park(self, tx: dict) -> None:
        rid = self.journal.append({"kind": "wallet", "event": "deposit_unmatched", "tx": tx["id"], "nano": tx["amount_nano"],
                                   "comment": tx["comment"], "source": tx["source"]})
        self.store.data.setdefault("unmatched", {})[tx["id"]] = {"tx": tx["id"], "nano": tx["amount_nano"], "comment": tx["comment"],
                                                                  "source": tx["source"], "utime": tx["utime"], "journal_id": rid}

    def _credit(self, key: str, tx: dict, event: str, by=None) -> int:
        player = self.store.players[key]
        cents, dust = ton.cents_from_nano(tx["amount_nano"])
        before = player["real_balance"]
        player["real_balance"] = before + cents
        w = player["wallet"]
        w["deposited"] += cents
        w["dust_nano"] = w.get("dust_nano", 0) + dust
        rec = {"kind": "wallet", "event": event, "player": key, "nick": player["nickname"], "amount_cents": cents, "nano": tx["amount_nano"],
               "tx": tx["id"], "source": tx["source"], "comment": tx["comment"], "balance_before": before, "balance_after": player["real_balance"]}
        if by:
            rec["by"] = by
        rid = self.journal.append(rec)
        self.store.data.setdefault("ton_seen", {})[tx["id"]] = rid
        return cents

    # ------------------------------------------------------------------ admin cabinet
    def admin_wallet(self, token) -> dict:
        with self.lock:
            self._admin(token)
            c = self.wallet_cfg
            wds = list(self._withdrawals().values())
            players = self.store.players
            return {"enabled": c.enabled, "provider": getattr(self.ton, "name", None), "network": c.network,
                    "address": ton.to_friendly(self.wallet_addr["raw"], testnet=c.network == "testnet") if c.enabled else None,
                    "cursor": self.store.data.get("ton_cursor"),
                    "limits": {"min_deposit_cents": c.min_deposit_cents, "min_withdraw_cents": c.min_withdraw_cents, "max_withdraw_cents": c.max_withdraw_cents,
                               "daily_withdraw_cents": c.daily_withdraw_cents, "max_bet_cents": c.max_bet_cents, "wager_mult": c.wager_mult},
                    "totals": {"deposited_cents": sum(p["wallet"]["deposited"] for p in players.values()),
                               "withdrawn_cents": sum(p["wallet"]["withdrawn"] for p in players.values()),
                               "pending_cents": sum(w["amount_cents"] for w in wds if w["status"] == "pending"),
                               "pending_count": sum(1 for w in wds if w["status"] == "pending"),
                               "player_real_balances_cents": sum(p["real_balance"] for p in players.values()),
                               "unmatched_count": len(self.store.data.get("unmatched", {}))}}

    def admin_withdrawals(self, token, status=None, limit=100) -> dict:
        with self.lock:
            self._admin(token)
            rows = [w for w in self._withdrawals().values() if status in (None, "") or w["status"] == status]
            rows.sort(key=lambda w: -w["id"])
            out = []
            for w in rows[:max(1, min(int(limit), 500))]:
                p = self.store.players.get(w["player"], {})
                wal = p.get("wallet", {})
                out.append({**self._wd_view(w), "player": w["player"], "nick": w["nick"], "raw": w["raw"],
                            "player_deposited": wal.get("deposited"), "player_turnover": wal.get("turnover"),
                            "player_real_balance": p.get("real_balance")})
            return {"withdrawals": out}

    def admin_withdraw_paid(self, token, wd_id, tx_hash, note="") -> dict:
        with self.lock:
            self._admin(token)
            wd = self._withdrawals().get(str(wd_id)) if isinstance(wd_id, int) and not isinstance(wd_id, bool) else None
            if wd is None:
                raise AccountError("no such withdrawal", 404)
            if not isinstance(tx_hash, str) or not _TX_HASH.match(tx_hash.strip()):
                raise AccountError("enter the transaction hash of the payment (8-128 characters)")
            h = tx_hash.strip()
            if any(x.get("tx_hash") == h for x in self._withdrawals().values()):
                raise AccountError("this transaction hash is already recorded for another withdrawal")
            if wd["status"] != "pending":
                raise AccountError(f"this withdrawal is already {wd['status']}")
            note = (note or "").strip()[:200]
            wd.update({"status": "paid", "decided": self.clock(), "tx_hash": h, "note": note})
            player = self.store.players[wd["player"]]
            player["wallet"]["withdrawn"] += wd["amount_cents"]
            self.journal.append({"kind": "wallet", "event": "withdraw_paid", "player": wd["player"], "nick": wd["nick"], "wd_id": wd["id"],
                                 "amount_cents": wd["amount_cents"], "tx_hash": h, "note": note})
            self._audit("withdraw_paid", wd["player"], wd_id=wd["id"], amount=wd["amount_cents"], tx_hash=h)
            self.store.save()
            return {"withdrawal": self._wd_view(wd)}

    def admin_withdraw_reject(self, token, wd_id, reason) -> dict:
        with self.lock:
            self._admin(token)
            wd = self._withdrawals().get(str(wd_id)) if isinstance(wd_id, int) and not isinstance(wd_id, bool) else None
            if wd is None:
                raise AccountError("no such withdrawal", 404)
            reason = self._reason(reason)
            try:
                res = self._refund(wd, "withdraw_rejected", reason, by_admin=True)
            except GameError as e:
                raise AccountError(str(e))
            self._audit("withdraw_rejected", wd["player"], wd_id=wd["id"], amount=wd["amount_cents"], reason=reason)
            return res

    def admin_deposits(self, token, limit=100) -> dict:
        with self.lock:
            self._admin(token)
            recs = self.journal.query(kinds={"wallet"}, limit=500)
            keep = [r for r in recs if r["event"] in ("deposit", "deposit_assigned")][:max(1, min(int(limit), 500))]
            return {"deposits": keep, "unmatched": list(self.store.data.get("unmatched", {}).values())}

    def admin_assign_deposit(self, token, tx_id, key, reason) -> dict:
        """Credits a parked transfer (comment missing or mistyped) to the player an admin identified. Audited."""
        with self.lock:
            self._admin(token)
            parked = self.store.data.get("unmatched", {})
            tx = parked.get(tx_id) if isinstance(tx_id, str) else None
            if tx is None:
                raise AccountError("no such unmatched transfer", 404)
            self._target(key)
            reason = self._reason(reason)
            cents = self._credit(key, {"id": tx["tx"], "amount_nano": tx["nano"], "source": tx["source"], "comment": tx["comment"]}, "deposit_assigned", by="admin")
            del parked[tx_id]
            self._audit("assign_deposit", key, tx=tx_id, amount=cents, reason=reason)
            self.store.save()
            return {"credited_cents": cents}

    def admin_simulate_deposit(self, token, key, amount_cents) -> dict:
        """Development only (mock provider): behaves exactly like a transfer that arrived on the chain."""
        with self.lock:
            self._admin(token)
            if not self._wallet_on() or getattr(self.ton, "name", None) != "mock":
                raise AccountError("only available with the mock wallet provider")
            p = self._target(key)
            if isinstance(amount_cents, bool) or not isinstance(amount_cents, int) or not 1 <= amount_cents <= 10_000_000:
                raise AccountError("amount must be 1 .. 10 000 000 cents")
            code = self._code_for(key, p)
            self.ton.simulate(code, amount_cents * ton.NANO_PER_CENT)
        return {"scan": self.scan_deposits()}

    def admin_fund_own(self, token, key, amount_cents) -> dict:
        """Development only (mock provider): puts pretend TON on the player's own wallet, as if he had bought it on an exchange."""
        with self.lock:
            self._admin(token)
            if not self._wallet_on() or getattr(self.ton, "name", None) != "mock":
                raise AccountError("only available with the mock wallet provider")
            p = self._target(key)
            own = p["wallet"].get("own_address")
            if not own:
                raise AccountError("the player has no wallet of his own")
            if isinstance(amount_cents, bool) or not isinstance(amount_cents, int) or not 1 <= amount_cents <= 10_000_000:
                raise AccountError("amount must be 1 .. 10 000 000 cents")
            self.ton.fund(own, amount_cents * ton.NANO_PER_CENT)
        return {"funded_cents": amount_cents}

    def admin_scan(self, token) -> dict:
        with self.lock:
            self._admin(token)
        return {"scan": self.scan_deposits()}

    def admin_reconcile(self, token) -> dict:
        """Re-derives every balance from the journal and compares it with the stored one. Empty `mismatches` = the books close."""
        with self.lock:
            self._admin(token)
            return self.reconcile()

    def reconcile(self) -> dict:
        from .store import START_BALANCE_CENTS
        exp = {}                                                                    # (player, mode) -> cents
        for k, p in self.store.players.items():
            if p.get("legacy"):
                continue                                                            # a balance from before the journal existed
            exp[(k, "demo")] = START_BALANCE_CENTS
            exp[(k, "real")] = 0
        for r in self.journal.records:
            k = r.get("player") or r.get("target")
            kind = r["kind"]
            mode = r.get("mode", "demo")
            if (k, "demo") not in exp:
                continue
            if kind == "spin":
                exp[(k, mode)] += r["win_cents"] - r.get("charged", r["bet"])
            elif kind == "order":
                exp[(k, mode)] += r["win_cents"]
            elif kind == "gamble":
                exp[(k, mode)] += r["stake_cents"] if r["won"] else -r["stake_cents"]
            elif kind == "wallet":
                ev = r["event"]
                if ev in ("deposit", "deposit_assigned", "withdraw_rejected", "withdraw_cancelled"):
                    exp[(k, "real")] += r["amount_cents"]
                elif ev == "withdraw_request":
                    exp[(k, "real")] -= r["amount_cents"]
            elif kind == "admin" and r.get("action") == "adjust_balance":
                exp[(k, r.get("wallet", "demo"))] += r["delta"]
        bad = []
        for (k, mode), cents in exp.items():
            have = self.store.players[k]["balance" if mode == "demo" else "real_balance"]
            if have != cents:
                bad.append({"player": k, "wallet": mode, "stored": have, "derived": cents, "difference": have - cents})
        return {"players": len(self.store.players), "records": len(self.journal.records), "mismatches": bad}
