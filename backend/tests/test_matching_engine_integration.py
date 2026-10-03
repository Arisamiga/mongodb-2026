import json
import select
import shutil
import subprocess
from datetime import datetime
from io import BytesIO
from pathlib import Path

import pytest
from conftest import account, item_payload
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app

SERVICE = Path(__file__).resolve().parents[1] / "matching-service"
pytestmark = pytest.mark.skipif(
    not shutil.which("node") or not (SERVICE / "node_modules/mongodb").is_dir(),
    reason="Install Node 24+ and run npm ci in backend/matching-service for HTTP engine tests",
)


@pytest.mark.parametrize("first_type", ["lost", "found"])
def test_python_api_uses_typescript_engine_for_matching_and_image_access(
    db,
    settings,
    tmp_path,
    monkeypatch,
    first_type,
):
    snapshot = tmp_path / "reports.json"
    snapshot.write_text("[]")
    original_insert = db.items.insert_one

    def serialize(value):
        if isinstance(value, datetime):
            return value.isoformat()
        raise TypeError(type(value).__name__)

    def insert_report(document, *args, **kwargs):
        result = original_insert(document, *args, **kwargs)
        snapshot.write_text(json.dumps(list(db.items.find()), default=serialize))
        return result

    monkeypatch.setattr(db.items, "insert_one", insert_report)
    process = subprocess.Popen(
        ["node", str(Path(__file__).with_name("matching_service_harness.ts")), str(snapshot)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert select.select([process.stdout], [], [], 15)[0], "Matching service failed to start"
        url = process.stdout.readline().strip()
        assert url.startswith("http://127.0.0.1:"), "Matching service did not announce a URL"
        config = settings.model_copy(
            update={
                "ai_service_url": url,
                "ai_service_token": "integration-test-token",
            }
        )
        with TestClient(create_app(database=db, settings=config)) as client:
            first_headers, first_user = account(client)
            second_headers, second_user = account(client, "second@example.com")
            outsider, _ = account(client, "outsider@example.com")
            first = client.post(
                "/items",
                headers=first_headers,
                json=item_payload(
                    first_type,
                    eventDate="2026-10-03T12:00:00Z",
                ),
            )
            assert first.status_code == 201, first.text
            assert first.json()["matchingStatus"] == "completed"
            image = BytesIO()
            Image.new("RGB", (8, 8), "red").save(image, format="PNG")
            attachment = client.post(
                f"/items/{first.json()['_id']}/images",
                headers=first_headers,
                files={"file": ("report.png", image.getvalue(), "image/png")},
            )
            assert attachment.status_code == 201
            second = client.post(
                "/items",
                headers=second_headers,
                json=item_payload(
                    "found" if first_type == "lost" else "lost",
                    eventDate="2026-10-03T12:00:00Z",
                ),
            )
            assert second.status_code == 201, second.text
            assert second.json()["matchingStatus"] == "completed"
            assert len(db.items.find_one({"_id": second.json()["_id"]})["embedding"]) == 1024
            matches = client.get(f"/items/{second.json()['_id']}/matches", headers=second_headers)
            assert matches.status_code == 200, matches.text
            match = matches.json()[0]
            assert match["score"] == pytest.approx(1)
            assert {member["id"] for member in match["conversation"]["members"]} == {
                first_user["id"],
                second_user["id"],
            }
            assert db.conversations.count_documents({}) == 1
            image_url = attachment.json()["url"]
            assert client.get(image_url, headers=second_headers).status_code == 200
            assert client.get(image_url, headers=outsider).status_code == 404
            messages = f"/conversations/{match['conversation']['id']}/messages"
            assert (
                client.post(
                    messages, headers=first_headers, json={"body": "Is this yours?"}
                ).status_code
                == 201
            )
            assert (
                client.get(messages, headers=second_headers).json()[0]["body"] == "Is this yours?"
            )
    finally:
        process.terminate()
        try:
            process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
