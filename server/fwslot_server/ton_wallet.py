"""Creates a personal TON wallet (v4R2) for a player: 24-word recovery phrase and the address.

Custody: the phrase exists in memory for the length of one request. It is shown to the player ONCE and is never stored, logged or
journaled; the server keeps only the address. Whoever has the phrase owns the funds, so the server can not recover a lost phrase.
Standard library only: the phrase follows the TON scheme (BIP39 word list, "basic seed" check, PBKDF2-SHA512), the public key is
derived with a small Ed25519 implementation (RFC 8032), the address is the hash of the wallet's StateInit.
"""
import hashlib
import hmac
import secrets
from pathlib import Path

from . import boc, ton

_WORDS = None
WALLET_ID = 698983191                          # v4R2, workchain 0
CODE_HASH = bytes.fromhex("feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0")     # wallet v4R2 code cell
CODE_DEPTH = 7
CODE_BOC = bytes.fromhex(
    "B5EE9C72410214010002D4000114FF00F4A413F4BCF2C80B010201200203020148040504F8F28308D71820D31FD31FD3"
    "1F02F823BBF264ED44D0D31FD31FD3FFF404D15143BAF2A15151BAF2A205F901541064F910F2A3F80024A4C8CB1F5240"
    "CB1F5230CBFF5210F400C9ED54F80F01D30721C0009F6C519320D74A96D307D402FB00E830E021C001E30021C002E300"
    "01C0039130E30D03A4C8CB1F12CB1FCBFF1011121302E6D001D0D3032171B0925F04E022D749C120925F04E002D31F21"
    "8210706C7567BD22821064737472BDB0925F05E003FA403020FA4401C8CA07CBFFC9D0ED44D0810140D721F404305C81"
    "0108F40A6FA131B3925F07E005D33FC8258210706C7567BA923830E30D03821064737472BA925F06E30D060702012008"
    "09007801FA00F40430F8276F2230500AA121BEF2E0508210706C7567831EB17080185004CB0526CF1658FA0219F400CB"
    "6917CB1F5260CB3F20C98040FB0006008A5004810108F45930ED44D0810140D720C801CF16F400C9ED540172B08E2382"
    "1064737472831EB17080185005CB055003CF1623FA0213CB6ACB1FCB3FC98040FB00925F03E20201200A0B0059BD242B"
    "6F6A2684080A06B90FA0218470D4080847A4937D29910CE6903E9FF9837812801B7810148987159F31840201580C0D00"
    "11B8C97ED44D0D70B1F8003DB29DFB513420405035C87D010C00B23281F2FFF274006040423D029BE84C600201200E0F"
    "0019ADCE76A26840206B90EB85FFC00019AF1DF6A26840106B90EB858FC0006ED207FA00D4D422F90005C8CA0715CBFF"
    "C9D077748018C8CB05CB0222CF165005FA0214CB6B12CCCCC973FB00C84014810108F451F2A7020070810108D718FA00"
    "D33FC8542047810108F451F2A782106E6F746570748018C8CB05CB025006CF165004FA0214CB6A12CB1FCB3FC973FB00"
    "02006C810108D718FA00D33F305224810108F459F2A782106473747270748018C8CB05CB025005CF165003FA0213CB6A"
    "CB1F12CB3FC973FB00000AF400C9ED54696225E5"
)                                              # the v4R2 wallet code (a bag of cells), needed for the first transaction
_P = 2 ** 255 - 19
_D = -121665 * pow(121666, -1, _P) % _P
_L = 2 ** 252 + 27742317777372353535851937790883648493
_B = (15112221349535400772501151409588531511454012693041857206046113283949847762202,
      46316835694926478169428394003475163141307993866256225615783033603165251855960)


def words() -> list:
    global _WORDS
    if _WORDS is None:
        _WORDS = (Path(__file__).parent / "bip39_english.txt").read_text(encoding="utf-8").split()
        assert len(_WORDS) == 2048
    return _WORDS


def _add(p, q):
    (x1, y1), (x2, y2) = p, q
    t = _D * x1 * x2 * y1 * y2 % _P
    x3 = (x1 * y2 + x2 * y1) * pow(1 + t, -1, _P) % _P
    y3 = (y1 * y2 + x1 * x2) * pow(1 - t, -1, _P) % _P
    return x3, y3


def _mul(k, p):
    r = (0, 1)
    while k:
        if k & 1:
            r = _add(r, p)
        p = _add(p, p)
        k >>= 1
    return r


