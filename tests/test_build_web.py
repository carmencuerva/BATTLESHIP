import subprocess
import sys
import zipfile

from .conftest import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import build_web  # noqa: E402


def test_zip_contents(tmp_path):
    names = build_web.build(tmp_path / "py.zip")
    assert "webglue.py" in names
    assert "battleship/game.py" in names and "battleship/bots/shooting.py" in names
    assert "players/builtin/players.yaml" in names and "players/builtin/hard_bot.py" in names
    assert "players/custom/players.yaml" in names
    assert not any("__pycache__" in n or n.endswith(".pyc") for n in names)
    assert names == sorted(names)


def test_zip_is_deterministic(tmp_path):
    build_web.build(tmp_path / "a" / "py.zip")
    build_web.build(tmp_path / "b" / "py.zip")
    assert (tmp_path / "a" / "py.zip").read_bytes() == (tmp_path / "b" / "py.zip").read_bytes()


def test_unpacked_zip_runs_standalone(tmp_path):
    """What Pyodide does: unpack, put the folder first on sys.path, import webglue."""
    build_web.build(tmp_path / "py.zip")
    extracted = tmp_path / "arena"
    with zipfile.ZipFile(tmp_path / "py.zip") as zf:
        zf.extractall(extracted)
    script = (
        "import sys, json; sys.path.insert(0, sys.argv[1]); import webglue, battleship; "
        "assert battleship.__file__.startswith(sys.argv[1]), battleship.__file__; "
        "print(webglue.list_players())"
    )
    out = subprocess.run(
        [sys.executable, "-I", "-c", script, str(extracted)],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    import json

    players = json.loads(out.stdout)["players"]
    assert [p["name"] for p in players] == ["random", "easy", "medium", "hard"]
