#!/usr/bin/env python3
"""Heuristic SilverScript security triage; not a correctness proof."""

from __future__ import annotations

import argparse
import pathlib
import re


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def audit(path: pathlib.Path) -> list[tuple[str, int, str]]:
    text = path.read_text(encoding="utf-8")
    findings: list[tuple[str, int, str]] = []

    for match in re.finditer(
        r"validateOutputStateWithTemplate\s*\(\s*([^,\n]+)", text
    ):
        argument = match.group(1).strip()
        direct = "OpCovOutputIdx" in argument
        escaped = re.escape(argument)
        id_guard = re.search(
            rf"OpOutputCovenantId\s*\(\s*{escaped}\s*\)", text
        )
        derived = re.search(
            rf"\b{escaped}\s*=\s*OpCovOutputIdx\s*\(", text
        )
        if not (direct or id_guard or derived):
            findings.append(
                (
                    "SS001",
                    line_number(text, match.start()),
                    f"cross-template output {argument!r} is not visibly bound to a covenant ID",
                )
            )

    for match in re.finditer(
        r"scriptPubKey\s*==\s*(?!byte\[\]\s*\()([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)",
        text,
    ):
        findings.append(
            (
                "SS002",
                line_number(text, match.start()),
                f"scriptPubKey comparison with {match.group(1)!r} may mix byte[] and fixed bytes",
            )
        )

    if "termination = allowed" in text and re.search(
        r"return\s*\(?\s*next_states\s*\)?\s*;", text
    ) and not re.search(r"next_states\.length\s*==\s*0", text):
        offset = text.index("termination = allowed")
        findings.append(
            (
                "SS003",
                line_number(text, offset),
                "termination path returns caller-supplied state without requiring termination",
            )
        )

    fee_match = re.search(r"tx\.outputs\s*\[\s*fee\w*Index\s*\]", text, re.I)
    if fee_match:
        findings.append(
            (
                "SS004",
                line_number(text, fee_match.start()),
                "review fee-output aliasing across multiple contract executions",
            )
        )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+", type=pathlib.Path)
    args = parser.parse_args()

    count = 0
    for source in args.sources:
        findings = audit(source)
        for code, line, message in findings:
            print(f"{source}:{line}: {code}: {message}")
        count += len(findings)
    print(f"heuristic findings: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
