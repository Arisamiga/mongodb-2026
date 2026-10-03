# Matching service contract

The FastAPI backend calls `backend/matching-service`, a Node 24 HTTP wrapper around the shared TypeScript engine in `lib/matching`. This is the implemented local integration, not a proposed external model endpoint or Python port. The wrapper creates embeddings through Voyage AI and reads/scores reports from the same MongoDB database as the API.

## Configuration and startup

Keep settings and credentials in the private `backend/.env` (copy `backend/.env.example` as a starting point). `JWT_SECRET` is required by the API and is not used by the matching service. `VOYAGE_API_KEY` is required for embedding requests. The API and matching service must share `MONGODB_URI` and `MONGODB_DATABASE` so the matching service can look up saved reports. `AI_SERVICE_TOKEN` is optional; when configured, set the same value for both processes and the API sends it as a bearer token. Without it the service does not require bearer auth. `/health` is a database-ping endpoint and does not require that token.

Compose starts MongoDB, the API, and the matching service on a shared network; it sets the service URL to `http://ai:8001`, uses the same local Mongo URI for both app containers, and does not publish the matching-service port. For host-run development, install Node dependencies from `backend` with `npm ci --prefix matching-service`, then start the processes in separate terminals:

```sh
cd backend/matching-service
node --env-file=../.env index.ts
```

```sh
cd backend
uv sync
AI_SERVICE_URL=http://127.0.0.1:8001 uv run uvicorn app.asgi:app --reload
```

The matching service defaults to port 8001. Its `index.ts` also loads `.env` from its working directory if present; the command above explicitly loads `backend/.env`. `AI_SERVICE_URL` defaults to the Compose hostname `http://ai:8001`, so a host-run API must override it as shown. For Atlas or another shared database, configure both processes with the same private URI and database name; never commit credentials.

## Embeddings

The API sends report title and description to:

```http
POST /embeddings
Content-Type: application/json
Authorization: Bearer <AI_SERVICE_TOKEN>  # only when configured
```

```json
{"title":"Blue backpack","description":"Blue canvas backpack left in the library."}
```

The response is `{"embedding":[...]}`. The backend validates a non-empty finite numeric vector and stores it on the report; embeddings are not included in report API responses. Model and dimension configuration is authoritative in `lib/matching/config.ts`: Voyage `voyage-3.5-lite`, 1024 dimensions. `lib/matching/embedding.ts` embeds the trimmed title and description together as a document and uses `VOYAGE_API_KEY` for the Voyage API call. The API requests the embedding before inserting a new report; an unusable or failed response returns API HTTP 503 and the report is not saved.

Images, image URLs, attributes, and account details are not sent to Voyage. Images remain available through the backend's protected upload/read routes and are excluded from remote embedding and matching.

## Match request and response

The API sends the saved report's fields to:

```http
POST /matches
Content-Type: application/json
Authorization: Bearer <AI_SERVICE_TOKEN>  # only when configured
```

```json
{
  "itemId":"saved-report-id",
  "type":"lost",
  "title":"Blue backpack",
  "description":"Blue canvas backpack left in the library.",
  "category":"Bags",
  "location":{"coordinates":[-0.12,51.5]},
  "eventDate":"2026-10-03T12:30:00Z",
  "userId":"report-owner-id"
}
```

`itemId` identifies the saved report. The request validates the full payload, then the service looks up that report in the shared `items` collection; the saved report, not potentially stale request values, is authoritative for its comparison. It scans saved open reports of the opposite type, excludes the current report and reports belonging to the same user, and skips candidates with invalid or incompatible matching fields/vectors.

The response is `{"matches":[{"itemId":"candidate-report-id","score":0.91}]}`. `score` is the engine's weighted total in the range 0–1, not a probability; component scores are not returned over this endpoint. Candidates are ordered by descending score (ID breaks ties), with at most 1000 results. The matching service does not create conversations or change report status. The backend checks candidates against its own database and authorization rules, deduplicates them, and creates private conversations for qualifying pairs. The backend's `MATCH_THRESHOLD` defaults to 0.90 and accepts scores **equal to or above** that value; it may be raised but not lowered.

The backend requires a saved item to be open to match. Matching is read-only with respect to reports and only selects open opposite-type candidates. It does not mark either report matched or returned; owners control those report statuses. Existing conversations remain available to their members after a report closes.

## Scoring and scale

The wrapper calls `cosineSimilarity` and the original `scoreMatch` from `lib/matching/score.ts` against stored 1024-element embeddings. The weighted total combines description 0.6, location 0.2, time 0.1, and category 0.1. Description cosine is linearly stretched from a 0.7 floor to a 0.9 ceiling and clamped to 0–1. Those bounds are sample-derived heuristics, not calibrated probabilities. With coordinates, location score falls linearly from 1 to 0 across 500 metres. Time score has a 24-hour half-life and tolerates a found date up to three hours before the lost date. Category matches case-insensitively.

This implementation scans saved opposite-type open reports and computes exact cosine similarity over their vectors; it does not use Atlas Vector Search's normalized score or require an Atlas vector index. The scan is intended for small-project scale and grows with the number of stored reports. A separate 2d geospatial index may still be used by the backend's nearby-listing route; that is unrelated to vector matching.

## Existing embeddings and operations

Embeddings from MiniLM or any other model/dimension are incompatible with the current Voyage vectors. Re-embed **all reports** with the configured Voyage model before comparing existing reports with new ones. The service returns HTTP 409 if the requested saved report is not ready for matching (including an invalid current embedding); it skips invalid/incompatible candidate reports. There is no automatic migration/backfill or administrative re-embedding API. Back up the database and plan an authorized migration; do not mass-delete reports to work around incompatible vectors. New reports created through the authenticated backend route receive current embeddings.

The backend uses HTTP 503 for embedding-service failures and for match-service request failures. Report creation does not persist a report when embedding generation fails; a later match failure leaves the already-saved report intact and records its internal `matchingStatus` as failed. Retry via the backend's owner-only match route or matches read route. Conversation upserts are idempotent by report pair.

Backend tests use mocked HTTP and a fake database, plus cross-language tests that launch the actual Node HTTP service and verify Python-to-engine matching, private conversations, and image access with injected storage/embeddings. Install the service dependencies first to enable those tests. The matching-service test command is `npm test --prefix matching-service`; service tests inject the embedding/database dependencies while exercising real scoring. MongoDB-specific backend tests are skipped unless `MONGODB_TEST_URI` is set (use only a disposable database). These checks do not establish a live Voyage API request or live shared-database integration; no paid Voyage request is implied by local test success.

## Source of truth

- `lib/matching/config.ts` — embedding model/dimensions, Voyage key name, and scoring parameters.
- `lib/matching/embedding.ts` — Voyage request and embedding validation.
- `lib/matching/score.ts` — cosine, component scores, and weighted total.
- `backend/matching-service/server.ts` and `index.ts` — HTTP routes, database lookup/scan, filtering, and startup.
- `backend/app/ai_client.py` — API-side HTTP payloads and response validation.
- `backend/compose.yaml` and `backend/.env.example` — local service wiring and environment names.
