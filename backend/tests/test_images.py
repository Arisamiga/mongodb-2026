from io import BytesIO

import pytest
from conftest import account, create_item
from PIL import Image
from pymongo.errors import AutoReconnect


def png_bytes(size=(8, 8)):
    image = Image.new("RGB", size, "red")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def animated_png_bytes():
    frames = [Image.new("RGB", (8, 8), color) for color in ("red", "blue")]
    output = BytesIO()
    frames[0].save(output, format="PNG", save_all=True, append_images=frames[1:])
    return output.getvalue()


def image_bytes(image_format, *, exif=False):
    image = Image.new("RGB", (8, 8), "red")
    options = {}
    if exif:
        metadata = Image.Exif()
        metadata[0x010E] = "private metadata"
        options["exif"] = metadata
    output = BytesIO()
    image.save(output, format=image_format, **options)
    return output.getvalue()


def upload(
    client,
    headers,
    item_id,
    data=None,
    filename="spoofed.svg",
    content_type="image/svg+xml",
):
    return client.post(
        f"/items/{item_id}/images",
        headers=headers,
        files={"file": (filename, data if data is not None else png_bytes(), content_type)},
    )


def test_upload_list_and_download_restricted_to_owner_or_high_score_conversation(client, db):
    owner, owner_user = account(client)
    counterpart, counterpart_user = account(client, "counterpart@example.com")
    outsider, _ = account(client, "outsider@example.com")
    report = create_item(client, owner, "lost")

    uploaded = upload(client, owner, report["_id"])
    assert uploaded.status_code == 201, uploaded.text
    metadata = uploaded.json()
    assert metadata["contentType"] == "image/png"
    assert metadata["url"] == f"/items/{report['_id']}/images/{metadata['id']}"
    assert metadata["size"] > 0

    own_list = client.get(f"/items/{report['_id']}/images", headers=owner)
    assert own_list.status_code == 200
    assert own_list.json() == [metadata]
    image_url = metadata["url"]
    owner_download = client.get(image_url, headers=owner)
    assert owner_download.status_code == 200
    assert owner_download.content == png_bytes()
    assert owner_download.headers["content-type"] == "image/png"
    assert owner_download.headers["cache-control"] == "private, no-store"
    assert owner_download.headers["x-content-type-options"] == "nosniff"

    db.conversations.insert_one(
        {
            "_id": "high-score",
            "lost_id": report["_id"],
            "found_id": "some-found-item",
            "score": 0.91,
            "member_ids": [owner_user["id"], counterpart_user["id"]],
        }
    )
    counterpart_list = client.get(f"/items/{report['_id']}/images", headers=counterpart)
    assert counterpart_list.status_code == 200
    assert counterpart_list.json() == [metadata]
    assert client.get(image_url, headers=counterpart).content == png_bytes()

    for response in (
        client.get(f"/items/{report['_id']}/images", headers=outsider),
        client.get(image_url, headers=outsider),
    ):
        assert response.status_code == 404
    assert upload(client, counterpart, report["_id"]).status_code == 403


def test_actual_auto_link_grants_counterpart_access_and_images_cannot_be_swapped(client, db):
    owner, _ = account(client)
    finder, finder_user = account(client, "finder@example.com")
    outsider, _ = account(client, "outsider@example.com")
    lost_report = create_item(client, owner, "lost")
    uploaded = upload(client, owner, lost_report["_id"])
    assert uploaded.status_code == 201, uploaded.text

    found_report = create_item(client, finder, "found")
    conversation = db.conversations.find_one(
        {"lost_id": lost_report["_id"], "found_id": found_report["_id"]}
    )
    assert conversation is not None
    assert conversation["score"] > 0.90
    assert finder_user["id"] in conversation["member_ids"]

    image_url = uploaded.json()["url"]
    finder_list = client.get(f"/items/{lost_report['_id']}/images", headers=finder)
    assert finder_list.status_code == 200
    assert finder_list.json()[0]["id"] == uploaded.json()["id"]
    assert client.get(image_url, headers=finder).content == png_bytes()
    assert client.get(image_url, headers=outsider).status_code == 404

    unrelated_report = create_item(client, owner, "lost", title="Unrelated report")
    db.items.update_one({"_id": unrelated_report["_id"]}, {"$push": {"images": image_url}})
    swapped_url = f"/items/{unrelated_report['_id']}/images/{uploaded.json()['id']}"
    assert client.get(swapped_url, headers=owner).status_code == 404


