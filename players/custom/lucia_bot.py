import random

from battleship.bots import hit_clusters, random_fleet
from battleship.game import HIT, SUNK, UNKNOWN, in_bounds, neighbours
from battleship.player import Player


class LuciaBot(Player):
    """Uses the no-touch rule to skip certain water and hunts far from earlier shots."""

    @classmethod
    def get_name(cls):
        return "lucia"

    @classmethod
    def get_authors(cls):
        return ["Lucía Argüello"]

    @classmethod
    def get_description(cls):
        return "Skips water the no-touch rule gives away; hunts far from earlier shots."

    @classmethod
    def get_icon(cls):
        return "🐬"

    @classmethod
    def create(cls, seed):
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    def choose_placement(self, board_size, fleet):
        return random_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        size, cells = view["size"], view["cells"]
        water = self.certain_water(view)

        def open_cell(cell):
            r, c = cell
            return in_bounds(size, cell) and cells[r][c] == UNKNOWN and cell not in water

        # Target: finish the first ship we have hit, along its line if we know it.
        for cluster in hit_clusters(view):
            (r0, c0), (r1, c1) = cluster[0], cluster[-1]
            if len(cluster) == 1:
                options = [(r0 - 1, c0), (r0 + 1, c0), (r0, c0 - 1), (r0, c0 + 1)]
            elif r0 == r1:
                options = [(r0, c0 - 1), (r1, c1 + 1)]
            else:
                options = [(r0 - 1, c0), (r1 + 1, c1)]
            options = [cell for cell in options if open_cell(cell)]
            if options:
                self.last_info = {"heatmap": self.grid(size, {cell: 1 for cell in options})}
                return self.rng.choice(options)

        # Hunt: on the parity grid of the shortest ship left, as far as possible from
        # every shot so far (big empty areas are where the long ships fit).
        step = min(view["remaining"], default=1)
        shots = [(r, c) for r in range(size) for c in range(size) if cells[r][c] != UNKNOWN]
        free = [(r, c) for r in range(size) for c in range(size) if open_cell((r, c))]
        candidates = [(r, c) for r, c in free if (r + c) % step == 0] or free
        if not candidates:  # only certain water is left (cannot happen in a legal game)
            candidates = [(r, c) for r in range(size) for c in range(size) if cells[r][c] == 0]

        def room(cell):
            if not shots:
                return 1 + min(cell[0], cell[1], size - 1 - cell[0], size - 1 - cell[1])
            return min(abs(cell[0] - r) + abs(cell[1] - c) for r, c in shots)

        scores = {cell: room(cell) for cell in candidates}
        best = max(scores.values())
        self.last_info = {"heatmap": self.grid(size, scores)}
        return self.rng.choice([cell for cell, score in scores.items() if score == best])

    @staticmethod
    def certain_water(view):
        """Unshot cells that cannot hold a ship: around sunk ships and diagonal to hits."""
        size, cells = view["size"], view["cells"]
        water = set()
        for r in range(size):
            for c in range(size):
                if cells[r][c] == SUNK:
                    water.update(neighbours(size, (r, c)))
                elif cells[r][c] == HIT:
                    water.update(
                        (r + dr, c + dc)
                        for dr in (-1, 1)
                        for dc in (-1, 1)
                        if in_bounds(size, (r + dr, c + dc))
                    )
        return water

    @staticmethod
    def grid(size, scores):
        return [[scores.get((r, c), 0) for c in range(size)] for r in range(size)]
