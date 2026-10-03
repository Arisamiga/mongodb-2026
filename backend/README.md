# Lost&Found AI backend

FastAPI service for accounts, lost/found item listings, automatic matching, and private REST-based conversations. It stores data in MongoDB and computes semantic embeddings with a CPU sentence-transformer. Application endpoints require a bearer token except health, registration, and login.

## Local setup

Requirements: Python 3.12+, `uv`, and MongoDB 8 (or Docker Compose).

```sh
cd backend
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Copy the generated value into `JWT_SECRET` in `.env`. Keep `.env` private and do not commit it. The secret must be at least 32 non-padding characters. Review `MONGODB_URI`, `MONGODB_DATABASE`, `CORS_ORIGINS`, and the match settings if needed.

### Run against a local MongoDB

With MongoDB listening at the URI in `.env` (default `mongodb://localhost:27017`):

```sh
uv sync --extra ai
uv run --extra ai uvicorn app.asgi:app --reload
```

The sentence-transformer is loaded lazily; its model files are downloaded on the first item-embedding request if they are not cached. The default encoder runs on CPU. Visit `http://127.0.0.1:8000/docs` for the interactive API reference.

### Run with Docker Compose instead

After creating and filling in `.env` as above:

```sh
docker compose up --build
```

Compose runs the API and MongoDB 8.0, persists Mongo data and the model cache in named volumes, and publishes both ports only on loopback (`127.0.0.1`). Its MongoDB service has no authentication and is for local development only; do not expose it to an untrusted network. Stop the services with `docker compose down` (named-volume data remains).

## Tests and lint

```sh
uv run pytest
uv run ruff check .
```

The API tests use a fake encoder and `mongomock`, so they do not download/run the real model or require a MongoDB server. If `MONGODB_TEST_URI` is set, all API tests use that server and the additional MongoDB test verifies text and geospatial searches. Each test creates then drops a uniquely named test database; point this variable only at a disposable test deployment. The matching helper tests check score behavior, not real-world model accuracy. Passing the default tests does not verify an actual model download, live MongoDB deployment, or match quality.

```sh
MONGODB_TEST_URI=mongodb://localhost:27017 uv run pytest
```

## API overview

JSON request bodies reject unknown fields. IDs are opaque strings. Registration and login return a bearer access token; send it as `Authorization: Bearer <access_token>` on all other API calls except health. Passwords are stored as Argon2 hashes, and are never included in user responses. Listings, including location and image URLs, are visible to all authenticated accounts; avoid putting sensitive details in descriptions. Conversations and their messages are visible only to the two matched users and expose display names, not email addresses.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Ping MongoDB and return service status. |
| `POST /auth/register` | Create an account and return a token (`201`; duplicate email is `409`). |
| `POST /auth/login` | Authenticate and return a token. |
| `GET /auth/me` | Return the authenticated account. |
| `POST /items` | Create a lost/found listing, embed it, then scan for matches (`201`). |
| `GET /items` | List open items by default; filter, text-search, nearby-search, and paginate. |
| `GET /items/{item_id}` | Get an item. |
| `PATCH /items/{item_id}` | Owner changes status to `open` or `resolved`; reopening triggers matching. |
| `POST /items/{item_id}/match` | Owner retries matching for an open item. |
| `GET /items/{item_id}/matches` | List conversations created for an owned item, highest score first. |
| `GET /conversations` | List the caller's conversations. |
| `GET /conversations/{conversation_id}` | Get a conversation if the caller is a member. |
| `POST /conversations/{conversation_id}/messages` | Add a message if the caller is a member (`201`). |
| `GET /conversations/{conversation_id}/messages` | Read messages if the caller is a member. |

Account input: `email`, `password` (12–128 characters at registration), and `display_name` (1–80 characters). Item input has `kind` (`lost` or `found`), `title`, `description`, `category`, optional string-valued `attributes`, optional `images`, and `location`. Images are limited to eight HTTP(S) URLs; this API does not upload image files or analyze image content. Location is GeoJSON: `{ "type": "Point", "coordinates": [longitude, latitude] }`.

`GET /items` accepts optional `kind`, `status` (`open` or `resolved`), `category`, `q` (MongoDB text search), `mine`, and pagination (`limit`, `offset`). For a nearby search, provide both `longitude` and `latitude`, with optional `radius_m` (default 5000); text and nearby searches must be separate requests. The endpoint uses MongoDB's text index for `title` and `description` and its 2dsphere index for nearby search.

