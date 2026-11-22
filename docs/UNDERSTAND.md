# Understanding Battleship Arena

*Versión en español: [Entender Battleship Arena](ENTENDER.md).*

A study guide for explaining and defending every part of the project. Everything here comes
from reading this repository's code or running it; anything not checked says so. The bot
figures come from the local tournaments of November 2026 (seed 0).

Battleship Arena starts from [nim-arena](https://github.com/jparisu/nim-arena) (by
jparisu): we reused its architecture (player API, manifest, tournament, CI, Pyodide web
page) and adapted it to Battleship. Section 5 details what comes from there and what is
ours, and section 6 explains the bots in depth: how they detect hits, how they decide and
why each level is harder than the previous one.

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
| `bots/` | Reusable strategies as pure functions: `placement.py` (`random_fleet`, `stealth_fleet`) and `shooting.py` (`random_shot`, `scan_shot`, `random_target_shot`, `hunt_target_shot`, `probability_map`/`probability_shot`, `certain_water`, `hit_clusters`). |

### Players: `players/`

| Folder | What is in it |
|---|---|
| `players/builtin/` | The reference ladder (random, easy, medium, hard) and its `players.yaml`. Each bot is a thin class that calls a strategy from `bots/`. |
| `players/custom/` | Bots submitted by pull request (now `car_lu_bot.py`) and their `players.yaml`. |

### Web: `web/`

