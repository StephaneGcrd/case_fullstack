from pathlib import Path

import pytest

from api.exceptions import ArtifactAccessDeniedError, ArtifactGoneError, ArtifactNotFoundError
from api.services.artifact_store import InMemoryArtifactStore


@pytest.fixture
def store(tmp_path: Path, monkeypatch) -> InMemoryArtifactStore:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "output").mkdir()
    return InMemoryArtifactStore()


def test_register_returns_artifact_id(store, tmp_path: Path):
    filepath = tmp_path / "output" / "chart.html"
    filepath.write_text("<html>plot</html>")
    artifact_id = store.register(
        filepath=filepath,
        title="Price Chart",
        artifact_type="figure",
        session_id="sess-1",
    )
    assert artifact_id
    artifact = store.get(artifact_id)
    assert artifact is not None
    assert artifact.title == "Price Chart"
    assert artifact.type == "figure"


def test_read_content_returns_bytes(store, tmp_path: Path):
    filepath = tmp_path / "output" / "data.csv"
    filepath.write_text("a,b\n1,2")
    artifact_id = store.register(filepath, "Table", "table", "sess-1")
    content = store.read_content(artifact_id)
    assert content == b"a,b\n1,2"


def test_get_unknown_raises(store):
    with pytest.raises(ArtifactNotFoundError):
        store.get("missing")


def test_read_content_missing_file_raises(store, tmp_path: Path):
    filepath = tmp_path / "output" / "gone.html"
    filepath.write_text("x")
    artifact_id = store.register(filepath, "Chart", "figure", "sess-1")
    filepath.unlink()
    with pytest.raises(ArtifactGoneError):
        store.read_content(artifact_id)


def test_parse_visualize_tool_result(store, tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    output_dir = tmp_path / "output"
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / "price_distribution.html"
    filepath.write_text("<html></html>")
    content = "Figure created: Price Distribution\nSaved to: output/price_distribution.html\n"
    artifact_id = store.register_from_tool_result(
        content=content,
        title="Price Distribution",
        artifact_type="figure",
        session_id="sess-1",
    )
    assert artifact_id is not None
    assert store.get(artifact_id).filepath.resolve() == filepath.resolve()


def test_register_rejects_path_outside_output_dir(store, tmp_path: Path):
    filepath = tmp_path / "outside.html"
    filepath.write_text("<html></html>")
    with pytest.raises(ArtifactAccessDeniedError):
        store.register(filepath, "Chart", "figure", "sess-1")


def test_read_content_rejects_path_outside_output_dir(store, tmp_path: Path):
    filepath = tmp_path / "output" / "chart.html"
    filepath.write_text("<html></html>")
    artifact_id = store.register(filepath, "Chart", "figure", "sess-1")
    store._artifacts[artifact_id].filepath = tmp_path / "outside.html"
    (tmp_path / "outside.html").write_text("secret")
    with pytest.raises(ArtifactAccessDeniedError):
        store.read_content(artifact_id)
