import random

from battleship.bots import random_fleet, scan_shot
from battleship.player import Player


class EasyBot(Player):
    @classmethod
    def get_name(cls):
        return "easy"

    @classmethod
    def get_authors(cls):
        return ["Battleship Arena"]

    @classmethod
    def get_description(cls):
        return "Random fleet; shoots row by row, left to right."

    @classmethod
    def get_icon(cls):
        return "🐣"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        return random_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        return scan_shot(view)
