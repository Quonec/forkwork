"""TON cells and bags of cells (BOC): build, hash, serialize, parse. Standard library only.

Used for two things: (1) the server checks and relays a deposit transaction that a player's own wallet signed on his device (the server
never sees a key, only the finished message), (2) tests build the same transaction independently and compare it with the client's.
Only ordinary cells (no exotic / library cells) are supported: that is all a simple wallet transfer and the wallet's own code use.
"""
import hashlib


class BocError(ValueError):
    pass


class Cell:
    """data: bytes (unused low bits of the last byte are zero), bitlen: number of valid bits, refs: up to 4 cells."""
    __slots__ = ("data", "bitlen", "refs", "_hash", "_depth")

    def __init__(self, data: bytes = b"", bitlen: int = None, refs=()):
        self.data = bytes(data)
        self.bitlen = len(self.data) * 8 if bitlen is None else bitlen
        self.refs = list(refs)
        self._hash = None
        self._depth = None
        if self.bitlen > 1023 or len(self.refs) > 4 or (self.bitlen + 7) // 8 != len(self.data):
            raise BocError("cell does not fit: %d bits, %d refs" % (self.bitlen, len(self.refs)))

    def depth(self) -> int:
        if self._depth is None:
            self._depth = 0 if not self.refs else 1 + max(r.depth() for r in self.refs)
        return self._depth

    def descriptor(self) -> bytes:
        full, rest = divmod(self.bitlen, 8)
        return bytes([len(self.refs), full + (1 if rest else 0) + full])

    def padded(self) -> bytes:
        """Data with the completion tag (a 1 bit then zeros) when the last byte is partial."""
        full, rest = divmod(self.bitlen, 8)
        if not rest:
            return self.data
        last = (self.data[full] & (0xFF << (8 - rest)) & 0xFF) | (1 << (7 - rest))
        return self.data[:full] + bytes([last])

    def hash(self) -> bytes:
        if self._hash is None:
            h = hashlib.sha256(self.descriptor() + self.padded())
            for r in self.refs:
                h.update(r.depth().to_bytes(2, "big"))
            for r in self.refs:
                h.update(r.hash())
            self._hash = h.digest()
        return self._hash


