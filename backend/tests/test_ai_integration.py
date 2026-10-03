import json

import httpx
from conftest import account, item_payload
from fastapi.testclient import TestClient

from app.ai_client import AIClient
from app.main import create_app


def test_http_embedding_save_match_and_private_chat(db, settings):
    calls = []

    def ai_service(request):
        payload = json.loads(request.content)
        calls.append((request.url.path, payload))
        if request.url.path == "/embeddings":
            assert set(payload) == {"title", "description"}
            assert (
                db.items.count_documents({}) == sum(path == "/embeddings" for path, _ in calls) - 1
            )
            return httpx.Response(200, json={"embedding": [0.1, 0.2, 0.3]})
        assert request.url.path == "/matches"
        assert set(payload) == {
            "itemId",
            "type",
            "title",
            "description",
            "category",
            "location",
            "eventDate",
            "userId",
        }
        report = db.items.find_one({"_id": payload["itemId"]})
        assert report is not None and report["embedding"] == [0.1, 0.2, 0.3]
        for field in ("type", "title", "description", "category", "userId"):
            assert payload[field] == report[field]
        assert payload["location"] == {"coordinates": report["location"]["coordinates"]}
        from datetime import datetime

        assert datetime.fromisoformat(payload["eventDate"]) == report["eventDate"]
        candidates = db.items.find({"type": {"$ne": report["type"]}})
        return httpx.Response(
            200,
            json={
                "matches": [
                    {"itemId": candidate["_id"], "score": 0.92} for candidate in candidates
                ],
            },
        )

    ai = AIClient(settings, transport=httpx.MockTransport(ai_service))
    try:
        with TestClient(create_app(database=db, ai_client=ai, settings=settings)) as client:
            finder, finder_user = account(client)
            owner, owner_user = account(client, "owner@example.com")
            found = client.post("/items", headers=finder, json=item_payload("found"))
            assert found.status_code == 201
            lost = client.post("/items", headers=owner, json=item_payload("lost"))
            assert lost.status_code == 201
            result = client.get(f"/items/{lost.json()['_id']}/matches", headers=owner)
            assert result.status_code == 200
            matches = result.json()
            assert len(matches) == 1
            assert matches[0]["item"]["_id"] == found.json()["_id"]
            assert "embedding" not in matches[0]["item"]
            conversation = matches[0]["conversation"]
            assert {member["id"] for member in conversation["members"]} == {
                finder_user["id"],
                owner_user["id"],
            }
            url = f"/conversations/{conversation['id']}/messages"
            assert (
                client.post(url, headers=owner, json={"body": "That may be my wallet"}).status_code
                == 201
            )
            assert client.get(url, headers=finder).json()[0]["body"] == "That may be my wallet"
            assert db.conversations.count_documents({}) == 1
            assert [path for path, _ in calls] == [
                "/embeddings",
                "/matches",
                "/embeddings",
                "/matches",
                "/matches",
            ]
    finally:
        ai.close()
