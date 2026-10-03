# Boomerang frontend

A simple lost-and-found reporting interface. The top buttons take you straight to the form for an item you lost or found. There is no search or item-browsing screen.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Submitted reports are saved in the current browser's local storage and remain on that device. This frontend does not currently integrate with the API; running it in the root Docker Compose stack alongside the backend does not change that. For the full stack, create the root `.env` from `.env.example` and run `docker compose up --build` from the repository root; backend credentials remain server-side and are not needed by the frontend. See [`../README.md`](../README.md) for the root quick start and [`../backend/README.md`](../backend/README.md) for API setup.
