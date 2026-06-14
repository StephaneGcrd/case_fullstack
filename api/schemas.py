"""Pydantic models for REST request/response bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DatasetInfo(BaseModel):
    name: str
    rows: int
    columns: list[str]


class CreateSessionResponse(BaseModel):
    session_id: str
    datasets: list[DatasetInfo]


class SessionDetailResponse(BaseModel):
    session_id: str
    datasets: list[DatasetInfo]
    message_count: int
    is_streaming: bool


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
