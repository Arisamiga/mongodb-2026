from datetime import datetime, timedelta, timezone

import jwt
import pytest
from bson import ObjectId
from conftest import account, create_item, item_payload
from fastapi.testclient import TestClient
from pymongo.errors import AutoReconnect, DuplicateKeyError

from app.ai_client import AIServiceError, Match
from app.main import create_app


def test_account_authentication_and_password_storage(client, db):
    headers, user = account(client, "ALICE@example.com")
    assert user["email"] == "alice@example.com"
    assert "password_hash" not in user and "_id" not in user
    stored = db.users.find_one({"_id": user["id"]})
    assert stored["password_hash"].startswith("$argon2id$")
    assert stored["password_hash"] != "long-test-password"
    assert client.get("/auth/me", headers=headers).json() == user
    duplicate = client.post(
        "/auth/register",
        json={
            "email": "alice@example.com",
            "password": "long-test-password",
            "display_name": "Other",
        },
    )
    assert duplicate.status_code == 409
    for email, password in [
        ("alice@example.com", "incorrect"),
        ("nobody@example.com", "incorrect"),
    ]:
        response = client.post("/auth/login", json={"email": email, "password": password})
        assert response.status_code == 401
    login = client.post(
        "/auth/login",
        json={"email": "ALICE@example.com", "password": "long-test-password"},
    )
    assert login.status_code == 200
    assert client.get(
        "/auth/me", headers={"Authorization": "Bearer " + login.json()["access_token"]}
    ).status_code == 200


def test_missing_invalid_and_expired_credentials(client, settings):
    headers, user = account(client)
    assert client.get("/items").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    expired = jwt.encode(
        {
            "sub": user["id"],
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + expired}).status_code == 401
    assert client.post("/items", json=item_payload()).status_code == 401


def test_password_whitespace_is_preserved(client):
    password = "  long-test-password  "
    assert client.post(
        "/auth/register",
        json={"email": "spaces@example.com", "password": password, "display_name": "Spaces"},
    ).status_code == 201
    assert client.post(
        "/auth/login", json={"email": "spaces@example.com", "password": password}
    ).status_code == 200
    assert client.post(
        "/auth/login", json={"email": "spaces@example.com", "password": password.strip()}
    ).status_code == 401


