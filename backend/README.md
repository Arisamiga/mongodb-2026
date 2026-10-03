# Lost&Found backend

FastAPI service for accounts, lost/found reports, matching, and private conversations. It stores reports and their embeddings in MongoDB and calls the repository's Node 24 HTTP matching service for embeddings and candidate scores. That wrapper reuses the merged engine in `lib/matching`; it is not a Python port and does not run a separate model server. All API routes except health, registration, and login require a bearer access token.

## Local setup

Requirements: Docker Compose v2 for the stack, or Python 3.12+, `uv`, Node.js 24+, and npm for backend development. MongoDB 8 is included in the root Compose setup.

```sh
# Run from the repository root.
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Put the generated value in root `.env` as `JWT_SECRET` (at least 32 non-padding characters). `VOYAGE_API_KEY` is optional for startup and health checks, but is needed for embedding requests; set it to a private Voyage AI key to enable report matching. `AI_SERVICE_TOKEN` is optional. Keep `.env` private and do not commit secrets. The API and matching service share `MONGODB_URI` and `MONGODB_DATABASE`; `JWT_SECRET` is required by the API but is not used by the matching service. The root `.env.example` uses host-local defaults (`localhost` for MongoDB and `127.0.0.1` for the matching-service URL); Compose overrides the database hostname to `mongo` and the API's matching-service URL to `http://ai:8001`. Locations are submitted with each report, not configured in `.env`.

If you already have a `backend/.env`, move it to the repository root yourself before starting; preserve its values and do not overwrite an existing root `.env`. Install the matching service dependencies from its directory:

```sh
cd backend/matching-service
npm ci
```

For direct local development, run the matching service and API in separate terminals. The matching service and API load the root `.env` themselves, including when started from their respective directories; no command-line env-file flag or host-only `AI_SERVICE_URL` override is needed. Start MongoDB separately (or run `docker compose up mongo` from the repository root):

```sh
cd backend/matching-service
npm start
```

```sh
cd backend
uv sync
uv run uvicorn app.asgi:app --reload
```

The interactive API reference is at `http://127.0.0.1:8000/docs`. The matching service listens on port 8001 and uses the saved report in MongoDB as the authoritative input to matching.

### Docker Compose

Run Compose from the repository root after creating `.env` as described above:

```sh
# Run from the repository root.
docker compose up --build
```

The root Compose file starts the frontend, API, MongoDB, and Node matching service. The frontend is published at `http://localhost:3000`, the API at `http://localhost:8000`, and MongoDB at `localhost:27017`; all three host ports bind to loopback, while the matching service is private to the Compose network. Compose keeps the Dockerfiles with their services (`frontend/Dockerfile`, `backend/Dockerfile`, and `backend/matching-service/Dockerfile`); its build contexts are `frontend/`, `backend/`, and the repository root for the matching service. The API and matching containers receive the root `.env` (including private Voyage and optional service-token values), but the frontend does not receive backend secrets. Compose uses project name `backend` by default, preserving the prior `backend_mongo-data` volume. If the old stack was started with a custom project name, use that same name with `docker compose -p <project-name>` from the repository root to continue using its volume. Compose overrides the sample's host-local Mongo URI with `mongodb://mongo:27017` for both backend services and sets the API's matching URL to `http://ai:8001`. Mongo data persists in a named volume. To use Atlas, deliberately configure both backend processes to use the same private URI. Never put a database URI in source control or documentation. Stop services with `docker compose down`; this preserves the volume. Do not use `docker compose down -v` unless you intend to delete the stored MongoDB data.

## Tests and lint

```sh
# Run from backend/.
uv run pytest
uv run ruff check .
npm test --prefix matching-service
```

Backend tests use a fake database and mocked HTTP client; the optional MongoDB tests are skipped unless `MONGODB_TEST_URI` is set, in which case they create and drop uniquely named databases (use only a disposable deployment). After installing the matching-service dependencies, Python also launches the real Node HTTP service and verifies scoring, conversations, and image access in both report arrival orders, with an injected database and embedding provider. These cross-language tests skip when Node or the service dependencies are missing. The matching-service tests exercise the wrapper with injected database/embedding dependencies and the real scoring code; neither suite makes a live Voyage request by default. Passing local tests is not live Atlas/Voyage verification.

