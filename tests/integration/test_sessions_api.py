from fastapi.testclient import TestClient


def test_create_session_returns_datasets(client: TestClient):
    response = client.post("/sessions")
    assert response.status_code == 200
    body = response.json()
    assert "session_id" in body
    assert isinstance(body["datasets"], list)
    assert len(body["datasets"]) > 0


def test_get_session(client: TestClient):
    created = client.post("/sessions").json()
    response = client.get(f"/sessions/{created['session_id']}")
    assert response.status_code == 200
    assert response.json()["message_count"] == 0


def test_delete_session(client: TestClient):
    created = client.post("/sessions").json()
    response = client.delete(f"/sessions/{created['session_id']}")
    assert response.status_code == 204
    assert client.get(f"/sessions/{created['session_id']}").status_code == 404


def test_health(client: TestClient):
    assert client.get("/health").json() == {"status": "ok"}
