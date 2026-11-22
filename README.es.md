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

## 🎬 Videotutorial

[![Videotutorial de Battleship Arena: cómo se juega y cómo usar la interfaz](docs/media/tutorial-thumbnail.jpg)](docs/media/tutorial.mp4)

Haz clic en la imagen para ver el vídeo (2 min 35 s, con voz en off, subtítulos en español
y la música pirata del propio juego de fondo). Grabado sobre la web actual:

1. **El camarote (menú):** elegir el modo de juego, poner tu nombre, preparar la travesía
   (flota, tamaño del mar y viento) y escoger el capitán enemigo.
2. **Colocar la flota:** arrastrar barcos, girarlos con <kbd>R</kbd>, qué pasa si un barco
   toca a otro, y los botones *Aleatoria* y *¡Leven anclas!*.
3. **La batalla:** cómo disparar, agua y tocado, las pistas de agua segura, los Rayos X y
   el cuaderno de bitácora; después salta al final de la partida.
4. **Fin de la partida:** la pantalla de victoria y qué hacer después.
5. **Torneo, Clasificación y ajustes** de sonido, volumen e idioma.

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
| 🐣 easy | dispara al azar y, cuando toca, prueba las casillas de alrededor hasta hundir el barco |
| 🎯 medium | busca en damero y luego remata cada barco que toca; nunca dispara donde la regla de no tocarse deja solo agua |
| 🧠 hard | dispara a la casilla más probable según todas las posiciones legales de los barcos; esconde su flota donde menos miran los cazadores |

Cada nivel añade una idea al anterior, y se nota en los disparos que necesita para hundir
una flota colocada al azar (media de 300 partidas): random 95, easy 66, medium 44, hard 39.
Ningún bot ve el tablero rival: todos deciden solo con la `view` (lo ya disparado y las
esloras que quedan), y hay tests que lo comprueban.

Cambios de la revisión de bots (noviembre de 2026, tras el feedback del profesor):

- **easy** recorría el tablero fila a fila y apenas se distinguía del azar (90 disparos
  frente a 95; ganaba a random solo el 68 %). Ahora es un principiante creíble: dispara al
  azar y remata lo que toca (66 disparos; gana a random 100–0 y pierde con medium 2–98).
- **car_lu** ganaba a hard solo porque sus constantes (cuánto se esconde un rival en el
  borde) estaban medidas en 10×10 para la colocación de hard; en 12×12 casi empataban
  (108–92) y en el torneo de 10 partidas de la web hard podía quedar por delante. Ahora
  construye sus dos hipótesis («coloca al azar» / «se esconde donde menos miran») a partir
  del propio tablero y aprende con cada casilla destapada, agua incluida. Gana a hard el
  80 % en el torneo oficial y entre el 66 % y el 83 % en tableros de 8×8 a 15×15.
- **medium** y **hard** no cambian: ya eran coherentes y hard es exigente sin hacer trampa.

Cambios anteriores en la escalera (noviembre de 2026), medidos con 1.000 partidas por pareja (semilla 0):

- **medium** disparaba a casillas que la regla de no tocarse ya había demostrado que eran
  agua (alrededor de barcos hundidos y en diagonal a los impactos): 7–8 disparos perdidos
  por partida. Ahora las salta, así que gana en 42,8 disparos en vez de 51,1. Sigue
  perdiendo con hard (243–757).
- **hard** juega exactamente igual que antes (los mismos disparos en las 12.031 posiciones
  comprobadas), pero calcula su mapa de probabilidad unas 6 veces más rápido, con más
  margen bajo el límite de 2 s.
- **random** y **easy** no cambiaron entonces.

Bots enviados (`players/custom/`):

| bot | autoría | estrategia |
|-----|--------|------------|
| 🐬 car_lu | Lucía Argüello y Carmen Cuerva | cuenta todas las posiciones de barco que permite la regla de no tocarse, como hard, pero mezcla dos hipótesis sobre el rival («coloca al azar» y «se esconde donde menos miran los cazadores») y aprende en cada partida cuál es la buena; esconde su flota entre las colocaciones menos expuestas, elegida al azar |

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

- Arquitectura: [nim-arena](https://github.com/jparisu/nim-arena), de jparisu y las personas que contribuyen a NIM Arena (MIT); su aviso de copyright se conserva en [LICENSE](LICENSE).
- Fuentes: [Pirata One](https://fonts.google.com/specimen/Pirata+One), [Bangers](https://fonts.google.com/specimen/Bangers) y [Nunito](https://fonts.google.com/specimen/Nunito), todas con la [SIL Open Font License 1.1](https://openfontlicense.org) y servidas por Google Fonts.
- Los barcos, el loro, el camarote del capitán (la sala, las ventanas, los faroles, la carta, las miniaturas y cada objeto de la mesa), los efectos y todos los sonidos los dibuja o sintetiza el propio código del proyecto (SVG, CSS, Web Audio).
- La música de fondo es una melodía original compuesta para este proyecto y sintetizada en directo (`web/js/music.js`).
- La voz del loro es la síntesis de voz de tu propio navegador (`speechSynthesis`), con las voces instaladas en tu dispositivo; no se incluye ninguna grabación.
- Las ilustraciones de los piratas de las pantallas finales y el sombrero (`web/img/`) las aportaron las personas que firman el proyecto.

## Licencia

[MIT](LICENSE).
