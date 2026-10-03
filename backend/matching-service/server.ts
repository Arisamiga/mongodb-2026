import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ObjectId, type Db } from "mongodb";
import { createEmbedding } from "../../lib/matching/embedding.ts";
import { EMBEDDING_DIMENSIONS } from "../../lib/matching/config.ts";
import { cosineSimilarity, scoreMatch, type ScorableReport } from "../../lib/matching/score.ts";

const BODY_LIMIT_BYTES = 1024 * 1024;
const EMBEDDING_TIMEOUT_MS = 30_000;
const MAX_MATCHES = 1000;
const CATEGORIES = new Set([
  "Electronics",
  "Clothing",
  "Bags",
  "Keys",
  "Cards and IDs",
  "Books",
  "Other",
]);

type Embed = typeof createEmbedding;
type Report = Record<string, unknown> & { _id: unknown };

export interface MatchingServerOptions {
  embed?: Embed;
  token?: string;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSIONS &&
    value.every((component) => typeof component === "number" && Number.isFinite(component)) &&
    value.some((component) => component !== 0)
  );
}

function coordinates(value: unknown): [number, number] | null {
  if (!isRecord(value) || !Array.isArray(value.coordinates) || value.coordinates.length !== 2) return null;
  const [longitude, latitude] = value.coordinates;
  if (
    typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
  ) return null;
  return [longitude, latitude];
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof ObjectId) return value.toHexString();
  return null;
}

function comparisonReport(report: Report): (ScorableReport & { embedding: number[]; userId: string }) | null {
  const userId = normalizeId(report.userId);
  const locationCoordinates = coordinates(report.location);
  if (
    !userId || (report.type !== "lost" && report.type !== "found") ||
    typeof report.category !== "string" || !CATEGORIES.has(report.category) ||
    !validDate(report.eventDate) || report.status !== "open" ||
    !validVector(report.embedding) || !locationCoordinates
  ) return null;

  return {
    type: report.type,
    category: report.category,
    location: { name: "", coordinates: locationCoordinates },
    eventDate: report.eventDate,
    embedding: report.embedding,
    userId,
  };
}

function validateRequest(value: unknown): { itemId: string } {
  if (!isRecord(value) || !nonemptyString(value.itemId, 100)) throw new HttpError(400, "Invalid request");
  if (
    (value.type !== "lost" && value.type !== "found") ||
    !nonemptyString(value.title, 160) || !nonemptyString(value.description, 2000) ||
    typeof value.category !== "string" || !CATEGORIES.has(value.category) ||
    !nonemptyString(value.userId, 100) || coordinates(value.location) === null ||
    typeof value.eventDate !== "string" || !/[zZ]|[+-]\d\d:\d\d$/.test(value.eventDate) ||
    !Number.isFinite(Date.parse(value.eventDate))
  ) throw new HttpError(400, "Invalid request");
  return { itemId: value.itemId };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      request.resume();
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store",
  });
  response.end(encoded);
}

function authorized(request: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const supplied = request.headers.authorization;
  if (typeof supplied !== "string" || !supplied.startsWith("Bearer ")) return false;
  const expectedDigest = createHash("sha256").update(token).digest();
  const suppliedDigest = createHash("sha256").update(supplied.slice(7)).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new HttpError(503, "Embedding service unavailable")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function handleEmbedding(body: unknown, embed: Embed): Promise<{ embedding: number[] }> {
  if (
    !isRecord(body) || !nonemptyString(body.title, 160) || !nonemptyString(body.description, 2000)
  ) throw new HttpError(400, "Invalid request");
  let embedding: number[];
  try {
    embedding = await withTimeout(embed(body.title, body.description), EMBEDDING_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Embedding service unavailable");
  }
  if (!validVector(embedding)) throw new HttpError(503, "Embedding service unavailable");
  return { embedding };
}

async function handleMatches(db: Db, body: unknown): Promise<{ matches: { itemId: string; score: number }[] }> {
  const { itemId } = validateRequest(body);
  const ids: (string | ObjectId)[] = [itemId];
  if (ObjectId.isValid(itemId)) ids.push(new ObjectId(itemId));
  const collection = db.collection<Report>("items");
  const currentDocument = await collection.findOne({ _id: { $in: ids } });
  if (!currentDocument) throw new HttpError(404, "Report not found");
  const current = comparisonReport(currentDocument);
  if (!current) throw new HttpError(409, "Report is not ready for matching");

  const oppositeType = current.type === "lost" ? "found" : "lost";
  const cursor = collection.find({ type: oppositeType, status: "open" }).batchSize(250);
  const matches: { itemId: string; score: number }[] = [];
  for await (const candidateDocument of cursor) {
    const candidateId = normalizeId(candidateDocument._id);
    if (!candidateId || candidateId.length > 100 || candidateId === itemId || candidateId === normalizeId(currentDocument._id)) continue;
    const candidate = comparisonReport(candidateDocument);
    if (!candidate || candidate.type === current.type || candidate.userId === current.userId) continue;
    const lost = current.type === "lost" ? current : candidate;
    const found = current.type === "found" ? current : candidate;
    const cosine = cosineSimilarity(current.embedding, candidate.embedding);
    if (!Number.isFinite(cosine)) continue;
    const score = scoreMatch(lost, found, cosine).total;
    if (!Number.isFinite(score)) continue;
    matches.push({ itemId: candidateId, score });
    if (matches.length > MAX_MATCHES * 2) {
      matches.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
      matches.length = MAX_MATCHES;
    }
  }
  matches.sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId));
  matches.length = Math.min(matches.length, MAX_MATCHES);
  return { matches };
}

export function createMatchingServer(db: Db, options: MatchingServerOptions = {}): Server {
  const embed = options.embed ?? createEmbedding;
  const token = options.token ?? process.env.AI_SERVICE_TOKEN ?? "";
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        await db.command({ ping: 1 });
        send(response, 200, { status: "ok" });
        return;
      }
      if (request.method !== "POST" || (url.pathname !== "/embeddings" && url.pathname !== "/matches")) {
        send(response, 404, { error: "Not found" });
        return;
      }
      if (!authorized(request, token)) {
        send(response, 401, { error: "Unauthorized" });
        return;
      }
      const body = await readJson(request);
      const result = url.pathname === "/embeddings"
        ? await handleEmbedding(body, embed)
        : await handleMatches(db, body);
      send(response, 200, result);
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (error instanceof HttpError) {
        send(response, error.status, { error: error.message });
        return;
      }
      console.error("Matching service request failed:", error instanceof Error ? error.constructor.name : "UnknownError");
      send(response, 500, { error: "Internal server error" });
    }
  });
  return server;
}
