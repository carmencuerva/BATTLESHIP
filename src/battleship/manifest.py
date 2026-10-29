"""Read ``players.yaml`` manifests: the explicit list of admitted players.

Players are admitted by manifest, never by scanning folders, so a reviewer sees the new
``.py`` and the line that admits it in the same pull request. Format::

    players:
      - file: random_bot.py     # a .py file in the same folder as the manifest
        class: RandomBot        # the Player subclass inside it
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

MANIFEST_NAME = "players.yaml"


class ManifestError(ValueError):
    """A manifest is malformed or points at something that does not exist."""


@dataclass(frozen=True)
class ManifestEntry:
    path: Path  # absolute path of the player's .py file
    class_name: str

    @property
    def source(self) -> str:
        """Short, stable label such as ``builtin/random_bot.py``."""
        return f"{self.path.parent.name}/{self.path.name}"


def read_manifest(manifest_path: str | Path) -> list[ManifestEntry]:
    manifest_path = Path(manifest_path).resolve()
    try:
        data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ManifestError(f"{manifest_path}: cannot read manifest: {exc}") from exc
    if not isinstance(data, dict) or set(data) != {"players"}:
        raise ManifestError(f"{manifest_path}: expected a single top-level 'players' key")
    items = data["players"] or []
    if not isinstance(items, list):
        raise ManifestError(f"{manifest_path}: 'players' must be a list")

    entries: list[ManifestEntry] = []
    seen: set[tuple[str, str]] = set()
    for i, item in enumerate(items):
        where = f"{manifest_path}: entry {i}"
        if not isinstance(item, dict) or set(item) != {"file", "class"}:
            raise ManifestError(f"{where}: expected exactly the keys 'file' and 'class'")
        file, class_name = item["file"], item["class"]
        if not isinstance(file, str) or Path(file).name != file or not file.endswith(".py"):
            raise ManifestError(f"{where}: 'file' must be a .py file name in the same folder")
        if not isinstance(class_name, str) or not class_name.isidentifier():
            raise ManifestError(f"{where}: 'class' must be a Python class name")
        if (file, class_name) in seen:
            raise ManifestError(f"{where}: {file}:{class_name} is listed twice")
        seen.add((file, class_name))
        path = manifest_path.parent / file
        if not path.is_file():
            raise ManifestError(f"{where}: {file} does not exist")
        entries.append(ManifestEntry(path=path, class_name=class_name))
    return entries
