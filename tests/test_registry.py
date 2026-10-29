import textwrap

import pytest

from battleship.registry import RegistryError, default_manifests, load_players

from .conftest import ROOT

BOT = """
from battleship.player import Player

class Bot(Player):
    @classmethod
    def get_name(cls):
        return {name!r}

    @classmethod
    def get_authors(cls):
        return {authors!r}

    @classmethod
    def get_icon(cls):
        return {icon!r}

    def choose_placement(self, board_size, fleet):
        return []

    def choose_shot(self, view):
        return (0, 0)
"""


def make_group(tmp_path, group, bots):
    """Write ``bots`` ({file: source}) and a manifest admitting class ``Bot`` in each."""
    folder = tmp_path / group
    folder.mkdir()
    lines = ["players:"]
    for file, source in bots.items():
        (folder / file).write_text(textwrap.dedent(source), encoding="utf-8")
        lines.append(f"  - {{file: {file}, class: Bot}}")
    manifest = folder / "players.yaml"
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest


def bot(name="bot", authors=("Ada",), icon="🤖"):
    return BOT.format(name=name, authors=list(authors), icon=icon)


def test_repository_manifests_load():
    players = load_players(default_manifests(ROOT))
    assert [p.name for p in players][:2] == ["random", "easy"]
    assert {p.source.split("/")[0] for p in players} <= {"builtin", "custom"}


def test_loads_player_from_manifest(tmp_path):
    (info,) = load_players([make_group(tmp_path, "g", {"a.py": bot("alpha")})])
    assert (info.name, info.authors, info.icon, info.source) == ("alpha", ["Ada"], "🤖", "g/a.py")


def test_duplicate_names_across_manifests(tmp_path):
    first = make_group(tmp_path, "builtin", {"a.py": bot("same")})
    second = make_group(tmp_path, "custom", {"b.py": bot("same")})
    with pytest.raises(RegistryError, match="already used by builtin/a.py"):
        load_players([first, second])


@pytest.mark.parametrize(
    "source, fragment",
    [
        (bot(name=""), "invalid name"),
        (bot(name="x" * 33), "invalid name"),
        (bot(name="bad/name"), "invalid name"),
        (bot(authors=()), "non-empty list"),
        (bot(authors=("  ",)), "non-empty list"),
        (bot(icon="X"), "single emoji"),
        (bot(icon=""), "single emoji"),
        (bot(icon="🤖 🤖"), "single emoji"),
        ("class Bot:\n    pass\n", "not a Player subclass"),
        ("Bot = 3\n", "not a Player subclass"),
        ("raise RuntimeError('boom')\n", "import failed"),
    ],
)
def test_invalid_players(tmp_path, source, fragment):
    with pytest.raises(RegistryError, match=fragment):
        load_players([make_group(tmp_path, "g", {"a.py": source})])
