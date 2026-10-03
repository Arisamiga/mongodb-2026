// The AI service from backend/AI_CONTRACT.md. Run from lib/matching:  node server.ts
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createEmbedding } from "./embedding.ts";

// The repo-root .env, wherever the server is started from. quiet: dotenv prints nothing, and
// variables already set in the real environment win (handy for tests and deployment).
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const PORT = Number(process.env.PORT ?? 8001);
// Loopback by default so a laptop isn't exposed; set HOST=0.0.0.0 inside a container.
const HOST = process.env.HOST ?? "127.0.0.1";
// Optional shared secret. Read once and never logged.
const TOKEN = process.env.AI_SERVICE_TOKEN || undefined;

// Same limits the backend enforces on reports (backend/app/schemas.py), so we never see more.
const MAX_TITLE = 160;
const MAX_DESCRIPTION = 2000;

const app = new Hono();

// Bodies here are small JSON; 64 KB is far more than needed and stops oversized payloads early.
app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "body too large" }, 413) }));

// Bearer-token check for /embeddings and /matches. With no token configured, all requests pass.
// timingSafeEqual avoids leaking the token through response-time differences.
app.use("/embeddings", requireToken);
app.use("/matches", requireToken);

async function requireToken(c: any, next: () => Promise<void>) {
  if (!TOKEN) return next();
  const given = Buffer.from(c.req.header("Authorization") ?? "");
  const want = Buffer.from(`Bearer ${TOKEN}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
}

// Reads the body as a JSON object, or returns null for anything else.
async function readObject(c: any): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/embeddings", async (c) => {
  const body = await readObject(c);
  if (!body) return c.json({ error: "body must be a JSON object" }, 400);
  if (!isText(body.title, MAX_TITLE)) return c.json({ error: "title is required (max 160 chars)" }, 400);
  if (!isText(body.description, MAX_DESCRIPTION)) {
    return c.json({ error: "description is required (max 2000 chars)" }, 400);
  }
  try {
    return c.json({ embedding: await createEmbedding(body.title, body.description) });
  } catch {
    // The error text can contain the provider's response, so log a fixed line and tell the
    // caller nothing specific. A non-2xx makes the backend treat it as an AI failure (503).
    console.error("embedding request failed");
    return c.json({ error: "embedding failed" }, 502);
  }
});

// Placeholder until the vector search is built: a valid, empty answer for the contract.
app.post("/matches", async (c) => {
  const body = await readObject(c);
  if (!body) return c.json({ error: "body must be a JSON object" }, 400);
  if (typeof body.itemId !== "string" || body.itemId.length < 1 || body.itemId.length > 100) {
    return c.json({ error: "itemId is required (1-100 chars)" }, 400);
  }
  return c.json({ matches: [] });
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`AI service listening on http://${HOST}:${PORT}${TOKEN ? " (token required)" : ""}`);
});
