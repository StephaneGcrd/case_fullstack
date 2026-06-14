"""FastAPI application entry point."""

from dotenv import load_dotenv

# Load .env before any route creates the PydanticAI agent (API keys, MODEL, etc.).
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import artifacts, chat, sessions
from api.schemas import HealthResponse


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title="Data Analysis Agent API",
        summary="API for dataset-backed data-analysis conversations.",
        description=(
            "Create chat sessions over local datasets, deliver streaming responses as "
            "server-sent events, and retrieve generated table or figure artifacts."
        ),
        version="0.1.0",
        contact={
            "name": "Data Analysis Agent maintainers",
        },
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict in production
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(sessions.router)
    app.include_router(chat.router)
    app.include_router(artifacts.router)

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Check API health",
        response_description="API health status.",
    )
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    return app


app = create_app()
