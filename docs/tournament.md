# Tournament

```bash
battleship-tournament [--format league|simple|championship] [--games 100] [--seed 0]
                      [--knockout-games 10] [--top 4]
                      [--size 10] [--fleet 5,4,3,3,2]
                      [--time-budget 2] [--build-budget 2]
                      [--jobs 4] [--no-subprocess] [--output results/leaderboard.json]
```

## Format

- **Round-robin:** every pair of admitted players plays `--games` games (100 by default; with fewer, the order between close players is largely luck).
- **Mirrored pairs:** games `2k` and `2k+1` of a pair use the same seeds (so the same fleets
  for seeded bots), and each player shoots first once.
- **Reproducible:** each game's seeds depend only on the tournament seed and the two names.
  Adding a new player does not change the games between the others.
- **Ranking:**
    - `league` (default) sorts by an **Elo-scale rating** fitted to all the games at once
      (the maximum-likelihood fit of the Elo model, also called Bradley-Terry; see
      `src/battleship/elo.py`). 400 points of difference mean 10-to-1 odds; the mean is
      1500. Unlike updating Elo game by game, it does not depend on the order of the games,
      and in a round robin more points always means a higher rating.
    - `simple` sorts by **points**: 1 per win, ½ per draw.
    - Ties go to fewer forfeits, then the name.

## Championship

`--format championship` plays the league first, then a knockout between the best
`--top` players (4 by default; always a power of two that fits the field).

- **Bracket:** seeded by league position so that 1st and 2nd can only meet in the final
  (with 4: 1st v 4th and 2nd v 3rd in the semi-finals).
- **Matches:** each knockout match is `--knockout-games` games (10 by default), again in
  mirrored pairs with their own seeds. A drawn match goes to the better league position.
- **Final ranking:** the champion first, then the finalist, then everyone else by how far
  they got in the bracket and, after that, by league position. Each row keeps its
  `league_rank`. The statistics in the table come from the league games only.
- The leaderboard gains a `knockout` section: `{"size", "games_per_match", "rounds":
  [{"name", "matches": [{"a", "b", "wins_a", "wins_b", "draws", "winner"}]}],
  "champion"}`.

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

- `avg_shots_to_win` averages the shots the player fired in the games it won without a forfeit.
- `hit_rate` is the share of the player's shots that hit.
- `rejected` lists the players that could not be admitted, with the reason.

In CI, `tournament.yml` replays the tournament when `src/` or `players/` change on
`main`, and commits the leaderboard. `pages.yml` publishes it with the web page.
