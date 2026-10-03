# Boomerang frontend

A simple lost-and-found reporting interface. The top buttons take you straight to the form for an item you lost or found. There is no search or item-browsing screen.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open http://localhost:3000. Submitted reports are saved in the current browser's local storage and remain on that device. The separate API service is in the repository-level `backend` folder.
