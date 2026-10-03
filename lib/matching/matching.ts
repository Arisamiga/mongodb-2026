// The /matches logic: find the report, get its vector, fetch opposite-type candidates, score them.
import { ObjectId, type Collection, type Document } from "mongodb";
import {
  CATEGORIES,
  EMBEDDING_DIMENSIONS,
  FALLBACK_MAX_CANDIDATES,
  MATCH_LIMIT,
  MATCH_MIN_SCORE,
  MAX_DESCRIPTION,
  MAX_TITLE,
  VECTOR_INDEX_NAME,
  VECTOR_NUM_CANDIDATES,
  VECTOR_SEARCH_LIMIT,
  type Category,
} from "./config.ts";
import { createEmbedding } from "./embedding.ts";
import { contractScore, cosineSimilarity, scoreMatch, type ScorableReport } from "./score.ts";
import { indexStatus } from "./vector-index.ts";

export type ReportType = "lost" | "found";
export type Match = { itemId: string; score: number };

// The report we are finding matches for.
export interface QueryReport {
  type: ReportType;
  category: Category;
  coordinates?: [number, number];
  eventDate: Date;
}

// One opposite-type report with its cosine similarity to the query (-1 to 1).
export interface Candidate {
  id: string;
  category: string;
  coordinates?: [number, number];
  eventDate: Date;
  cosine: number;
}

// ---- Input validation -------------------------------------------------------------------

// Thrown for a bad request body; the server turns it into a 400.
export class ValidationError extends Error {}
const fail = (msg: string): never => {
  throw new ValidationError(msg);
};

// The body of POST /matches (backend/AI_CONTRACT.md). Only itemId is required: the other fields
// are used when the report is not stored yet.
export interface MatchRequest {
  itemId: string;
  type?: ReportType;
  title?: string;
  description?: string;
  category?: Category;
  coordinates?: [number, number];
  eventDate?: Date;
  userId?: string;
}

export function parseMatchRequest(body: Record<string, unknown>): MatchRequest {
  const { itemId } = body;
  if (typeof itemId !== "string" || itemId.length < 1 || itemId.length > 100) {
    fail("itemId is required (1-100 chars)");
  }
  const req: MatchRequest = { itemId: itemId as string };

  if (body.type !== undefined) {
    if (body.type !== "lost" && body.type !== "found") fail("type must be lost or found");
    req.type = body.type as ReportType;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.length > MAX_TITLE) fail("title is invalid");
    req.title = body.title as string;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION) {
      fail("description is invalid");
    }
    req.description = body.description as string;
  }
  if (body.category !== undefined) {
    if (!(CATEGORIES as readonly unknown[]).includes(body.category)) fail("category is invalid");
    req.category = body.category as Category;
  }
  if (body.location !== undefined) {
    const loc = body.location as { coordinates?: unknown } | null;
    const coords = asCoordinates(loc?.coordinates);
    if (!coords) fail("location.coordinates must be [longitude, latitude]");
    req.coordinates = coords;
  }
  if (body.eventDate !== undefined) {
    const d = typeof body.eventDate === "string" ? new Date(body.eventDate) : null;
    if (!d || Number.isNaN(d.getTime())) fail("eventDate must be an ISO 8601 date-time");
    req.eventDate = d as Date;
  }
  if (body.userId !== undefined) {
    if (typeof body.userId !== "string" || body.userId.length < 1 || body.userId.length > 100) {
      fail("userId is invalid");
    }
    req.userId = body.userId as string;
  }
  return req;
}

// [longitude, latitude] within range, or undefined. Mongo gives us arrays of numbers.
function asCoordinates(v: unknown): [number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const [lng, lat] = v;
  const ok =
    typeof lng === "number" && typeof lat === "number" &&
    Number.isFinite(lng) && Number.isFinite(lat) &&
    Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  return ok ? [lng, lat] : undefined;
}

// ---- Scoring -----------------------------------------------------------------------------

