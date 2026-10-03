import os

import pytest
from conftest import account, create_item

pytestmark = pytest.mark.skipif(
    not os.getenv("MONGODB_TEST_URI"), reason="Set MONGODB_TEST_URI to verify real MongoDB features"
)


def test_mongodb_text_and_geospatial_search(client, db):
    headers, _ = account(client)
    near = create_item(client, headers, title="Black leather wallet")
    create_item(
        client,
        headers,
        title="Red umbrella",
        category="Other",
        location={"coordinates": [2.35, 48.85]},
    )
    assert client.get("/health").json() == {"status": "ok"}
    text = client.get("/items?q=wallet", headers=headers)
    assert text.status_code == 200, text.text
    assert near["_id"] in {item["_id"] for item in text.json()}
    nearby = client.get("/items?longitude=-0.12&latitude=51.5&radius_m=1000", headers=headers)
    assert nearby.status_code == 200, nearby.text
    assert [item["_id"] for item in nearby.json()] == [near["_id"]]
    indexes = db.items.index_information()
    assert any(index["key"] == [("location.coordinates", "2d")] for index in indexes.values())
