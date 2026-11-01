# Torneo

```bash
battleship-tournament [--format league|simple] [--games 20] [--seed 0]
                      [--size 10] [--fleet 5,4,3,3,2]
                      [--time-budget 2] [--build-budget 2]
                      [--jobs 4] [--no-subprocess] [--output results/leaderboard.json]
```

## Formato

- **Liguilla (todos contra todos):** cada pareja de jugadores admitidos juega `--games`
  partidas (20 por defecto).
- **Parejas espejo:** las partidas `2k` y `2k+1` de una pareja usan las mismas semillas
  (y, por tanto, las mismas flotas para los bots con semilla), y cada jugador empieza una vez.
- **Reproducible:** las semillas de cada partida dependen solo de la semilla del torneo y
  de los dos nombres. Añadir un jugador nuevo no cambia las partidas entre los demás.
- **Clasificación:**
    - `league` (por defecto) ordena por **Elo**. Todos empiezan en 1500, K = 32, y las
      partidas se procesan en el orden del calendario.
    - `simple` ordena por **puntos**: 1 por victoria, ½ por empate.
    - Los empates se deshacen por menos abandonos y después por nombre.

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
  "config": {"games_per_pair": 20, "seed": 0, "size": 10, "fleet": [5,4,3,3,2], ...},
  "standings": [
    {"rank": 1, "name": "hard", "icon": "🧠", "elo": 1767.8, "points": 70.0,
     "played": 80, "wins": 70, "losses": 10, "draws": 0, "forfeits": 0,
     "forfeit_reasons": {}, "wins_first": 36, "wins_second": 34,
     "avg_shots_to_win": 36.6, "hit_rate": 0.452, ...}
  ],
  "pairs": [{"a": "easy", "b": "hard", "wins_a": 0, "wins_b": 20, "draws": 0}],
  "rejected": [],
  "generated_at": "2026-11-01T12:00:00+00:00"
}
```

- `avg_shots_to_win` es la media de disparos del jugador en las partidas que ganó sin abandonos.
- `hit_rate` es la proporción de disparos del jugador que tocaron un barco.
- `rejected` lista los jugadores que no se pudieron admitir, con el motivo.

En la CI, `tournament.yml` vuelve a jugar el torneo cuando cambian `src/` o `players/`
en `main` y hace commit de la clasificación. `pages.yml` la publica junto con la web.