@pytest.mark.parametrize("score, expected_status", [(0.8999, 404), (0.90, 200)])
def test_image_access_requires_at_least_point_nine(client, db, score, expected_status):
    owner, owner_user = account(client)
    counterpart, counterpart_user = account(client, "counterpart@example.com")
    report = create_item(client, owner, "lost")
    uploaded = upload(client, owner, report["_id"])
    assert uploaded.status_code == 201, uploaded.text
    db.conversations.insert_one(
        {
            "_id": "exact-threshold",
            "lost_id": report["_id"],
            "found_id": "some-found-item",
            "score": score,
            "member_ids": [owner_user["id"], counterpart_user["id"]],
        }
    )
    assert (
        client.get(f"/items/{report['_id']}/images", headers=counterpart).status_code
        == expected_status
    )
    assert client.get(uploaded.json()["url"], headers=counterpart).status_code == expected_status


def test_rejects_unsupported_corrupt_oversized_and_too_many_images(client, db):
    owner, _ = account(client)
    report = create_item(client, owner)

    assert upload(client, owner, report["_id"], b"<svg></svg>").status_code == 415
    assert upload(client, owner, report["_id"], animated_png_bytes()).status_code == 415
    assert upload(client, owner, report["_id"], b"not an image").status_code == 400
    assert upload(client, owner, report["_id"], b"x" * (5 * 1024 * 1024 + 1)).status_code == 413

    large_dimensions = upload(client, owner, report["_id"], png_bytes((5000, 4001)))
    assert large_dimensions.status_code == 413

    db.items.update_one({"_id": report["_id"]}, {"$set": {"images": ["legacy"] * 8}})
    too_many = upload(client, owner, report["_id"])
    assert too_many.status_code == 409
    assert db.images.files.count_documents({}) == 0


@pytest.mark.parametrize("image_format", ["JPEG", "PNG"])
def test_upload_reencoding_removes_exif_and_ignores_spoofed_mime(client, image_format):
    owner, _ = account(client)
    report = create_item(client, owner)
    response = upload(
        client,
        owner,
        report["_id"],
        image_bytes(image_format, exif=True),
        filename="spoofed.svg",
        content_type="image/svg+xml",
    )
    assert response.status_code == 201, response.text
    assert (
        response.json()["contentType"]
        == {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
        }[image_format]
    )
    stored = client.get(response.json()["url"], headers=owner)
    with Image.open(BytesIO(stored.content)) as image:
        assert not image.getexif()


def test_reencoded_image_cannot_exceed_size_limit(client, monkeypatch):
    owner, _ = account(client)
    report = create_item(client, owner)
    source = Image.new("RGB", (8, 8), "red")
    webp_buffer = BytesIO()
    source.save(webp_buffer, format="WEBP", quality=1)
    compact_webp = webp_buffer.getvalue()
    monkeypatch.setattr("app.images.MAX_IMAGE_SIZE", len(compact_webp))
    response = upload(client, owner, report["_id"], compact_webp, content_type="image/webp")
    assert response.status_code == 413


def test_missing_image_and_failed_item_attachment_do_not_leave_gridfs_file(client, db, monkeypatch):
    owner, _ = account(client)
    report = create_item(client, owner)
    missing = client.get(f"/items/{report['_id']}/images/not-an-object-id", headers=owner)
    assert missing.status_code == 404

    original_update = db.items.update_one

    def unavailable_attachment(*args, **kwargs):
        raise AutoReconnect("simulated database interruption")

    monkeypatch.setattr(db.items, "update_one", unavailable_attachment)
    unavailable = upload(client, owner, report["_id"])
    assert unavailable.status_code == 503
    assert unavailable.json() == {"detail": "Database temporarily unavailable"}
    assert db.images.files.count_documents({}) == 0
    assert db.images.chunks.count_documents({}) == 0

    def fail_attachment(*args, **kwargs):
        raise RuntimeError("simulated item attachment failure")

    monkeypatch.setattr(db.items, "update_one", fail_attachment)
    with pytest.raises(RuntimeError, match="simulated item attachment failure"):
        upload(client, owner, report["_id"])
    assert db.images.files.count_documents({}) == 0

    def unattached(*args, **kwargs):
        class Result:
            matched_count = 0

        return Result()

    monkeypatch.setattr(db.items, "update_one", unattached)
    response = upload(client, owner, report["_id"])
    assert response.status_code == 409
    assert db.images.files.count_documents({}) == 0
    monkeypatch.setattr(db.items, "update_one", original_update)

    uploaded = upload(client, owner, report["_id"])
    assert uploaded.status_code == 201
    db.items.update_one({"_id": report["_id"]}, {"$set": {"images": []}})
    assert client.get(uploaded.json()["url"], headers=owner).status_code == 404
    assert client.get(f"/items/{report['_id']}/images", headers=owner).json() == []
