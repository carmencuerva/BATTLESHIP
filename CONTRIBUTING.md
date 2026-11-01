# Contributing · Contribuir

*English below · [Español más abajo](#espanol)*

## Adding a bot

1. Fork the repository and create a branch.
2. Add **one file** under `players/custom/`, for example `players/custom/my_bot.py`, with
   one subclass of `battleship.player.Player`. The guide is in
   [docs/write-a-bot.md](docs/write-a-bot.md).
3. Add its entry to `players/custom/players.yaml`:

    ```yaml
    players:
      - file: my_bot.py
        class: MyBot
    ```

4. Check it locally:

    ```bash
    pip install -e ".[dev]"
    python scripts/check_players.py
    ```

5. Open a pull request. The `custom-players` workflow runs the same check. A bot pull
   request should only touch `players/custom/`.

A bot is accepted when:

- its name is unique;
- it loads without errors;
- it plays the short check tournament without a single forfeit;
- it respects the time budget of 2 s per game;
- it does not read files, use the network or look at anything other than the view it is given.

## Changing the engine, the tournament or the web

- Keep the rules in Python (`battleship.game`). The web only draws what `webglue.py`
  returns, and only plain JSON crosses between them.
- Engine functions stay pure: they never mutate their arguments.
- Before pushing, run:

    ```bash
    ruff check . && ruff format --check . && mypy && pytest
    ```

- For changes to `web/`, also run the JavaScript tests (needs Node 18 or newer):

    ```bash
    python scripts/build_web.py
    npm install
    npm test
    npm run smoke
    ```

- Write code and comments in English. User-facing text goes in both languages: `web/js/i18n.js` and
  `docs/*.md` + `docs/*.es.md`.

---

<a id="espanol"></a>

## Añadir un bot

1. Haz un fork del repositorio y crea una rama.
2. Añade **un fichero** en `players/custom/`, por ejemplo `players/custom/mi_bot.py`, con
   una subclase de `battleship.player.Player`. La guía está en
   [docs/write-a-bot.es.md](docs/write-a-bot.es.md).
3. Añade su entrada en `players/custom/players.yaml`:

    ```yaml
    players:
      - file: mi_bot.py
        class: MiBot
    ```

4. Compruébalo en local:

    ```bash
    pip install -e ".[dev]"
    python scripts/check_players.py
    ```

5. Abre un pull request. El workflow `custom-players` hace la misma comprobación. Un pull
   request de un bot solo debe tocar `players/custom/`.

Un bot se acepta si:

- su nombre es único;
- carga sin errores;
- juega el torneo corto de comprobación sin ningún abandono;
- respeta el límite de 2 s por partida;
- no lee ficheros, no usa la red y no mira nada más que la vista que recibe.

## Cambiar el motor, el torneo o la web

- Las reglas se quedan en Python (`battleship.game`). La web solo dibuja lo que devuelve
  `webglue.py`, y entre ambos solo cruza JSON plano.
- Las funciones del motor siguen siendo puras: nunca modifican sus argumentos.
- Antes de subir cambios, ejecuta:

    ```bash
    ruff check . && ruff format --check . && mypy && pytest
    ```

- Si cambias `web/`, ejecuta también los tests de JavaScript (necesitas Node 18 o superior):

    ```bash
    python scripts/build_web.py
    npm install
    npm test
    npm run smoke
    ```

- Escribe el código y los comentarios en inglés. Los textos que ve el usuario van en los dos idiomas:
  `web/js/i18n.js` y `docs/*.md` + `docs/*.es.md`.
