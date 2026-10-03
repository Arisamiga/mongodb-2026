from io import BytesIO
from uuid import uuid4

import gridfs
from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError

from app.security import current_user

MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_IMAGES_PER_ITEM = 8
SUPPORTED_FORMATS = {
    "PNG": ("image/png", "PNG"),
    "JPEG": ("image/jpeg", "JPEG"),
    "WEBP": ("image/webp", "WEBP"),
}


def _validated_image(data):
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(413, "Image exceeds the 5 MiB limit")

    try:
        with Image.open(BytesIO(data)) as image:
            detected_format = image.format
            if detected_format not in SUPPORTED_FORMATS:
                raise HTTPException(415, "Only PNG, JPEG, and WEBP images are supported")
            if getattr(image, "n_frames", 1) > 1:
                raise HTTPException(415, "Animated images are not supported")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "Image exceeds the 20 megapixel limit")
            image.verify()

        with Image.open(BytesIO(data)) as image:
            image.load()
            content_type, output_format = SUPPORTED_FORMATS[detected_format]
            has_alpha = "A" in image.getbands() or "transparency" in image.info
            if output_format == "JPEG":
                image = image.convert("RGB")
            else:
                image = image.convert("RGBA" if has_alpha else "RGB")
            image.info.clear()
            clean_image = Image.frombytes(image.mode, image.size, image.tobytes())
            output = BytesIO()
            clean_image.save(output, format=output_format)
    except HTTPException:
        raise
    except Image.DecompressionBombError as error:
        raise HTTPException(413, "Image exceeds the 20 megapixel limit") from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        if data.lstrip().lower().startswith((b"<svg", b"<?xml")):
            raise HTTPException(415, "Only PNG, JPEG, and WEBP images are supported") from error
        raise HTTPException(400, "Image data is corrupt or invalid") from error

    reencoded = output.getvalue()
    if len(reencoded) > MAX_IMAGE_SIZE:
        raise HTTPException(413, "Re-encoded image exceeds the 5 MiB limit")
    return reencoded, content_type


def _can_view_item(db, item, user):
    if str(item["userId"]) == str(user["_id"]):
        return True
    item_id = str(item["_id"])
    return (
        db.conversations.find_one(
            {
                "member_ids": user["_id"],
                "$or": [{"lost_id": item_id}, {"found_id": item_id}],
                "score": {"$gte": 0.90},
            }
        )
        is not None
    )


def _image_references(db, item):
    item_id = str(item["_id"])
    references = []
    for reference in item.get("images", []):
        image_id = str(reference).rstrip("/").rsplit("/", 1)[-1]
        if not ObjectId.is_valid(image_id):
            continue
        image_id = ObjectId(image_id)
        stored = db.images.files.find_one({"_id": image_id, "metadata.itemId": item_id})
        if stored is not None:
            references.append((image_id, stored))
    return references


def register_image_routes(app: FastAPI):
    from app.main import get_item, owned_item

    @app.post("/items/{item_id}/images", status_code=201)
    def upload_image(
        item_id: str,
        request: Request,
        file: UploadFile,
        user=Depends(current_user),
    ):
        item = owned_item(request.app.state.db, item_id, user)
        uploaded = file.file
        try:
            data = uploaded.read(MAX_IMAGE_SIZE + 1)
            image_data, content_type = _validated_image(data)
        finally:
            uploaded.close()

        item_images = item.get("images", [])
        if len(item_images) >= MAX_IMAGES_PER_ITEM:
            raise HTTPException(409, "An item can have at most 8 images")

        image_store = request.app.state.image_store
        image_id = image_store.put(
            image_data,
            filename=f"{uuid4().hex}",
            content_type=content_type,
            metadata={
                "itemId": str(item["_id"]),
                "userId": str(user["_id"]),
                "contentType": content_type,
            },
        )
        image_id = ObjectId(image_id)
        image_url = f"/items/{item_id}/images/{image_id}"
        try:
            result = request.app.state.db.items.update_one(
                {
                    "_id": item["_id"],
                    "images.7": {"$exists": False},
                },
                {"$push": {"images": image_url}},
            )
        except Exception:
            image_store.delete(image_id)
            raise
        if result.matched_count != 1:
            image_store.delete(image_id)
            raise HTTPException(409, "An item can have at most 8 images")

        return {
            "id": str(image_id),
            "url": image_url,
            "contentType": content_type,
            "size": len(image_data),
        }

    @app.get("/items/{item_id}/images")
    def list_images(item_id: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        item = get_item(db, item_id)
        if not _can_view_item(db, item, user):
            raise HTTPException(404, "Item not found")
        return [
            {
                "id": str(image_id),
                "url": f"/items/{item_id}/images/{image_id}",
                "contentType": stored.get("metadata", {}).get(
                    "contentType", "application/octet-stream"
                ),
                "size": stored["length"],
            }
            for image_id, stored in _image_references(db, item)
        ]

    @app.get("/items/{item_id}/images/{image_id}")
    def get_image(item_id: str, image_id: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        item = get_item(db, item_id)
        if not _can_view_item(db, item, user):
            raise HTTPException(404, "Item not found")
        if not ObjectId.is_valid(image_id):
            raise HTTPException(404, "Image not found")
        object_id = ObjectId(image_id)
        if not any(reference_id == object_id for reference_id, _ in _image_references(db, item)):
            raise HTTPException(404, "Image not found")

        try:
            image_file = request.app.state.image_store.get(object_id)
        except gridfs.errors.NoFile:
            raise HTTPException(404, "Image not found") from None

        def content():
            try:
                while chunk := image_file.readchunk():
                    yield chunk
            finally:
                image_file.close()

        content_type = image_file.metadata.get("contentType", "application/octet-stream")
        return StreamingResponse(
            content(),
            media_type=content_type,
            headers={
                "Content-Length": str(image_file.length),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f'inline; filename="image-{object_id}"',
            },
        )
