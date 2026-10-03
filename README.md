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
<http://localhost:8000/docs>. The frontend currently saves reports in the
browser's local storage; running it alongside the API does not imply they are
integrated. See [`frontend/README.md`](frontend/README.md) for frontend-only
development and [`backend/README.md`](backend/README.md) for backend setup,
configuration, and tests. Keep `.env` private. Compose binds the frontend, API,
and MongoDB ports to loopback; the matching service is private to the Compose
network. Set `VOYAGE_API_KEY` in `.env` to a private Voyage key to enable
embeddings. It is optional to start the stack; without it, service health
checks still work.
