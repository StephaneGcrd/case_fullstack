from fastapi import APIRouter, Depends, HTTPException, Response

from api.dependencies import get_artifact_store
from api.exceptions import ArtifactAccessDeniedError, ArtifactGoneError, ArtifactNotFoundError
from api.services.artifact_store import ArtifactStore

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

_CONTENT_TYPES = {"figure": "text/html", "table": "text/csv"}

_FIGURE_RESIZE_SCRIPT = """
<script>
(function () {
  function sendHeight() {
    var height = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );
    if (window.parent !== window) {
      window.parent.postMessage({ type: "figure-artifact-resize", height: height }, "*");
    }
  }

  window.addEventListener("load", sendHeight);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(sendHeight).observe(document.documentElement);
  }
  [100, 500, 1500].forEach(function (delay) {
    window.setTimeout(sendHeight, delay);
  });
})();
</script>
"""


_RESIZE_MARKER = b"figure-artifact-resize"
_BODY_END = b"</body>"
_RESIZE_SCRIPT_BYTES = _FIGURE_RESIZE_SCRIPT.encode("utf-8")


def _inject_figure_resize_script(content: bytes) -> bytes:
    if _RESIZE_MARKER in content:
        return content
    if _BODY_END in content:
        return content.replace(_BODY_END, _RESIZE_SCRIPT_BYTES + _BODY_END, 1)
    return content + _RESIZE_SCRIPT_BYTES


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
    except ArtifactAccessDeniedError:
        raise HTTPException(status_code=403, detail="Artifact access denied") from None

    if artifact.type == "figure":
        content = _inject_figure_resize_script(content)

    return Response(
        content=content,
        media_type=_CONTENT_TYPES.get(artifact.type, "application/octet-stream"),
    )
