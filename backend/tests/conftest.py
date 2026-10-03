import os
from datetime import datetime, timezone
from uuid import uuid4

import mongomock
import mongomock.gridfs
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.ai_client import Match
from app.config import Settings
from app.main import create_app

mongomock.gridfs.enable_gridfs_integration()


class FakeAIClient:
    def __init__(self, database):
        self.database = database
        self.embedding_calls = []
        self.match_calls = []

    def create_embedding(self, title, description):
        self.embedding_calls.append((title, description))
        text = f"{title} {description}".casefold()
        return [0.0, 1.0] if "umbrella" in text else [1.0, 0.0]

    def find_matches(self, report):
        item_id = str(report["_id"])
        self.match_calls.append(item_id)
        item = self.database.items.find_one({"_id": item_id})
        if item is None and ObjectId.is_valid(item_id):
            item = self.database.items.find_one({"_id": ObjectId(item_id)})
        if item is None:
            return []
        opposite = "found" if item["type"] == "lost" else "lost"
        results = []
        for candidate in self.database.items.find({"type": opposite, "status": "open"}):
            score = 0.1 if "umbrella" in f"{item['title']} {candidate['title']}".casefold() else 1.0
            results.append(Match(itemId=candidate["_id"], score=score))
        return results


@pytest.fixture
def db():
    uri = os.getenv("MONGODB_TEST_URI")
    client = (
        MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
        if uri
        else mongomock.MongoClient(tz_aware=True)
    )
    name = "lost_found_test_" + uuid4().hex
    database = client[name]
    if uri:
        client.admin.command("ping")
    try:
        yield database
    finally:
        client.drop_database(name)
        client.close()


@pytest.fixture
def settings():
    return Settings(
        jwt_secret="test-only-secret-with-at-least-32-characters",
        campus_locations=[
            {"name": "Library", "coordinates": [-0.12, 51.5]},
            {"name": "Gym", "coordinates": [2.35, 48.85]},
        ],
        _env_file=None,
    )


@pytest.fixture
def client(db, settings):
    ai_client = FakeAIClient(db)
    with TestClient(create_app(database=db, ai_client=ai_client, settings=settings)) as client:
        yield client


def account(client, email="alice@example.com"):
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "long-test-password",
            "display_name": email.split("@")[0],
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    return {"Authorization": "Bearer " + data["access_token"]}, data["user"]


def item_payload(report_type="found", **changes):
    return {
        "type": report_type,
        "title": "Black leather wallet",
        "description": "A small black wallet",
        "category": "Electronics",
        "attributes": {"color": "black", "material": "leather"},
        "location": "Library",
        "eventDate": datetime.now(timezone.utc).isoformat(),
        **changes,
    }


def create_item(client, headers, report_type="found", **changes):
    response = client.post("/items", headers=headers, json=item_payload(report_type, **changes))
    assert response.status_code == 201, response.text
    return response.json()
