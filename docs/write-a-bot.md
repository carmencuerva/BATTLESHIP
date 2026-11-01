# Write a bot

A bot is one Python file with one class that subclasses `battleship.player.Player`.

## 1. The class

```python title="players/custom/my_bot.py"
import random

from battleship.bots import hunt_target_shot, random_fleet
from battleship.player import Player


class MyBot(Player):
    # --- identity (read without building the bot) ---
    @classmethod
    def get_name(cls):
        return "mybot"                      # unique; letters, digits, space, _ . -; up to 32

    @classmethod
    def get_authors(cls):
        return ["Your Name"]

    @classmethod
    def get_description(cls):               # optional
        return "Hunts on a parity grid, then finishes what it hits."

    @classmethod
    def get_icon(cls):                      # optional, one emoji
        return "🐙"

    # --- construction ---
    @classmethod
    def create(cls, seed):                  # optional; use the seed for reproducible games
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    # --- play ---
    def choose_placement(self, board_size, fleet):
        return random_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        return hunt_target_shot(view, self.rng)
```

| method | must return |
|--------|-------------|
| `choose_placement(board_size, fleet)` | one `[row, col, "H"|"V"]` per ship, in `fleet` order (see [Rules](rules.md)) |
| `choose_shot(view)` | a `(row, col)` that is on the board and not shot yet |

The bot only sees the attacker's **view** and never the enemy board. It is a function of
that view: there is no callback with the result of a shot, because the next view already
shows it. You may keep state in `self` if you want to.

### Helpers you can reuse

`battleship.bots` contains the strategies of the built-in bots:

| helper | idea |
|--------|------|
| `random_shot(view, rng)` | any unshot cell |
| `scan_shot(view)` | the first unshot cell, row by row |
| `hunt_target_shot(view, rng)` | parity hunt, then finish every hit ship |
| `probability_shot(view, rng)` | the cell covered by the most legal ship positions; returns `(cell, heatmap)` |
| `probability_map(view)`, `hit_clusters(view)` | building blocks for your own ideas |
| `random_fleet(size, fleet, rng)` | a random legal placement |
| `stealth_fleet(size, fleet, rng)` | a placement that is hard for a probability hunter |

### X-ray mode (optional)

If your bot sets `self.last_info = {"heatmap": grid}` in `choose_shot`, the web page shows that
grid over the board in X-ray mode. `grid` is `size × size` numbers, and higher numbers are drawn brighter.
The tournament ignores `last_info`.

## 2. The manifest

A bot only plays if the manifest of its folder lists it. Add one entry to
`players/custom/players.yaml`:

```yaml
players:
  - file: my_bot.py
    class: MyBot
```

## 3. Try it

```bash
python scripts/check_players.py      # loads every player and plays a short round-robin
battleship-tournament                # the full tournament, with your bot in it
python scripts/build_web.py          # then play against it in the browser
```

`check_players.py` fails if your bot is rejected (bad identity, duplicated name, import
error) or if it forfeits any game.

## Rules for bots

- **Time:** each game gives a bot **2 s** to build itself (`create`) and **2 s in total** for
  its placement and every shot of that game. A bot that runs over loses the game.
- **Errors:** an exception, an illegal shot or a bad placement loses the game. The
  tournament goes on.
- Do not read files, use the network or inspect other objects. Your bot must play
  only with the view it gets.

## 4. Send it

Open a pull request that adds your file and the manifest entry. The `custom-players`
workflow runs the same check. Once your pull request is merged, the `tournament` workflow
replays the tournament and the online ranking updates. See `CONTRIBUTING.md` for the
details.
