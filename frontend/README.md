# Boomerang frontend

A simple lost-and-found reporting interface. The top buttons take you straight to the form for an item you lost or found. There is no search or item-browsing screen.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open http://localhost:3000. Submitted reports are saved in the current browser's local storage and remain on that device. The separate API service is in the repository-level `backend` folder.

Location suggestions require a Geoapify API key in `frontend/.env.local`:

```sh
GEOAPIFY_API_KEY=your_key_here
```

Restart the dev server after configuring it. The key is used only by the server-side `/api/places` route; never commit it. Without a valid key, location selection and report submission remain unavailable.

Reports accept up to three JPG, PNG, or WebP photos (5 MB each). Photos are resized to at most 1200 pixels and saved as compressed JPEGs in browser storage, not uploaded to the backend. Browser storage limits still apply.