## Matching and conversations

Each new item is compared synchronously against all currently open items of the opposite kind. This scans the matching candidate set, so it is intended for small projects rather than large-scale workloads. It works whether the lost or found report arrives first: whichever report is added second scans the first. Items owned by the same account and resolved items are excluded. A conversation is created automatically when the score meets `MATCH_THRESHOLD` (default `0.78`); a unique lost/found pair index prevents duplicate conversations, including concurrent scans.

The score is a weighted similarity heuristic, **not a calibrated probability**. It combines cosine similarity between configured sentence-transformer text embeddings (default `sentence-transformers/all-MiniLM-L6-v2`; weight 0.65), matching shared attributes (0.15 when any keys overlap), distance-based location similarity (0.15), and normalized category equality (0.05). If there are no shared attributes, that component is omitted and the remaining weights are renormalized. `MATCH_DISTANCE_SCALE_KM` (default `5`) controls the location decay. The score and component similarities are returned with the conversation; neither the embeddings nor password hashes are returned by the API. Embeddings are stored in MongoDB and should be treated as private data. Changing `EMBEDDING_MODEL` requires re-embedding existing listings before comparing them with new listings.

Embedding generation occurs before the item is inserted. If it fails, the API returns `503` and does not save the item. If matching fails after insertion, the item remains saved with `matching_status: "failed"`; retry with `POST /items/{item_id}/match`. Item responses expose `matching_status` as `pending`, `completed`, or `failed`.

## End-to-end example

With the API running locally and `jq` installed, the following creates separate finder and owner accounts, files a found and a lost report, reads the resulting match conversation, sends a message, and reads it as the other member:

```sh
API=http://127.0.0.1:8000

FINDER=$(curl -sS "$API/auth/register" -H 'Content-Type: application/json' \
  -d '{"email":"finder@example.com","password":"correct-horse-battery","display_name":"Finder"}')
OWNER=$(curl -sS "$API/auth/register" -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"another-correct-horse","display_name":"Owner"}')
FINDER_TOKEN=$(printf '%s' "$FINDER" | jq -r .access_token)
OWNER_TOKEN=$(printf '%s' "$OWNER" | jq -r .access_token)

FOUND=$(curl -sS "$API/items" -H "Authorization: Bearer $FINDER_TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "kind":"found","title":"Blue backpack","description":"Blue canvas backpack with a silver pin",
    "category":"bags","attributes":{"color":"blue","material":"canvas"},
    "images":["https://example.com/backpack.jpg"],
    "location":{"type":"Point","coordinates":[-73.9857,40.7484]}
  }')
LOST=$(curl -sS "$API/items" -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d '{
    "kind":"lost","title":"Blue backpack","description":"I lost a blue canvas bag with a small silver pin",
    "category":"bags","attributes":{"color":"blue","material":"canvas"},
    "location":{"type":"Point","coordinates":[-73.9858,40.7485]}
  }')
LOST_ID=$(printf '%s' "$LOST" | jq -r .id)

MATCHES=$(curl -sS "$API/items/$LOST_ID/matches" -H "Authorization: Bearer $OWNER_TOKEN")
CONVERSATION_ID=$(printf '%s' "$MATCHES" | jq -r '.[0].id')
curl -sS -X POST "$API/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"body":"I think this may be mine. Can you confirm where you found it?"}'
curl -sS "$API/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $FINDER_TOKEN"
```

For successful matching, the actual item descriptions, category, attributes, and locations must produce a score at or above the configured threshold. Check the returned item `matching_status` and `GET /items/{item_id}/matches` rather than assuming every pair qualifies.

## Storage and deployment notes

MongoDB indexes support unique account emails, item status/kind and owner/time listings, geospatial and text search, unique lost/found conversation pairs, conversation membership listings, and chronological messages. MongoDB Atlas is not required; any compatible MongoDB deployment can be configured with `MONGODB_URI` and `MONGODB_DATABASE`.

This backend does not include production rate limiting, TLS termination, backups, password reset, or image upload/visual analysis. Configure production network security and operations separately; do not use the unauthenticated local Compose database in production.
