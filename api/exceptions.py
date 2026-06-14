"""Domain exceptions mapped to HTTP status codes in route handlers."""


class SessionNotFoundError(Exception):
    """Raised when a session_id does not exist. Maps to HTTP 404."""


class StreamBusyError(Exception):
    """Raised when a chat stream is already active. Maps to HTTP 409."""


class ArtifactNotFoundError(Exception):
    """Raised when an artifact_id does not exist. Maps to HTTP 404."""


class ArtifactGoneError(Exception):
    """Raised when artifact metadata exists but file is missing. Maps to HTTP 410."""


class ArtifactAccessDeniedError(Exception):
    """Raised when an artifact filepath is outside the trusted output directory. Maps to HTTP 403."""
