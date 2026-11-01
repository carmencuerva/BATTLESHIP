"""Check the submitted players in ``players/custom`` before they join the tournament.

A submission passes when every manifest entry loads with a valid identity and each custom
player gets through a short round-robin against everyone else without a single forfeit
(no exceptions, illegal shots, bad placements or timeouts). CI runs this on every pull
request that touches ``players/``.

Usage: python scripts/check_players.py [--root .] [--games 4]
Exit code 0 when everything passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from battleship.registry import default_manifests, load_players
from battleship.tournament import Config, run_tournament

ROOT = Path(__file__).resolve().parents[1]


def check(root: Path, games: int = 4, subprocess: bool = True) -> list[str]:
    """Problems found (empty when the custom players are fine). Prints a short report."""
    rejected: list[dict[str, str]] = []
    players = load_players(default_manifests(root), rejected)
    problems = [f"rejected {item['source']}: {item['error']}" for item in rejected]
    custom = {p.name for p in players if p.source.startswith("custom/")}
    if not custom:
        print("no custom players to check")
        return problems
    if len(players) < 2:
        return [*problems, "need at least 2 players to play a test tournament"]

    config = Config(games_per_pair=games, subprocess=subprocess, jobs=4)
    leaderboard = run_tournament(players, config)
    for row in leaderboard["standings"]:
        if row["name"] not in custom:
            continue
        wld = f"{row['wins']}-{row['losses']}-{row['draws']}"
        print(f"{row['icon']} {row['name']} ({row['source']}): rank {row['rank']}, W-L-D {wld}")
        if row["forfeits"]:
            reasons = ", ".join(f"{k} x{v}" for k, v in row["forfeit_reasons"].items())
            problems.append(f"{row['name']} forfeited {row['forfeits']} game(s): {reasons}")
    return problems


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--games", type=int, default=4, help="games per pair (even is fairer)")
    parser.add_argument("--no-subprocess", action="store_true", help="faster; cannot kill hangs")
    args = parser.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):  # emoji icons on Windows consoles
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")

    problems = check(args.root, max(1, args.games), subprocess=not args.no_subprocess)
    for problem in problems:
        print(f"FAIL {problem}")
    if not problems:
        print("OK")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
