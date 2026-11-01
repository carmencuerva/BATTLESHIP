import shutil
import sys
import textwrap

import pytest

from .conftest import ROOT

sys.path.insert(0, str(ROOT / "scripts"))
import check_players  # noqa: E402

BOT = """
from battleship.bots import random_fleet, scan_shot
from battleship.player import Player


class {cls}(Player):
    @classmethod
    def get_name(cls):
        return "{name}"

    @classmethod
    def get_authors(cls):
        return ["Tester"]

    def choose_placement(self, board_size, fleet):
        import random
        return random_fleet(board_size, fleet, random.Random(0))

    def choose_shot(self, view):
        {shot}
"""


@pytest.fixture
def root(tmp_path):
    shutil.copytree(ROOT / "players" / "builtin", tmp_path / "players" / "builtin")
    (tmp_path / "players" / "custom").mkdir()
    return tmp_path


def submit(root, bots):
    """bots: list of (file stem, class, name, body of choose_shot)."""
    custom = root / "players" / "custom"
    lines = ["players:"]
    for stem, cls, name, shot in bots:
        (custom / f"{stem}.py").write_text(
            textwrap.dedent(BOT).format(cls=cls, name=name, shot=shot), encoding="utf-8"
        )
        lines += [f"  - file: {stem}.py", f"    class: {cls}"]
    (custom / "players.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run(root, capsys):
    code = check_players.main(["--root", str(root), "--games", "2", "--no-subprocess"])
    return code, capsys.readouterr().out


def test_no_custom_players_passes(root, capsys):
    (root / "players" / "custom" / "players.yaml").write_text("players: []\n", encoding="utf-8")
    code, out = run(root, capsys)
    assert code == 0 and "no custom players" in out


def test_a_good_bot_passes(root, capsys):
    submit(root, [("scanner", "Scanner", "scanner", "return scan_shot(view)")])
    code, out = run(root, capsys)
    assert code == 0, out
    assert "scanner (custom/scanner.py)" in out and out.rstrip().endswith("OK")


def test_a_crashing_bot_fails(root, capsys):
    submit(root, [("boom", "Boom", "boom", "raise RuntimeError('boom')")])
    code, out = run(root, capsys)
    assert code == 1
    assert "FAIL boom forfeited" in out and "forfeit_error" in out


def test_a_rejected_bot_fails(root, capsys):
    submit(root, [("dup", "Dup", "hard", "return scan_shot(view)")])  # name taken by builtin
    code, out = run(root, capsys)
    assert code == 1 and "FAIL rejected custom/dup.py" in out and "already used" in out