## Reports and API

JSON input rejects unknown fields. Register/login provide bearer tokens; pass `Authorization: Bearer <access_token>` on authenticated routes. `GET /metadata` returns the allowed categories and statuses and requires authentication. Send the item's coordinates directly when creating a report.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Ping MongoDB. |
| `GET /metadata` | Return report categories and statuses. |
| `POST /auth/register`, `POST /auth/login` | Create an account or obtain a bearer token. |
| `GET /auth/me` | Return the authenticated account. |
| `POST /items` | Create a report, request its embedding, save it, then request matches (`201`). |
| `GET /items` | List open reports by default; filter, text/nearby search, and paginate. |
| `GET /items/{item_id}` | Get a report. |
| `PATCH /items/{item_id}` | Owner changes report status; reopening triggers matching. |
| `POST /items/{item_id}/match` | Owner retries matching for an open report. |
| `GET /items/{item_id}/matches` | Owner requests current matches; returns candidate report, score, and conversation. |
| `GET /conversations` and `/conversations/{conversation_id}` | List or view conversations the caller belongs to. |
| `GET`/`POST /conversations/{conversation_id}/messages` | Read or send messages as a conversation member. |

Report-create JSON fields are `type`, `title`, `description`, `category`, `location`, and timezone-qualified `eventDate`; `attributes` are optional. Attach files after creation using the image-upload route below, not an `images` field in the JSON body. `type` is exactly `lost` or `found`. Categories are exactly `Electronics`, `Clothing`, `Bags`, `Keys`, `Cards and IDs`, `Books`, or `Other`. Statuses are exactly `open`, `matched`, and `returned`. A report starts `open`; an AI match does not change report status. Only the owner can change it, and only `open` reports are candidates for new conversations. Closed reports do not create further conversations; existing conversations remain available to their members.

`eventDate` must be an ISO 8601 date-time including a timezone, for example `2026-10-03T12:30:00+00:00`. It is stored as a MongoDB BSON date, not a text field. `createdAt` is assigned by the backend and also stored as a BSON date. User IDs come from the authenticated account and are not accepted from report input. Report IDs are UUID strings generated by this backend; it also accepts ObjectId-form IDs during lookup for compatibility and serializes IDs as strings in API responses.

Submit `"location": {"coordinates": [longitude, latitude]}` with each report. Both values must be finite numbers: longitude from -180 to 180 and latitude from -90 to 90. Coordinates are saved exactly in that order and sent to the AI comparison service. No place name, dropdown, or configured location list is used. Optional `attributes` are string key/value pairs.

`GET /items` supports `type`, `status`, `category`, `q`, `mine`, pagination, and nearby-search coordinates. Text search (`q`) and nearby search must be separate requests. Nearby search takes both `longitude` and `latitude`, with optional `radius_m` (default 5000). Listing APIs return report details, but omit embeddings.

### Create and check a report

Register or log in to obtain a token, then submit the item's actual coordinates. Coordinates below are illustrative; replace them with the submitted location. Submit new and seed reports through this route so the backend requests and saves each embedding:

```sh
curl -X POST http://127.0.0.1:8000/items \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"lost","title":"Blue backpack","description":"Blue canvas backpack.","category":"Bags","location":{"coordinates":[-0.12,51.5]},"eventDate":"2026-10-03T12:30:00+00:00"}'
```

The response includes the saved report ID (as `_id`) and `matchingStatus`, but not its embedding. To request matches for that owned report, call `GET /items/{id}/matches`; it returns candidate report details, score, and conversation.

## Matching lifecycle

On `POST /items`, the backend calls the AI embedding endpoint before inserting the report. If that request or its response fails, the API returns `503` and inserts no report. On success, the returned embedding is stored on the report in the `items` collection. The backend then asks the AI service for candidate IDs and scores. It validates each candidate against MongoDB: it must exist, be open, have the opposite report type, and belong to a different user. Scores **at or above 0.90** auto-link users in a private conversation; exactly 0.90 qualifies. `MATCH_THRESHOLD` may be raised but not lowered below 0.90. Conversation creation is idempotent via a unique pair index. The score is supplied by the AI service; it is not described as a probability.

