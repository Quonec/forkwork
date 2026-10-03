"""Accounts: nickname / password rules, password hashing, brute-force throttle.

Passwords are never stored: only scrypt(salt, password) with a per-account random salt, compared in constant time.
Login errors never say whether the nickname exists. Failed logins are throttled per nickname AND per client address.
"""
import hashlib
import hmac
import re
import secrets
import time
import unicodedata

NICK_RE = re.compile(r"^[\w\-]{3,20}$")          # unicode letters/digits, _ and -
MIN_PASSWORD, MAX_PASSWORD = 8, 128
RESERVED = {"admin", "administrator", "root", "system", "moderator", "support", "guest", "chef", "sleeperchef"}
SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}


class AccountError(Exception):
    """A request the account system refuses (bad input, wrong password, locked...). Maps to HTTP 400/403/429."""

    def __init__(self, message, code=400):
        super().__init__(message)
        self.code = code


def nick_key(nickname: str) -> str:
    """Identity key: Unicode-normalized and case-folded, so 'Chef' and 'chef' (or fullwidth variants) are one account."""
    return unicodedata.normalize("NFKC", nickname).casefold()


def validate_nickname(nickname) -> str:
    if not isinstance(nickname, str):
        raise AccountError("nickname must be text")
    nick = unicodedata.normalize("NFKC", nickname)            # no stripping: stray whitespace/newlines are refused
    if not NICK_RE.fullmatch(nick):
        raise AccountError("nickname must be 3-20 characters: letters, digits, _ or -")
    key = nick_key(nick)
    if key in RESERVED or key.startswith("legacy_") or key.startswith("admin"):
        raise AccountError("this nickname is reserved")
    return nick


def validate_password(password) -> str:
    if not isinstance(password, str):
        raise AccountError("password must be text")
    if not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        raise AccountError(f"password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters")
    if password.lower() == password.upper() and not any(ch.isdigit() for ch in password):
        raise AccountError("password must contain letters or digits")
    return password


def hash_password(password: str, salt: bytes = None) -> dict:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, dklen=32, maxmem=64 * 1024 * 1024, **SCRYPT)
    return {"alg": "scrypt", **SCRYPT, "salt": salt.hex(), "hash": digest.hex()}


def verify_password(password: str, record: dict) -> bool:
    try:
        salt = bytes.fromhex(record["salt"])
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, dklen=32, maxmem=64 * 1024 * 1024,
                                n=record["n"], r=record["r"], p=record["p"])
        return hmac.compare_digest(digest, bytes.fromhex(record["hash"]))
    except (KeyError, ValueError, TypeError):
        return False


class Throttle:
    """After `max_fails` failures a key is locked; the lock doubles on every further failure (up to `max_lock`)."""

    def __init__(self, max_fails=5, base_lock=30.0, max_lock=900.0, clock=time.monotonic):
        self.max_fails, self.base_lock, self.max_lock, self.clock = max_fails, base_lock, max_lock, clock
        self._state = {}                      # key -> [fails, locked_until]

    def check(self, *keys) -> None:
        now = self.clock()
        for k in keys:
            st = self._state.get(k)
            if st and st[1] > now:
                raise AccountError(f"too many attempts, try again in {int(st[1] - now) + 1} s", 429)

    def fail(self, *keys) -> None:
        now = self.clock()
        for k in keys:
            st = self._state.setdefault(k, [0, 0.0])
            st[0] += 1
            if st[0] >= self.max_fails:
                st[1] = now + min(self.base_lock * 2 ** (st[0] - self.max_fails), self.max_lock)

    def success(self, *keys) -> None:
        for k in keys:
            self._state.pop(k, None)
