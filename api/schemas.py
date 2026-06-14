"""Pydantic models for REST request/response bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field


class DatasetInfo(BaseModel):
    name: str = Field(
        description="Dataset filename loaded into the session.",
        examples=["orders.csv"],
    )
    rows: int = Field(
        ge=0,
        description="Number of rows available in the dataset.",
        examples=[1250],
    )
    columns: list[str] = Field(
        description="Column names available in the dataset.",
        examples=[["order_id", "created_at", "total"]],
    )


class CreateSessionResponse(BaseModel):
    session_id: str = Field(
        description="Identifier used for follow-up chat, session, and artifact requests.",
        examples=["session_01HZY7K2C6X6X6DTRW4J9E7A4B"],
    )
    datasets: list[DatasetInfo] = Field(
        description="Datasets loaded from the data directory for this session.",
    )


class SessionDetailResponse(BaseModel):
    session_id: str = Field(
        description="Unique chat session identifier.",
        examples=["session_01HZY7K2C6X6X6DTRW4J9E7A4B"],
    )
    datasets: list[DatasetInfo] = Field(
        description="Datasets currently available to the session.",
    )
    message_count: int = Field(
        ge=0,
        description="Number of conversation messages stored for the session.",
        examples=[4],
    )
    is_streaming: bool = Field(
        description="Whether an agent response stream is currently active for the session.",
        examples=[False],
    )


class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        description="User prompt to send to the data-analysis agent.",
        examples=["Summarize revenue by month and show the trend."],
    )


class HealthResponse(BaseModel):
    status: str = Field(
        description="Current API health status.",
        examples=["ok"],
    )
