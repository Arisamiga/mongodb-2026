import pytest
from conftest import account, create_item

from app.ai_client import Match
from app.config import Settings


@pytest.mark.parametrize("score, linked", [(0.89, False), (0.90, True), (0.9001, True), (1, True)])
def test_auto_link_requires_at_least_ninety_percent(client, db, score, linked):
    owner, _ = account(client)
    finder, _ = account(client, "finder@example.com")
    lost = create_item(client, owner, "lost")
    found = create_item(client, finder, "found")
    db.conversations.delete_many({})
    client.app.state.ai_client.find_matches = lambda item_id: [
        Match(itemId=found["_id"], score=score)
    ]
    response = client.get(f"/items/{lost['_id']}/matches", headers=owner)
    assert response.status_code == 200
    assert bool(response.json()) is linked
    assert db.conversations.count_documents({}) == int(linked)


def test_configuration_cannot_lower_auto_link_threshold():
    with pytest.raises(ValueError):
        Settings(jwt_secret="test-only-secret-with-at-least-32-characters", match_threshold=0.89)


def test_configuration_allows_perfect_match_threshold_and_rejects_above_one():
    Settings(jwt_secret="test-only-secret-with-at-least-32-characters", match_threshold=1)
    with pytest.raises(ValueError):
        Settings(jwt_secret="test-only-secret-with-at-least-32-characters", match_threshold=1.01)


def test_perfect_score_qualifies_at_perfect_match_threshold(client, db):
    owner, _ = account(client)
    finder, _ = account(client, "finder@example.com")
    lost = create_item(client, owner, "lost")
    found = create_item(client, finder, "found")
    db.conversations.delete_many({})
    client.app.state.settings = client.app.state.settings.model_copy(update={"match_threshold": 1})
    client.app.state.ai_client.find_matches = lambda item_id: [
        Match(itemId=found["_id"], score=1)
    ]

    response = client.get(f"/items/{lost['_id']}/matches", headers=owner)

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert db.conversations.count_documents({}) == 1
