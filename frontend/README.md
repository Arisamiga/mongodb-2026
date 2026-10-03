# Boomerang frontend

A lost-and-found interface connected to the Python API and matching service.
The top buttons open lost/found reporting. Account provides registration, sign-in,
sign-out, and your persisted reports; Chat shows private qualifying-match conversations.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Start the API separately using the backend instructions,
or run the full stack with the root `.env` and `docker compose up --build`.
For frontend-only development, copy `.env.example` to `.env.local`; `BACKEND_URL`
defaults to `http://127.0.0.1:8000`. Compose sets it to `http://api:8000` at runtime.
This is a server-only variable, not a public browser URL. The `/api/backend/*`
proxy keeps the bearer token in an HTTP-only, SameSite cookie and forwards it to
the API. Mutations require the custom request header set by `lib/api.ts`.
Use HTTPS and request-body/rate limits at the production reverse proxy.
See [`../README.md`](../README.md) and [`../backend/README.md`](../backend/README.md).

Location suggestions require a Geoapify API key in `frontend/.env.local`:

```sh
GEOAPIFY_API_KEY=your_key_here
```

Restart the dev server after configuring it. The key is used only by the server-side
`/api/places` route; never commit it. In Compose, set it in the root `.env` instead.
Without a key, use **Enter coordinates instead**. Coordinates are submitted in
`[longitude, latitude]` order; a selected place name is not sent to the API.

New reports accept up to three JPG, PNG, or WebP photos (5 MB each), resized to
1200 pixels and uploaded individually to protected GridFS endpoints. Report
details allow additional uploads (eight total), status changes, and matching
retries. Photos are only visible to the owner and qualifying match participants.
If matching or a photo upload fails after creation, the report remains saved;
retry from its details rather than publishing it again. Chat polls messages every
15 seconds and offers manual refresh. Authentication expires according to the
backend JWT TTL; sign in again when an expired-session error appears.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The API/proxy tests cover session cookies, mutation protection, binary photos,
multipart uploads, validation errors, and backend outages. Backend tests also
exercise matching thresholds, conversation authorization, and GridFS access.
Old reports in browser local storage are not automatically migrated to an account.

For isolated browser checks without Docker or external credentials, run
`backend/.venv/bin/python frontend/tests/serve-api.py` from the repository root,
then run the frontend normally. This uses the real API routes with in-memory
Mongo/GridFS and the backend test matching fixture; data disappears when it
stops. It is test-only, not a substitute for production MongoDB/Voyage verification.
