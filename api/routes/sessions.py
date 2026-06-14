from fastapi import APIRouter, Depends, HTTPException, Response, status

from api.dependencies import get_session_store
from api.schemas import CreateSessionResponse, DatasetInfo, SessionDetailResponse
from api.services.dataset_loader import load_datasets
from api.services.session_store import SessionStore

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse)
async def create_session(store: SessionStore = Depends(get_session_store)):
    """Create a new chat session with datasets loaded from data/."""
    datasets, dataset_info = load_datasets()
    session = await store.create(datasets, dataset_info)
    return CreateSessionResponse(
        session_id=session.id,
        datasets=[
            DatasetInfo(name=name, rows=len(df), columns=list(df.columns))
            for name, df in datasets.items()
        ],
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
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


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str, store: SessionStore = Depends(get_session_store)):
    """Delete a session and free in-memory state."""
    if not await store.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
