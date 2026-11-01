# Battleship Arena

Battleship Arena is a Battleship engine, a small API for writing bots, and an automatic
tournament that ranks them. The rules and every bot are written **once, in Python**:
the same code plays the official tournament in CI and runs in your browser via
[Pyodide](https://pyodide.org).

- **Play**: [carmencuerva.github.io/BATTLESHIP](https://carmencuerva.github.io/BATTLESHIP/).
  You can play against a bot, watch two bots play each other, play another person on the same
  device, or run a tournament in the browser.
- **Ranking**: the *Ranking* tab of the page shows the latest official tournament.
- **Write your own bot**: see [Write a bot](write-a-bot.md). You need a single Python file
  and one line in a manifest.

## Quick start

```bash
git clone https://github.com/carmencuerva/BATTLESHIP.git
cd BATTLESHIP
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest                             # the test suite
battleship-tournament              # play the tournament, write results/leaderboard.json
```

To play the web page locally:

```bash
python scripts/build_web.py        # packs the Python code into web/py.zip
python -m http.server 8000 --directory web
# open http://localhost:8000
```

## Principles

- **One source of truth.** The rules live in `battleship.game`. JavaScript only draws what Python returns.
- **Plain data only.** Boards, views, shots and results are lists, dicts and strings (JSON).
- **Pure engine.** Engine functions never mutate their arguments; they return new values.
- **The tournament owns turns and time.** Neither the engine nor the bots enforce turns or
  timeouts. The tournament does.
- **Minimal bot contract.** A bot places its fleet and chooses shots. That is all.
- **Explicit admission.** A bot plays only if a `players.yaml` manifest lists it.
- **Failures are contained.** A bot that crashes, cheats or runs out of time loses that game,
  and the tournament goes on.
