# Lost&Found AI

Lost-and-found frontend and API with AI-assisted matching and private conversations.

## Quick start

Requirements: Docker Compose v2. From the repository root, create the private
environment file, set a generated `JWT_SECRET`, then build and start the stack:

```sh
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(48))'
# Put the generated value in JWT_SECRET in .env.
docker compose up --build
```

The frontend is at <http://localhost:3000> and the API docs are at
<http://localhost:8000/docs>. Create an account in the frontend to publish lost
or found reports, upload private photos, manage report status, and chat with
qualifying matches. The frontend calls the API through a same-origin server
proxy; authentication uses an HTTP-only cookie rather than browser storage.
Reports are saved in MongoDB and photos in GridFS. See [`frontend/README.md`](frontend/README.md) for frontend-only
development and [`backend/README.md`](backend/README.md) for backend setup,
configuration, and tests. Keep `.env` private. Compose binds the frontend, API,
and MongoDB ports to loopback; the matching service is private to the Compose
network. Set `VOYAGE_API_KEY` in `.env` to a private Voyage key to enable
embeddings. It is optional to start the stack; without it, service health
checks still work, reports are still saved, and the UI offers a matching retry.
An optional `GEOAPIFY_API_KEY` enables place suggestions; direct longitude and
latitude entry works without it. Scores of **0.90 or greater** open private
conversations between the two report owners.

Existing browser-local demo reports are not automatically uploaded. Re-submit
them while signed in if they should be shared. Existing backend reports using
older embedding models require the deliberate migration described in the backend README.
