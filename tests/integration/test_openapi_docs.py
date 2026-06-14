from fastapi.testclient import TestClient


def test_openapi_schema_documents_public_api(client: TestClient):
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()

    assert schema["info"]["title"] == "Data Analysis Agent API"
    assert "chat sessions" in schema["info"]["description"]
    assert "streaming responses" in schema["info"]["description"]
    assert "artifacts" in schema["info"]["description"]

    create_session = schema["paths"]["/sessions"]["post"]
    assert create_session["tags"] == ["Sessions"]
    assert create_session["summary"] == "Create a chat session"
    assert create_session["responses"]["200"]["description"] == (
        "Session created with loaded dataset metadata."
    )

    chat = schema["paths"]["/sessions/{session_id}/chat"]["post"]
    assert chat["tags"] == ["Chat"]
    assert chat["summary"] == "Stream an agent response"
    assert chat["responses"]["200"]["description"] == (
        "Server-sent event stream of transcript updates."
    )
    assert "404" in chat["responses"]
    assert "409" in chat["responses"]

    artifact = schema["paths"]["/artifacts/{artifact_id}"]["get"]
    assert artifact["tags"] == ["Artifacts"]
    assert artifact["summary"] == "Fetch a generated artifact"
    assert artifact["responses"]["200"]["description"] == (
        "Generated artifact content, either CSV data or an HTML figure."
    )
    assert "410" in artifact["responses"]

    dataset_schema = schema["components"]["schemas"]["DatasetInfo"]["properties"]
    assert dataset_schema["name"]["description"] == "Dataset filename loaded into the session."
    assert dataset_schema["rows"]["description"] == "Number of rows available in the dataset."
    assert dataset_schema["columns"]["description"] == "Column names available in the dataset."

    chat_request = schema["components"]["schemas"]["ChatRequest"]["properties"]["message"]
    assert chat_request["description"] == "User prompt to send to the data-analysis agent."
