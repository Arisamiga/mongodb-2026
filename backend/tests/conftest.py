import os
from uuid import uuid4

import mongomock
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.config import Settings
from app.main import create_app


class FakeEncoder:
    def encode(self, text):
        return [0.0, 1.0] if "umbrella" in text.casefold() else [1.0, 0.0]


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
    return Settings(jwt_secret="test-only-secret-with-at-least-32-characters", _env_file=None)


@pytest.fixture
def client(db, settings):
    with TestClient(create_app(database=db, encoder=FakeEncoder(), settings=settings)) as client:
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


def item_payload(kind="found", **changes):
    return {
        "kind": kind,
        "title": "Black leather wallet",
        "description": "A small black wallet",
        "category": "wallet",
        "attributes": {"color": "black", "material": "leather"},
        "images": ["https://example.com/wallet.jpg"],
        "location": {"type": "Point", "coordinates": [-0.12, 51.5]},
        **changes,
    }


def create_item(client, headers, kind="found", **changes):
    response = client.post("/items", headers=headers, json=item_payload(kind, **changes))
    assert response.status_code == 201, response.text
    assert response.json()["matching_status"] == "completed"
    return response.json()
