# Battleship Arena

Battleship Arena es un motor de Hundir la flota, una pequeña API para escribir bots y un
torneo automático que los clasifica. Las reglas y todos los bots se escriben **una sola
vez, en Python**: ese mismo código juega el torneo oficial en la CI y se ejecuta en tu
navegador gracias a [Pyodide](https://pyodide.org).

- **Jugar**: [carmencuerva.github.io/BATTLESHIP](https://carmencuerva.github.io/BATTLESHIP/).
  Puedes jugar contra un bot, ver a dos bots enfrentarse, jugar contra otra persona en el
  mismo dispositivo o lanzar un torneo en el navegador.
- **Tu nombre pirata**: la web te lo pide y el loro te llama por él (grumete hasta que
  hundes tu primer barco, y capitán o capitana después, como elijas). Se guarda solo en tu
  navegador (`localStorage`); no se envía a ningún sitio.
- **El camarote del capitán**: todas las pantallas transcurren dentro del camarote. En la
  de inicio, un pergamino sobre la mesa reúne las opciones por grupos: la batalla (tres
  tarjetas ilustradas), la travesía (flota, tamaño del mar, viento y capitán enemigo, con
  controles grandes), tu nombre, el gran botón *¡Al abordaje!* y la bitácora (el código del
  pirata). Los tableros y controles se ven siempre de frente. Todo lo dibuja el propio
  código de la web (`web/js/cabin-art.js`).
- **Colocar la flota**: la primera vez, el loro te guía paso a paso (el botón **?** vuelve
  a abrir el tutorial).
- **El loro** está quieto en su percha entre los dos tableros, así que nunca los tapa.
  Habla solo en momentos concretos: cuando empieza tu turno, cuando hundes un barco enemigo
  (te dice cuántos quedan), cuando el enemigo hunde uno de los tuyos (dejando claro que es
  de tu flota) y al terminar. Una frase nueva nunca suena encima de otra ni se acumula. Lo que dice sale siempre en su bocadillo. Sus
  frases están en `web/js/parrot-lines.js` por si queréis otras palabras.
- **Sonido**: apagado hasta que lo enciendes con 🔊 (la web recuerda tu elección). Entonces
  el loro grazna (un graznido sintetizado por la propia web) y dice su frase con una voz
  viva y algo aguda que cambia según el momento (emoción, preocupación, tristeza…), usando
  la voz más natural de tu dispositivo; si no hay voz para el idioma, solo grazna. Su voz,
  sus estados de ánimo y sus graznidos son constantes al principio de `web/js/sound.js`.
- **Música**: piezas propias compuestas para el juego y tocadas en directo por la web
  (`web/js/music.js`, sin grabaciones): una canción de marineros en 6/8 para los menús y la
  colocación de la flota, una pieza épica con tambores de guerra y metales durante la
  batalla, y una fanfarria o un lamento al terminar. Cada una se funde con la siguiente,
  nunca suenan dos a la vez. Empieza tras tu primer clic con el sonido encendido, baja
  mientras habla el loro y se pausa si la pestaña está oculta. El botón de deslizadores junto a 🔊 ajusta el volumen de la
  música y del loro (se recuerda). Si tu sistema tiene activado *reducir movimiento*, las animaciones grandes se
  quedan quietas.
- **Clasificación**: la pestaña *Clasificación* de la web muestra el último torneo oficial.
- **Escribe tu propio bot**: mira [Escribe un bot](write-a-bot.md). Necesitas un único
  fichero de Python y una línea en un manifiesto.

## Primeros pasos

```bash
git clone https://github.com/carmencuerva/BATTLESHIP.git
cd BATTLESHIP
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest                             # los tests
battleship-tournament              # juega el torneo y escribe results/leaderboard.json
```

Para jugar en la web en tu ordenador:

```bash
python scripts/build_web.py        # empaqueta el código Python en web/py.zip
python -m http.server 8000 --directory web
# abre http://localhost:8000
```

## Principios

- **Una única fuente de verdad.** Las reglas viven en `battleship.game`. El JavaScript solo
  dibuja lo que devuelve Python.
- **Solo datos planos.** Tableros, vistas, disparos y resultados son listas, diccionarios y
  cadenas (JSON).
- **Motor puro.** Las funciones del motor nunca modifican sus argumentos; devuelven valores
  nuevos.
- **Los turnos y el tiempo son cosa del torneo.** Ni el motor ni los bots controlan los
  turnos ni los límites de tiempo. Lo hace el torneo.
- **Contrato mínimo para los bots.** Un bot coloca su flota y elige disparos. Nada más.
- **Admisión explícita.** Un bot solo juega si lo incluye un manifiesto `players.yaml`.
- **Los fallos se aíslan.** Un bot que falla, hace trampas o se queda sin tiempo pierde esa
  partida, y el torneo sigue.