| File | What it does |
|---|---|
| `webglue.py` | The JS ↔ Python bridge: every function takes JSON strings and returns a JSON string. Keeps live bots behind numbers (`handle`) because they are objects with state. |
| `pyodide-bootstrap.js` | Loads Pyodide 0.27.2 from jsDelivr, unpacks `py.zip`, imports `webglue` and offers `arena.call("function", ...args)`, which JSON-encodes every argument and the result. |
| `js/app.js` | Screens and turn orchestration: decides what to draw and when to ask Python for the next step. Holds no rules. |
| `js/board.js`, `js/ships.js`, `js/coords.js` | Drawing the board, the ships (SVG) and "C7"-style coordinates. Presentation only. |
| `js/cabin.js`, `js/cabin-art.js` | The start screen as a cabin in perspective: geometry (the chart's homography) and SVG drawing. |
| `js/deck-art.js` | Drawings for the placement and battle screens (cutlasses, quill, plaques, the parrot's brass stand). Both screens show the start screen's cabin behind them, dimmed. Decoration only. |
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

[nim-arena](https://github.com/jparisu/nim-arena) (MIT licence, "Copyright (c) 2026
jparisu and the NIM Arena contributors") is an arena for the game of Nim: a rules engine,
an API to write bots, an automatic tournament in CI and a web page that runs the same
Python through Pyodide. Compared by reading its code on GitHub (November 2026: `game.py`,
`player.py`, `manifest.py`, `registry.py`, `elo.py`, `tournament.py`, `webglue.py`,
`pyodide-bootstrap.js`, `build_web.py` and its five workflows). Our code was not copied
file by file: the history starts with an empty commit and the project was written in
phases following its design. What we reused is **the architecture and the conventions**;
the game, the bots, the rating and the interface are ours.

### How the pieces fit (a map shared by both projects)

```text
players/*/players.yaml ──► manifest.py ──► registry.py ──► tournament.py ──► results/leaderboard.json
   (who plays)             (read, check)    (import classes)  (games, Elo)           │
                                                    │                                  ▼
                                               game.py (rules)         build_web.py ──► web/ (Pyodide)
                                                    ▲                                  │
                                         webglue.py ◄── pyodide-bootstrap.js ◄── js/app.js
```

### Kept almost the same (nim-arena's idea)

| Piece | In nim-arena | In Battleship Arena |
|---|---|---|
| Player API | `Player(ABC)` with `get_name`, `get_authors`, `get_description`, `get_icon` and `create(cls, seed)` | The same. |
| Manifest | `players: - file: … class: …`, `builtin` and `custom` folders, never scan folders | The same. |
| Tournament formats | `simple`, `league`, `championship` | The same names. |
| Budgets | 2000 ms per game and 2000 ms to build | 2 s and 2 s. |
| Forfeits | `forfeit_timeout`, `forfeit_illegal`, `forfeit_error`, `forfeit_build_timeout`, `forfeit_build_error` | The same, plus `forfeit_bad_placement`. |
| One process per game | Yes (one child forked per game) | Yes (a new process per game, talking through a pipe). |
| Elo | 1500 to start, 400 scale | 1500 and 400, computed differently (see below). |
| CI | `tests`, `custom-players`, `tournament`, `pages`, `docs` | The same five names. |
| Web | `pyodide-bootstrap.js` (Pyodide 0.26.2), JSON-only `webglue.py`, `build_web.py` → `py.zip` | The same structure (Pyodide 0.27.2). |
| Bot ladder | `random`, `easy`, `medium`, `hard` | The same level names, with new strategies. |
| Docs | MkDocs, English and Spanish | The same. |

### Adapted or new (ours)

- **The game:** Nim → Battleship. A new engine (`game.py`): placement with the no-touch rule, diagonals included; shots answered with water/hit/sunk; shooting again after a hit. In nim-arena's Nim the state is a list of heaps (`list[int]`) and a move is `(row, count)`.
- **Hidden information:** in Nim both players see everything; here the `view` hides the ships not yet hit.
- **The move API:** Nim's `choose_move(state)` becomes two methods, `choose_placement` and `choose_shot(view)`.
- **A registry that does not build:** nim-arena validates each player by building it (`create(seed=0)`); we read its identity through class methods without building it, and set broken ones aside in `rejected`.
- **Time per call:** the game process announces each bot call with the time left, and the tournament kills it if it overruns (plus 1 s of slack).
- **Schedule:** mirrored couples sharing seeds; the championship is a league plus knockout (nim-arena uses groups of four and copies of the built-in bots).
- **Ranking:** nim-arena updates Elo game by game with K = 32; we fit the rating to all games at once (Bradley-Terry), so it does not depend on the order.
- **Workflows:** nim-arena's opens a pull request with the leaderboard and Pages waits for the tournament; ours commits directly, and Pages plays its own tournament.
- **Hunting bots:** the four levels and CarLuBot (section 6) are ours; nim-arena's are minimax players for Nim.
- **Pirate interface:** the cabin in perspective, a drag-and-drop placement editor, illustrated boards, X-ray mode, the tournament in the browser.
- **The parrot, the music and the sounds:** lines, a voice through the browser's speech synthesis, music composed for the game in Web Audio.
- **`scripts/check_players.py`** to validate submissions.

## 6. The bots in depth

### What a bot knows

A bot never sees the rival's board. Every turn it gets a `view`: the size, a matrix of
`0` (not shot), `1` (water), `2` (hit) or `3` (sunk), and `remaining`, the lengths of the
ships still afloat. **Hit detection is the engine's job** (`apply_shot` in `game.py`
decides water, hit or sunk); bots only read the outcome in the `view`. From there they
all share the same deductions:

- **Hit clusters** (`hit_clusters`): hit cells joined horizontally or vertically. Ships
  never touch, so each cluster belongs to a single ship still afloat.
- **Certain water** (`certain_water`): around a sunk ship and diagonal to a hit there can
  only be water, by the no-touch rule.
- **The original fleet** (`whole_fleet`, in car_lu): `remaining` plus the length of each
  group of sunk cells.

### The ladder: each level adds one idea

| Bot | Hunts (no pending hits) | Finishes (a ship is hit) | Uses the no-touch rule | Places its fleet | Shots to sink a random fleet |
|---|---|---|---|---|---|
| random | at random | at random | no | at random | 95 |
| easy | at random | tries the 4 cells next to any hit | no | at random | 66 |
| medium | on a parity grid: `(row + col) % shortest_ship == 0` | extends the line of hits at both ends | yes, never shoots certain water | at random | 44 |
| hard | the cell covered by most legal ship positions | the same, counting only positions through the hit | yes, inside the count | `stealth_fleet`: the least exposed of 20 random placements | 39 |
| car_lu | like hard, but weighs each position by how it believes the rival places | like hard | yes | the least exposed of 120, with some chance | 39.4 (and 37.6 against hard's fleet) |

Mean of 300 games per bot on 10x10 with the `[5, 4, 3, 3, 2]` fleet. Placement matters
too: hard needs 38.9 shots against a random fleet, 42.6 against its own and 44.1 against
car_lu's. Official tournament (100 games per pair, seed 0):

| | easy | medium | hard | car_lu |
|---|---|---|---|---|
| **random** | 0–100 | 0–100 | 0–100 | 0–100 |
| **easy** | | 2–98 | 0–100 | 8–92 |
| **medium** | | | 30–70 | 31–69 |
| **hard** | | | | 20–80 |

(Each cell reads "wins of the row's bot – wins of the column's bot".)

### How hard decides: the probability map

`probability_map` goes through **every** possible position of every ship still afloat
(horizontal and vertical, at every starting cell) and drops those the `view` rules out:
positions on water, on a sunk ship or on its halo. If a ship is hit, it only counts
positions that hold **all of** each hit cluster they touch and brush past no other cluster
(ships never touch). Each valid position adds 1 to every unshot cell it covers. Hard shoots
the cell with most votes, breaking ties at random.

Why it is strong: at first the map peaks in the middle (more ships fit there); as water
appears, the map adapts by itself; and since a long ship fits in fewer places, the map
favours the gaps where the longest one still fits.

**Why it is not unfair:** it only uses the `view`, like a person who plays well; it does
not remember previous games; it breaks ties at random, so it is not predictable; and tests
hand it a spy (`test_no_view_reveals_a_ship_that_was_not_shot`). Medium beats it in 30% of
games, so it can be beaten.

### How car_lu decides: hard + learning how the rival places

car_lu starts from the same count as hard, but **not every position is worth the same**.
It keeps two hypotheses about the rival:

- **"even"**: every legal position equally likely.
- **"hiding"**: a rival who knows hunters avoids the most watched cells. Each position
  weighs `exp(-2 · exposure)`, where exposure is how much of the opening map it covers
  (0 for the least exposed, 1 for the most). This describes hard, which places that way,
  but also any rival (or person) who hides the fleet.

Each position weighs the mixture `(1 − belief) · P_even + belief · P_hiding`. With belief
0 the map is exactly hard's (a test checks it).

**How it learns (Bayes' rule).** The belief starts at 0.5. Every uncovered cell is
evidence: a ship cell compares how likely a ship was there under each hypothesis
(`hide[i] / even[i]`); water compares how likely it was not (`(1 − hide[i]) / (1 −
even[i])`). The log-odds add up with a weight of 0.5 per cell, because cells are not
independent (a ship covers several) and counting them fully would make the belief
overconfident. That is why car_lu's first shot usually goes to the border: it tells the two
hypotheses apart best.

**Why it is robust now.** car_lu used to rely on two constants measured by hand on 10x10
("32% of ship cells are on the border for a random placement, 58% for one hidden like
hard's"). Those figures do not hold on other boards, and on 12x12 hard and car_lu were
nearly even (92–108). Both hypotheses are now computed **from the board itself**
(`_models`), so they work at any size:

| Board | Before (hard–car_lu) | Now (hard–car_lu) |
|---|---|---|
| 10x10, `[5,4,3,3,2]` | 73–127 | 51–149 |
| 8x8, `[4,3,2,2]` | 51–149 | 34–166 |
| 12x12, `[6,5,4,3,3,2]` | 92–108 | 60–140 |
| 10x10, `[4,3,3,2,2,2,1]` | 81–119 | 59–141 |
| 15x15, `[5,4,4,3,3,2,2]` | — | 67–133 |

(200 mirrored games per row, seed 0.)

**What it costs.** Against a randomly placed fleet car_lu needs ~0.5 more shots than hard
(39.4 against 38.9), because at first it suspects the rival hides. In exchange, against a
rival who hides it does much better: hard takes 42.6 shots to sink hard's fleet and car_lu
only 37.6. Against medium (which places at random) car_lu and hard do the same: over 400
games, 76% and 77%.

**How it places its fleet.** It draws 120 legal placements at random, measures how much
of a hunter's opening map each one covers, and picks one of the least exposed with a
weighted draw (`exp(-(s - minimum) / (0.25 · average cell))`): the fleet is hidden but
never the same (a test asks for at least 35 different placements out of 40).

### What we tried and dropped

- **Sampling whole fleets** instead of counting each ship separately (more exact, since
  ships do not touch each other either). With 400 fleets per shot it needed 39.4 shots on
  average against 38.9 for hard's count: no better, and slower.
- **A stronger "hiding" hypothesis** (4 or 6 instead of 2): finds hard's fleet sooner but
  loses 1–2 shots against random fleets.
- **A prior belief of 0.2:** hardly loses against random fleets, but stops detecting
  rivals who hide.

## 7. Questions a teacher might ask

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
| 10 | Why not classic game-by-game Elo? | Because it depends on the order: with the previous car_lu and 100 games per pair, car_lu beat hard 70-30 and had more wins, but came second. |
| 11 | How does hard's probability map work? | For each cell it counts how many legal positions of the remaining ships cover it (no water, not in the ring of a sunk ship, never brushing past a hit it does not contain); if a ship is hit, only positions through it count. It shoots the cell with the most. |
| 12 | How is CarLuBot different from hard? | It counts the same legal positions, but weighs them with a mixture of two hypotheses about the rival ("places at random" and "hides where hunters look least"), built from the board itself; it learns which one holds with Bayes' rule, from every cell it uncovers (water included). It places its fleet among the least exposed of 120 candidates, with some chance. It beats hard 80% of the time in the official tournament (section 6). |
| 13 | Why does hard hide its fleet on the edges? | `stealth_fleet` picks, out of 20 random placements, the one covering the least of the opening probability map, which is lowest along the edges. It works against hunters that do not adapt (medium, a person who starts in the middle); car_lu detects it and takes advantage. |
| 14 | What is medium's parity search? | While hunting it only shoots cells with `(row + col) % shortest_ship == 0`: every ship of that length covers at least one. |
| 15 | Why can't ships touch, and how do bots use it? | It is a rule of the game we chose; because of it, around a sunk ship and diagonal to a hit there can only be water, and medium, hard and car_lu do not shoot there. easy ignores it on purpose: that is part of what makes it easier than medium. |
| 16 | How is the tournament reproducible? | All randomness comes from seeds: each game gets seeds derived from the tournament seed and the two names, and each bot builds its own `random.Random(seed)`. |
| 17 | What are mirrored couples? | Games with the same seeds in which each player starts once, to balance the advantage of starting. |
| 18 | Why a manifest? | So a bot only gets in if a line admits it, visible in the same pull request. |
| 19 | What if someone submits a broken bot? | `check_players.py` catches it in the PR; if it still reaches the tournament, it is set aside in `rejected` and the tournament goes on. |
| 20 | How much time does a bot get? | 2 s in total for placing and shooting during the whole game, and another 2 s to be built. On the web the limits are much higher (30 s and 10 s) because a bot cannot be killed there. |
| 21 | Why 100 games per pair? | With the previous car_lu and 20 games, the order between hard and car_lu changed with the number of games; with 1,000 the difference was clear. With 100, any gap of 15 points or more is reliable. |
| 22 | How do the standings reach the page? | `build_web.py` copies `results/leaderboard.json` next to the page and the Ranking tab downloads it with `fetch`. |
| 23 | What is `last_info` and X-ray mode? | An optional field of the bot (for example its heat map) that the page draws over the board it is attacking. The tournament ignores it. |
| 24 | Which part of the project comes from nim-arena? | The architecture: player API, manifest, tournament with processes and forfeits, Elo, CI, Pyodide page and docs. The game, the bots and the interface are ours (section 5). |
| 25 | How is it tested? | pytest (engine, API, manifest, tournament, bots, web bridge), ruff and mypy in CI; JavaScript tests with Node and a run of `py.zip` inside Pyodide. |
| 26 | Why did hard beat car_lu? | car_lu did not aim better than hard (against random fleets, slightly worse); its edge came only from constants describing hard's placement on 10x10. On other boards they were nearly even (12x12: 92–108), and in the web's 10-game tournament hard came out ahead or level roughly one time in four. |
| 27 | How is a hit detected? | By the engine: `apply_shot` checks whether the cell belongs to a ship (hit) and whether every cell of that ship has now been shot (sunk, with its length). The bot only sees the outcome in the `view`. |
| 28 | What does easy do and why was it changed? | It shoots at random and, after a hit, tries the cells next to it until the ship sinks. It used to scan row by row and was almost random (90 shots against 95). It now needs 66: between random and medium. |
| 29 | Is hard unfair? | No: it only uses the `view`, like a person who plays well, breaks ties at random and remembers nothing between games. It is the best bot of the ladder, but medium beats it 30% of the time and car_lu 80%. |
| 30 | How do we know car_lu wins on any board? | A slow test (`test_car_lu_beats_hard_on_other_boards`) plays on 8x8 and 12x12, and we measured 8x8, 10x10, 12x12 and 15x15 (section 6). |

## Open questions

- **The leaderboard commit and Pages.** `tournament.yml` pushes with the GitHub Actions token. According to GitHub's documentation, events created with that token do not start other workflows, so that commit should not republish the page. It does not change the result, because `pages.yml` plays its own tournament, but we have not checked it in Actions.
- **Timing on GitHub.** The measured times (hard's worst game was about 1.2 s before it was sped up; car_lu's under 0.8 s) are from our computer; we have not measured how much slower GitHub's runners are.
- **nim-arena:** we have not read its tests, its GitHub templates, its JavaScript or the inside of its bots (only their descriptions), so we do not claim how close they are to ours.
- **The web and human cheating:** on the web both full boards live in JavaScript's memory (`match.sides[i].board`). A bot cannot see them, but a person with the browser's developer tools can. It does not affect the tournament (which runs in Python), but it is worth knowing.
- **Human rivals.** car_lu's "hiding" hypothesis is meant for any rival who avoids the most watched cells, but we have only measured it against bots; we do not know how people really place their fleets.
- **The web tournament.** By default it plays 10 games per pair: enough to see the order, but with hard against car_lu (80–20) a draw or a reversed result still comes up in about 1 tournament out of 30. With 20 games it would be very rare, but it would take twice as long.
