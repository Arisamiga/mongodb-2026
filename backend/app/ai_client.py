"""Synchronous client for the external embedding and matching service."""

from __future__ import annotations

from typing import Annotated

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import Settings
from app.schemas import ItemOut


class AIServiceError(Exception):
    """Raised when the AI service request or response is unusable."""

    def __init__(self) -> None:
        super().__init__("AI service request failed")


class Match(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    itemId: str = Field(min_length=1, max_length=100)
    score: float = Field(ge=0, le=1, allow_inf_nan=False)


class _EmbeddingResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")

    embedding: list[Annotated[float, Field(strict=True, allow_inf_nan=False)]] = Field(
        min_length=1, max_length=4096
    )


class _MatchesResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")

    matches: list[Match] = Field(max_length=1000)


class AIClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        headers = {}
        if settings.ai_service_token:
            headers["Authorization"] = f"Bearer {settings.ai_service_token}"

        self._embedding_path = settings.ai_embedding_path.lstrip("/")
        self._matches_path = settings.ai_matches_path.lstrip("/")
        self._client = httpx.Client(
            base_url=str(settings.ai_service_url).rstrip("/") + "/",
            headers=headers,
            timeout=settings.ai_timeout_seconds,
            follow_redirects=False,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def create_embedding(self, title: str, description: str) -> list[float]:
        payload = {"title": title, "description": description}
        response = self._post(self._embedding_path, payload)
        try:
            return _EmbeddingResponse.model_validate(response).embedding
        except ValidationError:
            raise AIServiceError() from None

    def find_matches(self, item: dict) -> list[Match]:
        item_id = str(item["_id"])
        if not 1 <= len(item_id) <= 100:
            raise ValueError("item_id must be a string of 1 to 100 characters")
        report = ItemOut.model_validate(
            {
                **item,
                "_id": item_id,
                "userId": str(item["userId"]),
            }
        ).model_dump(mode="json")
        payload = {
            "itemId": item_id,
            **{
                field: report[field]
                for field in (
                    "type",
                    "title",
                    "description",
                    "category",
                    "eventDate",
                    "userId",
                )
            },
            "location": {"coordinates": report["location"]["coordinates"]},
        }
        response = self._post(self._matches_path, payload)
        try:
            return _MatchesResponse.model_validate(response).matches
        except ValidationError:
            raise AIServiceError() from None

    def _post(self, path: str, payload: dict) -> object:
        try:
            response = self._client.post(path, json=payload)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise AIServiceError() from None