If matching fails after insertion, the report stays saved and has `matchingStatus: "failed"`; the create response still contains the saved report. Retry with `POST /items/{item_id}/match`. Successful matching records `matchingStatus: "completed"`. This internal matching status is separate from report `status`. `GET /items/{item_id}/matches` asks the AI service again and returns matching report details, score, and conversation; it is owner-only. Embeddings are private stored data and are never returned in report API responses.

See [AI_CONTRACT.md](AI_CONTRACT.md) for the matching service's implemented wire protocol, scoring behavior, and embedding compatibility requirements.

## Image attachments (GridFS)

Images are stored in `images.files` and `images.chunks` in the same MongoDB database. Report `images` contains protected relative API URLs, never base64 data or third-party URLs.

| Method and path | Access |
| --- | --- |
| `POST /items/{id}/images` | Report owner; multipart field named `file`. |
| `GET /items/{id}/images` | Owner or participant in a match scoring at least 90%; returns attachment metadata. |
| `GET /items/{id}/images/{imageId}` | Same access; streams the image bytes. |

Up to eight images per report, each at most 5 MiB and 20 million pixels. JPEG, PNG, and WebP are supported; SVG, animated files, and invalid image content are rejected. Images are re-encoded to remove EXIF metadata such as GPS coordinates. Upload names and declared MIME types are not trusted. An upload failure leaves the report saved, so retry only the attachment. Successful uploads return `id`, `url`, `contentType`, and `size`.

```sh
curl -X POST "http://127.0.0.1:8000/items/$ITEM_ID/images" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -F 'file=@photo.jpg'
curl "http://127.0.0.1:8000/items/$ITEM_ID/images" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The frontend should fetch the returned `url` with the bearer header and display a blob URL; a plain `<img src>` cannot supply that header. A finder linked to the lost report with a score of at least 90% can use these same read endpoints; unrelated accounts receive `404`. Existing conversation participants retain image access after a report is marked matched/returned. This does not send image content to the AI service: its embedding request still contains only title and description. Configure a reverse-proxy request-body limit and rate limiting in production, since multipart parsing occurs before application validation. Legacy external image URLs are not served or fetched by these routes.

## Existing data

Remove the obsolete `CAMPUS_LOCATIONS` entry from `.env`. Existing named-location reports should retain their coordinates but have the legacy `location.name` removed in a deliberate migration; the new location contract accepts only `coordinates`. Startup does not rewrite existing data.

Update any old `.env` using `MATCH_THRESHOLD=0.78` to `0.90` or higher; lower thresholds now fail configuration validation. Existing external image URLs are not migrated into GridFS. Owners must upload the actual files using the new attachment route.

There is no automatic migration for the previous report format (for example `kind`, `owner_id`, `created_at`, `resolved`, or GeoJSON `Point` locations). Existing documents may require a deliberate migration to the current field names, status values, location shape, and BSON dates. The current engine uses Voyage `voyage-3.5-lite` embeddings with 1024 dimensions: previously stored MiniLM or other-model vectors are incompatible. Re-embed **all** reports with the current Voyage model before comparing old and new reports. The matching service rejects an invalid current-report vector with HTTP 409 and skips incompatible candidates; there is no automatic backfill or administrative re-embedding API. Back up the database and plan an authorized migration; do not mass-delete reports to work around incompatible vectors. New reports submitted through `POST /items` get current embeddings.

The previous `location_2dsphere` index expects GeoJSON and can reject the new location shape. Before using an existing database, back it up and plan the report migration. An administrator should inspect `db.items.getIndexes()` and deliberately remove that obsolete index with `db.items.dropIndex("location_2dsphere")` after confirming it is no longer used. Startup does not drop indexes or rewrite shared data. The new nearby search uses the `location.coordinates` 2d index and `$geoWithin`/`$centerSphere`; results are ordered by creation time, not distance.

Authenticated users can see listings and their locations; only conversation members can read or send messages. Production rate limiting, password reset, TLS termination, and backups remain deployment work.
