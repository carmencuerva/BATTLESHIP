# Tournament

```bash
battleship-tournament [--format league|simple] [--games 20] [--seed 0]
                      [--size 10] [--fleet 5,4,3,3,2]
                      [--time-budget 2] [--build-budget 2]
                      [--jobs 4] [--no-subprocess] [--output results/leaderboard.json]
```

## Format

- **Round-robin:** every pair of admitted players plays `--games` games (20 by default).
- **Mirrored pairs:** games `2k` and `2k+1` of a pair use the same seeds (so the same fleets
  for seeded bots), and each player shoots first once.
- **Reproducible:** each game's seeds depend only on the tournament seed and the two names.
  Adding a new player does not change the games between the others.
- **Ranking:**
    - `league` (default) sorts by **Elo**. Everyone starts at 1500, K = 32, and the games
      are processed in schedule order.
    - `simple` sorts by **points**: 1 per win, ½ per draw.
    - Ties go to fewer forfeits, then the name.

## Isolation and forfeits

Every game runs in its own process. Before each call to a bot, the game tells the
tournament how much time that bot has left. If the bot goes silent for longer, its
process is killed and the bot loses the game. That covers infinite loops too.

| reason | when |
|--------|------|
| `forfeit_build_error` / `forfeit_build_timeout` | `create()` raised / took too long |
| `forfeit_bad_placement` | an illegal or non-JSON placement |
| `forfeit_error` | an exception in `choose_placement` or `choose_shot` (or the process died) |
| `forfeit_illegal` | a shot off the board or repeated |
| `forfeit_timeout` | the 2 s budget per game was used up |

If both bots fail while building or placing, the game is a draw.

## The leaderboard

`results/leaderboard.json` has this structure:

```json
{
  "format": "league",
  "config": {"games_per_pair": 20, "seed": 0, "size": 10, "fleet": [5,4,3,3,2], ...},
  "standings": [
    {"rank": 1, "name": "hard", "icon": "🧠", "elo": 1752.2, "points": 55.0,
     "played": 60, "wins": 55, "losses": 5, "draws": 0, "forfeits": 0,
     "forfeit_reasons": {}, "wins_first": 28, "wins_second": 27,
     "avg_shots_to_win": 37.2, "hit_rate": 0.448, ...}
  ],
  "pairs": [{"a": "easy", "b": "hard", "wins_a": 0, "wins_b": 20, "draws": 0}],
  "rejected": [],
  "generated_at": "2026-11-01T12:00:00+00:00"
}
```

- `avg_shots_to_win` averages the shots the player fired in the games it won without a forfeit.
- `hit_rate` is the share of the player's shots that hit.
- `rejected` lists the players that could not be admitted, with the reason.

In CI, `tournament.yml` replays the tournament when `src/` or `players/` change on
`main`, and commits the leaderboard. `pages.yml` publishes it with the web page.
