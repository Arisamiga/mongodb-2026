import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.config import Settings
from app.db import create_indexes
from app.matching import SentenceEncoder, score_items, text_for_item
from app.schemas import (
    ConversationOut,
    ItemCreate,
    ItemOut,
    ItemStatus,
    Login,
    MessageCreate,
    MessageOut,
    Register,
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
    return {**document, "id": document["_id"]}


def get_item(db, item_id):
    item = db.items.find_one({"_id": item_id})
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


def owned_item(db, item_id, user):
    item = get_item(db, item_id)
    if item["owner_id"] != user["_id"]:
        raise HTTPException(403, "Only the owner can perform this action")
    return item


def conversation_for_user(db, conversation_id, user):
    conversation = db.conversations.find_one({"_id": conversation_id, "member_ids": user["_id"]})
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    return conversation


def conversation_out(db, conversation):
    users = db.users.find({"_id": {"$in": conversation["member_ids"]}})
    return {
        **public_document(conversation),
        "members": [{"id": user["_id"], "display_name": user["display_name"]} for user in users],
    }


def run_matching(app, item):
    db, settings = app.state.db, app.state.settings
    opposite = "found" if item["kind"] == "lost" else "lost"
    candidates = db.items.find(
        {"kind": opposite, "status": "open", "owner_id": {"$ne": item["owner_id"]}}
    )
    for candidate in candidates:
        if candidate["embedding_model"] != item["embedding_model"]:
            raise ValueError("Stored items must be re-embedded before changing the model")
        lost, found = (item, candidate) if item["kind"] == "lost" else (candidate, item)
        result = score_items(lost, found, settings.match_distance_scale_km)
        if result["score"] < settings.match_threshold:
            continue
        pair = {"lost_id": lost["_id"], "found_id": found["_id"]}
        try:
            db.conversations.update_one(
                pair,
                {
                    "$setOnInsert": {
                        "_id": str(uuid4()),
                        **pair,
                        **result,
                        "member_ids": [lost["owner_id"], found["owner_id"]],
                        "created_at": now(),
                    }
                },
                upsert=True,
            )
        except DuplicateKeyError:
            # Concurrent scans may discover the same pair; the unique index arbitrates.
            pass


def finish_matching(app, item):
    try:
        run_matching(app, item)
    except Exception:
        logger.exception("Matching failed for item %s", item["_id"])
        status = "failed"
    else:
        status = "completed"
    app.state.db.items.update_one({"_id": item["_id"]}, {"$set": {"matching_status": status}})
    return get_item(app.state.db, item["_id"])


def create_app(*, database=None, encoder=None, settings=None):
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
        app.state.settings = config
        app.state.encoder = (
            encoder if encoder is not None else SentenceEncoder(config.embedding_model)
        )
        try:
            yield
        finally:
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
        item = {
            **payload.model_dump(mode="json"),
            "_id": str(uuid4()),
            "owner_id": user["_id"],
            "status": "open",
            "matching_status": "pending",
            "created_at": now(),
            "embedding_model": request.app.state.settings.embedding_model,
        }
        try:
            item["embedding"] = request.app.state.encoder.encode(text_for_item(item))
        except Exception:
            logger.exception("Embedding generation failed")
            raise HTTPException(
                503, "AI model unavailable; item was not saved. Please retry."
            ) from None
        request.app.state.db.items.insert_one(item)
        return public_document(finish_matching(request.app, item))

    @app.get("/items", response_model=list[ItemOut])
    def list_items(
        request: Request,
        kind: Literal["lost", "found"] | None = None,
        status: Literal["open", "resolved"] = "open",
        category: str | None = Query(default=None, max_length=80),
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
        if kind:
            query["kind"] = kind
        if category:
            query["category"] = category.strip().casefold()
        if mine:
            query["owner_id"] = user["_id"]
        if (longitude is None) != (latitude is None):
            raise HTTPException(422, "Provide both longitude and latitude")
        if longitude is not None:
            if q:
                raise HTTPException(422, "Text and nearby search must be separate requests")
            query["location"] = {
                "$near": {
                    "$geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "$maxDistance": radius_m,
                }
            }
        if q:
            query["$text"] = {"$search": q}
        cursor = request.app.state.db.items.find(query)
        if longitude is None:
            cursor = cursor.sort([("created_at", -1), ("_id", -1)])
        return [public_document(item) for item in cursor.skip(offset).limit(limit)]

    @app.get("/items/{item_id}", response_model=ItemOut)
    def item_detail(item_id: str, request: Request, user=Depends(current_user)):
        return public_document(get_item(request.app.state.db, item_id))

    @app.patch("/items/{item_id}", response_model=ItemOut)
    def update_status(
        item_id: str, payload: ItemStatus, request: Request, user=Depends(current_user)
    ):
        db = request.app.state.db
        item = owned_item(db, item_id, user)
        db.items.update_one({"_id": item_id}, {"$set": {"status": payload.status}})
        item["status"] = payload.status
        if payload.status == "open":
            item = finish_matching(request.app, item)
        return public_document(item)

    @app.post("/items/{item_id}/match", response_model=ItemOut)
    def retry_match(item_id: str, request: Request, user=Depends(current_user)):
        item = owned_item(request.app.state.db, item_id, user)
        if item["status"] != "open":
            raise HTTPException(409, "Resolved items cannot be matched")
        return public_document(finish_matching(request.app, item))

    @app.get("/items/{item_id}/matches", response_model=list[ConversationOut])
    def matches(item_id: str, request: Request, user=Depends(current_user)):
        db = request.app.state.db
        owned_item(db, item_id, user)
        conversations = db.conversations.find(
            {
                "member_ids": user["_id"],
                "$or": [{"lost_id": item_id}, {"found_id": item_id}],
            }
        ).sort("score", -1)
        return [conversation_out(db, conversation) for conversation in conversations]

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

    return app
