# Remote AI service contract (proposed)

This backend runs separately from the AI service. The AI service owns model inference; this API owns accounts, report validation/storage, candidate validation, conversation creation, and authorization. The paths and JSON shapes below are what the backend currently expects, but the contract is **not confirmed with the AI teammate**. Confirm the wire format, deployment URL/network, and credentials together before treating this as a stable integration.

## Configuration

Set these values in the backend's private `.env` or deployment environment:

| Variable | Current default | Meaning |
| --- | --- | --- |
| `AI_SERVICE_URL` | `http://ai:8001` | Base URL reachable from the backend process/container. |
| `AI_EMBEDDING_PATH` | `/embeddings` | Relative path for embedding POSTs. |
| `AI_MATCHES_PATH` | `/matches` | Relative path for match POSTs. |
| `AI_TIMEOUT_SECONDS` | `30` | HTTP request timeout; configured range is greater than 0 and at most 120 seconds. |
| `AI_SERVICE_TOKEN` | unset | Optional bearer token sent on both requests when configured. |
| `MATCH_THRESHOLD` | `0.90` | Scores must be at or above this value; it may be raised, not lowered below 0.90. |

Paths must start with one `/` and cannot include a query or fragment. The backend's Compose file includes only API and MongoDB, not the AI service; the hostname/default is not guaranteed to resolve outside a network that provides `ai`. Keep service credentials in environment configuration, never in source control. If the API is public, use an authenticated private service channel; the optional bearer token does not replace network protection.

## Embedding request

```http
POST {AI_SERVICE_URL}{AI_EMBEDDING_PATH}
Content-Type: application/json
Authorization: Bearer <AI_SERVICE_TOKEN>  # only when configured
```

```json
{"title":"Blue backpack","description":"Blue canvas backpack left in the library."}
```

Expected success response:

```json
{"embedding":[0.12,-0.34,0.56]}
```

`embedding` must be a non-empty array of at most 4096 finite JSON numbers. The backend currently accepts a varying vector length; agree on a fixed dimension/model compatibility rule before production. It stores the value on the report as `embedding` and excludes it from API report responses. The AI service should return a non-2xx response for inference failures; malformed JSON, transport errors, non-2xx status, or schema-invalid response are treated as AI failure.

## Match request

```http
POST {AI_SERVICE_URL}{AI_MATCHES_PATH}
Content-Type: application/json
Authorization: Bearer <AI_SERVICE_TOKEN>  # only when configured
```

```json
{
  "itemId": "6d3c1f0e-4ccf-4f31-a15a-f5131f7031db",
  "type": "lost",
  "title": "Blue backpack",
  "description": "Blue canvas backpack left in the library.",
  "category": "Bags",
  "location": {"coordinates": [-0.12, 51.5]},
  "eventDate": "2026-10-03T12:30:00Z",
  "userId": "report-owner-id"
}
```

Each comparison sends the saved report's type (which selects the opposite search side), title and description (embedding text), category (category score), longitude-first coordinates (location score), timezone-qualified event date/time (time score), and authenticated owner's identifier (exclude their own reports). `itemId` is retained for correlation with the stored report. BSON dates are serialized to ISO 8601 for HTTP JSON; the database still stores real dates. Coordinates come from the configured campus dropdown, and `userId` comes from the account rather than client input. Image bytes, image URLs, embeddings, and account details are not sent in this request. Endpoint paths and response format still need confirmation from the teammate.

Expected success response:

```json
{"matches":[{"itemId":"3b92d58e-3164-4f71-bab0-210865b26c82","score":0.91}]}
```

Each candidate `itemId` must be a string of 1–100 characters. `score` must be a finite number from 0 through 1. The response may contain at most 1000 candidates. Return IDs of reports already stored in this backend's agreed `items` collection. The AI service should rank candidates as useful, but must not create conversations, change report status, or decide authorization. Candidate scores below `MATCH_THRESHOLD` are ignored by the backend; scores at or above 0.90 auto-link users by default.