// Scores every candidate and keeps the top MATCH_LIMIT above MATCH_MIN_SCORE, best first.
// Pure (no database, no network), so the test can run it on in-memory data.
export function rankCandidates(query: QueryReport, candidates: Candidate[]): Match[] {
  const self: ScorableReport = {
    type: query.type,
    category: query.category,
    location: { coordinates: query.coordinates },
    eventDate: query.eventDate,
  };
  const out: Match[] = [];
  for (const c of candidates) {
    if (!Number.isFinite(c.cosine)) continue;
    const other: ScorableReport = {
      type: query.type === "lost" ? "found" : "lost",
      category: c.category as Category,
      location: { coordinates: c.coordinates },
      eventDate: c.eventDate,
    };
    // scoreMatch wants (lost, found); the time rule depends on which is which.
    const [lost, found] = query.type === "lost" ? [self, other] : [other, self];
    const score = contractScore(scoreMatch(lost, found, c.cosine));
    if (score > MATCH_MIN_SCORE) out.push({ itemId: c.id, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MATCH_LIMIT);
}

// ---- Candidate search --------------------------------------------------------------------

// Ids may be stored as strings (the backend's UUIDs) or as ObjectIds; try both forms.
const isHex24 = (s: string) => /^[0-9a-f]{24}$/i.test(s);
const idForms = (id: string): (string | ObjectId)[] => (isHex24(id) ? [id, new ObjectId(id)] : [id]);

// Logged once a minute per reason so a missing index doesn't flood the log. The message never
// includes the connection string or any credentials.
const lastWarned = new Map<string, number>();
function warn(reason: string) {
  if (Date.now() - (lastWarned.get(reason) ?? 0) < 60_000) return;
  lastWarned.set(reason, Date.now());
  console.warn(`matching: ${reason}`);
}

// Asking Atlas about the index costs a round trip, so remember the answer briefly.
const indexCache = new Map<string, { at: number; queryable: boolean }>();
async function indexIsQueryable(items: Collection<Document>): Promise<boolean> {
  const key = items.namespace;
  const hit = indexCache.get(key);
  if (hit && Date.now() - hit.at < (hit.queryable ? 30_000 : 5_000)) return hit.queryable;
  let queryable = false;
  try {
    queryable = (await indexStatus(items)).queryable;
  } catch (err) {
    warn(`could not read search index status (${(err as Error).name})`);
  }
  indexCache.set(key, { at: Date.now(), queryable });
  return queryable;
}

// Open reports of the opposite type, from other users. Used by both search paths.
function candidateFilter(query: QueryReport, userId?: string) {
  const filter: Document = {
    type: query.type === "lost" ? "found" : "lost",
    status: "open",
  };
  if (userId) filter.userId = { $nin: idForms(userId) };
  return filter;
}

function toCandidate(doc: Document, cosine: number): Candidate | null {
  const eventDate = doc.eventDate instanceof Date ? doc.eventDate : new Date(doc.eventDate);
  if (Number.isNaN(eventDate.getTime())) return null;
  return {
    id: String(doc._id),
    category: doc.category,
    coordinates: asCoordinates(doc.location?.coordinates),
    eventDate,
    cosine,
  };
}

// Atlas $vectorSearch. For cosine similarity Atlas returns score = (1 + cosine) / 2, so we
// convert back with cosine = 2 * score - 1 (what score.ts expects). Exported so tests can poll it.
export async function vectorSearchCandidates(
  items: Collection<Document>,
  query: QueryReport,
  vector: number[],
  userId?: string,
): Promise<Candidate[]> {
  const docs = await items
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector: vector,
          numCandidates: VECTOR_NUM_CANDIDATES,
          limit: VECTOR_SEARCH_LIMIT,
          filter: candidateFilter(query, userId),
        },
      },
      // Project only what scoring needs. The embedding is never selected.
      {
        $project: {
          category: 1,
          "location.coordinates": 1,
          eventDate: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  return docs.flatMap((d) => toCandidate(d, 2 * d.score - 1) ?? []);
}

// Fallback when the index is missing or the query fails: load the same filtered candidates and
// compute cosine in code. Slower, but gives the same ranking.
export async function inCodeCandidates(
  items: Collection<Document>,
  query: QueryReport,
  vector: number[],
  userId?: string,
): Promise<Candidate[]> {
  const docs = await items
    .find(
      { ...candidateFilter(query, userId), embedding: { $type: "array" } },
      { projection: { embedding: 1, category: 1, "location.coordinates": 1, eventDate: 1 } },
    )
    .limit(FALLBACK_MAX_CANDIDATES + 1)
    .toArray();
  if (docs.length > FALLBACK_MAX_CANDIDATES) {
    warn(`more than ${FALLBACK_MAX_CANDIDATES} candidates; in-code search only used the first ${FALLBACK_MAX_CANDIDATES}`);
    docs.length = FALLBACK_MAX_CANDIDATES;
  }
  return docs.flatMap((d) =>
    Array.isArray(d.embedding) && d.embedding.length === vector.length
      ? (toCandidate(d, cosineSimilarity(vector, d.embedding)) ?? [])
      : [],
  );
}

// ---- Putting it together -----------------------------------------------------------------

export async function findMatches(
  req: MatchRequest,
  items: Collection<Document>,
  opts: { forceInCode?: boolean } = {},
): Promise<{ matches: Match[]; via: "vector-search" | "in-code" | "none" }> {
  const none = { matches: [], via: "none" as const };

  // The stored report is the source of truth; the request body fills in what is missing.
  const doc = await items.findOne({ _id: { $in: idForms(req.itemId) } } as Document);
  const type: ReportType | undefined = doc?.type ?? req.type;
  const category: Category | undefined = doc?.category ?? req.category;
  const rawDate = doc?.eventDate ?? req.eventDate;
  const eventDate = rawDate === undefined ? undefined : new Date(rawDate);
  const userId = doc?.userId != null ? String(doc.userId) : req.userId;

  // Not stored and not described in the request (or not scoreable): nothing to match against.
  if ((type !== "lost" && type !== "found") || !category || !eventDate || Number.isNaN(eventDate.getTime())) {
    return none;
  }
  const query: QueryReport = {
    type,
    category,
    coordinates: asCoordinates(doc?.location?.coordinates) ?? req.coordinates,
    eventDate,
  };

  // Use the stored vector if it has the right size; otherwise embed the request's text.
  let vector: number[] | undefined =
    Array.isArray(doc?.embedding) && doc!.embedding.length === EMBEDDING_DIMENSIONS ? doc!.embedding : undefined;
  if (!vector) {
    const title = req.title ?? doc?.title;
    const description = req.description ?? doc?.description;
    if (!title && !description) return none;
    vector = await createEmbedding(title ?? "", description ?? "");
  }

  let candidates: Candidate[] | undefined;
  let via: "vector-search" | "in-code" = "vector-search";
  if (!opts.forceInCode) {
    if (await indexIsQueryable(items)) {
      try {
        candidates = await vectorSearchCandidates(items, query, vector, userId);
      } catch (err) {
        warn(`$vectorSearch failed (${(err as Error).name}); using in-code search`);
      }
    } else {
      warn(`vector index "${VECTOR_INDEX_NAME}" is missing or not READY; using in-code search`);
    }
  }
  if (!candidates) {
    via = "in-code";
    candidates = await inCodeCandidates(items, query, vector, userId);
  }
  return { matches: rankCandidates(query, candidates), via };
}
