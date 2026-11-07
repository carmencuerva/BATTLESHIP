# Torneo

```bash
battleship-tournament [--format league|simple|championship] [--games 100] [--seed 0]
                      [--knockout-games 10] [--top 4]
                      [--size 10] [--fleet 5,4,3,3,2]
                      [--time-budget 2] [--build-budget 2]
                      [--jobs 4] [--no-subprocess] [--output results/leaderboard.json]
```

## Formato

- **Liguilla (todos contra todos):** cada pareja de jugadores admitidos juega `--games`
  partidas (100 por defecto; con menos, el orden entre jugadores parecidos depende
  mucho del azar).
- **Parejas espejo:** las partidas `2k` y `2k+1` de una pareja usan las mismas semillas
  (y, por tanto, las mismas flotas para los bots con semilla), y cada jugador empieza una vez.
- **Reproducible:** las semillas de cada partida dependen solo de la semilla del torneo y
  de los dos nombres. Añadir un jugador nuevo no cambia las partidas entre los demás.
- **Clasificación:**
    - `league` (por defecto) ordena por una **puntuación en escala Elo** ajustada a todas
      las partidas a la vez (el ajuste de máxima verosimilitud del modelo de Elo, también
      llamado Bradley-Terry; ver `src/battleship/elo.py`). 400 puntos de diferencia son
      apuestas de 10 a 1; la media es 1500. A diferencia de actualizar el Elo partida a
      partida, no depende del orden de las partidas y, en una liga, más puntos significan
      siempre más puntuación.
    - `simple` ordena por **puntos**: 1 por victoria, ½ por empate.
    - Los empates se deshacen por menos abandonos y después por nombre.

## Campeonato

`--format championship` juega primero la liga y después unas eliminatorias entre los
`--top` mejores (4 por defecto; siempre una potencia de dos que quepa en el torneo).

- **Cuadro:** se ordena por la posición en la liga, de modo que el 1.º y el 2.º solo pueden
  verse en la final (con 4: 1.º contra 4.º y 2.º contra 3.º en semifinales).
- **Eliminatorias:** cada una son `--knockout-games` partidas (10 por defecto), también en
  parejas espejo y con sus propias semillas. Una eliminatoria empatada la gana quien quedó
  mejor en la liga.
- **Clasificación final:** primero el campeón, luego el finalista y después el resto según
  hasta dónde llegó en el cuadro y, a igualdad, según la liga. Cada fila conserva su
  `league_rank`. Las estadísticas de la tabla son solo de las partidas de liga.
- La clasificación añade una sección `knockout`: `{"size", "games_per_match", "rounds":
  [{"name", "matches": [{"a", "b", "wins_a", "wins_b", "draws", "winner"}]}],
  "champion"}`.

## Aislamiento y abandonos

Cada partida se juega en su propio proceso. Antes de cada llamada a un bot, la partida le
dice al torneo cuánto tiempo le queda a ese bot. Si el bot se queda callado más tiempo,
se mata el proceso y el bot pierde la partida. Así también se cubren los bucles infinitos.

| motivo | cuándo |
|--------|--------|
| `forfeit_build_error` / `forfeit_build_timeout` | `create()` falló / tardó demasiado |
| `forfeit_bad_placement` | colocación ilegal o que no es JSON |
| `forfeit_error` | excepción en `choose_placement` o `choose_shot` (o el proceso murió) |
| `forfeit_illegal` | disparo fuera del tablero o repetido |
| `forfeit_timeout` | se agotaron los 2 s por partida |

Si los dos bots fallan al construirse o al colocar, la partida es empate.

## La clasificación

`results/leaderboard.json` tiene esta estructura:

```json
{
  "format": "league",
  "config": {"games_per_pair": 100, "seed": 0, "size": 10, "fleet": [5,4,3,3,2], ...},
  "standings": [
    {"rank": 1, "name": "lucia", "icon": "🐬", "elo": 2096.9, "points": 351.0,
     "played": 400, "wins": 351, "losses": 49, "draws": 0, "forfeits": 0,
     "forfeit_reasons": {}, "wins_first": 177, "wins_second": 174,
     "avg_shots_to_win": 38.5, "hit_rate": 0.434, ...}
  ],
  "pairs": [{"a": "easy", "b": "hard", "wins_a": 0, "wins_b": 100, "draws": 0}],
  "rejected": [],
  "generated_at": "2026-11-01T12:00:00+00:00"
}
```

- `avg_shots_to_win` es la media de disparos del jugador en las partidas que ganó sin abandonos.
- `hit_rate` es la proporción de disparos del jugador que tocaron un barco.
- `rejected` lista los jugadores que no se pudieron admitir, con el motivo.

En la CI, `tournament.yml` vuelve a jugar el torneo cuando cambian `src/` o `players/`
en `main` y hace commit de la clasificación. `pages.yml` la publica junto con la web.
