# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

This repo turns a PydanticAI data-analysis CLI agent into a full-stack web app.

- `agent/` contains the PydanticAI agent, prompt, runtime context, and tools for DuckDB queries and Plotly visualizations.
- `api/` contains the FastAPI backend, including SSE streaming, routes, schemas, services, and artifact/session storage.
- `web/` contains the Vite React frontend for chat, streaming transcript segments, tables, and visualizations.
- `tests/` contains pytest unit and integration tests for the backend.
- `data/` and `output/` are mounted into Docker containers for input CSVs and generated artifacts.

## Common Commands

- Start the API with Docker: `docker compose up api`
- Start the CLI agent with Docker: `docker compose run --rm agent`
- Start the frontend: `cd web && npm run dev`
- Build the frontend: `cd web && npm run build`
- Run backend tests: `pytest`
- Run a focused backend test file: `pytest tests/path/to/test_file.py`
- Run the API without Docker: `uvicorn api.main:app --reload --port 8000`

The API is served at `http://localhost:8000`; Swagger is available at `/docs`.

## Working Practices

- Keep backend changes aligned with the existing FastAPI route/service/schema split.
- Keep frontend changes aligned with the existing component and `segment-views` structure.
- Preserve streaming behavior. Transcript events should remain renderable progressively as SSE messages arrive.
- Prefer extending existing artifact/session abstractions over adding parallel storage or fetch paths.
- Do not commit secrets or local `.env` values. Use `.env.example` as the public configuration reference.
- Treat generated outputs in `output/` and user-provided CSVs in `data/` as runtime artifacts unless the task explicitly says otherwise.

## Backend Notes

- API routes live under `api/routes/`; shared dependencies live in `api/dependencies.py`.
- Business logic belongs in `api/services/`; streaming translation/parsing belongs in `api/streaming/`.
- Use Pydantic schemas from `api/schemas.py` for request and response contracts.
- When changing API behavior, update or add pytest coverage in `tests/unit/` or `tests/integration/` as appropriate.

## Frontend Notes

- The frontend uses React, Vite, TypeScript, Tailwind CSS, and TanStack Router.
- Transcript rendering is split across `web/src/components/ChatTranscript.tsx`, `web/src/lib/transcriptReducer.ts`, and `web/src/components/segment-views/`.
- Artifact-specific UI belongs under `web/src/components/artifacts/`.
- Keep `web/src/routeTree.gen.ts` treated as generated router output; avoid manual edits unless the task explicitly requires it.

## Verification

Before claiming a change is complete, run the narrowest relevant checks:

- Backend changes: `pytest` or focused pytest targets.
- Frontend changes: `cd web && npm run build`.
- Cross-stack changes: run both relevant backend tests and the frontend build.

If a verification command cannot be run, explain why and state what remains unverified.
