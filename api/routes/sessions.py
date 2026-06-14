import asyncio

from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.dependencies import get_session_store
from api.schemas import CreateSessionResponse, DatasetInfo, SessionDetailResponse
from api.services.dataset_loader import load_datasets
from api.services.session_store import SessionStore

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post(
    "",
    response_model=CreateSessionResponse,
    summary="Create a chat session",
    description=(
        "Load the available CSV datasets from the data directory and create an "
        "in-memory chat session that can be used for follow-up analysis prompts."
    ),
    response_description="Session created with loaded dataset metadata.",
)
async def create_session(store: SessionStore = Depends(get_session_store)):
    """Create a new chat session with datasets loaded from data/."""
    datasets, dataset_info = await asyncio.to_thread(load_datasets)
    session = await store.create(datasets, dataset_info)
    return CreateSessionResponse(
        session_id=session.id,
        datasets=[
            DatasetInfo(name=name, rows=len(df), columns=list(df.columns))
            for name, df in datasets.items()
        ],
    )


@router.get(
    "/{session_id}",
    response_model=SessionDetailResponse,
    summary="Get session details",
    description=(
        "Return dataset metadata, stored conversation count, and streaming state "
        "for an existing chat session."
    ),
    response_description="Session metadata.",
    responses={404: {"description": "Session not found."}},
)
async def get_session(session_id: str, store: SessionStore = Depends(get_session_store)):
    """Return session metadata for debugging and UI state."""
    session = await store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetailResponse(
        session_id=session.id,
        datasets=[
            DatasetInfo(name=n, rows=len(df), columns=list(df.columns))
            for n, df in session.context.datasets.items()
        ],
        message_count=len(session.message_history),
        is_streaming=session.is_streaming,
    )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session",
    description="Delete an in-memory chat session and release its loaded datasets.",
    responses={
        204: {"description": "Session deleted."},
        404: {"description": "Session not found."},
    },
)
async def delete_session(session_id: str, store: SessionStore = Depends(get_session_store)):
    """Delete a session and free in-memory state."""
    if not await store.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
