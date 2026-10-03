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
