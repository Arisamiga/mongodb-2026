// Creates the Atlas Vector Search index on the items collection. Safe to run twice.
//   node create-index.ts            create it (or report that it already exists)
//   node create-index.ts --status   only print the current status
import { closeDb, dbSettings, getItems } from "./db.ts";
import { VECTOR_INDEX_NAME } from "./config.ts";
import { ensureVectorIndex, indexStatus } from "./vector-index.ts";

const { database, collection } = dbSettings(); // names only, never the connection string
// A friendly one-line error instead of a stack trace (the message never contains the URI).
const items = await getItems().catch((err: Error) => {
  console.error(`Cannot connect: ${err.message}`);
  process.exit(1);
});

if (!process.argv.includes("--status")) {
  const result = await ensureVectorIndex(items);
  console.log(
    result === "created"
      ? `Created index "${VECTOR_INDEX_NAME}" on ${database}.${collection}.`
      : `Index "${VECTOR_INDEX_NAME}" already exists on ${database}.${collection}; nothing changed.`,
  );
}

const s = await indexStatus(items);
console.log(`Status: ${s.exists ? `${s.status}${s.queryable ? " (queryable)" : ""}` : "MISSING"}`);
console.log(`
The index is ready when the status is READY and queryable. It can take a minute or two.
Check it either way:
  - this script:  node create-index.ts --status
  - Atlas UI:     your cluster -> Search & Vector Search -> "${VECTOR_INDEX_NAME}" -> Status: READY
Until it is READY, POST /matches still works: it falls back to a slower in-code search.`);

await closeDb();
