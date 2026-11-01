# Arquitectura

```text
src/battleship/
  game.py          las reglas, como funciones puras sobre datos planos
  player.py        el contrato Player
  manifest.py      lee players.yaml (qué ficheros y clases se admiten)
  registry.py      importa los jugadores admitidos y valida su identidad
  bots/            estrategias reutilizables (shooting.py, placement.py)
  tournament.py    liguilla, aislamiento, tiempos, abandonos, clasificación, CLI
  elo.py           puntuación Elo
players/
  builtin/         random, easy, medium, hard + players.yaml
  custom/          bots enviados por pull request + players.yaml
web/
  index.html, style.css, js/   la página (dibuja, nunca decide)
  webglue.py       el único puente entre JavaScript y Python
  pyodide-bootstrap.js         carga Pyodide y py.zip
scripts/
  build_web.py     empaqueta src/battleship, players/ y webglue.py en web/py.zip
  check_players.py validación de los bots enviados (CI)
```

## Un motor, dos sitios

```text
CI (CPython)                         Navegador (Pyodide)
battleship-tournament                app.js ──JSON──▶ webglue.py
        │                                               │
        └──────────▶ battleship.game, bots, tournament ◀┘
```

El navegador ejecuta **los mismos ficheros** que la CI. `scripts/build_web.py` los
empaqueta en un `py.zip` determinista. Sus entradas van ordenadas y con fechas fijas, así
que el mismo código produce siempre los mismos bytes. Después Pyodide lo descomprime e
importa `webglue`.

### La frontera JavaScript ↔ Python

Todas las funciones de `webglue.py` reciben cadenas JSON y devuelven una cadena JSON.
JavaScript las llama con un único método, `arena.call(nombre, ...args)`. No cruza nada
más: ningún objeto de Python llega a JavaScript. Los bots se quedan en Python detrás de
identificadores enteros.

JavaScript nunca decide nada del juego:

- la legalidad, los resultados y de quién es el turno vienen de `shoot`;
- las pistas de «agua segura» vienen de `status`;
- la pantalla de torneo pide a `tournament_next` las partidas que faltan (primero la liga
  y después cada ronda eliminatoria de un campeonato), las juega con `tournament_game` y
  obtiene la clasificación con `tournament_result`. Usan el mismo `next_games`, `run_game`
  y `final_leaderboard` que la línea de comandos, así que un torneo en el navegador da la
  misma clasificación que la CI con la misma configuración.

A diferencia de la CI, el navegador no puede matar a un bot colgado. Por eso sus límites
de tiempo son generosos (30 s por partida), y la página devuelve el control al navegador
entre partida y partida.

## Integración continua

| workflow | cuándo | qué |
|----------|--------|-----|
| `tests.yml` | cada push y pull request | ruff, mypy y pytest en Python 3.10–3.13. En el job `web`: tests de JS y el `py.zip` real ejecutándose en Pyodide con Node |
| `custom-players.yml` | cambios en `players/` | `scripts/check_players.py` |
| `tournament.yml` | cambios en `src/` o `players/` en `main` | vuelve a jugar el torneo y hace commit de `results/leaderboard.json` |
| `pages.yml` | push a `main` | construye la web, la clasificación y esta documentación, y las publica en GitHub Pages |
| `docs.yml` | cambios en la documentación | `mkdocs build --strict` |
