"""Package the Python engine, the players and webglue into ``web/py.zip`` for Pyodide.

The zip is deterministic (sorted entries, fixed timestamps), so rebuilding without code
changes produces the same bytes. Layout inside the zip::

    battleship/...      the package from src/battleship
    players/...         manifests and player files (builtin and custom)
    webglue.py          the JS <-> Python bridge

Usage: python scripts/build_web.py [--output web/py.zip]
"""

from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXED_TIME = (2020, 1, 1, 0, 0, 0)


def collect(root: Path = ROOT) -> dict[str, Path]:
    """Map of zip path -> source file."""
    files: dict[str, Path] = {}
    package = root / "src" / "battleship"
    for path in package.rglob("*.py"):
        files[path.relative_to(root / "src").as_posix()] = path
    for path in (root / "players").rglob("*"):
        if path.is_file() and path.suffix in (".py", ".yaml") and "__pycache__" not in path.parts:
            files[path.relative_to(root).as_posix()] = path
    files["webglue.py"] = root / "web" / "webglue.py"
    return files


def build(output: Path, root: Path = ROOT) -> list[str]:
    """Write the zip and also copy results/leaderboard.json next to it if present."""
    files = collect(root)
    names = sorted(files)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in names:
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, files[name].read_bytes())
    leaderboard = root / "results" / "leaderboard.json"
    if leaderboard.is_file():
        shutil.copyfile(leaderboard, output.parent / "leaderboard.json")
    return names


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, default=ROOT / "web" / "py.zip")
    args = parser.parse_args()
    names = build(args.output)
    print(f"wrote {args.output} ({len(names)} files)")


if __name__ == "__main__":
    main()
