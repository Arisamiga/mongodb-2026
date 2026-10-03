# Boomerang

A responsive Next.js MVP for a MongoDB student hackathon. Includes a homepage, searchable community
board, lost/found reports, item details, and email contact. No authentication or AI matching is
implemented.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The example environment explicitly enables **demo mode**. Sample
listings and new reports are persisted in `.data/items.json`. Demo mode is for a single local
server; it is not a database substitute for deployment. Remove `.data/items.json` to reset the demo.
Photo URLs are optional, HTTPS only, and loaded directly by the browser. Sample imagery comes from
Unsplash.

## Connect MongoDB Atlas

1. Create an Atlas database user with read/write access only to the application database, and allow
   the deployment's outbound IP in Atlas Network Access.
2. Set these values in `.env.local` or the deployment's secret environment:

```dotenv
DEMO_MODE=false
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=lost_found_ai
```

3. Restart the application. On first database access, it creates the `items` collection and its
   indexes. It does not seed sample reports in Atlas.

MongoDB credentials remain server-side. Connection failures return an error; the app never silently
switches from Atlas to demo storage. The connection pool is reused across requests and hot reloads.
Use OpenBao to retrieve existing infrastructure credentials if appropriate; do not commit
credentials.

## Data model

`items` documents:

| Field                    | Type / purpose                                             |
| ------------------------ | ---------------------------------------------------------- |
| `_id`                    | MongoDB ObjectId, internal only                            |
| `id`                     | Public UUID, unique index                                  |
| `type`                   | `LOST` or `FOUND`                                          |
| `title`, `description`   | Bounded, validated strings                                 |
| `category`               | One of seven shared categories                             |
| `location`               | Human-readable location                                    |
| `eventDate`              | Valid ISO date `YYYY-MM-DD`, not in the future             |
| `contactEmail`           | Reporter email; explicitly disclosed on the detail page    |
| `imageUrl`               | Optional HTTPS photo URL                                   |
| `status`                 | `OPEN`; reserved `RESOLVED` for a later ownership workflow |
| `createdAt`, `updatedAt` | UTC ISO timestamps                                         |
| `schemaVersion`          | `1`                                                        |

Indexes: unique `id`; compound `status/type/category/createdAt`; text `title/description/location`.
Atlas search uses the standard MongoDB text index. Demo search uses a case-insensitive substring
match. Lists return the newest 100 matching reports in Atlas; pagination can be added later.

## Routes

- `/` — homepage and recent reports
- `/browse` — debounced search, category and lost/found filters
- `/report?type=LOST|FOUND` — report form with validation and submission state
- `/items/[id]` — item details and an email link
- `GET /api/items?q=&type=&category=` — filtered reports (email excluded)
- `POST /api/items` — validates and persists a report; returns 201
- `GET /api/items/[id]` — public report or 404 (email excluded)

Invalid input returns 400, oversized reports 413, cross-origin submissions 403, and storage
failures 503. A report is only shown as successful after storage completes. There is no server-side
email service: the contact button opens the visitor's email app.

## Future matching

`lib/matching.ts` defines a `MatchingService` interface and result shape. Add an Atlas Vector Search
implementation behind this interface later. Keep embeddings in a separate collection with `itemId`,
embedding model/version, and generation state. Existing reports and routes will not need to change.
The current UI clearly labels AI matching as coming soon and does not produce fake matches.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm start
```

Validation tests cover malformed dates, future dates, unsafe URLs, unexpected fields, field limits,
and contact redaction. The report → detail → search workflow has also been exercised in a headless
browser at desktop and mobile widths.

## MVP scope

There is no authentication, ownership verification, editing/deletion UI, moderation, upload service,
rate limiting, or automatic matching. Contact emails are public on detail pages, with explicit
consent in the report form. Add ownership controls and abuse prevention before a public launch.
Local demo storage is not suitable for serverless deployments; deploy with Atlas enabled.
