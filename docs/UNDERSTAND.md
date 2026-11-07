# Understanding Battleship Arena

*Versión en español: [Entender Battleship Arena](ENTENDER.md).*

A study guide for explaining and defending every part of the project. Everything here comes
from reading this repository's code or running it; anything not checked says so. The bot
figures come from the local tournaments of November 2026 (seed 0).

Battleship Arena starts from [nim-arena](https://github.com/jparisu/nim-arena) (by
jparisu): we reused its architecture (player API, manifest, tournament, CI, Pyodide web
page) and adapted it to Battleship. Section 5 details what comes from there and what is
ours.

## 1. Project map

### Python: `src/battleship/`

| Module | What it does |
|---|---|
| `game.py` | The rules engine, pure: board, placement, shots, the attacker's view, who shoots next. Everything is plain data (dicts, lists, ints) and no function changes its arguments: they return a new board. |
| `player.py` | The contract every player implements: identity through class methods (`get_name`, `get_authors`, `get_description`, `get_icon`), `create(seed)` to build it, and `choose_placement` / `choose_shot` to play. Optional: `last_info` for the web's X-ray mode. |
| `manifest.py` | Reads the `players.yaml` files: the explicit list of admitted players (`file` + `class`). Rejects extra keys, paths outside the folder, duplicates and missing files. |
| `registry.py` | Imports each manifest file under a unique module name, checks the class subclasses `Player` and validates its identity (name, authors, emoji) **without building** the player. Can set broken players aside in a `rejected` list so one bad bot cannot stop a tournament. |
| `tournament.py` | The tournament: schedule of mirrored games, one game (`run_game`) with time budgets and forfeits, one process per game, the `league`, `simple` and `championship` formats, the standings and the `battleship-tournament` command line. |
| `elo.py` | The Elo-scale rating: fits every result at once (Bradley-Terry model), so it does not depend on the order of the games. |
| `bots/` | Reusable strategies as pure functions: `placement.py` (`random_fleet`, `stealth_fleet`) and `shooting.py` (`random_shot`, `scan_shot`, `hunt_target_shot`, `probability_map`/`probability_shot`, `certain_water`, `hit_clusters`). |

### Players: `players/`

| Folder | What is in it |
|---|---|
| `players/builtin/` | The reference ladder (random, easy, medium, hard) and its `players.yaml`. Each bot is a thin class that calls a strategy from `bots/`. |
| `players/custom/` | Bots submitted by pull request (now `lucia_bot.py`) and their `players.yaml`. |

### Web: `web/`

