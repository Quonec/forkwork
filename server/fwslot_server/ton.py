"""TON helpers: address validation, amounts, and the sources of incoming deposits.

What this module does NOT do, on purpose: it never holds a private key and never sends a transaction. Deposits are READ from the
chain (a provider returns the incoming transfers of the operator's address); withdrawals are paid by a person from the operator's own
wallet and recorded in the admin cabinet with the transaction hash. A game server that can move funds on its own is a target.

Units: the game keeps money in integer "cents"; in the real wallet 1 cent = 0.01 TON = 10 000 000 nanoTON (TON has 9 decimals).
"""
import base64
import binascii
import hashlib
import json
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

NANO = 10 ** 9
NANO_PER_CENT = 10_000_000                    # 0.01 TON
_RAW = re.compile(r"^(-?\d{1,3}):([0-9a-fA-F]{64})$")
_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"        # no 0 / 1 / I / O: a comment typed by hand stays unambiguous


class ProviderError(Exception):
    """The chain data source did not answer as expected."""


def crc16_xmodem(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def parse_address(text: str) -> dict:
    """Validates a TON address (user-friendly base64 with CRC, or raw `workchain:hex`) and returns
    {"raw": "0:HEX" (upper case), "workchain", "bounceable", "testnet"}. Raises ValueError with a readable reason."""
    if not isinstance(text, str) or not text.strip() or len(text) > 100:
        raise ValueError("enter a TON address")
    t = text.strip()
    m = _RAW.match(t)
    if m:
        wc = int(m.group(1))
        if wc not in (0, -1):
            raise ValueError("unsupported workchain")
        return {"raw": f"{wc}:{m.group(2).upper()}", "workchain": wc, "bounceable": None, "testnet": None}
    if len(t) != 48:
        raise ValueError("a TON address has 48 characters (or the raw form 0:<64 hex>)")
    try:
        data = base64.urlsafe_b64decode(t.replace("+", "-").replace("/", "_"))
    except (binascii.Error, ValueError):
        raise ValueError("the address is not valid base64")
    if len(data) != 36:
        raise ValueError("wrong address length")
    if crc16_xmodem(data[:34]) != int.from_bytes(data[34:], "big"):
        raise ValueError("the address checksum does not match: a character was mistyped")
    tag = data[0]
    testnet = bool(tag & 0x80)
    base_tag = tag & 0x7F
    if base_tag not in (0x11, 0x51):
        raise ValueError("this is not a wallet address")
    wc = data[1] if data[1] < 128 else data[1] - 256
    if wc not in (0, -1):
        raise ValueError("unsupported workchain")
    return {"raw": f"{wc}:{data[2:34].hex().upper()}", "workchain": wc, "bounceable": base_tag == 0x11, "testnet": testnet}


def to_friendly(raw: str, bounceable: bool = False, testnet: bool = False) -> str:
    """The user-friendly form of a raw address (non-bounceable by default: the right form for a deposit address)."""
    m = _RAW.match(raw)
    if not m:
        raise ValueError("not a raw address")
    wc = int(m.group(1))
    tag = (0x11 if bounceable else 0x51) | (0x80 if testnet else 0)
    body = bytes([tag, wc & 0xFF]) + bytes.fromhex(m.group(2))
    return base64.urlsafe_b64encode(body + crc16_xmodem(body).to_bytes(2, "big")).decode()


def check_network(addr: dict, network: str) -> None:
    """A testnet-only address must not be accepted on mainnet (funds would be lost); the raw form carries no flag."""
    if network == "mainnet" and addr["testnet"]:
        raise ValueError("this is a testnet address; the game uses the main TON network")


def new_comment_code() -> str:
    """Per-player deposit comment, e.g. FW7K2M9QXT. The player writes it in the transfer comment."""
    return "FW" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))


def cents_from_nano(nano: int) -> tuple:
    """(whole cents, leftover nanoTON): nothing is rounded up, the dust is kept on the ledger."""
    return nano // NANO_PER_CENT, nano % NANO_PER_CENT