def test_report_uses_shared_schema_and_stores_bson_dates(client, db):
    headers, user = account(client)
    payload = item_payload("lost", eventDate="2025-04-03T12:30:00+00:00")
    response = client.post("/items", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["type"] == "lost"
    assert report["userId"] == user["id"]
    assert report["location"] == {"name": "Library", "coordinates": [-0.12, 51.5]}
    assert "_id" in report and "id" not in report
    assert {"createdAt", "eventDate", "matchingStatus"} <= report.keys()
    assert "embedding" not in report
    stored = db.items.find_one({"_id": report["_id"]})
    assert stored["type"] == "lost" and stored["userId"] == user["id"]
    assert stored["location"] == {"name": "Library", "coordinates": [-0.12, 51.5]}
    assert isinstance(stored["createdAt"], datetime)
    assert isinstance(stored["eventDate"], datetime)
    assert stored["eventDate"].replace(tzinfo=timezone.utc) == datetime(
        2025, 4, 3, 12, 30, tzinfo=timezone.utc
    )
    assert isinstance(stored["embedding"], list)
    assert client.app.state.ai_client.embedding_calls[-1] == (
        payload["title"], payload["description"]
    )


def test_object_id_report_is_found_and_owned_by_string_user_id(client, db):
    alice, user = account(client)
    report = create_item(client, alice)
    stored = db.items.find_one({"_id": report["_id"]})
    db.items.delete_one({"_id": report["_id"]})
    object_id = ObjectId()
    stored["_id"] = object_id
    db.items.insert_one(stored)

    response = client.get(f"/items/{object_id}", headers=alice)
    assert response.status_code == 200, response.text
    assert response.json()["_id"] == str(object_id)
    assert response.json()["userId"] == user["id"]
    matches = client.get(f"/items/{object_id}/matches", headers=alice)
    assert matches.status_code == 200, matches.text
    assert matches.json() == []
    assert client.app.state.ai_client.match_calls[-1] == str(object_id)


@pytest.mark.parametrize("first_type", ["found", "lost"])
def test_matches_return_item_score_and_private_idempotent_conversation(client, db, first_type):
    alice, alice_user = account(client)
    bob, bob_user = account(client, "bob@example.com")
    outsider, _ = account(client, "outsider@example.com")
    first = create_item(client, alice, first_type)
    assert client.get("/conversations", headers=alice).json() == []
    second = create_item(
        client, bob, "lost" if first_type == "found" else "found"
    )
    assert "embedding" not in second

    ai_client = client.app.state.ai_client
    calls_before = len(ai_client.match_calls)
    matches_response = client.get(f"/items/{second['_id']}/matches", headers=bob)
    assert matches_response.status_code == 200, matches_response.text
    assert len(ai_client.match_calls) == calls_before + 1
    assert ai_client.match_calls[-1] == second["_id"]
    matches = matches_response.json()
    assert len(matches) == 1
    assert matches[0]["item"]["_id"] == first["_id"]
    assert matches[0]["score"] == pytest.approx(1)
    conversation = matches[0]["conversation"]
    assert "components" not in conversation and "score" in conversation
    assert {member["id"] for member in conversation["members"]} == {
        alice_user["id"], bob_user["id"]
    }
    assert all(set(member) == {"id", "display_name"} for member in conversation["members"])

    for _ in range(2):
        response = client.post(f"/items/{second['_id']}/match", headers=bob)
        assert response.status_code == 200, response.text
        assert "_id" in response.json() and "id" not in response.json()
    assert db.conversations.count_documents({}) == 1
    channel = f"/conversations/{conversation['id']}"
    assert client.get(channel, headers=alice).status_code == 200
    assert client.get("/conversations", headers=outsider).json() == []
    assert client.get(channel, headers=outsider).status_code == 404
    assert client.get(channel + "/messages", headers=outsider).status_code == 404
    assert client.post(
        channel + "/messages", headers=outsider, json={"body": "intrude"}
    ).status_code == 404
    message = client.post(
        channel + "/messages", headers=alice, json={"body": "I found your wallet!"}
    )
    assert message.status_code == 201
    assert message.json()["sender_id"] == alice_user["id"]
    assert client.get(channel + "/messages", headers=bob).json() == [message.json()]
    assert client.post(
        channel + "/messages", headers=bob, json={"body": "  "}
    ).status_code == 422


def test_ai_matches_are_validated_and_low_scores_and_duplicates_are_ignored(client, db):
    alice, alice_user = account(client)
    bob, bob_user = account(client, "bob@example.com")
    carol, carol_user = account(client, "carol@example.com")
    base = create_item(client, alice, "lost")
    valid = create_item(client, bob, "found")
    same_owner = create_item(client, alice, "found")
    wrong_type = create_item(client, carol, "lost")
    returned = create_item(client, carol, "found")
    db.items.update_one({"_id": returned["_id"]}, {"$set": {"status": "returned"}})
    missing_user = create_item(client, carol, "found")
    db.items.update_one(
        {"_id": missing_user["_id"]}, {"$set": {"userId": "deleted-account"}}
    )
    db.conversations.delete_many({})
    fake = client.app.state.ai_client
    fake.find_matches = lambda item_id: [
        Match(itemId=valid["_id"], score=0.95),
        Match(itemId=valid["_id"], score=0.95),
        Match(itemId=same_owner["_id"], score=1.0),
        Match(itemId=wrong_type["_id"], score=1.0),
        Match(itemId=returned["_id"], score=1.0),
        Match(itemId=missing_user["_id"], score=1.0),
        Match(itemId="does-not-exist", score=1.0),
        Match(itemId=valid["_id"], score=0.1),
    ]

    response = client.get(f"/items/{base['_id']}/matches", headers=alice)
    assert response.status_code == 200, response.text
    results = response.json()
    assert [result["item"]["_id"] for result in results] == [valid["_id"]]
    assert results[0]["score"] == pytest.approx(0.95)
    assert {member["id"] for member in results[0]["conversation"]["members"]} == {
        alice_user["id"], bob_user["id"]
    }
    assert carol_user["id"] not in {
        member["id"] for member in results[0]["conversation"]["members"]
    }
    assert db.conversations.count_documents({}) == 1


def test_owner_permissions_and_returned_reports_do_not_rematch(client):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    report = create_item(client, alice)
    url = f"/items/{report['_id']}"
    assert client.patch(url, headers=bob, json={"status": "returned"}).status_code == 403
    assert client.post(url + "/match", headers=bob).status_code == 403
    assert client.get(url + "/matches", headers=bob).status_code == 403
    returned = client.patch(url, headers=alice, json={"status": "returned"})
    assert returned.json()["status"] == "returned"
    assert client.post(url + "/match", headers=alice).status_code == 409
    candidate = create_item(client, bob, "lost")
    matches = client.get(f"/items/{candidate['_id']}/matches", headers=bob)
    assert matches.json() == []
    reopened = client.patch(url, headers=alice, json={"status": "open"})
    assert reopened.status_code == 200
    assert client.get(f"/items/{candidate['_id']}/matches", headers=bob).json()
    assert client.get("/items/missing", headers=alice).status_code == 404


def test_unconfigured_campus_locations_reject_report_creation(db):
    from conftest import FakeAIClient

    from app.config import Settings

    settings = Settings(
        jwt_secret="test-only-secret-with-at-least-32-characters", _env_file=None
    )
    with TestClient(
        create_app(database=db, ai_client=FakeAIClient(db), settings=settings)
    ) as empty_client:
        alice, _ = account(empty_client)
        response = empty_client.post("/items", headers=alice, json=item_payload())
        assert response.status_code == 503
        assert response.json() == {"detail": "Campus locations are not configured"}


def test_metadata_and_listing_filters(client):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    metadata = client.get("/metadata", headers=alice)
    assert metadata.status_code == 200, metadata.text
    assert metadata.json()["categories"] == [
        "Electronics", "Clothing", "Bags", "Keys", "Cards and IDs", "Books", "Other"
    ]
    assert metadata.json()["statuses"] == ["open", "matched", "returned"]
    assert metadata.json()["locations"] == [
        {"name": "Library", "coordinates": [-0.12, 51.5]},
        {"name": "Gym", "coordinates": [2.35, 48.85]},
    ]
    returned = create_item(client, alice, "found", category="Electronics")
    create_item(client, bob, "lost", category="Books", location="Gym")
    assert len(client.get("/items", headers=alice).json()) == 2
    assert len(client.get("/items?mine=true", headers=alice).json()) == 1
    assert len(client.get("/items?type=lost&category=Books", headers=alice).json()) == 1
    assert len(client.get("/items?category=Electronics", headers=alice).json()) == 1
    assert len(client.get("/items?limit=1&offset=1", headers=alice).json()) == 1
    assert client.patch(
        f"/items/{returned['_id']}", headers=alice, json={"status": "returned"}
    ).status_code == 200
    assert len(client.get("/items", headers=alice).json()) == 1
    assert len(client.get("/items?status=returned", headers=alice).json()) == 1
    for query in ["limit=101", "type=other", "status=resolved"]:
        assert client.get("/items?" + query, headers=alice).status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"type": "other"},
        {"category": "wallet"},
        {"category": "electronics"},
        {"location": "Campus Cafe"},
        {"eventDate": "not-a-date"},
        {"eventDate": None},
        {"images": ["file:///etc/passwd"]},
        {"attributes": {"$key": "value"}},
        {"userId": "forged-user"},
        {"title": " "},
        {"attributes": {"color": ""}},
    ],
)
def test_report_input_validation(client, changes):
    alice, _ = account(client)
    response = client.post("/items", headers=alice, json=item_payload(**changes))
    assert response.status_code == 422, response.text


