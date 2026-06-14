"""FastAPI application entry point."""

from dotenv import load_dotenv

# Load .env before any route creates the PydanticAI agent (API keys, MODEL, etc.).
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import artifacts, chat, sessions


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    app = FastAPI(
        title="Data Analysis Agent API",
        description="SSE-streaming API for the PydanticAI data analysis agent.",
        version="0.1.0",
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

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