def ton_text(cents: int) -> str:
    return f"{cents / 100:.2f} TON"


def deep_link(address: str, comment: str, amount_cents: int = 0) -> str:
    q = {"text": comment}
    if amount_cents > 0:
        q["amount"] = str(amount_cents * NANO_PER_CENT)
    return f"ton://transfer/{address}?{urllib.parse.urlencode(q)}"


# ---------------------------------------------------------------------------------------------------- providers

def parse_toncenter(payload: dict, our_raw: str) -> list:
    """Incoming internal transfers to `our_raw` from a TON Center v2 getTransactions answer, newest first:
    [{"id": "<lt>:<hash>", "lt", "hash", "utime", "amount_nano", "comment", "source"}].
    Ignored: external messages (no source), transfers to other accounts, zero value, malformed rows. The comment is taken only when
    the message is a plain text comment (jetton / NFT / binary bodies carry no comment we could match)."""
    if not isinstance(payload, dict) or not payload.get("ok") or not isinstance(payload.get("result"), list):
        raise ProviderError("unexpected answer from the TON API")
    out = []
    for tx in payload["result"]:
        try:
            msg = tx.get("in_msg") or {}
            if not msg.get("source"):
                continue
            if str(tx.get("account", "")).upper() != our_raw.upper():
                continue
            if parse_address(msg["destination"])["raw"] != our_raw.upper():
                continue
            amount = int(msg["value"])
            if amount <= 0:
                continue
            tid = tx["transaction_id"]
            text = msg.get("message") if (msg.get("msg_data") or {}).get("@type") == "msg.dataText" else ""
            out.append({"id": f"{tid['lt']}:{tid['hash']}", "lt": int(tid["lt"]), "hash": tid["hash"], "utime": int(tx["utime"]),
                        "amount_nano": amount, "comment": (text or "").strip()[:128], "source": msg["source"]})
        except (KeyError, ValueError, TypeError):
            continue
    return out


class MockTon:
    """Development / test source: nothing touches a network. `simulate` queues a transfer as if it had arrived."""
    name = "mock"
    FEE_NANO = 10_000_000                          # a pretend network fee of 0.01 TON
    CONFIRMED_AGE = 3600                           # a sent transfer counts as old enough to be credited at the next scan

    def __init__(self, clock=time.time):
        self.clock = clock
        self._queue = []
        self._n = 0
        self._lt = 0
        self._own = {}

    def simulate(self, comment: str, amount_nano: int, source: str = "EQMOCK-SENDER", age: int = 600) -> dict:
        self._n += 1
        self._lt = max(self._lt + 1, int(self.clock() * 1000))      # like the chain's logical time: it only grows, also across restarts
        tx = {"id": f"mock:{self._n}:{secrets.token_hex(4)}", "lt": self._lt, "hash": f"mock-{self._n}", "utime": int(self.clock()) - age,
              "amount_nano": int(amount_nano), "comment": comment, "source": source}
        self._queue.append(tx)
        return tx

    def incoming(self, since_lt=None) -> list:
        out, self._queue = list(reversed(self._queue)), []
        return out

    # ---- a pretend chain for wallets made on the players' devices (development and tests)
    def fund(self, address: str, nano: int) -> None:
        raw = parse_address(address)["raw"]
        st = self._own.setdefault(raw, {"balance": 0, "seqno": 0})
        st["balance"] += int(nano)

    def own_state(self, raw: str) -> dict:
        st = self._own.get(raw, {"balance": 0, "seqno": 0})
        return {"balance_nano": st["balance"], "seqno": st["seqno"], "active": st["seqno"] > 0}

    def send_boc(self, data: bytes) -> dict:
        """Behaves like the chain for a simple transfer: the seqno must match, the wallet must hold amount + fee, then the money moves."""
        from . import boc as _boc
        t = _boc.parse_transfer(data)
        st = self._own.setdefault(t["wallet"], {"balance": 0, "seqno": 0})
        if t["seqno"] != st["seqno"]:
            raise ProviderError("seqno mismatch: the wallet is at %d" % st["seqno"])
        if t["valid_until"] < self.clock():
            raise ProviderError("the message has expired")
        if st["balance"] < t["amount_nano"] + self.FEE_NANO:
            raise ProviderError("not enough funds in the wallet")
        st["balance"] -= t["amount_nano"] + self.FEE_NANO
        st["seqno"] += 1
        src = to_friendly(t["wallet"], testnet=False)
        self.simulate(t["comment"], t["amount_nano"], source=src, age=self.CONFIRMED_AGE)
        return {"hash": hashlib.sha256(data).hexdigest()}


