"""Load admitted players from manifests and check their identity.

Loading reads each player's identity through classmethods only; no player is constructed
here. Construction happens in the tournament through ``Player.create(seed)``.
"""

from __future__ import annotations

import importlib.util
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from battleship.manifest import MANIFEST_NAME, ManifestEntry, ManifestError, read_manifest
from battleship.player import Player

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,31}$")
PLAYER_GROUPS = ("builtin", "custom")


class RegistryError(ValueError):
    """A player cannot be loaded or has an invalid identity."""


@dataclass(frozen=True)
class PlayerInfo:
    name: str
    authors: list[str]
    description: str
    icon: str
    cls: type[Player]
    source: str  # e.g. "builtin/random_bot.py"
    entry: ManifestEntry | None = None  # where to re-import it from (e.g. in a subprocess)

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "authors": list(self.authors),
            "description": self.description,
            "icon": self.icon,
            "source": self.source,
        }


def default_manifests(root: str | Path) -> list[Path]:
    """``players/builtin/players.yaml`` and ``players/custom/players.yaml`` under ``root``."""
    return [Path(root) / "players" / group / MANIFEST_NAME for group in PLAYER_GROUPS]


def load_class(entry: ManifestEntry) -> type[Player]:
    """Import ``entry``'s file under a unique module name and return its Player class."""
    module_name = f"battleship_players.{entry.path.parent.name}.{entry.path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, entry.path)
    if spec is None or spec.loader is None:
        raise RegistryError(f"{entry.source}: cannot import")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        del sys.modules[module_name]
        raise RegistryError(f"{entry.source}: import failed: {exc!r}") from exc
    cls = getattr(module, entry.class_name, None)
    if not (isinstance(cls, type) and issubclass(cls, Player)):
        raise RegistryError(f"{entry.source}: {entry.class_name} is not a Player subclass")
    return cls


def _is_icon(value: object) -> bool:
    # Loose "one emoji" check: short, non-ASCII, no spaces (allows ZWJ/variation sequences).
    return (
        isinstance(value, str)
        and 1 <= len(value) <= 8
        and all(ord(ch) > 0x7F and not ch.isspace() for ch in value)
    )


def player_info(cls: type[Player], source: str, entry: ManifestEntry | None = None) -> PlayerInfo:
    """Read and validate ``cls``'s identity without constructing it."""
    try:
        name = cls.get_name()
        authors = cls.get_authors()
        description = cls.get_description()
        icon = cls.get_icon()
    except Exception as exc:
        raise RegistryError(f"{source}: identity classmethods failed: {exc!r}") from exc
    if not isinstance(name, str) or not NAME_RE.match(name):
        raise RegistryError(f"{source}: invalid name {name!r} (letters, digits, ' _.-', <=32)")
    if (
        not isinstance(authors, list)
        or not authors
        or not all(isinstance(a, str) and a.strip() for a in authors)
    ):
        raise RegistryError(f"{source}: get_authors() must return a non-empty list of names")
    if not isinstance(description, str):
        raise RegistryError(f"{source}: get_description() must return a string")
    if not _is_icon(icon):
        raise RegistryError(f"{source}: get_icon() must return a single emoji, got {icon!r}")
    return PlayerInfo(name, list(authors), description, icon, cls, source, entry)


def load_players(
    manifests: Iterable[str | Path], rejected: list[dict[str, str]] | None = None
) -> list[PlayerInfo]:
    """Every player admitted by ``manifests``, in manifest order. Names must be unique.

    By default the first problem raises. If a ``rejected`` list is given, broken players
    (or whole broken manifests) are appended to it as ``{"source", "error"}`` and skipped,
    so one bad submission cannot stop a tournament.
    """
    players: list[PlayerInfo] = []
    by_name: dict[str, PlayerInfo] = {}
    for manifest in manifests:
        try:
            entries = read_manifest(manifest)
        except ManifestError as exc:
            if rejected is None:
                raise
            path = Path(manifest)
            rejected.append({"source": f"{path.parent.name}/{path.name}", "error": str(exc)})
            continue
        for entry in entries:
            try:
                info = player_info(load_class(entry), entry.source, entry)
                taken = by_name.get(info.name)
                if taken:
                    raise RegistryError(
                        f"{entry.source}: name {info.name!r} already used by {taken.source}"
                    )
            except RegistryError as exc:
                if rejected is None:
                    raise
                rejected.append({"source": entry.source, "error": str(exc)})
                continue
            by_name[info.name] = info
            players.append(info)
    return players
