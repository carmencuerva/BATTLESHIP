import random

from battleship.bots import hunt_target_shot, random_fleet
from battleship.player import Player


class MediumBot(Player):
    @classmethod
    def get_name(cls):
        return "medium"

    @classmethod
    def get_authors(cls):
        return ["Battleship Arena"]

    @classmethod
    def get_description(cls):
        return "Random fleet; hunts on a parity grid, then finishes every ship it hits."

    @classmethod
    def get_icon(cls):
        return "🎯"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        return random_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        return hunt_target_shot(view, self.rng)
