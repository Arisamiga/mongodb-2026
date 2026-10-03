// Helpers for the Atlas Vector Search index on the items collection.
import type { Collection, Document } from "mongodb";
import { EMBEDDING_DIMENSIONS, VECTOR_INDEX_NAME } from "./config.ts";

export interface IndexStatus {
  exists: boolean;
  status?: string; // Atlas reports e.g. PENDING, BUILDING, READY
  queryable: boolean; // true once the index can actually serve $vectorSearch
  numDimensions?: number;
}

export async function indexStatus(items: Collection<Document>): Promise<IndexStatus> {
  const [idx] = await items.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
  if (!idx) return { exists: false, queryable: false };
  const vector = (idx.latestDefinition?.fields ?? []).find((f: Document) => f.type === "vector");
  return {
    exists: true,
    status: idx.status,
    queryable: idx.queryable === true,
    numDimensions: vector?.numDimensions,
  };
}

// Creates the index if it is missing and does nothing if it exists, so it is safe to run twice.
export async function ensureVectorIndex(items: Collection<Document>): Promise<"created" | "exists"> {
  const current = await indexStatus(items);
  if (current.exists) {
    // Don't silently rebuild: a different size means every stored vector is the wrong shape.
    if (current.numDimensions !== undefined && current.numDimensions !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `Warning: index has ${current.numDimensions} dimensions but config.ts says ${EMBEDDING_DIMENSIONS}. Drop the index and re-embed.`,
      );
    }
    return "exists";
  }
  try {
    await items.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: {
        fields: [
          // Cosine matches how scoring compares vectors (see score.ts).
          { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
          // Filter fields let $vectorSearch restrict to opposite type, open status, other users
          // BEFORE ranking, instead of dropping results afterwards.
          { type: "filter", path: "type" },
          { type: "filter", path: "status" },
          { type: "filter", path: "userId" },
        ],
      },
    });
  } catch (err) {
    // Two runs racing: the second sees "already exists", which is the outcome we wanted.
    if (/already exists|IndexAlreadyExists/i.test(String((err as Error).message))) return "exists";
    throw err;
  }
  return "created";
}

// Polls until the index can serve queries. Building takes from seconds to a couple of minutes.
export async function waitUntilQueryable(
  items: Collection<Document>,
  timeoutMs = 5 * 60_000,
  onPoll?: (s: IndexStatus) => void,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await indexStatus(items);
    onPoll?.(s);
    if (s.queryable) return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}
