from datetime import datetime, timedelta, timezone

import jwt
import pytest
from conftest import account, create_item, item_payload
from pymongo.errors import AutoReconnect, DuplicateKeyError

from app.main import create_app


def test_account_authentication_and_password_storage(client, db):
    headers, user = account(client, "ALICE@example.com")
    assert user["email"] == "alice@example.com"
    assert "password_hash" not in user
    assert "_id" not in user
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
        assert (
            client.post("/auth/login", json={"email": email, "password": password}).status_code
            == 401
        )
    login = client.post(
        "/auth/login",
        json={
            "email": "ALICE@example.com",
            "password": "long-test-password",
        },
    )
    assert login.status_code == 200
    assert (
        client.get(
            "/auth/me",
            headers={
                "Authorization": "Bearer " + login.json()["access_token"],
            },
        ).status_code
        == 200
    )


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
    assert (
        client.post(
            "/auth/register",
            json={
                "email": "spaces@example.com",
                "password": password,
                "display_name": "Spaces",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/auth/login",
            json={
                "email": "spaces@example.com",
                "password": password,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/auth/login",
            json={
                "email": "spaces@example.com",
                "password": password.strip(),
            },
        ).status_code
        == 401
    )


@pytest.mark.parametrize("first_kind", ["found", "lost"])
def test_match_creates_private_idempotent_conversation(client, db, first_kind):
    alice, alice_user = account(client)
    bob, bob_user = account(client, "bob@example.com")
    outsider, _ = account(client, "outsider@example.com")
    create_item(client, alice, first_kind)
    assert client.get("/conversations", headers=alice).json() == []
    second = create_item(client, bob, "lost" if first_kind == "found" else "found")
    assert "embedding" not in second and "_id" not in second
    matches = client.get(f"/items/{second['id']}/matches", headers=bob).json()
    assert len(matches) == 1
    conversation = matches[0]
    assert conversation["score"] == pytest.approx(1)
    assert {m["id"] for m in conversation["members"]} == {alice_user["id"], bob_user["id"]}
    assert all(set(m) == {"id", "display_name"} for m in conversation["members"])
    for _ in range(2):
        assert client.post(f"/items/{second['id']}/match", headers=bob).status_code == 200
    assert db.conversations.count_documents({}) == 1
    channel = f"/conversations/{conversation['id']}"
    assert client.get(channel, headers=alice).status_code == 200
    assert client.get("/conversations", headers=outsider).json() == []
    assert client.get(channel, headers=outsider).status_code == 404
    assert client.get(channel + "/messages", headers=outsider).status_code == 404
    assert (
        client.post(channel + "/messages", headers=outsider, json={"body": "intrude"}).status_code
        == 404
    )
    message = client.post(
        channel + "/messages", headers=alice, json={"body": "I found your wallet!"}
    )
    assert message.status_code == 201
    assert message.json()["sender_id"] == alice_user["id"]
    assert client.get(channel + "/messages", headers=bob).json() == [message.json()]
    assert client.post(channel + "/messages", headers=bob, json={"body": "  "}).status_code == 422


def test_no_self_match_or_low_score_match(client):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    create_item(client, alice, "lost")
    create_item(client, alice, "found")
    create_item(client, bob, "found", title="Red umbrella", category="umbrella", attributes={})
    assert client.get("/conversations", headers=alice).json() == []


def test_owner_permissions_and_resolved_items(client):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    item = create_item(client, alice)
    url = f"/items/{item['id']}"
    assert client.patch(url, headers=bob, json={"status": "resolved"}).status_code == 403
    assert client.post(url + "/match", headers=bob).status_code == 403
    assert client.get(url + "/matches", headers=bob).status_code == 403
    assert (
        client.patch(url, headers=alice, json={"status": "resolved"}).json()["status"] == "resolved"
    )
    assert client.post(url + "/match", headers=alice).status_code == 409
    create_item(client, bob, "lost")
    assert client.get("/conversations", headers=bob).json() == []
    assert client.patch(url, headers=alice, json={"status": "open"}).status_code == 200
    assert len(client.get("/conversations", headers=bob).json()) == 1
    assert client.get("/items/missing", headers=alice).status_code == 404


def test_listing_filters_pagination_and_validation(client):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    create_item(client, alice, "found", category="WALLET", attributes={" Color ": "black"})
    create_item(client, bob, "lost")
    assert len(client.get("/items", headers=alice).json()) == 2
    assert len(client.get("/items?mine=true", headers=alice).json()) == 1
    assert len(client.get("/items?kind=lost&category=WALLET", headers=alice).json()) == 1
    assert len(client.get("/items?limit=1&offset=1", headers=alice).json()) == 1
    for query in ["limit=101", "longitude=1", "longitude=200", "longitude=0&latitude=0&q=wallet"]:
        assert client.get("/items?" + query, headers=alice).status_code == 422
    for changes in [
        {"location": {"coordinates": [0, 91]}},
        {"images": ["file:///etc/passwd"]},
        {"attributes": {"$key": "value"}},
        {"kind": "other"},
        {"owner_id": "forged"},
        {"title": " "},
        {"attributes": {"color": ""}},
    ]:
        assert client.post("/items", headers=alice, json=item_payload(**changes)).status_code == 422


def test_embedding_failure_does_not_save_item(client, db, monkeypatch):
    alice, _ = account(client)

    def fail(text):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(client.app.state.encoder, "encode", fail)
    response = client.post("/items", headers=alice, json=item_payload())
    assert response.status_code == 503
    assert db.items.count_documents({}) == 0


def test_failed_matching_can_be_retried_without_duplicate_channels(client, monkeypatch):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    create_item(client, alice)
    import app.main as main

    original = main.run_matching

    def fail_after_scan(app, item):
        original(app, item)
        raise RuntimeError("partial scan failure")

    monkeypatch.setattr(main, "run_matching", fail_after_scan)
    response = client.post("/items", headers=bob, json=item_payload("lost"))
    assert response.status_code == 201
    assert response.json()["matching_status"] == "failed"
    monkeypatch.setattr(main, "run_matching", original)
    retry = client.post(f"/items/{response.json()['id']}/match", headers=bob)
    assert retry.json()["matching_status"] == "completed"
    assert len(client.get("/conversations", headers=bob).json()) == 1


def test_changed_embedding_model_requires_reembedding(client, db):
    alice, _ = account(client)
    bob, _ = account(client, "bob@example.com")
    item = create_item(client, alice)
    db.items.update_one({"_id": item["id"]}, {"$set": {"embedding_model": "different-model"}})
    response = client.post("/items", headers=bob, json=item_payload("lost"))
    assert response.status_code == 201
    assert response.json()["matching_status"] == "failed"
    assert client.get("/conversations", headers=bob).json() == []


def test_database_error_is_sanitized(client, monkeypatch):
    alice, _ = account(client)

    def fail(*args, **kwargs):
        raise AutoReconnect("private database address")

    monkeypatch.setattr(client.app.state.db.items, "find", fail)
    response = client.get("/items", headers=alice)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database temporarily unavailable"}


def test_unique_indexes(client, db):
    alice, user = account(client)
    with pytest.raises(DuplicateKeyError):
        db.users.insert_one({"_id": "other", "email": user["email"]})
    db.conversations.insert_one({"_id": "one", "lost_id": "lost", "found_id": "found"})
    with pytest.raises(DuplicateKeyError):
        db.conversations.insert_one({"_id": "two", "lost_id": "lost", "found_id": "found"})


def test_openapi_and_config(client, settings):
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert "/items/{item_id}/match" in schema["paths"]
    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(jwt_secret="short", _env_file=None)
    assert create_app(settings=settings).title == "Lost&Found AI API"
