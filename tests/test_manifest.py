import pytest

from battleship.manifest import ManifestError, read_manifest


def write(tmp_path, manifest, files=("bot.py",)):
    for name in files:
        (tmp_path / name).write_text("", encoding="utf-8")
    path = tmp_path / "players.yaml"
    path.write_text(manifest, encoding="utf-8")
    return path


def test_reads_entries_in_order(tmp_path):
    path = write(
        tmp_path,
        "players:\n  - {file: b.py, class: B}\n  - {file: a.py, class: A}\n",
        files=("a.py", "b.py"),
    )
    entries = read_manifest(path)
    assert [(e.path.name, e.class_name) for e in entries] == [("b.py", "B"), ("a.py", "A")]
    assert entries[0].path == (tmp_path / "b.py").resolve()
    assert entries[0].source == f"{tmp_path.name}/b.py"


@pytest.mark.parametrize("manifest", ["players: []\n", "players:\n"])
def test_empty_manifest(tmp_path, manifest):
    assert read_manifest(write(tmp_path, manifest)) == []


@pytest.mark.parametrize(
    "manifest, fragment",
    [
        ("- {file: bot.py, class: Bot}\n", "top-level"),
        ("players: []\nextra: 1\n", "top-level"),
        ("players: {file: bot.py}\n", "must be a list"),
        ("players:\n  - {file: bot.py}\n", "exactly the keys"),
        ("players:\n  - {file: bot.py, class: Bot, x: 1}\n", "exactly the keys"),
        ("players:\n  - {file: ../bot.py, class: Bot}\n", "same folder"),
        ("players:\n  - {file: sub/bot.py, class: Bot}\n", "same folder"),
        ("players:\n  - {file: bot.txt, class: Bot}\n", "same folder"),
        ("players:\n  - {file: bot.py, class: 'not valid'}\n", "class name"),
        ("players:\n  - {file: missing.py, class: Bot}\n", "does not exist"),
        ("players:\n  - {file: bot.py, class: Bot}\n  - {file: bot.py, class: Bot}\n", "twice"),
        ("players: [\n", "cannot read"),
    ],
)
def test_invalid_manifests(tmp_path, manifest, fragment):
    with pytest.raises(ManifestError, match=fragment):
        read_manifest(write(tmp_path, manifest))


def test_missing_manifest_file(tmp_path):
    with pytest.raises(ManifestError, match="cannot read"):
        read_manifest(tmp_path / "players.yaml")
