# Integration verification

The frontend now uses the backend instead of browser-local report storage.
`/api/backend/*` is a same-origin server proxy configured by `BACKEND_URL`.
Authentication tokens stay in an HTTP-only cookie; report images use the same
authenticated proxy. Docker Compose supplies the API's internal hostname.

## Verified on 2026-10-03

- Frontend: 11 API/proxy regression tests, TypeScript check, production build.
- Backend: 85 tests passed; the real-Mongo-only test was skipped.
- Node matching service: 9 tests passed, including shared-engine scoring.
- Shared matcher: deterministic tie-order regression passed.
- Python lint and whitespace checks passed.

Browser checks used the production Next application and real HTTP API routes
with `frontend/tests/serve-api.py`: in-memory Mongo/GridFS and deterministic
matching fixtures, not mocked frontend requests. Synthetic accounts verified:

1. Registration returns to the requested lost/found form.
2. Reports persist across reloads with API category labels, timezone-qualified
   event dates, and `[longitude, latitude]` coordinates.
3. A selected photo uploads and renders from its protected endpoint.
4. Opposite reports by different users open a fixture-matched conversation.
5. Both participants can send/read messages and view matched report photos.
6. Only the owner sees management controls; another participant's attempted
   status update receives HTTP 403.
7. Changing status to returned persists after a reload.
8. The token is not visible through `document.cookie`.
9. Chat fits a 390px viewport without horizontal overflow.

Docker Compose execution, a live MongoDB database, real Voyage embeddings, and
Geoapify suggestions were not exercised. Coordinate entry works without Geoapify.
Matching-service and backend boundary tests cover the inclusive 0.90 threshold;
browser fixtures are not evidence of live embedding quality.
