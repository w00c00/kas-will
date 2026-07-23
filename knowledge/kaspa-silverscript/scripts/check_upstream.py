#!/usr/bin/env python3
"""Compare the reviewed SilverScript snapshot with the official remote HEAD."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys


SKILL_DIR = pathlib.Path(__file__).resolve().parent.parent
SNAPSHOT = SKILL_DIR / "references" / "upstream.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--require-current",
        action="store_true",
        help="exit non-zero when the reviewed snapshot differs from remote HEAD",
    )
    args = parser.parse_args()

    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    remote_ref = f"refs/heads/{snapshot['branch']}"
    process = subprocess.run(
        ["git", "ls-remote", snapshot["repository"], remote_ref],
        check=False,
        capture_output=True,
        text=True,
    )
    if process.returncode != 0:
        print(process.stderr.strip() or "unable to query SilverScript upstream", file=sys.stderr)
        return 2

    fields = process.stdout.strip().split()
    if not fields:
        print(f"remote branch not found: {remote_ref}", file=sys.stderr)
        return 2

    current = fields[0]
    reviewed = snapshot["verified_commit"]
    result = {
        "repository": snapshot["repository"],
        "branch": snapshot["branch"],
        "reviewed_commit": reviewed,
        "remote_commit": current,
        "reviewed_at": snapshot["verified_at"],
        "stale": current != reviewed,
    }
    print(json.dumps(result, indent=2))
    return 1 if args.require_current and result["stale"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