def public_key(seed: bytes) -> bytes:
    """Ed25519 public key of a 32-byte seed (RFC 8032)."""
    h = hashlib.sha512(seed).digest()
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    x, y = _mul(a, _B)
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def _entropy(phrase: list) -> bytes:
    return hmac.new(" ".join(phrase).encode(), b"", hashlib.sha512).digest()


def is_basic_seed(entropy: bytes) -> bool:
    return hashlib.pbkdf2_hmac("sha512", entropy, b"TON seed version", 390)[0] == 0


def new_phrase() -> list:
    wl = words()
    while True:
        phrase = [wl[secrets.randbelow(2048)] for _ in range(24)]
        if is_basic_seed(_entropy(phrase)):
            return phrase


def phrase_valid(phrase: list) -> bool:
    wl = set(words())
    return len(phrase) == 24 and all(w in wl for w in phrase) and is_basic_seed(_entropy(phrase))


def phrase_public_key(phrase: list) -> bytes:
    seed = hashlib.pbkdf2_hmac("sha512", _entropy(phrase), b"TON default seed", 100_000)[:32]
    return public_key(seed)


def _cell_hash(d1: int, bits: bytes, bitlen: int, kids: list) -> bytes:
    """Representation hash of an ordinary cell; kids = [(depth, hash)]."""
    full, rest = divmod(bitlen, 8)
    data = bits[:full]
    if rest:
        data += bytes([(bits[full] & (0xFF << (8 - rest)) & 0xFF) | (1 << (7 - rest))])
    d2 = full + (1 if rest else 0) + full
    h = hashlib.sha256(bytes([d1, d2]) + data)
    for depth, _ in kids:
        h.update(depth.to_bytes(2, "big"))
    for _, ch in kids:
        h.update(ch)
    return h.digest()


def address_raw(pub: bytes, workchain: int = 0) -> str:
    """Raw address "0:HEX" of a v4R2 wallet with this public key (hash of its StateInit)."""
    data_bits = (0).to_bytes(4, "big") + WALLET_ID.to_bytes(4, "big") + pub + b"\x00"       # seqno, wallet id, key, empty plugins
    data_hash = _cell_hash(0, data_bits, 32 + 32 + 256 + 1, [])
    state_hash = _cell_hash(2, bytes([0b00110000]), 5, [(CODE_DEPTH, CODE_HASH), (0, data_hash)])
    return f"{workchain}:{state_hash.hex().upper()}"


def create(network: str = "mainnet") -> dict:
    """{"words": [24], "address": "UQ..." (non-bounceable, flagged for testnet), "raw": "0:HEX"} - words are for the player only."""
    phrase = new_phrase()
    raw = address_raw(phrase_public_key(phrase))
    return {"words": phrase, "raw": raw, "address": ton.to_friendly(raw, bounceable=False, testnet=(network == "testnet"))}


def sign(seed: bytes, msg: bytes) -> bytes:
    """Ed25519 signature (RFC 8032) of `msg` by the key of a 32-byte seed. Deterministic."""
    h = hashlib.sha512(seed).digest()
    a = (int.from_bytes(h[:32], "little") & ((1 << 254) - 8)) | (1 << 254)
    pub = public_key(seed)
    r = int.from_bytes(hashlib.sha512(h[32:] + msg).digest(), "little") % _L
    x, y = _mul(r, _B)
    big_r = (y | ((x & 1) << 255)).to_bytes(32, "little")
    k = int.from_bytes(hashlib.sha512(big_r + pub + msg).digest(), "little") % _L
    return big_r + ((r + k * a) % _L).to_bytes(32, "little")


def state_init_cell(pub: bytes) -> "boc.Cell":
    data = boc.BitWriter().uint(0, 32).uint(WALLET_ID, 32).raw(pub).uint(0, 1).to_cell()
    return boc.BitWriter().uint(0b00110, 5).to_cell([boc.from_boc(CODE_BOC), data])


def build_transfer(seed: bytes, dest_raw: str, amount_nano: int, comment: str, seqno: int, valid_until: int,
                   bounce: bool = False, mode: int = 3) -> bytes:
    """The signed external message (a BOC) that makes the wallet of `seed` send `amount_nano` with a text comment to `dest_raw`.
    seqno 0 also carries the StateInit: the first transaction deploys the wallet. Reference for the client's GDScript builder."""
    pub = public_key(seed)
    wallet_raw = address_raw(pub)
    signing = boc.signing_message(WALLET_ID, valid_until, seqno, mode, boc.internal_message(dest_raw, amount_nano, comment, bounce))
    msg = boc.external_message(wallet_raw, sign(seed, signing.hash()), signing, state_init_cell(pub) if seqno == 0 else None)
    return boc.to_boc(msg)
