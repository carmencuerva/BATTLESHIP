# Battleship Arena

Battleship engine, bot API and automatic tournament. The same Python code runs the
tournament in CI and the game in the browser (Pyodide).

Work in progress. See `src/battleship/game.py` for the rules engine.

```bash
python -m venv .venv
.venv/Scripts/activate      # Windows; on Linux/macOS: source .venv/bin/activate
pip install -e ".[dev]"
pytest
```