class BitWriter:
    def __init__(self):
        self.bits = []

    def uint(self, value: int, n: int) -> "BitWriter":
        if value < 0 or value >> n:
            raise BocError("value does not fit in %d bits" % n)
        for i in range(n - 1, -1, -1):
            self.bits.append((value >> i) & 1)
        return self

    def int8(self, value: int) -> "BitWriter":
        return self.uint(value & 0xFF, 8)

    def raw(self, data: bytes) -> "BitWriter":
        for b in data:
            self.uint(b, 8)
        return self

    def coins(self, amount: int) -> "BitWriter":
        """VarUInteger 16: a 4-bit byte count, then the bytes."""
        n = (amount.bit_length() + 7) // 8
        if n > 15:
            raise BocError("amount too large")
        self.uint(n, 4)
        return self.uint(amount, n * 8) if n else self

    def address(self, raw: str) -> "BitWriter":
        wc, h = raw.split(":")
        return self.uint(0b10, 2).uint(0, 1).int8(int(wc)).raw(bytes.fromhex(h))

    def length(self) -> int:
        return len(self.bits)

    def to_cell(self, refs=()) -> Cell:
        n = len(self.bits)
        data = bytearray((n + 7) // 8)
        for i, b in enumerate(self.bits):
            if b:
                data[i // 8] |= 0x80 >> (i % 8)
        return Cell(bytes(data), n, refs)


class BitReader:
    def __init__(self, cell: Cell):
        self.cell = cell
        self.pos = 0

    def left(self) -> int:
        return self.cell.bitlen - self.pos

    def uint(self, n: int) -> int:
        if n > self.left():
            raise BocError("read past the end of a cell")
        v = 0
        for _ in range(n):
            byte = self.cell.data[self.pos // 8]
            v = (v << 1) | ((byte >> (7 - self.pos % 8)) & 1)
            self.pos += 1
        return v

    def raw(self, n_bytes: int) -> bytes:
        return bytes(self.uint(8) for _ in range(n_bytes))

    def coins(self) -> int:
        n = self.uint(4)
        return self.uint(n * 8) if n else 0

    def address(self) -> str:
        tag = self.uint(2)
        if tag == 0:
            return ""
        if tag != 2 or self.uint(1) != 0:
            raise BocError("unsupported address")
        wc = self.uint(8)
        wc = wc - 256 if wc > 127 else wc
        return "%d:%s" % (wc, self.raw(32).hex().upper())

    def rest_bytes(self) -> bytes:
        return self.raw(self.left() // 8)


# ---------------------------------------------------------------------------------------------------- serialization

def crc32c(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0x82F63B78 if crc & 1 else crc >> 1
    return crc ^ 0xFFFFFFFF


def _order(root: Cell) -> list:
    """Unique cells (by hash), every cell before the cells it refers to (reverse post-order of a DFS)."""
    seen, out = set(), []

    def visit(c):
        h = c.hash()
        if h in seen:
            return
        seen.add(h)
        for r in c.refs:
            visit(r)
        out.append(c)

    visit(root)
    out.reverse()
    return out


def to_boc(root: Cell, crc: bool = True) -> bytes:
    cells = _order(root)
    index = {c.hash(): i for i, c in enumerate(cells)}
    size_bytes = max(1, (len(cells).bit_length() + 7) // 8)
    body = bytearray()
    for c in cells:
        body += c.descriptor() + c.padded()
        for r in c.refs:
            body += index[r.hash()].to_bytes(size_bytes, "big")
    off_bytes = max(1, (len(body).bit_length() + 7) // 8)
    out = bytearray(b"\xb5\xee\x9c\x72")
    out.append((0x40 if crc else 0) | size_bytes)
    out.append(off_bytes)
    out += len(cells).to_bytes(size_bytes, "big") + (1).to_bytes(size_bytes, "big") + (0).to_bytes(size_bytes, "big")
    out += len(body).to_bytes(off_bytes, "big") + (0).to_bytes(size_bytes, "big") + body
    if crc:
        out += crc32c(bytes(out)).to_bytes(4, "little")
    return bytes(out)


def from_boc(data: bytes) -> Cell:
    """The single root cell of a BOC. Raises BocError for anything malformed, oversized or with more than one root."""
    try:
        return _from_boc(data)
    except (IndexError, ValueError) as e:
        if isinstance(e, BocError):
            raise
        raise BocError("malformed BOC")


def _from_boc(data: bytes) -> Cell:
    if len(data) < 12 or len(data) > 65536 or data[:4] != b"\xb5\xee\x9c\x72":
        raise BocError("not a BOC")
    flags = data[4]
    has_idx, has_crc = bool(flags & 0x80), bool(flags & 0x40)
    size_bytes = flags & 0x07
    off_bytes = data[5]
    if not 1 <= size_bytes <= 4 or not 1 <= off_bytes <= 8:
        raise BocError("bad BOC header")
    pos = 6
    n = int.from_bytes(data[pos:pos + size_bytes], "big"); pos += size_bytes
    roots = int.from_bytes(data[pos:pos + size_bytes], "big"); pos += size_bytes
    pos += size_bytes                                               # absent
    total = int.from_bytes(data[pos:pos + off_bytes], "big"); pos += off_bytes
    if roots != 1 or not 1 <= n <= 4096:
        raise BocError("expected one root and a sane number of cells")
    root_index = int.from_bytes(data[pos:pos + size_bytes], "big")
    if root_index >= n:
        raise BocError("bad root index")
    pos += roots * size_bytes
    if has_idx:
        pos += n * off_bytes
    if has_crc and crc32c(data[:-4]).to_bytes(4, "little") != data[-4:]:
        raise BocError("BOC checksum mismatch")
    end = pos + total
    if end > len(data):
        raise BocError("BOC is truncated")
    raw = []
    while len(raw) < n:
        d1, d2 = data[pos], data[pos + 1]
        pos += 2
        if d1 & 0x08 or d1 >> 5:
            raise BocError("exotic cells are not supported")
        nrefs = d1 & 7
        dlen = (d2 + 1) // 2
        chunk = data[pos:pos + dlen]
        if len(chunk) != dlen:
            raise BocError("BOC is truncated")
        pos += dlen
        if d2 % 2:                                                  # partial last byte: strip the completion tag
            last = chunk[-1]
            tz = (last & -last).bit_length() - 1
            bitlen = (dlen - 1) * 8 + (7 - tz)
            chunk = chunk[:-1] + bytes([last & (0xFF << (tz + 1)) & 0xFF])
        else:
            bitlen = dlen * 8
        refs = [int.from_bytes(data[pos + i * size_bytes:pos + (i + 1) * size_bytes], "big") for i in range(nrefs)]
        pos += nrefs * size_bytes
        raw.append((chunk, bitlen, refs))
    if pos != end:
        raise BocError("BOC length does not match")
    built = [None] * n
    for i in range(n - 1, -1, -1):                                  # children have larger indexes: build from the back
        chunk, bitlen, refs = raw[i]
        if any(r <= i or r >= n for r in refs):
            raise BocError("bad cell reference")
        built[i] = Cell(chunk, bitlen, [built[r] for r in refs])
    return built[root_index]


# ---------------------------------------------------------------------------------------------------- wallet v4R2 messages

def internal_message(dest_raw: str, amount_nano: int, comment: str = "", bounce: bool = False) -> Cell:
    """An internal message with a text comment, laid out like the reference library: the body sits inside the message cell when it fits."""
    w = BitWriter().uint(0, 1).uint(1, 1).uint(1 if bounce else 0, 1).uint(0, 1).uint(0, 2).address(dest_raw).coins(amount_nano)
    w.uint(0, 1).coins(0).coins(0).uint(0, 64).uint(0, 32).uint(0, 1)                # no extra currency, no fees, no lt / time, no init
    body = BitWriter()
    if comment:
        body.uint(0, 32).raw(comment.encode("utf-8"))
    if body.length() <= 1023 - w.length() - 1:
        w.uint(0, 1)
        w.bits += body.bits
        return w.to_cell()
    w.uint(1, 1)
    return w.to_cell([body.to_cell()])


def signing_message(wallet_id: int, valid_until: int, seqno: int, mode: int, internal: Cell) -> Cell:
    w = BitWriter().uint(wallet_id, 32).uint(valid_until, 32).uint(seqno, 32).uint(0, 8).uint(mode, 8)
    return w.to_cell([internal])


def external_message(wallet_raw: str, signature: bytes, signing: Cell, state_init: Cell = None) -> Cell:
    """Signed external message to the wallet. The body (signature + the signing message) is a reference; the StateInit (first transaction only) too."""
    body = BitWriter().raw(signature)
    body.bits += _cell_bits(signing)
    body_cell = body.to_cell(signing.refs)
    w = BitWriter().uint(0b10, 2).uint(0, 2).address(wallet_raw).coins(0)
    if state_init is not None:
        w.uint(1, 1).uint(1, 1)                                     # a StateInit is present, as a reference
        return w.uint(1, 1).to_cell([state_init, body_cell])        # and the body is a reference
    return w.uint(0, 1).uint(1, 1).to_cell([body_cell])


def _cell_bits(c: Cell) -> list:
    return [(c.data[i // 8] >> (7 - i % 8)) & 1 for i in range(c.bitlen)]


def parse_transfer(boc: bytes) -> dict:
    """Reads an external message to a v4R2 wallet that carries one simple transfer. Returns
    {"wallet", "has_init", "signature", "signing_hash", "wallet_id", "valid_until", "seqno", "mode", "dest", "amount_nano", "bounce", "comment"}.
    Raises BocError for anything else."""
    root = from_boc(boc)
    r = BitReader(root)
    if r.uint(2) != 0b10:
        raise BocError("not an external incoming message")
    if r.address() != "":
        raise BocError("an external message has no source")
    wallet = r.address()
    r.coins()
    has_init = bool(r.uint(1))
    refs = list(root.refs)
    if has_init:
        if r.uint(1) != 1:
            raise BocError("StateInit must be a reference")
        refs.pop(0)
    if r.uint(1) != 1 or len(refs) != 1:
        raise BocError("the body must be a reference")
    body = refs[0]
    b = BitReader(body)
    signature = b.raw(64)
    wallet_id, valid_until, seqno, op, mode = b.uint(32), b.uint(32), b.uint(32), b.uint(8), b.uint(8)
    if op != 0 or b.left() != 0 or len(body.refs) != 1:
        raise BocError("not a simple transfer")
    sign_bits = BitWriter().uint(wallet_id, 32).uint(valid_until, 32).uint(seqno, 32).uint(0, 8).uint(mode, 8)
    signing = sign_bits.to_cell(body.refs)
    m = BitReader(body.refs[0])
    if m.uint(1) != 0:
        raise BocError("not an internal message")
    m.uint(1)
    bounce = bool(m.uint(1))
    m.uint(1)
    if m.address() != "":
        raise BocError("the source must be empty")
    dest = m.address()
    amount = m.coins()
    if m.uint(1) or m.coins() or m.coins():
        raise BocError("extra currencies and fees are not allowed")
    m.uint(64)
    m.uint(32)
    if m.uint(1):
        raise BocError("an init inside the transfer is not allowed")
    comment = ""
    if m.uint(1):
        if len(body.refs[0].refs) != 1:
            raise BocError("missing body")
        mb = BitReader(body.refs[0].refs[0])
    else:
        mb = m
    if mb.left():
        if mb.uint(32) != 0:
            raise BocError("only a text comment is allowed")
        try:
            comment = mb.rest_bytes().decode("utf-8")
        except UnicodeDecodeError:
            raise BocError("the comment is not text")
    return {"wallet": wallet, "has_init": has_init, "signature": signature, "signing_hash": signing.hash(), "wallet_id": wallet_id,
            "valid_until": valid_until, "seqno": seqno, "mode": mode, "dest": dest, "amount_nano": amount, "bounce": bounce, "comment": comment}
