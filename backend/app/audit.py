"""Hash-chained, tamper-evident audit log (in-memory)."""
from __future__ import annotations

import copy
import hashlib
import json
import time
from typing import Any, Callable

GENESIS = "0" * 64


def _hash(seq: int, actor: str, action: str, detail: dict, prev_hash: str) -> str:
    blob = json.dumps(
        [seq, actor, action, detail, prev_hash],
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(blob.encode()).hexdigest()


class AuditLog:
    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._events: list[dict[str, Any]] = []

    def append(self, actor: str, action: str, detail: dict) -> dict:
        seq = len(self._events)
        prev = self._events[-1]["hash"] if self._events else GENESIS
        detail = copy.deepcopy(detail)
        ev = {
            "seq": seq,
            "ts": self._clock(),
            "actor": actor,
            "action": action,
            "detail": detail,
            "prev_hash": prev,
            "hash": _hash(seq, actor, action, detail, prev),
        }
        self._events.append(ev)
        return ev

    def verify(self) -> tuple[bool, int | None]:
        prev = GENESIS
        for i, ev in enumerate(self._events):
            if (
                ev["seq"] != i
                or ev["prev_hash"] != prev
                or ev["hash"] != _hash(ev["seq"], ev["actor"], ev["action"], ev["detail"], prev)
            ):
                return False, i
            prev = ev["hash"]
        return True, None

    def events(self) -> list[dict]:
        return self._events
