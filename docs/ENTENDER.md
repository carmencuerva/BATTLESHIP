# Entender Battleship Arena

*English version: [Understanding Battleship Arena](UNDERSTAND.md).*

Guía de estudio para poder explicar y defender cada parte del proyecto. Todo lo que dice
sale de leer el código de este repositorio o de ejecutarlo; cuando algo no está
comprobado, se dice. Las cifras de los bots son de los torneos locales de noviembre de
2026 (semilla 0).

Battleship Arena parte de [nim-arena](https://github.com/jparisu/nim-arena) (de jparisu):
reutilizamos su arquitectura (API de jugador, manifiesto, torneo, CI, web con Pyodide) y la
adaptamos a Hundir la flota. La sección 5 detalla qué viene de allí y qué es nuestro.

## 1. Mapa del proyecto

### Python: `src/battleship/`

| Módulo | Qué hace |
|---|---|
| `game.py` | El motor de reglas, puro: tablero, colocación, disparos, vista del atacante, quién dispara después. Todo son datos planos (dicts, listas, ints) y ninguna función modifica sus argumentos: devuelven un tablero nuevo. |
| `player.py` | El contrato que implementa todo jugador: identidad por métodos de clase (`get_name`, `get_authors`, `get_description`, `get_icon`), `create(seed)` para construirlo, y `choose_placement` / `choose_shot` para jugar. Opcional: `last_info` para el modo rayos X de la web. |
| `manifest.py` | Lee los `players.yaml`: la lista explícita de jugadores admitidos (`file` + `class`). Rechaza claves de más, rutas fuera de la carpeta, duplicados y ficheros que no existen. |
| `registry.py` | Importa cada fichero del manifiesto con un nombre de módulo único, comprueba que la clase hereda de `Player` y valida su identidad (nombre, autores, emoji) **sin construir** el jugador. Puede apartar jugadores rotos en una lista `rejected` para que uno malo no pare el torneo. |
| `tournament.py` | El torneo: calendario de partidas espejo, una partida (`run_game`) con presupuestos de tiempo y abandonos, una partida por proceso, formatos `league`, `simple` y `championship`, la clasificación y la línea de órdenes `battleship-tournament`. |
| `elo.py` | La puntuación en escala Elo: ajusta a la vez todos los resultados (modelo de Bradley-Terry), así que no depende del orden de las partidas. |
| `bots/` | Estrategias reutilizables como funciones puras: `placement.py` (`random_fleet`, `stealth_fleet`) y `shooting.py` (`random_shot`, `scan_shot`, `hunt_target_shot`, `probability_map`/`probability_shot`, `certain_water`, `hit_clusters`). |

### Jugadores: `players/`

| Carpeta | Qué hay |
|---|---|
| `players/builtin/` | La escalera de referencia (random, easy, medium, hard) y su `players.yaml`. Cada bot es una clase fina que llama a una estrategia de `bots/`. |
| `players/custom/` | Los bots enviados por pull request (ahora `lucia_bot.py`) y su `players.yaml`. |

### Web: `web/`

| Fichero | Qué hace |
|---|---|
| `webglue.py` | El puente JS ↔ Python: cada función recibe cadenas JSON y devuelve una cadena JSON. Guarda los bots vivos detrás de números (`handle`) porque son objetos con estado. |
| `pyodide-bootstrap.js` | Carga Pyodide 0.27.2 desde jsDelivr, descomprime `py.zip`, importa `webglue` y ofrece `arena.call("función", ...args)`, que serializa a JSON cada argumento y el resultado. |
| `js/app.js` | Pantallas y orquestación de turnos: decide qué dibujar y cuándo pedir a Python el siguiente paso. No contiene reglas. |
| `js/board.js`, `js/ships.js`, `js/coords.js` | Dibujo del tablero, de los barcos (SVG) y de las coordenadas tipo «C7». Solo presentación. |
| `js/cabin.js`, `js/cabin-art.js` | La pantalla de inicio como camarote en perspectiva: geometría (homografía de la carta) y dibujo SVG. |
| `js/leaderboard.js` | Pinta la clasificación (el JSON del torneo) como tablas. |
| `js/parrot.js`, `js/parrot-lines.js`, `js/sound.js`, `js/music.js`, `js/fx.js`, `js/endscreen.js` | El loro comentarista y sus frases, efectos de sonido y voz, música propia en Web Audio, efectos visuales y pantallas finales. Decoración: nunca cambian el estado de la partida. |
| `js/i18n.js`, `js/html.js`, `js/store.js` | Textos ES/EN, escape de HTML y memoria local (`localStorage`) protegida con try/catch. |

### Scripts y CI

| Fichero | Qué hace |
|---|---|
| `scripts/build_web.py` | Empaqueta `src/battleship`, `players/` y `webglue.py` en `web/py.zip` de forma determinista (orden y fechas fijas) y copia `results/leaderboard.json` junto a la web. |
| `scripts/check_players.py` | Comprueba los bots enviados: que se cargan con una identidad válida y que juegan una liguilla corta sin un solo abandono. |
| `.github/workflows/tests.yml` | En cada push y PR: ruff, formato, mypy y pytest en Python 3.10, 3.12 y 3.13; y los tests de JavaScript más una prueba real de `py.zip` dentro de Pyodide (Node). |
| `.github/workflows/custom-players.yml` | En PR o push que toquen `players/`: `check_players.py --games 4`. |
| `.github/workflows/tournament.yml` | En push a `main` que toque `src/`, `players/` o `pyproject.toml`: juega el torneo oficial y hace commit de `results/leaderboard.json` si la clasificación cambió. |
| `.github/workflows/pages.yml` | En push a `main`: juega el torneo, construye `py.zip` y la documentación (MkDocs) y publica todo en GitHub Pages. |
| `.github/workflows/docs.yml` | Comprueba que la documentación compila sin avisos (`mkdocs build --strict`). |

## 2. Una partida, paso a paso (humano contra bot en la web)

1. **Arranque.** `boot()` llama a `startArena()`: Pyodide carga, descomprime `py.zip` e importa `webglue`. Después pide `defaults` (`{"size": 10, "fleet": [5,4,3,3,2]}`) y `list_players` (identidad de cada bot, leída sin construirlo).
2. **Pulsar «¡Al abordaje!».** Antes de empezar se llama a `check_fleet(size, fleet)`: Python valida la flota e intenta una colocación real; si falla devuelve `{"ok": false, "problem": {"code": ...}}` y la web lo explica en su idioma.
3. **El bot se prepara** (`startMatch`). `create_bot(nombre, semilla)` → `{"handle": 1}` (Python construye el bot con `create(seed)` y lo guarda). `bot_placement(handle, size, fleet)` → `{"placement": [[fila, col, "H"|"V"], ...]}`, ya validada con `validate_placement`. `new_board(size, fleet, placement)` → el tablero completo `{"size", "ships", "shots"}`.
4. **Colocas tu flota.** Cada vez que mueves el ratón, `layout(size, fleet, placement_parcial)` dice qué casillas ocupa cada barco y si la colocación vale (`ok`, `problem`). «Aleatoria» llama a `random_layout`. Al confirmar, `new_board` crea tu tablero.
5. **Batalla.** El primer turno se sortea en JS. En tu turno, la web dibuja con `status(tablero_rival)` (devuelve `view`, `hints`, `sunk`…) y, al hacer clic, `shoot(tablero, [f, c], atacante)` → `{"board", "result": {"outcome": "miss"|"hit"|"sunk", "length"}, "terminal", "next"}`. `next` es quién dispara: el mismo si ha tocado o hundido, el otro si ha fallado.
6. **Turno del bot** (`botTurn`). La web pide `status(tu_tablero).view` —solo casillas disparadas y esloras que quedan— y llama a `bot_shot(handle, view)` → `{"shot": [f, c], "info": {...}}`. Python comprueba que el disparo es legal; `info` es el `last_info` del bot (su mapa de calor, para los rayos X). Luego la web aplica el disparo con `shoot`.
7. **Final.** Cuando `shoot` devuelve `terminal: true`, la web anuncia al ganador (pantalla de victoria o derrota) y libera el bot con `release_bot`.

Lo que cruza son siempre cadenas JSON con datos planos. Las reglas, la legalidad y los bots viven en Python; JavaScript solo dibuja, anima y decide cuándo preguntar.

## 3. El torneo en la CI y cómo llega a la web

1. Un push a `main` que toque `src/`, `players/` o `pyproject.toml` lanza `tournament.yml`: `pip install .` y `battleship-tournament` con la configuración por defecto (liga, 100 partidas por pareja, semilla 0, subprocesos, 4 a la vez).
2. `load_players` lee `players/builtin/players.yaml` y `players/custom/players.yaml`; los jugadores rotos van a `rejected` y no detienen el torneo.
3. `schedule` crea para cada pareja 100 partidas en parejas espejo: las partidas `2k` y `2k+1` usan las mismas semillas y cada jugador empieza una vez. Las semillas dependen solo de la semilla del torneo y de los dos nombres.
4. Cada partida se juega en un proceso nuevo (`run_game_in_subprocess`): el proceso avisa de cada llamada a un bot con el tiempo que le queda; si no responde a tiempo, se mata y ese bot pierde por tiempo.
5. `standings` cuenta victorias, abandonos y sus motivos, victorias como primero y como segundo, disparos medios para ganar, porcentaje de acierto, y ajusta la puntuación Elo con `elo.fit`.
6. Se escribe `results/leaderboard.json`; si ha cambiado (sin contar `generated_at`), el workflow hace commit y push.
7. `pages.yml` (también en cada push a `main`) juega el mismo torneo por su cuenta, `build_web.py` copia `results/leaderboard.json` a `web/leaderboard.json`, y la pestaña Clasificación lo descarga con `fetch("leaderboard.json")` y lo pinta con `leaderboard.js`.

## 4. Por qué cada decisión de diseño

- **Estado como datos planos.** Tableros, vistas y resultados son dicts y listas de JSON. Así cruzan la frontera Python ↔ JS sin conversión, se pueden guardar y comparar en tests, y el proceso de una partida puede devolver su resultado por una tubería.
- **Funciones puras.** `apply_shot` devuelve un tablero nuevo en lugar de modificar el anterior; las estrategias de `bots/` son funciones de la vista. Se testean con una entrada y una salida, sin preparar objetos, y no hay estado escondido que pueda desincronizar la web y Python.
- **Un proceso por partida.** Un bot puede colgarse en un bucle infinito; un hilo no se puede matar en Python, un proceso sí. Además, un bot que rompa el intérprete solo tumba su partida.
- **Manifiesto en vez de escanear carpetas.** Un fichero `.py` no juega si no hay una línea que lo admita. En una pull request el revisor ve juntos el bot nuevo y la línea que lo admite, y un fichero suelto (de pruebas, a medias) nunca entra por accidente.
- **Información oculta con la `view`.** El bot nunca recibe el tablero del rival, solo `view_for_attacker(tablero)`: casillas disparadas (agua, tocado, hundido) y las esloras que quedan. En el torneo, además, recibe una copia profunda, así que modificarla no cambia la partida.
- **Identidad por métodos de clase.** El registro puede leer nombre, autores e icono sin construir el bot, así que un `__init__` lento o roto no impide listar a los jugadores.
- **`create(seed)` como única forma de construir.** Toda la aleatoriedad sale de esa semilla, y el torneo es reproducible: misma semilla, mismas partidas.

## 5. Qué viene de nim-arena y qué es nuestro

Comparación hecha leyendo nim-arena en GitHub (noviembre de 2026). Nuestro código no se copió fichero a fichero: el historial empieza con un commit vacío y el proyecto se escribió por fases siguiendo su diseño. Partes de nim-arena que no se abrieron (su `game.py`, los detalles de `registry.py`, el contenido de sus workflows y plantillas) no se comparan aquí.

### Se mantiene casi igual

- **API de jugador:** clase base `Player` con identidad por métodos de clase (`get_name`, `get_authors`, `get_description`, `get_icon` con un emoji) y `create(cls, seed)` como única forma de construir.
- **Manifiesto:** el mismo formato `players: - file: … class: …`, una carpeta `builtin` y otra `custom`, y la regla de no escanear carpetas.
- **Torneo:** formatos `simple`, `league` y `championship`; una partida por proceso; presupuesto de 2 s por partida y 2 s de construcción; los abandonos `forfeit_timeout`, `forfeit_illegal`, `forfeit_error`, `forfeit_build_timeout` y `forfeit_build_error`; resultado en `results/leaderboard.json`.
- **Elo:** 1500 inicial y escala de 400 puntos (nim-arena actualiza partida a partida con K = 32; nosotros lo cambiamos, ver abajo).
- **CI:** los mismos cinco workflows (`tests`, `custom-players`, `tournament`, `pages`, `docs`).
- **Web:** Pyodide con `pyodide-bootstrap.js`, un puente `webglue.py`, `scripts/build_web.py` que genera `py.zip`.
- **Documentación:** MkDocs con Material, en inglés y español.

### Adaptado o nuevo (nuestro)

- **El juego:** Nim → Hundir la flota. Motor nuevo (`game.py`): colocación con la regla de no tocarse ni en diagonal, disparos con agua/tocado/hundido, repetir turno al acertar.
- **Información oculta:** en Nim los dos jugadores ven todo; aquí la `view` esconde los barcos sin tocar.
- **API de jugada:** `choose_move` de Nim se convierte en dos métodos, `choose_placement` y `choose_shot`.
- **Nuevo abandono:** `forfeit_bad_placement`.
- **Calendario:** parejas espejo con las mismas semillas; campeonato como liga + eliminatorias (nim-arena usa grupos de cuatro).
- **Bots de caza:** paridad, caza y remate, mapa de probabilidad con la regla de no tocarse, colocación sigilosa, y LuciaBot con su creencia bayesiana sobre los bordes.
- **Clasificación:** puntuación Elo ajustada a todas las partidas a la vez (no depende del orden).
- **Interfaz pirata:** el camarote en perspectiva, editor de colocación con arrastre, tableros ilustrados, modo rayos X, torneo en el navegador.
- **El loro, la música y los sonidos:** frases, voz con la síntesis del navegador, música compuesta para el juego en Web Audio.
- **`scripts/check_players.py`** para validar envíos.

## 6. Preguntas que nos pueden hacer

| # | Pregunta | Respuesta corta |
|---|---|---|
| 1 | ¿Por qué un proceso por partida? | Para poder matar a un bot colgado (un hilo no se puede matar) y para que un fallo grave solo afecte a su partida. |
| 2 | ¿Qué pasa si un bot se cuelga? | El proceso de la partida avisa antes de cada llamada del tiempo que le queda; si no llega respuesta en ese tiempo más 1 s de margen, se mata el proceso y el bot pierde por `forfeit_timeout`. |
| 3 | ¿Y si lanza una excepción o devuelve algo ilegal? | Pierde esa partida (`forfeit_error`, `forfeit_illegal` o `forfeit_bad_placement`) y el torneo sigue. |
| 4 | ¿Cómo se evita que un bot vea los barcos del rival? | Solo recibe `view_for_attacker(tablero)`: casillas disparadas y esloras que quedan; nunca el tablero. Hay tests que lo comprueban, incluido un bot espía en partidas reales. |
| 5 | ¿Puede un bot hacer trampa modificando la vista? | No: el torneo le pasa una copia profunda. Lo comprueba un test. |
| 6 | ¿Qué es Pyodide? | El intérprete de Python compilado a WebAssembly: ejecuta en el navegador exactamente el mismo motor y los mismos bots que la CI. |
| 7 | ¿Qué cruza entre JavaScript y Python? | Solo cadenas JSON con datos planos: `arena.call` serializa los argumentos y `webglue` devuelve JSON. |
| 8 | ¿Dónde están las reglas? | Solo en `game.py`. La web pregunta a Python si una colocación o un disparo es legal. |
| 9 | ¿Cómo se calcula el Elo? | Es la puntuación (escala 400, media 1500) que mejor explica todos los resultados a la vez, según el modelo de Bradley-Terry; se ajusta por iteraciones (Hunter, 2004), con un empate virtual contra una referencia para que no se dispare con un pleno. |
| 10 | ¿Por qué no el Elo clásico partida a partida? | Porque depende del orden: con 100 partidas por pareja, lucia ganaba a hard 70-30 y tenía más victorias, pero quedaba segunda. |
| 11 | ¿Cómo funciona el mapa de probabilidades de hard? | Para cada casilla cuenta cuántas posiciones legales de los barcos que quedan la cubren (sin agua, sin el halo de los hundidos, sin rozar impactos ajenos); si hay un barco tocado, solo cuenta las que pasan por él. Dispara a la casilla con más. |
| 12 | ¿En qué se diferencia LuciaBot de hard? | Cuenta las mismas posiciones legales, pero da más peso a las que tocan el borde según una creencia bayesiana, actualizada en cada partida con los barcos que destapa, de si el rival se esconde en los bordes; y coloca su flota al azar entre las menos expuestas de 60 candidatas. Le gana a hard en torno al 68 % de las partidas. |
| 13 | ¿Por qué hard escondía su flota en los bordes? | `stealth_fleet` elige, de 20 colocaciones al azar, la que menos cubre el mapa de probabilidad inicial, que es más bajo en los bordes. |
| 14 | ¿Qué es la búsqueda por paridad de medium? | Mientras busca, solo dispara a casillas con `(fila + columna) % barco_más_corto == 0`: todo barco de esa longitud pisa al menos una. |
| 15 | ¿Por qué los barcos no pueden tocarse y cómo lo usan los bots? | Es una regla del juego que fijamos; gracias a ella, alrededor de un hundido y en diagonal a un impacto solo puede haber agua, y medium, hard y lucia no disparan ahí. |
| 16 | ¿Cómo es reproducible el torneo? | Toda la aleatoriedad sale de semillas: cada partida recibe semillas derivadas de la del torneo y de los dos nombres, y cada bot crea su `random.Random(seed)`. |
| 17 | ¿Qué son las parejas espejo? | Partidas con las mismas semillas en las que cada jugador empieza una vez, para compensar la ventaja de empezar. |
| 18 | ¿Por qué un manifiesto? | Para que un bot solo entre si una línea lo admite, visible en la misma pull request. |
| 19 | ¿Qué pasa si alguien sube un bot roto? | `check_players.py` lo detecta en la PR; si aun así llega al torneo, se aparta en `rejected` y el torneo sigue. |
| 20 | ¿Cuánto tiempo tiene un bot? | 2 s acumulados para colocar y disparar en toda la partida, y otros 2 s para construirse. En la web los límites son mucho mayores (30 s y 10 s) porque no se puede matar a un bot. |
| 21 | ¿Por qué 100 partidas por pareja? | Con 20, el orden entre hard y lucia cambiaba según el número de partidas (ganaba uno u otro); con 1.000 la diferencia sí era clara. |
| 22 | ¿Cómo llega la clasificación a la web? | `build_web.py` copia `results/leaderboard.json` a la web y la pestaña Clasificación lo descarga con `fetch`. |
| 23 | ¿Qué es `last_info` y el modo rayos X? | Un campo opcional del bot (por ejemplo su mapa de calor) que la web dibuja sobre el tablero que ataca. El torneo lo ignora. |
| 24 | ¿Qué parte del proyecto viene de nim-arena? | La arquitectura: API de jugador, manifiesto, torneo con procesos y abandonos, Elo, CI, web con Pyodide y documentación. El juego, los bots y la interfaz son nuestros (sección 5). |
| 25 | ¿Cómo se testea? | pytest (motor, API, manifiesto, torneo, bots, puente web), ruff y mypy en la CI; tests de JavaScript con Node y una prueba de `py.zip` dentro de Pyodide. |

## Dudas por resolver

- **Commit del leaderboard y Pages.** `tournament.yml` hace push con el token de GitHub Actions. Según la documentación de GitHub, los eventos creados con ese token no lanzan otros workflows, así que ese commit no debería volver a publicar la web. No afecta al resultado porque `pages.yml` juega su propio torneo, pero no lo hemos comprobado en Actions.
- **Tiempo en GitHub.** Los tiempos medidos (la peor partida de hard rondaba 1,2 s antes de acelerarlo, la de lucia por debajo de 0,8 s) son de nuestro ordenador; no hemos medido cuánto más lentos son los runners de GitHub.
- **nim-arena:** no hemos leído su `game.py`, los detalles de su `registry.py` ni el contenido de sus workflows y plantillas, así que no afirmamos cuánto se parecen a los nuestros.
- **Web y trampas humanas:** en la web, los dos tableros completos están en la memoria de JavaScript (`match.sides[i].board`). Un bot no puede verlos, pero una persona con las herramientas del navegador sí. No es un problema para el torneo (que corre en Python), pero hay que saberlo.
- **Por qué easy gana a random (67 %).** Medimos que, contra flotas de `random_fleet`, el escaneo por filas necesita menos disparos (90,8 frente a 95,5) que el azar. No hemos comprobado por qué esa colocación favorece al escaneo.
