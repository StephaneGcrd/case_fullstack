"""Register and serve visualization artifacts produced by the visualize tool."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Protocol

from api.exceptions import ArtifactAccessDeniedError, ArtifactGoneError, ArtifactNotFoundError

ArtifactType = Literal["figure", "table"]

# visualize.py returns "Saved to: output/<filename>"
_SAVED_TO_PATTERN = re.compile(r"Saved to:\s*(.+)", re.MULTILINE)


def resolve_artifact_type(filepath: Path, declared: ArtifactType) -> ArtifactType:
    """Prefer the file extension over tool args when they disagree."""
    suffix = filepath.suffix.lower()
    if suffix == ".csv":
        return "table"
    if suffix in {".html", ".htm"}:
        return "figure"
    return declared


@dataclass
class Artifact:
    id: str
    filepath: Path
    title: str
    type: ArtifactType
    session_id: str
    created_at: datetime


class ArtifactStore(Protocol):
    def register(
        self,
        filepath: Path,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str: ...
    def register_from_tool_result(
        self,
        content: str,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str | None: ...
    def get(self, artifact_id: str) -> Artifact: ...
    def read_content(self, artifact_id: str) -> bytes: ...


class InMemoryArtifactStore:
    """In-memory artifact registry pointing to files on disk."""

    def __init__(self, output_dir: str | Path = "output") -> None:
        self._output_dir = Path(output_dir).resolve()
        self._artifacts: dict[str, Artifact] = {}

    def _validate_filepath(self, filepath: Path) -> Path:
        resolved = filepath.resolve()
        try:
            resolved.relative_to(self._output_dir)
        except ValueError:
            raise ArtifactAccessDeniedError(str(resolved)) from None
        return resolved

    def register(
        self,
        filepath: Path,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str:
        filepath = self._validate_filepath(filepath)
        resolved_type = resolve_artifact_type(filepath, artifact_type)
        artifact_id = str(uuid.uuid4())
        self._artifacts[artifact_id] = Artifact(
            id=artifact_id,
            filepath=filepath,
            title=title,
            type=resolved_type,
            session_id=session_id,
            created_at=datetime.now(timezone.utc),
        )
        return artifact_id

    def register_from_tool_result(
        self,
        content: str,
        title: str,
        artifact_type: ArtifactType,
        session_id: str,
    ) -> str | None:
        match = _SAVED_TO_PATTERN.search(content)
        if not match:
            return None
        filepath = Path(match.group(1).strip()).resolve()
        if not filepath.exists():
            return None
        return self.register(filepath, title, artifact_type, session_id)

    def get(self, artifact_id: str) -> Artifact:
        artifact = self._artifacts.get(artifact_id)
        if artifact is None:
            raise ArtifactNotFoundError(artifact_id)
        return artifact

    def read_content(self, artifact_id: str) -> bytes:
        artifact = self.get(artifact_id)
        filepath = self._validate_filepath(artifact.filepath)
        if not filepath.exists():
            raise ArtifactGoneError(artifact_id)
        return filepath.read_bytes()