| File | What it does |
|---|---|
| `webglue.py` | The JS ↔ Python bridge: every function takes JSON strings and returns a JSON string. Keeps live bots behind numbers (`handle`) because they are objects with state. |
| `pyodide-bootstrap.js` | Loads Pyodide 0.27.2 from jsDelivr, unpacks `py.zip`, imports `webglue` and offers `arena.call("function", ...args)`, which JSON-encodes every argument and the result. |
| `js/app.js` | Screens and turn orchestration: decides what to draw and when to ask Python for the next step. Holds no rules. |
| `js/board.js`, `js/ships.js`, `js/coords.js` | Drawing the board, the ships (SVG) and "C7"-style coordinates. Presentation only. |
| `js/cabin.js`, `js/cabin-art.js` | The start screen as a cabin in perspective: geometry (the chart's homography) and SVG drawing. |
| `js/leaderboard.js` | Renders the standings (the tournament's JSON) as tables. |
| `js/parrot.js`, `js/parrot-lines.js`, `js/sound.js`, `js/music.js`, `js/fx.js`, `js/endscreen.js` | The commentator parrot and its lines, sound effects and voice, original Web Audio music, visual effects and end screens. Decoration: they never change the game state. |
| `js/i18n.js`, `js/html.js`, `js/store.js` | ES/EN strings, HTML escaping and local memory (`localStorage`) guarded with try/catch. |

### Scripts and CI

| File | What it does |
|---|---|
| `scripts/build_web.py` | Packs `src/battleship`, `players/` and `webglue.py` into `web/py.zip` deterministically (fixed order and dates) and copies `results/leaderboard.json` next to the page. |
| `scripts/check_players.py` | Checks submitted bots: they load with a valid identity and play a short round-robin without a single forfeit. |
| `.github/workflows/tests.yml` | On every push and PR: ruff, formatting, mypy and pytest on Python 3.10, 3.12 and 3.13; plus the JavaScript tests and a real run of `py.zip` inside Pyodide (Node). |
| `.github/workflows/custom-players.yml` | On PRs or pushes touching `players/`: `check_players.py --games 4`. |
| `.github/workflows/tournament.yml` | On pushes to `main` touching `src/`, `players/` or `pyproject.toml`: plays the official tournament and commits `results/leaderboard.json` if the standings changed. |
| `.github/workflows/pages.yml` | On pushes to `main`: plays the tournament, builds `py.zip` and the docs (MkDocs) and publishes everything to GitHub Pages. |
| `.github/workflows/docs.yml` | Checks the docs build without warnings (`mkdocs build --strict`). |

## 2. One game, step by step (human against a bot, on the web)

1. **Start-up.** `boot()` calls `startArena()`: Pyodide loads, unpacks `py.zip` and imports `webglue`. Then it asks for `defaults` (`{"size": 10, "fleet": [5,4,3,3,2]}`) and `list_players` (each bot's identity, read without building it).
2. **Pressing "All hands, attack!".** Before starting, `check_fleet(size, fleet)` is called: Python validates the fleet and tries a real placement; if that fails it returns `{"ok": false, "problem": {"code": ...}}` and the page explains it in its own language.
3. **The bot gets ready** (`startMatch`). `create_bot(name, seed)` → `{"handle": 1}` (Python builds the bot with `create(seed)` and keeps it). `bot_placement(handle, size, fleet)` → `{"placement": [[row, col, "H"|"V"], ...]}`, already checked with `validate_placement`. `new_board(size, fleet, placement)` → the full board `{"size", "ships", "shots"}`.
4. **You place your fleet.** Each time you move the pointer, `layout(size, fleet, partial_placement)` says which cells each ship covers and whether the placement is legal (`ok`, `problem`). "Random" calls `random_layout`. On confirming, `new_board` builds your board.
5. **Battle.** JS draws lots for who starts. On your turn the page draws with `status(enemy_board)` (returns `view`, `hints`, `sunk`…) and, on a click, `shoot(board, [r, c], attacker)` → `{"board", "result": {"outcome": "miss"|"hit"|"sunk", "length"}, "terminal", "next"}`. `next` is who shoots: the same player after a hit or sink, the other after a miss.
6. **The bot's turn** (`botTurn`). The page asks for `status(your_board).view` (only shot cells and the lengths still afloat) and calls `bot_shot(handle, view)` → `{"shot": [r, c], "info": {...}}`. Python checks the shot is legal; `info` is the bot's `last_info` (its heat map, for X-ray). Then the page applies the shot with `shoot`.
7. **End.** When `shoot` returns `terminal: true`, the page announces the winner (victory or defeat screen) and frees the bot with `release_bot`.

What crosses is always JSON strings of plain data. Rules, legality and bots live in Python;
JavaScript only draws, animates and decides when to ask.

## 3. The tournament in CI and how it reaches the page

1. A push to `main` touching `src/`, `players/` or `pyproject.toml` starts `tournament.yml`: `pip install .` and `battleship-tournament` with the default settings (league, 100 games per pair, seed 0, subprocesses, 4 at a time).
2. `load_players` reads `players/builtin/players.yaml` and `players/custom/players.yaml`; broken players go to `rejected` and do not stop the tournament.
3. `schedule` gives each pair 100 games in mirrored couples: games `2k` and `2k+1` use the same seeds and each player starts once. Seeds depend only on the tournament seed and the two names.
4. Each game runs in a new process (`run_game_in_subprocess`): the process announces every bot call with the time that bot has left; if no answer comes in time, the process is killed and that bot loses on time.
5. `standings` counts wins, forfeits and their reasons, wins as first and second player, average shots to win, hit rate, and fits the Elo rating with `elo.fit`.
6. `results/leaderboard.json` is written; if it changed (ignoring `generated_at`), the workflow commits and pushes it.
7. `pages.yml` (also on every push to `main`) plays the same tournament on its own, `build_web.py` copies `results/leaderboard.json` to `web/leaderboard.json`, and the Ranking tab downloads it with `fetch("leaderboard.json")` and renders it with `leaderboard.js`.

## 4. Why each design decision

- **State as plain data.** Boards, views and results are JSON dicts and lists. They cross the Python ↔ JS boundary without conversion, can be stored and compared in tests, and a game process can send its result back through a pipe.
- **Pure functions.** `apply_shot` returns a new board instead of changing the old one; the strategies in `bots/` are functions of the view. They are tested with an input and an output, no objects to set up, and there is no hidden state to drift between the page and Python.
- **One process per game.** A bot can hang in an endless loop; a thread cannot be killed in Python, a process can. A bot that breaks the interpreter only takes its own game down.
- **A manifest instead of scanning folders.** A `.py` file does not play unless a line admits it. In a pull request the reviewer sees the new bot and the line that admits it together, and a stray file (tests, half-done) never gets in by accident.
- **Hidden information through the `view`.** A bot never receives the opponent's board, only `view_for_attacker(board)`: shot cells (water, hit, sunk) and the lengths still afloat. In the tournament it also gets a deep copy, so changing it does not change the game.
- **Identity through class methods.** The registry reads name, authors and icon without building the bot, so a slow or broken `__init__` cannot stop the players from being listed.
- **`create(seed)` as the only constructor.** All randomness comes from that seed, and the tournament is reproducible: same seed, same games.

## 5. What comes from nim-arena and what is ours

Compared by reading nim-arena on GitHub (November 2026). Our code was not copied file by
file: the history starts with an empty commit and the project was written in phases
following its design. Parts of nim-arena we did not open (its `game.py`, the details of
`registry.py`, the contents of its workflows and templates) are not compared here.

### Kept almost the same

- **Player API:** a `Player` base class with identity through class methods (`get_name`, `get_authors`, `get_description`, `get_icon` with one emoji) and `create(cls, seed)` as the only way to build a player.
- **Manifest:** the same `players: - file: … class: …` format, a `builtin` and a `custom` folder, and the rule of never scanning folders.
- **Tournament:** the `simple`, `league` and `championship` formats; one process per game; a 2 s budget per game and 2 s to build; the forfeits `forfeit_timeout`, `forfeit_illegal`, `forfeit_error`, `forfeit_build_timeout` and `forfeit_build_error`; results in `results/leaderboard.json`.
- **Elo:** 1500 to start and a 400-point scale (nim-arena updates game by game with K = 32; we changed that, see below).
- **CI:** the same five workflows (`tests`, `custom-players`, `tournament`, `pages`, `docs`).
- **Web:** Pyodide with `pyodide-bootstrap.js`, a `webglue.py` bridge, `scripts/build_web.py` producing `py.zip`.
- **Docs:** MkDocs with Material, in English and Spanish.

### Adapted or new (ours)

- **The game:** Nim → Battleship. A new engine (`game.py`): placement with the no-touch rule, diagonals included; shots answered with water/hit/sunk; shooting again after a hit.
- **Hidden information:** in Nim both players see everything; here the `view` hides the ships not yet hit.
- **The move API:** Nim's `choose_move` becomes two methods, `choose_placement` and `choose_shot`.
- **New forfeit:** `forfeit_bad_placement`.
- **Schedule:** mirrored couples sharing seeds; the championship is a league plus knockout (nim-arena uses groups of four).
- **Hunting bots:** parity, hunt and target, a probability map with the no-touch rule, stealthy placement, and LuciaBot with its Bayesian belief about the edges.
- **Ranking:** an Elo-scale rating fitted to all games at once (independent of the order).
- **Pirate interface:** the cabin in perspective, a drag-and-drop placement editor, illustrated boards, X-ray mode, the tournament in the browser.
- **The parrot, the music and the sounds:** lines, a voice through the browser's speech synthesis, music composed for the game in Web Audio.
- **`scripts/check_players.py`** to validate submissions.

## 6. Questions a teacher might ask

| # | Question | Short answer |
|---|---|---|
| 1 | Why one process per game? | To be able to kill a hung bot (a thread cannot be killed) and so a serious failure only affects its own game. |
| 2 | What happens if a bot hangs? | Before each call the game process announces the time that bot has left; if no answer arrives within that time plus 1 s of slack, the process is killed and the bot loses with `forfeit_timeout`. |
| 3 | And if it raises an exception or returns something illegal? | It loses that game (`forfeit_error`, `forfeit_illegal` or `forfeit_bad_placement`) and the tournament goes on. |
| 4 | How is a bot kept from seeing the opponent's ships? | It only receives `view_for_attacker(board)`: shot cells and the lengths still afloat, never the board. Tests check it, including a spy bot in real games. |
| 5 | Can a bot cheat by changing the view? | No: the tournament gives it a deep copy. A test checks it. |
| 6 | What is Pyodide? | The Python interpreter compiled to WebAssembly: it runs in the browser exactly the same engine and bots as CI. |
| 7 | What crosses between JavaScript and Python? | Only JSON strings of plain data: `arena.call` encodes the arguments and `webglue` returns JSON. |
| 8 | Where are the rules? | Only in `game.py`. The page asks Python whether a placement or a shot is legal. |
| 9 | How is the Elo computed? | It is the rating (400-point scale, mean 1500) that best explains every result at once under the Bradley-Terry model, fitted by iteration (Hunter, 2004), with one virtual draw against a reference so a clean sweep cannot run off to infinity. |
| 10 | Why not classic game-by-game Elo? | Because it depends on the order: with 100 games per pair, lucia beat hard 70-30 and had more wins, but came second. |
| 11 | How does hard's probability map work? | For each cell it counts how many legal positions of the remaining ships cover it (no water, not in the ring of a sunk ship, never brushing past a hit it does not contain); if a ship is hit, only positions through it count. It shoots the cell with the most. |
| 12 | How is LuciaBot different from hard? | It counts the same legal positions, but gives more weight to those touching the border, according to a Bayesian belief, updated during each game from the ships it uncovers, about whether the rival hides along the edges; and it places its fleet at random among the least exposed of 60 candidates. It beats hard in about 68% of games. |
| 13 | Why did hard hide its fleet on the edges? | `stealth_fleet` picks, out of 20 random placements, the one covering the least of the opening probability map, which is lowest along the edges. |
| 14 | What is medium's parity search? | While hunting it only shoots cells with `(row + col) % shortest_ship == 0`: every ship of that length covers at least one. |
| 15 | Why can't ships touch, and how do bots use it? | It is a rule of the game we chose; because of it, around a sunk ship and diagonal to a hit there can only be water, and medium, hard and lucia do not shoot there. |
| 16 | How is the tournament reproducible? | All randomness comes from seeds: each game gets seeds derived from the tournament seed and the two names, and each bot builds its own `random.Random(seed)`. |
| 17 | What are mirrored couples? | Games with the same seeds in which each player starts once, to balance the advantage of starting. |
| 18 | Why a manifest? | So a bot only gets in if a line admits it, visible in the same pull request. |
| 19 | What if someone submits a broken bot? | `check_players.py` catches it in the PR; if it still reaches the tournament, it is set aside in `rejected` and the tournament goes on. |
| 20 | How much time does a bot get? | 2 s in total for placing and shooting during the whole game, and another 2 s to be built. On the web the limits are much higher (30 s and 10 s) because a bot cannot be killed there. |
| 21 | Why 100 games per pair? | With 20, the order between hard and lucia changed with the number of games (either could win); with 1,000 the difference was clear. |
| 22 | How do the standings reach the page? | `build_web.py` copies `results/leaderboard.json` next to the page and the Ranking tab downloads it with `fetch`. |
| 23 | What is `last_info` and X-ray mode? | An optional field of the bot (for example its heat map) that the page draws over the board it is attacking. The tournament ignores it. |
| 24 | Which part of the project comes from nim-arena? | The architecture: player API, manifest, tournament with processes and forfeits, Elo, CI, Pyodide page and docs. The game, the bots and the interface are ours (section 5). |
| 25 | How is it tested? | pytest (engine, API, manifest, tournament, bots, web bridge), ruff and mypy in CI; JavaScript tests with Node and a run of `py.zip` inside Pyodide. |

## Open questions

- **The leaderboard commit and Pages.** `tournament.yml` pushes with the GitHub Actions token. According to GitHub's documentation, events created with that token do not start other workflows, so that commit should not republish the page. It does not change the result, because `pages.yml` plays its own tournament, but we have not checked it in Actions.
- **Timing on GitHub.** The measured times (hard's worst game was about 1.2 s before it was sped up; lucia's under 0.8 s) are from our computer; we have not measured how much slower GitHub's runners are.
- **nim-arena:** we have not read its `game.py`, the details of its `registry.py` or the contents of its workflows and templates, so we do not claim how close they are to ours.
- **The web and human cheating:** on the web both full boards live in JavaScript's memory (`match.sides[i].board`). A bot cannot see them, but a person with the browser's developer tools can. It does not affect the tournament (which runs in Python), but it is worth knowing.
- **Why easy beats random (67%).** We measured that against `random_fleet` fleets, scanning row by row needs fewer shots (90.8 against 95.5) than shooting at random. We have not checked why that placement favours the scan.
