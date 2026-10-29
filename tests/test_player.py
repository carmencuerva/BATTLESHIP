import pytest

from battleship.game import legal_shots
from battleship.player import Player
from battleship.registry import player_info


class Minimal(Player):
    @classmethod
    def get_name(cls):
        return "minimal"

    @classmethod
    def get_authors(cls):
        return ["Ada"]

    def choose_placement(self, board_size, fleet):
        return [[2 * i, 0, "H"] for i in range(len(fleet))]

    def choose_shot(self, view):
        return legal_shots(view)[0]


def test_player_is_abstract():
    with pytest.raises(TypeError):
        Player()


@pytest.mark.parametrize("missing", ["get_name", "get_authors", "choose_placement", "choose_shot"])
def test_every_abstract_method_is_required(missing):
    namespace = {k: v for k, v in vars(Minimal).items() if k != missing and not k.startswith("__")}
    incomplete = type("Incomplete", (Player,), namespace)
    with pytest.raises(TypeError):
        incomplete()


def test_default_create_and_identity():
    player = Minimal.create(seed=123)
    assert isinstance(player, Minimal)
    assert Minimal.get_description() == ""
    assert Minimal.get_icon() == "🚢"
    assert player.last_info is None


def test_identity_is_read_without_constructing():
    class Unbuildable(Minimal):
        def __init__(self):
            raise RuntimeError("must not be constructed")

    info = player_info(Unbuildable, "test")
    assert info.name == "minimal"
    assert info.to_json() == {
        "name": "minimal",
        "authors": ["Ada"],
        "description": "",
        "icon": "🚢",
        "source": "test",
    }
