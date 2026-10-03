"""Append-only round journal (JSON lines). Every paid spin, every order choice, every account event and every admin
action becomes one record with a sequential id and a timestamp. Records are never edited or deleted by the game.
In memory for the dev server (list); a database table with the same fields in production."""
import json
import threading
import time
from pathlib import Path


class Journal:
    def __init__(self, path=None, clock=time.time):
        self.path = Path(path) if path else None
        self.clock = clock
        self.records = []
        self.corrupt_lines = 0
        self._lock = threading.Lock()
        if self.path and self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    self.records.append(json.loads(line))
                except ValueError:
                    self.corrupt_lines += 1           # a half-written last line after a crash
        self.next_id = (self.records[-1]["id"] + 1) if self.records else 1

    def append(self, record: dict) -> int:
        with self._lock:
            record = dict(record, id=self.next_id, ts=round(self.clock(), 3))
            if self.path:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                    f.flush()
            self.records.append(record)
            self.next_id += 1
            return record["id"]

    def get(self, record_id: int):
        # ids are sequential from 1 and never removed, so the record sits at index id-1 (unless the file was trimmed)
        i = record_id - 1
        if 0 <= i < len(self.records) and self.records[i]["id"] == record_id:
            return self.records[i]
        return next((r for r in self.records if r["id"] == record_id), None)

    def query(self, player=None, kinds=None, min_win=None, before=None, limit=50, mode=None) -> list:
        """Newest first. player = player key; kinds = iterable of kinds; before = only ids < before; mode = "demo" / "real"
        (records without a mode are demo)."""
        out = []
        for r in reversed(self.records):
            if before is not None and r["id"] >= before:
                continue
            if player is not None and r.get("player") != player:
                continue
            if kinds is not None and r["kind"] not in kinds:
                continue
            if min_win is not None and r.get("win_cents", 0) < min_win:
                continue
            if mode is not None and r.get("mode", "demo") != mode:
                continue
            out.append(r)
            if len(out) >= limit:
                break
        return out
