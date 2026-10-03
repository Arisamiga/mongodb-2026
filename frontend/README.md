# Boomerang frontend

A responsive Next.js interface for a community lost-and-found board. It includes a homepage, searchable sample listings, item details, and a report form.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm install
npm run dev
```

Open http://localhost:3000. The sample listings are bundled with the app. Reports submitted from the form are saved in the current browser's local storage, so they remain on that browser and device only. Clearing browser storage removes them.

This folder contains the frontend only. It has no API server, database connection, or shared report storage. Connect a backend separately if reports need to be shared between visitors.

Public visitors can report items and search at `/search`; no reports are listed until a search of at least three characters is entered. The old `/browse` route redirects to search. The full board is at `/admin`, outside public navigation, and requires HTTP Basic authentication over HTTPS. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the server environment (or `.env.local` for local development) and restart the app. Without both, admin access is denied. Do not use `NEXT_PUBLIC_` variables for these credentials.

This gate protects the admin route, not the browser-local data. Sample data and a visitor’s own reports remain accessible in their browser. Shared private reports would require backend storage and server-side authorization.
