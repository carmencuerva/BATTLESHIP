# Escribe un bot

Un bot es un fichero de Python con una clase que hereda de `battleship.player.Player`.

## 1. La clase

```python title="players/custom/mi_bot.py"
import random

from battleship.bots import hunt_target_shot, random_fleet
from battleship.player import Player


class MiBot(Player):
    # --- identidad (se lee sin construir el bot) ---
    @classmethod
    def get_name(cls):
        return "mibot"                      # único; letras, dígitos, espacio, _ . -; hasta 32

    @classmethod
    def get_authors(cls):
        return ["Tu Nombre"]

    @classmethod
    def get_description(cls):               # opcional
        return "Busca en damero y remata lo que toca."

    @classmethod
    def get_icon(cls):                      # opcional, un emoji
        return "🐙"

    # --- construcción ---
    @classmethod
    def create(cls, seed):                  # opcional; usa la semilla para partidas reproducibles
        return cls(seed)

    def __init__(self, seed=None):
        self.rng = random.Random(seed)

    # --- juego ---
    def choose_placement(self, board_size, fleet):
        return random_fleet(board_size, fleet, self.rng)

    def choose_shot(self, view):
        return hunt_target_shot(view, self.rng)
```

| método | debe devolver |
|--------|---------------|
| `choose_placement(board_size, fleet)` | un `[fila, columna, "H"|"V"]` por barco, en el orden de `fleet` (ver [Reglas](rules.md)) |
| `choose_shot(view)` | un `(fila, columna)` dentro del tablero y sin disparar |

El bot solo ve la **vista** del atacante, nunca el tablero enemigo. Es una función de esa
vista: no hay ningún aviso con el resultado de un disparo, porque la siguiente vista ya lo
muestra. Si quieres, puedes guardar estado en `self`.

### Ayudas que puedes reutilizar

`battleship.bots` contiene las estrategias de los bots incluidos:

| ayuda | idea |
|-------|------|
| `random_shot(view, rng)` | cualquier casilla sin disparar |
| `scan_shot(view)` | la primera casilla sin disparar, fila a fila |
| `hunt_target_shot(view, rng)` | búsqueda en damero y luego remata cada barco tocado |
| `probability_shot(view, rng)` | la casilla cubierta por más posiciones legales de barcos; devuelve `(casilla, mapa_de_calor)` |
| `probability_map(view)`, `hit_clusters(view)` | piezas para tus propias ideas |
| `random_fleet(size, fleet, rng)` | una colocación legal aleatoria |
| `stealth_fleet(size, fleet, rng)` | una colocación difícil para un cazador probabilístico |

### Modo rayos X (opcional)

Si tu bot pone `self.last_info = {"heatmap": rejilla}` en `choose_shot`, la web dibuja esa
rejilla sobre el tablero en modo rayos X. `rejilla` son `size × size` números, y los más altos se
ven más claros. El torneo ignora `last_info`.

## 2. El manifiesto

Un bot solo juega si lo incluye el manifiesto de su carpeta. Añade una entrada a
`players/custom/players.yaml`:

```yaml
players:
  - file: mi_bot.py
    class: MiBot
```

## 3. Pruébalo

```bash
python scripts/check_players.py      # carga todos los jugadores y juega una liguilla corta
battleship-tournament                # el torneo completo, con tu bot dentro
python scripts/build_web.py          # y juega contra él en el navegador
```

`check_players.py` falla si tu bot es rechazado (identidad no válida, nombre repetido,
error al importarlo) o si pierde alguna partida por abandono.

## Normas para los bots

- **Tiempo:** en cada partida, un bot tiene **2 s** para construirse (`create`) y **2 s en
  total** para su colocación y todos sus disparos. Si se pasa, pierde la partida.
- **Errores:** una excepción, un disparo ilegal o una colocación incorrecta hacen perder
  la partida. El torneo continúa.
- No leas ficheros, no uses la red y no inspecciones otros objetos. Tu bot debe jugar
  solo con la vista que recibe.

## 4. Envíalo

Abre un pull request que añada tu fichero y la entrada del manifiesto. El workflow
`custom-players` hace la misma comprobación. Cuando se acepta tu pull request, el
workflow `tournament` vuelve a jugar el torneo y se actualiza la clasificación online.
Los detalles están en `CONTRIBUTING.md`.
