import json
from datetime import datetime, timezone

import httpx
import pytest

from app.ai_client import AIClient, AIServiceError, Match
from app.config import Settings as AppSettings


class Settings:
    ai_service_url = "https://ai.example.test/api"
    ai_embedding_path = "/embeddings"
    ai_matches_path = "/matches"
    ai_timeout_seconds = 2.5
    ai_service_token = "test-token"


def client_for(handler, *, token="test-token"):
    settings = Settings()
    settings.ai_service_token = token
    return AIClient(settings, transport=httpx.MockTransport(handler))


def report(item_id="lost-1"):
    return {
        "_id": item_id,
        "type": "lost",
        "title": "Blue bag",
        "description": "Left at the library",
        "category": "Bags",
        "location": {"coordinates": [-0.12, 51.5]},
        "eventDate": datetime(2026, 10, 3, 12, 30, tzinfo=timezone.utc),
        "createdAt": datetime(2026, 10, 3, 13, tzinfo=timezone.utc),
        "status": "open",
        "userId": "owner-1",
        "embedding": [0.1, 0.2],
        "images": ["/items/report/images/private"],
    }


def test_create_embedding_posts_contract_and_parses_embedding():
    def handler(request):
        assert request.method == "POST"
        assert request.url == "https://ai.example.test/api/embeddings"
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.read() == b'{"title":"Blue bag","description":"Found by the library"}'
        return httpx.Response(200, json={"embedding": [0.25, -1, 0.0]})

    client = client_for(handler)
    try:
        assert client.create_embedding("Blue bag", "Found by the library") == [0.25, -1.0, 0.0]
    finally:
        client.close()


def test_find_matches_posts_comparison_fields_and_returns_match_models():
    def handler(request):
        assert request.url == "https://ai.example.test/api/matches"
        assert json.loads(request.content) == {
            "itemId": "lost-1",
            "type": "lost",
            "title": "Blue bag",
            "description": "Left at the library",
            "category": "Bags",
            "location": {"coordinates": [-0.12, 51.5]},
            "eventDate": "2026-10-03T12:30:00Z",
            "userId": "owner-1",
        }
        return httpx.Response(
            200,
            json={
                "matches": [{"itemId": "found-1", "score": 0.91}],
                "requestId": "request-1",
            },
        )

    client = client_for(handler, token=None)
    try:
        matches = client.find_matches(report())
        assert matches == [Match(itemId="found-1", score=0.91)]
    finally:
        client.close()


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(503, json={"detail": "sensitive server error"}),
        httpx.Response(302, headers={"Location": "https://redirect.example.test/"}),
        httpx.Response(200, text="not-json"),
        httpx.Response(200, json={"embedding": []}),
        httpx.Response(200, json={"embedding": [True]}),
        httpx.Response(200, content=b'{"embedding":[NaN]}'),
        httpx.Response(200, json={"embedding": [0.0] * 4097}),
        httpx.Response(200, json={"wrong": [1.0]}),
    ],
)
def test_create_embedding_sanitizes_http_and_schema_errors(response):
    client = client_for(lambda request: response)
    try:
        with pytest.raises(AIServiceError, match="AI service request failed") as error:
            client.create_embedding("title", "description")
        assert "sensitive server error" not in str(error.value)
        assert "ai.example.test" not in str(error.value)
    finally:
        client.close()


def test_timeout_is_sanitized():
    def handler(request):
        raise httpx.TimeoutException("private timeout detail", request=request)

    client = client_for(handler)
    try:
        with pytest.raises(AIServiceError) as error:
            client.find_matches(report())
        assert str(error.value) == "AI service request failed"
        assert "private timeout detail" not in str(error.value)
    finally:
        client.close()


@pytest.mark.parametrize(
    "matches",
    [
        [{"itemId": "", "score": 0.5}],
        [{"itemId": "x" * 101, "score": 0.5}],
        [{"itemId": "item", "score": -0.01}],
        [{"itemId": "item", "score": 1.01}],
        [{"itemId": "item", "score": True}],
        httpx.Response(200, content=b'{"matches":[{"itemId":"item","score":Infinity}]}'),
        [{"itemId": "item", "score": 0.5, "unexpected": "field"}],
        [{"itemId": "item", "score": 0.5}] * 1001,
    ],
)
def test_find_matches_rejects_invalid_response(matches):
    response = (
        matches
        if isinstance(matches, httpx.Response)
        else httpx.Response(200, json={"matches": matches})
    )
    client = client_for(lambda request: response)
    try:
        with pytest.raises(AIServiceError):
            client.find_matches(report())
    finally:
        client.close()


def test_find_matches_rejects_missing_matches_field():
    client = client_for(lambda request: httpx.Response(200, json={"result": []}))
    try:
        with pytest.raises(AIServiceError):
            client.find_matches(report())
    finally:
        client.close()


def test_find_matches_rejects_invalid_input_without_request():
    def unexpected_request(request):
        pytest.fail("Invalid item id should not issue a request")

    client = client_for(unexpected_request)
    try:
        with pytest.raises(ValueError):
            client.find_matches(report("x" * 101))
    finally:
        client.close()


def test_client_accepts_pydantic_settings_url():
    settings = AppSettings(
        jwt_secret="test-only-secret-with-at-least-32-characters", _env_file=None
    )

    def handler(request):
        assert request.url == f"{str(settings.ai_service_url).rstrip('/')}/embeddings"
        assert "Authorization" not in request.headers
        return httpx.Response(200, json={"embedding": [1.0]})

    client = AIClient(settings, transport=httpx.MockTransport(handler))
    try:
        assert client.create_embedding("title", "description") == [1.0]
    finally:
        client.close()


def test_empty_token_does_not_send_bearer_header():
    def handler(request):
        assert "Authorization" not in request.headers
        return httpx.Response(200, json={"embedding": [1.0]})

    client = client_for(handler, token="")
    try:
        assert client.create_embedding("title", "description") == [1.0]
    finally:
        client.close()
