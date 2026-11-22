"""InesBot: hunts using ship-position probabilities and hides its fleet from that hunter."""

import random

from battleship.bots import probability_shot, stealth_fleet
from battleship.player import Player


class InesBot(Player):
    @classmethod
    def get_name(cls):
        return "ines"

    @classmethod
    def get_authors(cls):
        return ["Ines"]

    @classmethod
    def get_description(cls):
        return "Cuenta posiciones probables para disparar y esconde su flota."

    @classmethod
    def get_icon(cls):
        return "🦊"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        return stealth_fleet(board_size, fleet, self.rng, samples=80)

    def choose_shot(self, view):
        shot, heat = probability_shot(view, self.rng)
        self.last_info = {"heatmap": heat}
        return shot
