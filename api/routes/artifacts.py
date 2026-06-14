from fastapi import APIRouter, Depends, HTTPException, Response

from api.dependencies import get_artifact_store
from api.exceptions import ArtifactGoneError, ArtifactNotFoundError
from api.services.artifact_store import ArtifactStore

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

_CONTENT_TYPES = {"figure": "text/html", "table": "text/csv"}


@router.get("/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    store: ArtifactStore = Depends(get_artifact_store),
):
    """Return HTML figure or CSV table content for a visualization artifact."""
    try:
        artifact = store.get(artifact_id)
        content = store.read_content(artifact_id)
    except ArtifactNotFoundError:
        raise HTTPException(status_code=404, detail="Artifact not found") from None
    except ArtifactGoneError:
        raise HTTPException(status_code=410, detail="Artifact file no longer available") from None

    return Response(
        content=content,
        media_type=_CONTENT_TYPES.get(artifact.type, "application/octet-stream"),
    )
