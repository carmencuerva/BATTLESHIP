# Entender Battleship Arena

*English version: [Understanding Battleship Arena](UNDERSTAND.md).*

Guía de estudio para poder explicar y defender cada parte del proyecto. Todo lo que dice
sale de leer el código de este repositorio o de ejecutarlo; cuando algo no está
comprobado, se dice. Las cifras de los bots son de los torneos locales de noviembre de
2026 (semilla 0).

Battleship Arena parte de [nim-arena](https://github.com/jparisu/nim-arena) (de jparisu):
reutilizamos su arquitectura (API de jugador, manifiesto, torneo, CI, web con Pyodide) y la
adaptamos a Hundir la flota. La sección 5 detalla qué viene de allí y qué es nuestro, y
la sección 6 explica los bots a fondo: cómo detectan los impactos, cómo deciden y por qué
cada nivel es más difícil que el anterior.

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
| `bots/` | Estrategias reutilizables como funciones puras: `placement.py` (`random_fleet`, `stealth_fleet`) y `shooting.py` (`random_shot`, `scan_shot`, `random_target_shot`, `hunt_target_shot`, `probability_map`/`probability_shot`, `certain_water`, `hit_clusters`). |

### Jugadores: `players/`

| Carpeta | Qué hay |
|---|---|
| `players/builtin/` | La escalera de referencia (random, easy, medium, hard) y su `players.yaml`. Cada bot es una clase fina que llama a una estrategia de `bots/`. |
| `players/custom/` | Los bots enviados por pull request (ahora `car_lu_bot.py`) y su `players.yaml`. |

### Web: `web/`

| Fichero | Qué hace |
|---|---|
| `webglue.py` | El puente JS ↔ Python: cada función recibe cadenas JSON y devuelve una cadena JSON. Guarda los bots vivos detrás de números (`handle`) porque son objetos con estado. |
| `pyodide-bootstrap.js` | Carga Pyodide 0.27.2 desde jsDelivr, descomprime `py.zip`, importa `webglue` y ofrece `arena.call("función", ...args)`, que serializa a JSON cada argumento y el resultado. |
| `js/app.js` | Pantallas y orquestación de turnos: decide qué dibujar y cuándo pedir a Python el siguiente paso. No contiene reglas. |
| `js/board.js`, `js/ships.js`, `js/coords.js` | Dibujo del tablero, de los barcos (SVG) y de las coordenadas tipo «C7». Solo presentación. |
| `js/cabin.js`, `js/cabin-art.js` | La pantalla de inicio como camarote en perspectiva: geometría (homografía de la carta) y dibujo SVG. |
| `js/deck-art.js` | Dibujos de la colocación y la batalla (sables, pluma, placas, pie de latón del loro). Ambas pantallas muestran detrás el mismo camarote del inicio, atenuado. Solo decoración. |
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

[nim-arena](https://github.com/jparisu/nim-arena) (licencia MIT, «Copyright (c) 2026
jparisu and the NIM Arena contributors») es una arena para el juego del Nim: un motor de
reglas, una API para escribir bots, un torneo automático en la CI y una web que ejecuta el
mismo Python con Pyodide. Comparación hecha leyendo su código en GitHub (noviembre de
2026: `game.py`, `player.py`, `manifest.py`, `registry.py`, `elo.py`, `tournament.py`,
`webglue.py`, `pyodide-bootstrap.js`, `build_web.py` y sus cinco workflows). Nuestro código
no se copió fichero a fichero: el historial empieza con un commit vacío y el proyecto se
escribió por fases siguiendo su diseño. Lo que reutilizamos es **la arquitectura y las
convenciones**; el juego, los bots, la puntuación y la interfaz son nuestros.

### Cómo encaja cada pieza (mapa común a los dos proyectos)

```text
players/*/players.yaml ──► manifest.py ──► registry.py ──► tournament.py ──► results/leaderboard.json
   (quién juega)           (lee y valida)   (importa clases)  (partidas, Elo)        │
                                                    │                                  ▼
                                               game.py (reglas)        build_web.py ──► web/ (Pyodide)
                                                    ▲                                  │
                                         webglue.py ◄── pyodide-bootstrap.js ◄── js/app.js
```

### Se mantiene casi igual (idea de nim-arena)

| Pieza | En nim-arena | En Battleship Arena |
|---|---|---|
| API de jugador | `Player(ABC)` con `get_name`, `get_authors`, `get_description`, `get_icon` y `create(cls, seed)` | Igual. |
| Manifiesto | `players: - file: … class: …`, carpetas `builtin` y `custom`, nunca escanear carpetas | Igual. |
| Formatos de torneo | `simple`, `league`, `championship` | Los mismos nombres. |
| Presupuestos | 2000 ms por partida y 2000 ms de construcción | 2 s y 2 s. |
| Abandonos | `forfeit_timeout`, `forfeit_illegal`, `forfeit_error`, `forfeit_build_timeout`, `forfeit_build_error` | Los mismos, más `forfeit_bad_placement`. |
| Una partida por proceso | Sí (un proceso hijo con `fork` por partida) | Sí (proceso nuevo por partida, comunicado por una tubería). |
| Elo | 1500 inicial, escala 400 | 1500 y 400, pero otro cálculo (ver abajo). |
| CI | `tests`, `custom-players`, `tournament`, `pages`, `docs` | Los mismos cinco nombres. |
| Web | `pyodide-bootstrap.js` (Pyodide 0.26.2), `webglue.py` con JSON, `build_web.py` → `py.zip` | La misma estructura (Pyodide 0.27.2). |
| Escalera de bots | `random`, `easy`, `medium`, `hard` | Los mismos nombres de nivel, con estrategias nuevas. |
| Documentación | MkDocs, inglés y español | Igual. |

### Adaptado o nuevo (nuestro)

- **El juego:** Nim → Hundir la flota. Motor nuevo (`game.py`): colocación con la regla de no tocarse ni en diagonal, disparos con agua/tocado/hundido, repetir turno al acertar. En el Nim de nim-arena el estado es una lista de montones (`list[int]`) y la jugada `(fila, cantidad)`.
- **Información oculta:** en Nim los dos jugadores ven todo; aquí la `view` esconde los barcos sin tocar.
- **API de jugada:** `choose_move(state)` de Nim se convierte en dos métodos, `choose_placement` y `choose_shot(view)`.
- **Registro sin construir:** nim-arena valida cada jugador construyéndolo (`create(seed=0)`); nosotros leemos su identidad por métodos de clase sin construirlo, y apartamos los rotos en `rejected`.
- **Tiempo por llamada:** el proceso de la partida avisa antes de cada llamada a un bot del tiempo que le queda, y el torneo lo mata si se pasa (más 1 s de margen).
- **Calendario:** parejas espejo con las mismas semillas; campeonato como liga + eliminatorias (nim-arena usa grupos de cuatro y copias de los bots incluidos).
- **Clasificación:** nim-arena actualiza el Elo partida a partida con K = 32; nosotros ajustamos la puntuación a todas las partidas a la vez (Bradley-Terry), así que no depende del orden.
- **Workflows:** el de nim-arena abre una pull request con la clasificación y Pages espera al torneo; el nuestro hace commit directo, y Pages juega su propio torneo.
- **Bots de caza:** los cuatro niveles y CarLuBot (sección 6) son nuestros; los de nim-arena son minimax para Nim.
- **Interfaz pirata:** el camarote en perspectiva, editor de colocación con arrastre, tableros ilustrados, modo rayos X, torneo en el navegador.
- **El loro, la música y los sonidos:** frases, voz con la síntesis del navegador, música compuesta para el juego en Web Audio.
- **`scripts/check_players.py`** para validar envíos.

## 6. Los bots a fondo

### Lo que sabe un bot

Un bot nunca ve el tablero rival. En cada turno recibe una `view`: el tamaño, una matriz
con `0` (sin disparar), `1` (agua), `2` (tocado) o `3` (hundido), y `remaining`, las
esloras de los barcos que siguen a flote. **La detección de impactos la hace el motor**
(`apply_shot` en `game.py` decide si es agua, tocado o hundido); los bots solo leen el
resultado en la `view`. A partir de ahí, todos usan las mismas deducciones:

- **Grupos de impactos** (`hit_clusters`): casillas tocadas unidas en horizontal o
  vertical. Como los barcos no se tocan, cada grupo es de un único barco aún a flote.
- **Agua segura** (`certain_water`): alrededor de un barco hundido y en diagonal a un
  tocado solo puede haber agua, por la regla de no tocarse.
- **Flota original** (`whole_fleet`, en car_lu): `remaining` más la eslora de cada grupo de
  casillas hundidas.

### La escalera: cada nivel añade una idea

| Bot | Busca (sin impactos pendientes) | Remata (con un barco tocado) | Usa la regla de no tocarse | Coloca su flota | Disparos para hundir una flota al azar |
|---|---|---|---|---|---|
| random | al azar | al azar | no | al azar | 95 |
| easy | al azar | prueba las 4 casillas de al lado de cualquier tocado | no | al azar | 66 |
| medium | en damero: `(fila + col) % barco_más_corto == 0` | sigue la línea de impactos por sus dos extremos | sí, nunca dispara al agua segura | al azar | 44 |
| hard | la casilla que cubren más posiciones legales de los barcos | lo mismo, contando solo posiciones que pasan por el tocado | sí, dentro del recuento | `stealth_fleet`: la menos expuesta de 20 colocaciones al azar | 39 |
| car_lu | como hard, pero pondera cada posición según cómo cree que coloca el rival | igual que hard | sí | la menos expuesta de 120, con algo de azar | 39,4 (y 37,6 contra la flota de hard) |

Media de 300 partidas por bot en 10×10 con la flota `[5, 4, 3, 3, 2]`. La colocación también
cuenta: hard necesita 38,9 disparos contra una flota al azar, 42,6 contra la suya y 44,1
contra la de car_lu. Resultado del
torneo oficial (100 partidas por pareja, semilla 0):

| | easy | medium | hard | car_lu |
|---|---|---|---|---|
| **random** | 0–100 | 0–100 | 0–100 | 0–100 |
| **easy** | | 2–98 | 0–100 | 8–92 |
| **medium** | | | 30–70 | 31–69 |
| **hard** | | | | 20–80 |

(Cada casilla es «victorias del bot de la fila – victorias del bot de la columna».)

### Cómo decide hard: el mapa de probabilidad

`probability_map` recorre, para cada barco que queda, **todas** sus posiciones posibles
(horizontal y vertical, en cada casilla de inicio) y descarta las que contradicen la
`view`: las que pisan agua, un hundido o el halo de un hundido. Si hay un barco tocado, solo
cuenta las posiciones que contienen **entero** cada grupo de impactos que tocan y que no
rozan otro grupo (los barcos no se tocan). Cada posición válida suma 1 a cada casilla sin
disparar que cubre. Hard dispara a la casilla con más votos y desempata al azar.

Por qué es fuerte: al principio el mapa es más alto en el centro (allí caben más barcos);
a medida que aparecen aguas, el mapa se adapta solo; y como un barco largo cabe en menos
sitios, el mapa favorece los huecos donde aún cabe el más largo.

**Por qué no es injusto:** solo usa la `view`, igual que una persona que juega bien; no
recuerda partidas anteriores; desempata al azar, así que no es predecible; y hay tests que
le pasan un espía (`test_no_view_reveals_a_ship_that_was_not_shot`). Medium le gana el
30 % de las partidas, así que se le puede ganar.

### Cómo decide car_lu: hard + aprender cómo coloca el rival

car_lu parte del mismo recuento que hard, pero **no todas las posiciones valen lo mismo**.
Mantiene dos hipótesis sobre el rival:

- **«al azar»** (`even`): toda posición legal es igual de probable.
- **«se esconde»** (`hiding`): un rival que conoce a los cazadores evita las casillas que
  más se miran. Cada posición pesa `exp(-2 · exposición)`, donde la exposición es cuánto
  cubre del mapa inicial (0 para la menos expuesta, 1 para la más). Esto describe a hard,
  que coloca así, pero también a cualquier rival (o persona) que esconda la flota.

En cada posición, el peso es la mezcla `(1 − creencia) · P_even + creencia · P_hiding`.
Con creencia 0 el mapa es exactamente el de hard (hay un test que lo comprueba).

**Cómo aprende (regla de Bayes).** La creencia empieza en 0,5. Cada casilla destapada es
evidencia: si es barco, se compara la probabilidad de que lo fuera según cada hipótesis
(`hide[i] / even[i]`); si es agua, la de que no lo fuera (`(1 − hide[i]) / (1 − even[i])`).
Los log-odds se suman con un peso de 0,5 por casilla, porque las casillas no son
independientes (un barco ocupa varias) y contarlas enteras haría la creencia demasiado
segura. Por eso el primer disparo de car_lu suele ir al borde: es el que mejor distingue
entre las dos hipótesis.

**Por qué ahora es robusto.** Antes, car_lu usaba dos constantes medidas a mano en 10×10
(«el 32 % de las casillas de barco caen en el borde si se coloca al azar, el 58 % si se
esconde como hard»). En otros tableros esas cifras no valen, y en 12×12 hard y car_lu casi
empataban (92–108). Ahora las dos hipótesis se calculan **a partir del propio tablero**
(`_models`), así que funcionan en cualquier tamaño:

| Tablero | Antes (hard–car_lu) | Ahora (hard–car_lu) |
|---|---|---|
| 10×10, `[5,4,3,3,2]` | 73–127 | 51–149 |
| 8×8, `[4,3,2,2]` | 51–149 | 34–166 |
| 12×12, `[6,5,4,3,3,2]` | 92–108 | 60–140 |
| 10×10, `[4,3,3,2,2,2,1]` | 81–119 | 59–141 |
| 15×15, `[5,4,4,3,3,2,2]` | — | 67–133 |

(200 partidas espejo por fila, semilla 0.)

**Lo que cuesta.** Contra una flota colocada al azar, car_lu necesita ~0,5 disparos más que
hard (39,4 frente a 38,9), porque al principio sospecha que el rival se esconde. A cambio,
contra un rival que se esconde gana mucho más: hard tarda 42,6 disparos en hundir la flota
de hard y car_lu solo 37,6.
Contra medium (que coloca al azar) car_lu y hard rinden igual: con 400 partidas, 76 % y 77 %.

**Cómo coloca su flota.** Genera 120 colocaciones legales al azar, mide cuánto cubre cada
una del mapa inicial de un cazador, y elige una de las menos expuestas con un sorteo
ponderado (`exp(-(s - mínimo) / (0,25 · casilla media))`): así esconde la flota, pero nunca
de la misma forma (hay un test que exige al menos 35 colocaciones distintas de 40).

### Lo que probamos y descartamos

- **Muestrear flotas completas** en vez de contar cada barco por separado (más exacto,
  porque los barcos tampoco se tocan entre sí). Con 400 flotas por disparo necesitaba 39,4
  disparos de media frente a 38,9 del recuento de hard: no mejora y es más lento.
- **Más fuerza en la hipótesis «se esconde»** (4 o 6 en vez de 2): encuentra antes la
  flota de hard, pero pierde 1–2 disparos contra flotas al azar.
- **Bajar la creencia inicial a 0,2:** casi no pierde contra flotas al azar, pero deja de
  detectar a los rivales que se esconden.

## 7. Preguntas que nos pueden hacer

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
| 10 | ¿Por qué no el Elo clásico partida a partida? | Porque depende del orden: con la versión anterior de car_lu y 100 partidas por pareja, car_lu ganaba a hard 70-30 y tenía más victorias, pero quedaba segunda. |
| 11 | ¿Cómo funciona el mapa de probabilidades de hard? | Para cada casilla cuenta cuántas posiciones legales de los barcos que quedan la cubren (sin agua, sin el halo de los hundidos, sin rozar impactos ajenos); si hay un barco tocado, solo cuenta las que pasan por él. Dispara a la casilla con más. |
| 12 | ¿En qué se diferencia CarLuBot de hard? | Cuenta las mismas posiciones legales, pero las pondera con una mezcla de dos hipótesis sobre el rival («coloca al azar» y «se esconde donde menos miran los cazadores»), construidas a partir del propio tablero; aprende cuál es la buena con la regla de Bayes, con cada casilla que destapa (agua incluida). Coloca su flota entre las menos expuestas de 120 candidatas, con algo de azar. Le gana a hard el 80 % en el torneo oficial (sección 6). |
| 13 | ¿Por qué hard esconde su flota en los bordes? | `stealth_fleet` elige, de 20 colocaciones al azar, la que menos cubre el mapa de probabilidad inicial, que es más bajo en los bordes. Contra cazadores que no se adaptan (medium, una persona que empieza por el centro) funciona; car_lu lo detecta y lo aprovecha. |
| 14 | ¿Qué es la búsqueda por paridad de medium? | Mientras busca, solo dispara a casillas con `(fila + columna) % barco_más_corto == 0`: todo barco de esa longitud pisa al menos una. |
| 15 | ¿Por qué los barcos no pueden tocarse y cómo lo usan los bots? | Es una regla del juego que fijamos; gracias a ella, alrededor de un hundido y en diagonal a un impacto solo puede haber agua, y medium, hard y car_lu no disparan ahí. easy no lo usa a propósito: es lo que lo hace más fácil que medium. |
| 16 | ¿Cómo es reproducible el torneo? | Toda la aleatoriedad sale de semillas: cada partida recibe semillas derivadas de la del torneo y de los dos nombres, y cada bot crea su `random.Random(seed)`. |
| 17 | ¿Qué son las parejas espejo? | Partidas con las mismas semillas en las que cada jugador empieza una vez, para compensar la ventaja de empezar. |
| 18 | ¿Por qué un manifiesto? | Para que un bot solo entre si una línea lo admite, visible en la misma pull request. |
| 19 | ¿Qué pasa si alguien sube un bot roto? | `check_players.py` lo detecta en la PR; si aun así llega al torneo, se aparta en `rejected` y el torneo sigue. |
| 20 | ¿Cuánto tiempo tiene un bot? | 2 s acumulados para colocar y disparar en toda la partida, y otros 2 s para construirse. En la web los límites son mucho mayores (30 s y 10 s) porque no se puede matar a un bot. |
| 21 | ¿Por qué 100 partidas por pareja? | Con la versión anterior de car_lu, con 20 partidas el orden entre hard y car_lu cambiaba según el número de partidas; con 1.000 la diferencia sí era clara. Con 100, cualquier diferencia de 15 puntos o más es fiable. |
| 22 | ¿Cómo llega la clasificación a la web? | `build_web.py` copia `results/leaderboard.json` a la web y la pestaña Clasificación lo descarga con `fetch`. |
| 23 | ¿Qué es `last_info` y el modo rayos X? | Un campo opcional del bot (por ejemplo su mapa de calor) que la web dibuja sobre el tablero que ataca. El torneo lo ignora. |
| 24 | ¿Qué parte del proyecto viene de nim-arena? | La arquitectura: API de jugador, manifiesto, torneo con procesos y abandonos, Elo, CI, web con Pyodide y documentación. El juego, los bots y la interfaz son nuestros (sección 5). |
| 25 | ¿Cómo se testea? | pytest (motor, API, manifiesto, torneo, bots, puente web), ruff y mypy en la CI; tests de JavaScript con Node y una prueba de `py.zip` dentro de Pyodide. |
| 26 | ¿Por qué hard le ganaba a car_lu? | car_lu no apuntaba mejor que hard (contra flotas al azar, incluso peor); solo le sacaba ventaja porque sus constantes describían la colocación de hard en 10×10. En otros tableros casi empataban (12×12: 92–108), y en el torneo de la web, de 10 partidas por pareja, hard quedaba por delante o empataba aproximadamente una vez de cada cuatro. |
| 27 | ¿Cómo se detecta un impacto? | Lo decide el motor: `apply_shot` mira si la casilla pertenece a un barco (tocado) y si con ella todas las del barco están disparadas (hundido, con su eslora). El bot solo ve el resultado en la `view`. |
| 28 | ¿Qué hace easy y por qué se cambió? | Dispara al azar y, tras un tocado, prueba las casillas de al lado hasta hundir el barco. Antes recorría el tablero fila a fila y era casi como random (90 disparos frente a 95). Ahora necesita 66: queda entre random y medium. |
| 29 | ¿Es hard injusto? | No: solo usa la `view`, como una persona que juega bien, desempata al azar y no recuerda partidas. Es el mejor bot de la escalera, pero medium le gana el 30 % y car_lu el 80 %. |
| 30 | ¿Cómo sabemos que car_lu gana en cualquier tablero? | Un test lento (`test_car_lu_beats_hard_on_other_boards`) juega en 8×8 y 12×12, y medimos 8×8, 10×10, 12×12 y 15×15 (sección 6). |

## Dudas por resolver

- **Commit del leaderboard y Pages.** `tournament.yml` hace push con el token de GitHub Actions. Según la documentación de GitHub, los eventos creados con ese token no lanzan otros workflows, así que ese commit no debería volver a publicar la web. No afecta al resultado porque `pages.yml` juega su propio torneo, pero no lo hemos comprobado en Actions.
- **Tiempo en GitHub.** Los tiempos medidos (la peor partida de hard rondaba 1,2 s antes de acelerarlo, la de car_lu por debajo de 0,8 s) son de nuestro ordenador; no hemos medido cuánto más lentos son los runners de GitHub.
- **nim-arena:** no hemos leído sus tests, sus plantillas de GitHub, su JavaScript ni sus bots por dentro (solo su descripción), así que no afirmamos cuánto se parecen a los nuestros.
- **Web y trampas humanas:** en la web, los dos tableros completos están en la memoria de JavaScript (`match.sides[i].board`). Un bot no puede verlos, pero una persona con las herramientas del navegador sí. No es un problema para el torneo (que corre en Python), pero hay que saberlo.
- **Rivales humanos.** La hipótesis «se esconde» de car_lu está pensada para cualquier rival que evite las casillas más vigiladas, pero solo la hemos medido contra bots; no sabemos cómo colocan de verdad las personas.
- **Torneo de la web.** Por defecto juega 10 partidas por pareja: suficiente para ver el orden, pero con hard contra car_lu (80–20) aún sale un empate o un resultado al revés en torno a 1 de cada 30 torneos. Con 20 partidas sería muy raro, pero tardaría el doble.
