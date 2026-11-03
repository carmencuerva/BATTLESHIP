# Battleship Arena

Battleship Arena is a Battleship engine, a small API for writing bots, and an automatic
tournament that ranks them. The rules and every bot are written **once, in Python**:
the same code plays the official tournament in CI and runs in your browser via
[Pyodide](https://pyodide.org).

- **Play**: [carmencuerva.github.io/BATTLESHIP](https://carmencuerva.github.io/BATTLESHIP/).
  You can play against a bot, watch two bots play each other, play another person on the same
  device, or run a tournament in the browser.
- **Your pirate name**: the page asks for it and the parrot calls you by it (deckhand until
  you sink your first ship, captain after that). It is stored only in your own browser
  (`localStorage`); nothing is sent anywhere.
- **The captain's cabin**: you set up each game inside the captain's cabin. The three
  miniatures on the chart choose the mode, and the objects on the table hold the rest:
  the wanted poster (your name), the spyglass (the enemy captain), the ship models (the
  fleet), the dividers (the size of the sea), the compass (the wind) and the logbook (the
  pirate code). Everything in it is drawn by the page's own code (`web/js/cabin-art.js`).
- **The parrot** sits still on its perch between the two boards, so it never covers them.
  It speaks rarely: when the battle starts, when you sink a ship (telling you
  how many enemy ships are left) and when the game ends. Its words always appear in its
  speech bubble. Its lines live in `web/js/parrot-lines.js` if you want other words.
- **Sound**: off until you turn it on with 🔊 (the page remembers your choice). The parrot
  then squawks (synthesised by the page) and says its line in a low voice, using your
  device's voices; with no voice for the language it only squawks. Its pitch, speed and
  squawk are constants at the top of `web/js/sound.js`.
- **Music**: an original sea shanty in 6/8, composed for the game and played live by the
  page (`web/js/music.js`, no recordings). It starts after your first click with sound on,
  carries on across screens, quietens while the parrot speaks and pauses in a hidden tab.
  The slider button next to 🔊 sets the music and parrot volumes (remembered). With *reduce motion* switched on in your system, the big animations stay
  still.
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
