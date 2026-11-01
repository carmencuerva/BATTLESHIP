# Architecture

```text
src/battleship/
  game.py          the rules, as pure functions over plain data
  player.py        the Player contract
  manifest.py      reads players.yaml (which files and classes are admitted)
  registry.py      imports admitted players and validates their identity
  bots/            reusable strategies (shooting.py, placement.py)
  tournament.py    round-robin, isolation, time budgets, forfeits, standings, CLI
  elo.py           Elo ratings
players/
  builtin/         random, easy, medium, hard + players.yaml
  custom/          bots sent by pull request + players.yaml
web/
  index.html, style.css, js/   the page (draws, never decides)
  webglue.py       the only bridge between JavaScript and Python
  pyodide-bootstrap.js         loads Pyodide and py.zip
scripts/
  build_web.py     packs src/battleship, players/ and webglue.py into web/py.zip
  check_players.py validation of submitted bots (CI)
```

## One engine, two places

```text
CI (CPython)                         Browser (Pyodide)
battleship-tournament                app.js ──JSON──▶ webglue.py
        │                                               │
        └──────────▶ battleship.game, bots, tournament ◀┘
```

The browser runs **the same files** as CI. `scripts/build_web.py` packs them into a
deterministic `py.zip`. Its entries are sorted and their timestamps fixed, so the same code always
produces the same bytes. Pyodide then unpacks it and imports `webglue`.

### The JavaScript ↔ Python boundary

Every function in `webglue.py` takes JSON strings and returns a JSON string. JavaScript
calls them through one method, `arena.call(name, ...args)`. Nothing else crosses: no
Python objects reach JavaScript. Bots stay in Python behind integer handles.

JavaScript never decides anything about the game:

- legality, results and whose turn it is all come from `shoot`;
- the "certain water" hints come from `status`;
- the tournament screen asks `tournament_next` for the games still to play (league first,
  then each knockout round of a championship), plays them with `tournament_game`, and
  gets the leaderboard from `tournament_result`. These use the same `next_games`,
  `run_game` and `final_leaderboard` as the CLI, so a browser tournament gives the same
  standings as CI with the same settings.

Unlike CI, the browser cannot kill a hung bot. Its time budgets are therefore generous
(30 s per game), and the page yields to the browser between games.

## Continuous integration

| workflow | when | what |
|----------|------|------|
| `tests.yml` | every push and pull request | ruff, mypy, pytest on Python 3.10–3.13. In the `web` job: JS unit tests and the real `py.zip` running in Pyodide under Node |
| `custom-players.yml` | changes to `players/` | `scripts/check_players.py` |
| `tournament.yml` | changes to `src/` or `players/` on `main` | replays the tournament, commits `results/leaderboard.json` |
| `pages.yml` | push to `main` | builds the page, the leaderboard and these docs, then deploys them to GitHub Pages |
| `docs.yml` | changes to the docs | `mkdocs build --strict` |
