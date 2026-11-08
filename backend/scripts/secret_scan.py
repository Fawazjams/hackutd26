"""Scan tracked + untracked (non-ignored) files and git history for leaked secrets.

Matches are always masked (first 6 chars only). Exits 1 if anything is found.
"""
import re
import subprocess
import sys
from pathlib import Path

PATTERNS = [
    re.compile(r"nvapi-[A-Za-z0-9_-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN .*PRIVATE KEY-----"),
]
HIST = re.compile(r"nvapi-[A-Za-z0-9_-]{8,}")


def mask(s: str) -> str:
    return s[:6] + "***"


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    return r.stdout


def main() -> int:
    root = git("rev-parse", "--show-toplevel").strip()
    files = set(git("-C", root, "ls-files").splitlines())
    files |= set(git("-C", root, "ls-files", "--others", "--exclude-standard").splitlines())
    found = 0
    for f in sorted(files):
        if Path(f).resolve() == Path(__file__).resolve():
            continue
        p = Path(root) / f
        try:
            data = p.read_bytes()
        except OSError:
            continue
        if b"\0" in data[:4096]:
            continue
        for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
            for pat in PATTERNS:
                for m in pat.finditer(line):
                    print(f"{f}:{n}: {mask(m.group(0))}")
                    found += 1
    # history
    cur = None
    seen = set()
    for line in git("-C", root, "log", "-p", "--all", "--no-color").splitlines():
        if line.startswith("commit "):
            cur = line[7:19]
        elif line.startswith(("+", "-")):
            for m in HIST.finditer(line):
                key = (cur, m.group(0))
                if key not in seen:
                    seen.add(key)
                    print(f"history commit {cur}: {mask(m.group(0))}")
                    found += 1
    print(f"{found} potential secret(s) found" if found else "clean: no secrets found")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