def test_embedding_failure_does_not_save_report(client, db, monkeypatch):
    alice, _ = account(client)

    def fail(title, description):
        raise AIServiceError()

    monkeypatch.setattr(client.app.state.ai_client, "create_embedding", fail)
    response = client.post("/items", headers=alice, json=item_payload())
    assert response.status_code == 503
    assert db.items.count_documents({}) == 0


def test_get_matches_ai_failure_sets_matching_status_failed(client, db, monkeypatch):
    alice, _ = account(client)
    report = create_item(client, alice)

    def fail(item_id):
        raise AIServiceError()

    monkeypatch.setattr(client.app.state.ai_client, "find_matches", fail)
    response = client.get(f"/items/{report['_id']}/matches", headers=alice)
    assert response.status_code == 503
    assert response.json() == {"detail": "AI matching service unavailable; please retry"}
    assert db.items.find_one({"_id": report["_id"]})["matchingStatus"] == "failed"


def test_failed_matching_can_be_retried_without_duplicate_conversations(client, db, monkeypatch):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    create_item(client, alice)
    fake = client.app.state.ai_client
    original = fake.find_matches

    def fail(item_id):
        raise RuntimeError("AI matching unavailable")

    monkeypatch.setattr(fake, "find_matches", fail)
    response = client.post("/items", headers=bob, json=item_payload("lost"))
    assert response.status_code == 201
    report = response.json()
    assert report["matchingStatus"] == "failed"
    monkeypatch.setattr(fake, "find_matches", original)
    retry = client.post(f"/items/{report['_id']}/match", headers=bob)
    assert retry.status_code == 200
    assert retry.json()["matchingStatus"] == "completed"
    assert len(client.get("/items/{}/matches".format(report["_id"]), headers=bob).json()) == 1
    assert db.conversations.count_documents({}) == 1


