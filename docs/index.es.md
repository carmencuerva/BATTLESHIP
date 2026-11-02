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
