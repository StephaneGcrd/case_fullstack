from fastapi.testclient import TestClient


def test_get_artifact_returns_html(client: TestClient, artifact_store, tmp_path):
    filepath = tmp_path / "output" / "chart.html"
    filepath.write_text("<html>plot</html>")
    artifact_id = artifact_store.register(filepath, "Chart", "figure", "s1")

    response = client.get(f"/artifacts/{artifact_id}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert b"plot" in response.content


def test_get_unknown_artifact_404(client: TestClient):
    assert client.get("/artifacts/missing").status_code == 404
