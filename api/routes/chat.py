from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from agent.context import AgentContext
from api.dependencies import get_agent_factory, get_artifact_store, get_session_store
from api.exceptions import SessionNotFoundError, StreamBusyError
from api.schemas import ChatRequest
from api.services.artifact_store import ArtifactStore
from api.services.chat_service import ChatService
from api.services.session_store import SessionStore
from pydantic_ai import Agent

router = APIRouter(tags=["Chat"])


@router.post(
    "/sessions/{session_id}/chat",
    summary="Stream an agent response",
    description=(
        "Send a user prompt to an existing session and receive transcript updates "
        "as server-sent events. The stream can include run status, thinking text, "
        "tool activity, final answer text, and generated artifact references."
    ),
    responses={
        200: {
            "description": "Server-sent event stream of transcript updates.",
            "content": {
                "text/event-stream": {
                    "schema": {
                        "type": "string",
                        "description": "SSE frames containing typed transcript events.",
                    }
                }
            },
        },
        404: {"description": "Session not found."},
        409: {"description": "A response stream is already active for this session."},
    },
)
async def chat(
    session_id: str,
    body: ChatRequest,
    session_store: SessionStore = Depends(get_session_store),
    artifact_store: ArtifactStore = Depends(get_artifact_store),
    agent_factory: Callable[[str], Agent[AgentContext]] = Depends(get_agent_factory),
):
    """Send a user message and receive an SSE stream of agent events."""
    try:
        session = await session_store.acquire_stream(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found") from None
    except StreamBusyError:
        raise HTTPException(status_code=409, detail="Stream already active") from None

    agent = agent_factory(session.context.dataset_info)
    service = ChatService(session_store, artifact_store)

    async def event_generator():
        async for chunk in service.stream_chat(session_id, body.message, agent=agent):
            yield chunk

    return StreamingResponse(event_generator(), media_type="text/event-stream")
