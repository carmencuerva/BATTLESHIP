# Reglas

## El juego

- Cada jugador tiene un tablero cuadrado, de 10×10 por defecto. Filas y columnas se
  numeran desde 0.
- Los dos jugadores colocan la misma flota. La flota por defecto tiene barcos de
  longitud **5, 4, 3, 3, 2**. El tamaño del tablero y la flota se pueden configurar.
- Los barcos son rectos, horizontales o verticales. Tienen que estar enteros dentro del
  tablero. **No pueden solaparse ni tocarse, ni siquiera en diagonal.**
- Por turnos, cada jugador dispara a una casilla del tablero rival:
    - **agua**: el turno pasa al rival;
    - **tocado**: **vuelves a disparar**;
    - **hundido**: todas las casillas de ese barco han sido tocadas. Se anuncia la
      **longitud** del barco hundido y **vuelves a disparar**.
- Disparar dos veces a la misma casilla, o fuera del tablero, es ilegal.
- Gana quien hunda primero toda la flota enemiga.

!!! note "Disparar primero es una ventaja"
    Como tocar te deja volver a disparar, quien empieza tiene ventaja. Por eso el torneo
    juega las partidas en parejas espejo: mismas flotas y semillas, y cada jugador empieza
    una vez.

## Formatos de datos

Todos los datos son Python plano compatible con JSON: enteros, cadenas, listas y diccionarios.

### Colocación

Un jugador devuelve un `[fila, columna, orientación]` por barco, **en el orden de la flota**:

```python
[[0, 0, "H"], [2, 0, "H"], [4, 0, "H"], [6, 0, "H"], [8, 0, "H"]]
```

`(fila, columna)` es la casilla superior izquierda del barco. Con `"H"` el barco se
extiende hacia la derecha (columnas crecientes). Con `"V"` se extiende hacia abajo (filas
crecientes).

### Vista

Al disparar, un bot recibe la **vista del atacante** del tablero enemigo. Nunca recibe
más:

```python
{
    "size": 10,
    "cells": [[0, 0, 1, ...], ...],  # size × size
    "remaining": [5, 3, 2],          # longitudes de los barcos a flote, de mayor a menor
}
```

| código | constante | significado |
|-------:|-----------|-------------|
| 0 | `UNKNOWN` | sin disparar |
| 1 | `MISS` | agua |
| 2 | `HIT` | tocado, el barco aún no está hundido |
| 3 | `SUNK` | parte de un barco hundido |

`remaining` sale de la regla «al hundir se anuncia la longitud»: cada vez que se hunde
un barco, su longitud desaparece de la lista.

### Disparo y resultado

Un disparo es `(fila, columna)` (también vale una lista). El motor responde con un resultado:

```python
{"outcome": "miss", "length": None}
{"outcome": "hit", "length": None}
{"outcome": "sunk", "length": 3}
```

## El motor

`battleship.game` contiene todas las reglas como funciones puras, por ejemplo:

| función | qué hace |
|---------|----------|
| `validate_placement(size, fleet, placement)` | `None` si es legal; si no, el motivo (p. ej. `"ship 1 touches ship 0 near [..]"`) |
| `random_placement(size, fleet, rng)` | una colocación legal aleatoria |
| `new_board(size, fleet, placement)` | un tablero sin disparos |
| `apply_shot(board, shot)` | `(nuevo_tablero, resultado)`; no modifica el tablero de entrada |
| `view_for_attacker(board)` | la vista descrita arriba |
| `legal_shots(view)`, `is_legal_shot(view, shot)` | las casillas a las que aún se puede disparar |
| `is_terminal(board)` | si todos los barcos están hundidos |
| `next_attacker(attacker, result)` | quién dispara después (la regla de repetir al tocar) |
