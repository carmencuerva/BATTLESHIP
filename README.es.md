# 🚢 Battleship Arena

[![tests](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tests.yml/badge.svg)](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tests.yml)
[![tournament](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tournament.yml/badge.svg)](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/tournament.yml)
[![pages](https://github.com/carmencuerva/BATTLESHIP/actions/workflows/pages.yml/badge.svg)](https://carmencuerva.github.io/BATTLESHIP/)
[![licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

*[Read in English](README.md)*

Battleship Arena incluye:

- un motor de Hundir la flota;
- una API mínima para escribir bots;
- un torneo automático que los clasifica;
- una web para jugar contra ellos.

Las reglas y todos los bots se escriben **una sola vez, en Python**. El mismo código juega
el torneo en la CI y la partida en tu navegador, gracias a [Pyodide](https://pyodide.org).

**▶ Jugar: <https://carmencuerva.github.io/BATTLESHIP/>** · **📖 Documentación:
<https://carmencuerva.github.io/BATTLESHIP/docs/es/>**

## Las reglas en un párrafo

El tablero es de 10×10 y la flota es 5, 4, 3, 3, 2; ambos se pueden configurar. Los
barcos no pueden tocarse, ni siquiera en diagonal. Si tocas o hundes, vuelves a disparar.
Al hundir un barco se anuncia su longitud. Gana quien hunda primero toda la flota enemiga.

## Primeros pasos

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest                           # tests
battleship-tournament            # liguilla → results/leaderboard.json
python scripts/build_web.py      # empaqueta el Python para el navegador
python -m http.server 8000 --directory web   # juega en http://localhost:8000
```

## Escribe tu propio bot

1. Crea `players/custom/mi_bot.py` con una subclase de `battleship.player.Player`.
   Necesita `get_name`, `get_authors`, `choose_placement` y `choose_shot`.
2. Añádelo a `players/custom/players.yaml`.
3. Ejecuta `python scripts/check_players.py` y abre un pull request.

La guía completa está en [Escribe un bot](docs/write-a-bot.es.md). Mira también
[CONTRIBUTING.md](CONTRIBUTING.md).

## Bots incluidos

| bot | estrategia |
|-----|------------|
| 🎲 random | dispara al azar |
| 🐣 easy | recorre el tablero fila a fila |
| 🎯 medium | busca en damero y luego remata cada barco que toca; nunca dispara donde la regla de no tocarse deja solo agua |
| 🧠 hard | dispara a la casilla más probable según todas las posiciones legales de los barcos; esconde su flota donde menos miran los cazadores |

Cambios en la escalera (noviembre de 2026), medidos con 1.000 partidas por pareja (semilla 0):

- **medium** disparaba a casillas que la regla de no tocarse ya había demostrado que eran
  agua (alrededor de barcos hundidos y en diagonal a los impactos): 7–8 disparos perdidos
  por partida. Ahora las salta, así que gana en 42,8 disparos en vez de 51,1. Sigue
  perdiendo con hard (243–757).
- **hard** juega exactamente igual que antes (los mismos disparos en las 12.031 posiciones
  comprobadas), pero calcula su mapa de probabilidad unas 6 veces más rápido, con más
  margen bajo el límite de 2 s.
- **random** y **easy** no cambian.

Bots enviados (`players/custom/`):

| bot | autoría | estrategia |
|-----|--------|------------|
| 🐬 lucia | Lucía Argüello | cuenta todas las posiciones de barco que permite la regla de no tocarse y da más peso a los bordes según aprende, en cada partida, si el rival se esconde allí; esconde su flota entre las colocaciones menos expuestas, elegida al azar |

## Estructura del repositorio

| ruta | qué |
|------|-----|
| `src/battleship/` | motor (`game.py`), API `Player`, manifiestos y registro, estrategias, torneo, Elo |
| `players/` | jugadores `builtin/` y `custom/`, cada carpeta con su manifiesto `players.yaml` |
| `web/` | la página estática y `webglue.py`, el puente JSON con Python |
| `scripts/` | `build_web.py` (genera `web/py.zip`) y `check_players.py` (valida los bots enviados) |
| `docs/` | documentación bilingüe con MkDocs |
| `tests/` | tests de pytest y de JavaScript (`tests/js`) |

## Créditos

- Fuentes: [Pirata One](https://fonts.google.com/specimen/Pirata+One), [Bangers](https://fonts.google.com/specimen/Bangers) y [Nunito](https://fonts.google.com/specimen/Nunito), todas con la [SIL Open Font License 1.1](https://openfontlicense.org) y servidas por Google Fonts.
- Los barcos, el loro, el camarote del capitán (la sala, las ventanas, los faroles, la carta, las miniaturas y cada objeto de la mesa), los efectos y todos los sonidos los dibuja o sintetiza el propio código del proyecto (SVG, CSS, Web Audio).
- La música de fondo es una melodía original compuesta para este proyecto y sintetizada en directo (`web/js/music.js`).
- La voz del loro es la síntesis de voz de tu propio navegador (`speechSynthesis`), con las voces instaladas en tu dispositivo; no se incluye ninguna grabación.
- Las ilustraciones de los piratas de las pantallas finales y el sombrero (`web/img/`) las aportaron las personas que firman el proyecto.

## Licencia

[MIT](LICENSE).
