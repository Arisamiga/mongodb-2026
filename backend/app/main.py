import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from gridfs import GridFS
from pydantic import ValidationError
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.ai_client import AIClient, AIServiceError
from app.config import Settings
from app.db import create_indexes
from app.images import register_image_routes
from app.schemas import (
    Category,
    ConversationOut,
    ItemCreate,
    ItemOut,
    ItemStatus,
    Login,
    MatchOut,
    MessageCreate,
    MessageOut,
    Register,
    ReportStatus,
    ReportType,
    TokenOut,
    UserOut,
)
from app.security import current_user, dummy_hash, issue_token, password_hasher, verify_password

logger = logging.getLogger(__name__)


def now():
    timestamp = datetime.now(timezone.utc)
    # BSON dates retain milliseconds, so create/read responses must use that precision.
    return timestamp.replace(microsecond=(timestamp.microsecond // 1000) * 1000)


def public_document(document):
    return {**document, "id": str(document["_id"])}


def item_document(document):
    return {**document, "_id": str(document["_id"]), "userId": str(document["userId"])}


def identifier_query(identifier):
    values = [str(identifier)]
    if ObjectId.is_valid(str(identifier)):
        values.append(ObjectId(str(identifier)))
    return {"_id": {"$in": values}}


def get_item(db, item_id):
    item = db.items.find_one(identifier_query(item_id))
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


def owned_item(db, item_id, user):
    item = get_item(db, item_id)
    if str(item["userId"]) != str(user["_id"]):
        raise HTTPException(403, "Only the owner can perform this action")
    return item


def conversation_for_user(db, conversation_id, user):
    conversation = db.conversations.find_one({"_id": conversation_id, "member_ids": user["_id"]})
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    return conversation


def conversation_out(db, conversation):
    users = db.users.find(
        {"$or": [identifier_query(member) for member in conversation["member_ids"]]}
    )
    return {
        **public_document(conversation),
        "members": [
            {"id": str(user["_id"]), "display_name": user["display_name"]} for user in users
        ],
    }


def run_matching(app, item):
    db, settings = app.state.db, app.state.settings
    if item["status"] != "open":
        return []
    opposite = "found" if item["type"] == "lost" else "lost"
    matches = app.state.ai_client.find_matches(item)
    accepted = []
    seen = set()
    for match in sorted(matches, key=lambda match: match.score, reverse=True):
        if match.itemId in seen or match.score < settings.match_threshold:
            continue
        seen.add(match.itemId)
        candidate = db.items.find_one(identifier_query(match.itemId))
        if (
            candidate is None
            or candidate.get("type") != opposite
            or candidate.get("status") != "open"
            or "userId" not in candidate
        ):
            continue
        if str(candidate["userId"]) == str(item["userId"]):
            continue
        try:
            ItemOut.model_validate(item_document(candidate))
        except ValidationError:
            continue
        owner = db.users.find_one(identifier_query(candidate["userId"]))
        if owner is None:
            continue
        # Recheck the requesting report after remote inference; it may have been closed meanwhile.
        if get_item(db, str(item["_id"]))["status"] != "open":
            break
        lost, found = (item, candidate) if item["type"] == "lost" else (candidate, item)
        pair = {"lost_id": str(lost["_id"]), "found_id": str(found["_id"])}
        try:
            db.conversations.update_one(
                pair,
                {
                    "$setOnInsert": {
                        "_id": str(uuid4()),
                        **pair,
                        "score": match.score,
                        "member_ids": [str(lost["userId"]), str(found["userId"])],
                        "created_at": now(),
                    }
                },
                upsert=True,
            )
        except DuplicateKeyError:
            # Concurrent scans may discover the same pair; the unique index arbitrates.
            pass
        conversation = db.conversations.find_one(pair)
        accepted.append(
            {
                "item": item_document(candidate),
                "score": match.score,
                "conversation": conversation_out(db, conversation),
            }
        )
    return accepted


def finish_matching(app, item):
    try:
        run_matching(app, item)
    except Exception:
        logger.warning("Matching failed for item %s", item["_id"])
        status = "failed"
    else:
        status = "completed"
    app.state.db.items.update_one({"_id": item["_id"]}, {"$set": {"matchingStatus": status}})
    return get_item(app.state.db, str(item["_id"]))


def create_app(*, database=None, ai_client=None, settings=None):
    @asynccontextmanager
    async def lifespan(app):
        config = settings if settings is not None else Settings()
        client = None
        if database is None:
            client = MongoClient(config.mongodb_uri, serverSelectionTimeoutMS=5000, tz_aware=True)
            client.admin.command("ping")
            db = client[config.mongodb_database]
        else:
            db = database
        create_indexes(db)
        app.state.db = db
        app.state.image_store = GridFS(db, collection="images")
        app.state.settings = config
        app.state.ai_client = ai_client if ai_client is not None else AIClient(config)
        try:
            yield
        finally:
            if ai_client is None:
                app.state.ai_client.close()
            if client is not None:
                client.close()

    app = FastAPI(title="Lost&Found AI API", version="0.1.0", lifespan=lifespan)
    # CORS configuration is read at construction so middleware is installed before startup.
    cors = settings if settings is not None else Settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors.cors_origins,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(PyMongoError)
    async def database_error(request: Request, error: PyMongoError):
        logger.error("MongoDB request failed: %s", type(error).__name__)
        return JSONResponse(status_code=503, content={"detail": "Database temporarily unavailable"})

    @app.get("/health")
    def health(request: Request):
        request.app.state.db.command("ping")
        return {"status": "ok"}

    @app.get("/metadata")
    def metadata(request: Request, user=Depends(current_user)):
        from typing import get_args

        return {
            "categories": get_args(Category),
            "statuses": get_args(ReportStatus),
            "locations": [
                place.model_dump(mode="json")
                for place in request.app.state.settings.campus_locations
            ],
        }

    @app.post("/auth/register", response_model=TokenOut, status_code=201)
    def register(payload: Register, request: Request):
        user = {
            "_id": str(uuid4()),
            "email": str(payload.email).casefold(),
            "display_name": payload.display_name,
            "password_hash": password_hasher.hash(payload.password),
            "created_at": now(),
        }
        try:
            request.app.state.db.users.insert_one(user)
        except DuplicateKeyError:
            raise HTTPException(409, "Email already registered") from None
        return {
            "access_token": issue_token(user["_id"], request.app.state.settings),
            "user": public_document(user),
        }

    @app.post("/auth/login", response_model=TokenOut)
    def login(payload: Login, request: Request):
        user = request.app.state.db.users.find_one({"email": str(payload.email).casefold()})
        valid = verify_password(payload.password, user["password_hash"] if user else dummy_hash)
        if not valid or user is None:
            raise HTTPException(401, "Invalid email or password")
        return {
            "access_token": issue_token(user["_id"], request.app.state.settings),
            "user": public_document(user),
        }

    @app.get("/auth/me", response_model=UserOut)
    def me(user=Depends(current_user)):
        return public_document(user)

    @app.post("/items", response_model=ItemOut, status_code=201)
    def create_item(payload: ItemCreate, request: Request, user=Depends(current_user)):
        locations = request.app.state.settings.campus_locations
        if not locations:
            raise HTTPException(503, "Campus locations are not configured")
        location = next((place for place in locations if place.name == payload.location), None)
        if location is None:
            raise HTTPException(422, "Select a location from /metadata")
        item = {
            **payload.model_dump(mode="python", exclude={"location"}),
            "images": [],
            "location": location.model_dump(mode="json"),
            "_id": str(uuid4()),
            "userId": user["_id"],
            "status": "open",
            "matchingStatus": "pending",
            "createdAt": now(),
        }
        try:
            item["embedding"] = request.app.state.ai_client.create_embedding(
                payload.title, payload.description
            )
        except AIServiceError:
            logger.warning("AI embedding service unavailable")
            raise HTTPException(
                503, "AI model unavailable; item was not saved. Please retry."
            ) from None
        request.app.state.db.items.insert_one(item)
        return item_document(finish_matching(request.app, item))

    @app.get("/items", response_model=list[ItemOut])
    def list_items(
        request: Request,
        type: ReportType | None = None,
        status: ReportStatus = "open",
        category: Category | None = None,
        q: str | None = Query(default=None, min_length=1, max_length=200),
        mine: bool = False,
        longitude: float | None = Query(default=None, ge=-180, le=180),
        latitude: float | None = Query(default=None, ge=-90, le=90),
        radius_m: int = Query(default=5000, ge=1, le=100000),
        limit: int = Query(default=20, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
        user=Depends(current_user),
    ):
        query = {"status": status}
        if type:
            query["type"] = type
        if category:
            query["category"] = category
        if mine:
            query["userId"] = user["_id"]
        if (longitude is None) != (latitude is None):
            raise HTTPException(422, "Provide both longitude and latitude")
        if longitude is not None:
            if q:
                raise HTTPException(422, "Text and nearby search must be separate requests")
            query["location.coordinates"] = {
                "$geoWithin": {"$centerSphere": [[longitude, latitude], radius_m / 6371008.8]}
            }
        if q:
            query["$text"] = {"$search": q}
        cursor = request.app.state.db.items.find(query)
        cursor = cursor.sort([("createdAt", -1), ("_id", -1)])
        return [item_document(item) for item in cursor.skip(offset).limit(limit)]

    @app.get("/items/{item_id}", response_model=ItemOut)
    def item_detail(item_id: str, request: Request, user=Depends(current_user)):
        return item_document(get_item(request.app.state.db, item_id))

    @app.patch("/items/{item_id}", response_model=ItemOut)
    def update_status(
        item_id: str, payload: ItemStatus, request: Request, user=Depends(current_user)
    ):
        db = request.app.state.db
        item = owned_item(db, item_id, user)
        db.items.update_one({"_id": item["_id"]}, {"$set": {"status": payload.status}})
        item["status"] = payload.status
        if payload.status == "open":
            item = finish_matching(request.app, item)
        return item_document(item)

    @app.post("/items/{item_id}/match", response_model=ItemOut)
    def retry_match(item_id: str, request: Request, user=Depends(current_user)):
        item = owned_item(request.app.state.db, item_id, user)
        if item["status"] != "open":
            raise HTTPException(409, "Only open items can be matched")
        return item_document(finish_matching(request.app, item))

    @app.get("/items/{item_id}/matches", response_model=list[MatchOut])
    def matches(item_id: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        item = owned_item(db, item_id, user)
        try:
            matches = run_matching(request.app, item)
        except AIServiceError:
            db.items.update_one({"_id": item["_id"]}, {"$set": {"matchingStatus": "failed"}})
            raise HTTPException(503, "AI matching service unavailable; please retry") from None
        db.items.update_one({"_id": item["_id"]}, {"$set": {"matchingStatus": "completed"}})
        return matches

    @app.get("/conversations", response_model=list[ConversationOut])
    def conversations(
        request: Request,
        limit: int = Query(default=20, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
        user=Depends(current_user),
    ):
        db = request.app.state.db
        cursor = (
            db.conversations.find({"member_ids": user["_id"]})
            .sort([("created_at", -1), ("_id", -1)])
            .skip(offset)
            .limit(limit)
        )
        return [conversation_out(db, conversation) for conversation in cursor]

    @app.get("/conversations/{conversation_id}", response_model=ConversationOut)
    def conversation_detail(conversation_id: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        return conversation_out(db, conversation_for_user(db, conversation_id, user))

    @app.post(
        "/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201
    )
    def send_message(
        conversation_id: str,
        payload: MessageCreate,
        request: Request,
        user=Depends(current_user),
    ):
        db = request.app.state.db
        conversation_for_user(db, conversation_id, user)
        message = {
            "_id": str(uuid4()),
            "conversation_id": conversation_id,
            "sender_id": user["_id"],
            "body": payload.body,
            "created_at": now(),
        }
        db.messages.insert_one(message)
        return public_document(message)

    @app.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
    def messages(
        conversation_id: str,
        request: Request,
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=10000),
        user=Depends(current_user),
    ):
        db = request.app.state.db
        conversation_for_user(db, conversation_id, user)
        cursor = (
            db.messages.find({"conversation_id": conversation_id})
            .sort([("created_at", 1), ("_id", 1)])
            .skip(offset)
            .limit(limit)
        )
        return [public_document(message) for message in cursor]

    register_image_routes(app)
    return app