def test_database_error_is_sanitized(client, monkeypatch):
    alice, _ = account(client)

    def fail(*args, **kwargs):
        raise AutoReconnect("private database address")

    monkeypatch.setattr(client.app.state.db.items, "find", fail)
    response = client.get("/items", headers=alice)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database temporarily unavailable"}


def test_unique_indexes(client, db):
    _, user = account(client)
    with pytest.raises(DuplicateKeyError):
        db.users.insert_one({"_id": "other", "email": user["email"]})
    pair = {"lost_id": "report-one", "found_id": "report-two"}
    db.conversations.insert_one({"_id": "one", **pair})
    with pytest.raises(DuplicateKeyError):
        db.conversations.insert_one({"_id": "two", **pair})


def test_openapi_and_config(client, settings):
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert "/items/{item_id}/match" in schema["paths"]
    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(jwt_secret="short", _env_file=None)
    assert create_app(settings=settings).title == "Lost&Found AI API"


def test_campus_environment_rejects_duplicate_names_but_allows_shared_coordinates(monkeypatch):
    from pydantic import ValidationError

    from app.config import Settings

    monkeypatch.setenv(
        "CAMPUS_LOCATIONS",
        '[{"name":"Library","coordinates":[-0.12,51.5]},'
        '{"name":"Gym","coordinates":[-0.12,51.5]}]',
    )
    settings = Settings(jwt_secret="test-only-secret-with-at-least-32-characters", _env_file=None)
    assert settings.campus_locations[0].coordinates == settings.campus_locations[1].coordinates

    monkeypatch.setenv(
        "CAMPUS_LOCATIONS",
        '[{"name":"Library","coordinates":[-0.12,51.5]},'
        '{"name":"Library","coordinates":[2.35,48.85]}]',
    )
    with pytest.raises(ValidationError):
        Settings(jwt_secret="test-only-secret-with-at-least-32-characters", _env_file=None)