The backend is authoritative for whether a candidate exists, has opposite type (`lost`/`found`), remains `open`, and belongs to a different user. It skips invalid/non-eligible candidates, deduplicates IDs, sorts by score, then upserts a private conversation keyed by the lost/found report pair. An AI candidate is not confirmation that an item was returned: report status remains `open` until its owner sets `matched` or `returned`. Those closed reports are excluded from new matching; existing conversations are retained.

## Failure and retry behavior

For report creation, embedding is requested before MongoDB insertion. An unavailable service or unusable embedding returns API `503` and saves no report. Once the embedding is stored with the report, a match-service failure does not roll back the report: the API returns it with `matchingStatus: "failed"`. Retry matching with the owner's `POST /items/{item_id}/match` call. `GET /items/{item_id}/matches` also calls the match service and can return `503`; retrying is safe because conversations are upserted by unique report pair. The report's internal `matchingStatus` records `pending`, `completed`, or `failed`; it is distinct from the agreed report statuses `open`, `matched`, and `returned`.

## Backend-owned report and storage contract

Report creation is authenticated; `userId` is derived from the caller and must not be provided by the AI service or client. Current API/report fields use the agreed names `type`, `title`, `description`, `category`, `location`, `eventDate`, `status`, `userId`, and `createdAt`, with a stored `embedding`. Categories are exactly `Electronics`, `Clothing`, `Bags`, `Keys`, `Cards and IDs`, `Books`, or `Other`; types are exactly lowercase `lost` and `found`; statuses are exactly lowercase `open`, `matched`, and `returned`.

The `items` collection is hardcoded. `MONGODB_DATABASE` currently defaults to `lost_found`; agree with the teammate on the shared database name before connecting to Atlas. The Atlas URI is supplied privately as `MONGODB_URI` and must not be committed. `createdAt` is backend-assigned. `eventDate` must arrive as an ISO 8601 date-time with timezone; both values are persisted as BSON dates rather than strings. Report IDs are currently UUID strings; serialization/lookup supports ObjectId-form IDs as well, so the match service must treat `itemId` as an opaque string and echo valid report IDs exactly.

Location is not arbitrary user text or GeoJSON in the current API. Each `CAMPUS_LOCATIONS` entry has this structure: `{"name":"<agreed campus place>","coordinates":[longitude,latitude]}`. Replace the placeholders with the actual agreed place name and numeric coordinates; the repository intentionally does not guess campus coordinates.

Coordinates are longitude first, latitude second. API report creation accepts the selected place's exact `name`; the backend persists the full `{ "name": "...", "coordinates": [longitude, latitude] }` object. The example environment intentionally configures no places. The actual roughly ten place names and coordinates are not in repository documentation and must be supplied/confirmed by the project teammates; do not invent them.

`GET /metadata` (authenticated) provides the backend's current `categories`, `statuses`, and configured `locations` for clients to populate consistently. Image files are attached separately through the backend's authenticated GridFS upload route; `images` stores protected API URLs. String attributes remain optional report data. Embedding generation currently receives only title and description, not image bytes; an image-aware AI contract remains future work.

## Operational agreements and gaps

- Confirm the two endpoint paths, request/response schemas, vector dimensions, service URL/network, and token arrangement with the AI teammate; the shapes documented here describe the backend's current expectations, not mutual confirmation.
- Confirm the shared Atlas database name. Current default is `lost_found`; the item collection name is `items`.
- Populate the real campus dropdown and coordinates in `CAMPUS_LOCATIONS`; none are supplied by this repository.
- The backend currently has no automatic migration for old report documents or automatic embedding backfill. Existing legacy fields/locations and unembedded reports need a planned migration; new or seed reports should be submitted through authenticated `POST /items`, not inserted directly, so the embedding is created before storage.
- An existing `location_2dsphere` index from the previous backend must be deliberately removed during migration because it rejects the new non-GeoJSON location shape; see [README.md](README.md#existing-data). The current index is `location.coordinates` (2d).
- The repository's tests use fake/mocked AI and database components by default. A live AI-service/Atlas end-to-end integration has not been established by this contract.
