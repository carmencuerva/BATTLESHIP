import random

from battleship.bots import probability_shot, stealth_fleet
from battleship.player import Player


class HardBot(Player):
    @classmethod
    def get_name(cls):
        return "hard"

    @classmethod
    def get_authors(cls):
        return ["Battleship Arena"]

    @classmethod
    def get_description(cls):
        return "Hides its fleet where hunters look least; shoots the most likely cell."

    @classmethod
    def get_icon(cls):
        return "🧠"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        return stealth_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        shot, heat = probability_shot(view, self.rng)
        self.last_info = {"heatmap": heat}
        return shot
