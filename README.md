# 🚢 Battleship Arena

[![tests](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tests.yml/badge.svg)](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tests.yml)
[![tournament](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tournament.yml/badge.svg)](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tournament.yml)
[![pages](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/pages.yml/badge.svg)](https://carmencuerva.github.io/BATTLESHIP/)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*[Leer en español](README.es.md)*

Battleship Arena contains:

- a Battleship engine;
- a tiny API for writing bots;
- an automatic tournament that ranks the bots;
- a web page to play against them.

The rules and every bot are written **once, in Python**. The same code runs the
tournament in CI and the game in your browser, via [Pyodide](https://pyodide.org).

**▶ Play: <https://carmencuerva.github.io/BATTLESHIP/>** · **📖 Docs:
<https://carmencuerva.github.io/BATTLESHIP/docs/>**

## 🎬 Video tutorial

[![Battleship Arena video tutorial: how to play and how to use the interface](docs/media/tutorial-thumbnail.jpg)](docs/media/tutorial.mp4)

Click the image to watch the video (2 min 35 s, with a Spanish voice-over, Spanish
subtitles and the game's own pirate music). Recorded on the current page, it walks through
the captain's cabin (game mode, your name, fleet, sea size, wind, enemy captain), placing
your fleet (drag, rotate with <kbd>R</kbd>, the no-touch rule, *Random*, *Weigh anchor!*),
the battle (shooting, miss and hit, safe-water hints, X-ray, the ship's log), the end
screen, the Tournament and Ranking tabs, and the sound, volume and language settings.

## Rules in one paragraph

The board is 10×10 and the fleet is 5, 4, 3, 3, 2; both can be configured. Ships may not
touch, not even diagonally. A hit or a sink lets you shoot again. Sinking a ship announces
its length. The first player to sink the whole enemy fleet wins.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest                           # tests
battleship-tournament            # round-robin → results/leaderboard.json
python scripts/build_web.py      # pack the Python for the browser
python -m http.server 8000 --directory web   # play at http://localhost:8000
```

## Write your own bot

1. Create `players/custom/my_bot.py` with a subclass of `battleship.player.Player`. It
   needs `get_name`, `get_authors`, `choose_placement` and `choose_shot`.
2. List it in `players/custom/players.yaml`.
3. Run `python scripts/check_players.py`, then open a pull request.

The full guide is [Write a bot](docs/write-a-bot.md). See also [CONTRIBUTING.md](CONTRIBUTING.md).

## Built-in bots

| bot | strategy |
|-----|----------|
| 🎲 random | shoots at random |
| 🐣 easy | shoots at random and, after a hit, tries the cells around it until the ship sinks |
| 🎯 medium | parity hunt, then finishes every ship it hits; never shoots where the no-touch rule leaves only water |
| 🧠 hard | shoots the most likely cell given every legal ship position; hides its fleet where hunters look least |

Each level adds one idea to the previous one, and it shows in the shots needed to sink a
randomly placed fleet (mean of 300 games): random 95, easy 66, medium 44, hard 39. No bot
sees the rival's board: they all decide from the `view` alone (cells already shot and the
lengths still afloat), and tests check it.

Bot review (November 2026, after our professor's feedback):

- **easy** used to scan the board row by row and was barely better than random (90 shots
  against 95; it beat random only 68% of the time). It is now a believable beginner: it
  shoots at random and finishes what it hits (66 shots; beats random 100–0, loses to
  medium 2–98).
- **car_lu** beat hard only because its constants (how much a rival hides on the border)
  had been measured on 10x10 against hard's placement; on 12x12 they were nearly even
  (108–92), and in the web's 10-game tournament hard could come out ahead. It now builds
  both hypotheses ("places at random" / "hides where hunters look least") from the board
  itself and learns from every uncovered cell, water included. It beats hard 80% of the
  time in the official tournament and 66–83% on boards from 8x8 to 15x15.
- **medium** and **hard** are unchanged: they were already consistent, and hard is
  demanding without cheating.

Earlier changes to the ladder (November 2026), measured over 1,000 games per pair (seed 0):

- **medium** used to shoot cells the no-touch rule had already proved to be water (around
  sunk ships, diagonal to hits): 7–8 wasted shots per game. It now skips them, so it wins
  in 42.8 shots instead of 51.1. It still loses to hard (243–757).
- **hard** plays exactly as before (same shots on 12,031 checked positions), but its
  probability map is computed about 6× faster, leaving a wider margin under the 2 s budget.
- **random** and **easy** were unchanged then.

Submitted bots (`players/custom/`):

| bot | author | strategy |
|-----|--------|----------|
| 🐬 car_lu | Lucía Argüello and Carmen Cuerva | counts every ship position the no-touch rule allows, like hard, but mixes two hypotheses about the rival ("places at random" and "hides where hunters look least") and learns during each game which one holds; hides its own fleet among the least exposed placements, drawn at random |

## Repository layout

| path | what |
|------|------|
| `src/battleship/` | engine (`game.py`), `Player` API, manifests and registry, strategies, tournament, Elo |
| `players/` | `builtin/` and `custom/` players, each with a `players.yaml` manifest |
| `web/` | the static page and `webglue.py`, the JSON bridge to Python |
| `scripts/` | `build_web.py` (packs `web/py.zip`) and `check_players.py` (validates submissions) |
| `docs/` | bilingual MkDocs documentation |
| `tests/` | pytest suite and JavaScript tests (`tests/js`) |

## Credits

- Architecture: [nim-arena](https://github.com/jparisu/nim-arena) by jparisu and the NIM Arena contributors (MIT); its copyright notice is kept in [LICENSE](LICENSE).
- Fonts: [Pirata One](https://fonts.google.com/specimen/Pirata+One), [Bangers](https://fonts.google.com/specimen/Bangers) and [Nunito](https://fonts.google.com/specimen/Nunito), all under the [SIL Open Font License 1.1](https://openfontlicense.org), served by Google Fonts.
- Ships, parrot, the captain's cabin (room, windows, lanterns, chart, miniatures and every object on the table), effects and every sound are drawn or synthesised by this project's own code (SVG, CSS, Web Audio).
- The background music is an original tune composed for this project and synthesised live (`web/js/music.js`).
- The parrot's voice is your browser's own speech synthesis (`speechSynthesis`), using the voices installed on your device; no recordings are shipped.
- The pirate pictures of the end screens and the hat (`web/img/`) were supplied by the project's authors.

## License

[MIT](LICENSE).
