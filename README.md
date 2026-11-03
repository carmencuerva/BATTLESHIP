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
| 🐣 easy | scans the board row by row |
| 🎯 medium | parity hunt, then finishes every ship it hits |
| 🧠 hard | shoots the most likely cell given every legal ship position; hides its fleet where hunters look least |

Submitted bots (`players/custom/`):

| bot | author | strategy |
|-----|--------|----------|
| 🐬 lucia | Lucía Argüello | skips water the no-touch rule gives away; hunts where the longest ship still fits; hides its fleet like hard |

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

- Fonts: [Cinzel](https://fonts.google.com/specimen/Cinzel) and [EB Garamond](https://fonts.google.com/specimen/EB+Garamond), both under the [SIL Open Font License 1.1](https://openfontlicense.org), served by Google Fonts.
- Ships, parrot, the captain's cabin (room, windows, lanterns, chart, miniatures and every object on the table), effects and every sound are drawn or synthesised by this project's own code (SVG, CSS, Web Audio).
- The background music is an original tune composed for this project and synthesised live (`web/js/music.js`).
- The parrot's voice is your browser's own speech synthesis (`speechSynthesis`), using the voices installed on your device; no recordings are shipped.
- The pirate pictures of the end screens and the hat (`web/img/`) were supplied by the project's authors.

## License

[MIT](LICENSE).