class ToncenterTon:
    """Reads the incoming transfers of `address` from TON Center (https://toncenter.com, or your own node's HTTP API).
    Read only. The API key is optional (a key lifts the public rate limit)."""
    name = "toncenter"

    def __init__(self, address: str, base_url: str = "https://toncenter.com", api_key: str = None, timeout: float = 15.0, opener=None):
        self.addr = parse_address(address)
        self.address = address
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._open = opener or urllib.request.urlopen

    def _get(self, params: dict) -> dict:
        url = f"{self.base_url}/api/v2/getTransactions?" + urllib.parse.urlencode(params)
        headers = {"User-Agent": "fwslot-server"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        try:
            with self._open(urllib.request.Request(url, headers=headers), timeout=self.timeout) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise ProviderError(f"TON API request failed: {e}")

    def _call(self, method: str, params: dict = None, body: dict = None) -> dict:
        url = f"{self.base_url}/api/v2/{method}" + ("?" + urllib.parse.urlencode(params) if params else "")
        headers = {"User-Agent": "fwslot-server"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        try:
            with self._open(urllib.request.Request(url, data=data, headers=headers), timeout=self.timeout) as r:
                out = json.loads(r.read())
        except urllib.error.HTTPError as e:                          # TON Center answers 4xx / 5xx with a JSON explanation
            try:
                out = json.loads(e.read())
            except (ValueError, OSError):
                raise ProviderError(f"TON API request failed: {e}")
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise ProviderError(f"TON API request failed: {e}")
        if not isinstance(out, dict) or not out.get("ok"):
            raise ProviderError("TON API: %s" % (str(out.get("error"))[:200] if isinstance(out, dict) else "unexpected answer"))
        return out

    def own_state(self, raw: str) -> dict:
        """Balance and seqno of a wallet (any address): what the player's own wallet needs before it signs a transaction."""
        res = self._call("getWalletInformation", {"address": raw}).get("result") or {}
        try:
            return {"balance_nano": int(res.get("balance", 0)), "seqno": int(res.get("seqno") or 0), "active": res.get("account_state") == "active"}
        except (TypeError, ValueError):
            raise ProviderError("unexpected answer from the TON API")

    def send_boc(self, data: bytes) -> dict:
        out = self._call("sendBoc", body={"boc": base64.b64encode(data).decode()})
        return out.get("result") or {}

    def incoming(self, since_lt=None, page: int = 50, max_pages: int = 10) -> list:
        """Incoming transfers newer than `since_lt` (all of the newest `page` when None). Pages back in time until it reaches a
        transaction the caller has already handled, so a flood of spam transfers can not push a real deposit out of the window."""
        rows, seen, lt, h = [], set(), None, None
        for _ in range(max_pages):
            params = {"address": self.address, "limit": max(1, min(page, 100)), "archival": "true"}   # "false" fails on the public node as soon as the page reaches older blocks
            if lt is not None:
                params["lt"], params["hash"] = lt, h
            data = self._get(params)
            raw = data.get("result") if isinstance(data, dict) else None
            for r in parse_toncenter(data, self.addr["raw"]):
                if r["id"] not in seen:
                    seen.add(r["id"])
                    rows.append(r)
            if not raw or len(raw) < params["limit"] - (1 if lt is not None else 0):
                break                                                   # the history ends here
            oldest = raw[-1]["transaction_id"]
            if since_lt is not None and int(oldest["lt"]) <= since_lt:
                break                                                   # everything older was handled already
            lt, h = oldest["lt"], oldest["hash"]
        return rows
