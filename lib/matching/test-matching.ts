// End-to-end check of matching on the 25 seed reports.
//   node test-matching.ts            uses the SCRATCH database lost_found_ai_test on Atlas
//   node test-matching.ts --offline  no database: same scoring, candidates held in memory
//   add --cleanup to drop the scratch database afterwards
import "./env.ts";
import { readFileSync } from "node:fs";
import { closeDb, dbSettings, getItems } from "./db.ts";
import { createEmbeddings } from "./embedding.ts";
import {
  findMatches,
  inCodeCandidates,
  rankCandidates,
  vectorSearchCandidates,
  type Match,
  type QueryReport,
} from "./matching.ts";
import { cosineSimilarity } from "./score.ts";
import { ensureVectorIndex, waitUntilQueryable } from "./vector-index.ts";

// SAFETY: this test only ever writes to the scratch database. The names are forced here, before
// the first query, so a MONGODB_DATABASE in .env can never redirect it to lost_found.
const SCRATCH_DB = "lost_found_ai_test";
process.env.MONGODB_DATABASE = SCRATCH_DB;
process.env.ITEMS_COLLECTION = "items";

const OFFLINE = process.argv.includes("--offline");
const TRUE_PAIR_MIN = 0.93; // a real pair scoring below this is flagged
// The backend links users at 0.90 or higher, so a decoy is only a problem once it reaches that.
const DECOY_FLAG_MIN = 0.9;

interface Seed {
  key: string;
  type: "lost" | "found";
  title: string;
  description: string;
  category: string;
  location: { coordinates: [number, number] };
  eventDate: string;
}
const seed = JSON.parse(readFileSync(new URL("./seed-reports.json", import.meta.url), "utf8")) as {
  truePairs: [string, string][];
  reports: Seed[];
};
const byKey = new Map(seed.reports.map((r) => [r.key, r]));
// Lost and found reports get different owners, as in the real app (own reports are excluded).
const ownerOf = (r: Seed) => (r.type === "lost" ? "seed-user-lost" : "seed-user-found");

console.log(`Embedding ${seed.reports.length} seed reports (one API call)...`);
const vectors = await createEmbeddings(seed.reports);
const vectorOf = new Map(seed.reports.map((r, i) => [r.key, vectors[i]]));

const results = new Map<string, Match[]>();
let via = "in-memory";

if (OFFLINE) {
  // Same ranking code as the server, with candidates computed here instead of fetched.
  for (const r of seed.reports) {
    const query: QueryReport = {
      type: r.type, category: r.category as QueryReport["category"],
      coordinates: r.location.coordinates, eventDate: new Date(r.eventDate),
    };
    const candidates = seed.reports
      .filter((o) => o.type !== r.type)
      .map((o) => ({
        id: o.key, category: o.category, coordinates: o.location.coordinates,
        eventDate: new Date(o.eventDate), cosine: cosineSimilarity(vectorOf.get(r.key)!, vectorOf.get(o.key)!),
      }));
    results.set(r.key, rankCandidates(query, candidates));
  }
} else {
  const items = await getItems();
  if (items.dbName !== SCRATCH_DB || items.dbName === "lost_found") {
    throw new Error(`refusing to run: target database is ${items.dbName}`);
  }
  console.log(`Using scratch database ${dbSettings().database}.${dbSettings().collection}`);

  // Start clean so the run is repeatable. Only the scratch collection is ever dropped.
  await items.deleteMany({});
  await items.insertMany(
    seed.reports.map((r) => ({
      _id: r.key as any, // a plain string id, like the backend's UUIDs
      userId: ownerOf(r),
      type: r.type, title: r.title, description: r.description, category: r.category,
      location: r.location, status: "open", matchingStatus: "completed",
      eventDate: new Date(r.eventDate), createdAt: new Date(),
      embedding: vectorOf.get(r.key)!,
    })),
  );

  console.log(`Index: ${await ensureVectorIndex(items)}. Waiting until it is READY (can take a few minutes)...`);
  const ready = await waitUntilQueryable(items, 5 * 60_000, (s) => console.log(`  status: ${s.status ?? "MISSING"}`));
  if (!ready) console.warn("Index not READY in time: results below come from the in-code fallback.");

  // New documents appear in the index a few seconds after insert; wait until all are searchable.
  if (ready) {
    const l1 = byKey.get("L1")!;
    const q: QueryReport = { type: "lost", category: "Electronics", eventDate: new Date(l1.eventDate) };
    const expected = seed.reports.filter((r) => r.type === "found").length;
    for (let i = 0; i < 24; i++) {
      const got = (await vectorSearchCandidates(items, q, vectorOf.get("L1")!, ownerOf(l1))).length;
      if (got >= expected) break;
      console.log(`  indexed ${got}/${expected} found reports...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  const fallback = new Map<string, Match[]>();
  const vias = new Set<string>();
  for (const r of seed.reports) {
    const req = {
      itemId: r.key, type: r.type, title: r.title, description: r.description,
      category: r.category as QueryReport["category"], coordinates: r.location.coordinates,
      eventDate: new Date(r.eventDate), userId: ownerOf(r),
    };
    const a = await findMatches(req, items);
    results.set(r.key, a.matches);
    vias.add(a.via);
    fallback.set(r.key, (await findMatches(req, items, { forceInCode: true })).matches);
  }
  via = [...vias].join("+");

  // The two search paths should rank the same (vector search is approximate, so allow small gaps).
  let disagree = 0;
  for (const [key, a] of results) {
    const b = fallback.get(key)!;
    const same = a.length === b.length && a.every((m, i) => m.itemId === b[i].itemId && Math.abs(m.score - b[i].score) < 0.01);
    if (!same) { disagree++; console.log(`  note: vector search and in-code differ for ${key}`); }
  }
  console.log(disagree === 0 ? "Vector search and in-code fallback agree on every report." : `${disagree} report(s) differ between search paths.`);

  if (process.argv.includes("--cleanup") && items.dbName === SCRATCH_DB) {
    await items.db.dropDatabase();
    console.log(`Dropped scratch database ${SCRATCH_DB}.`);
  }
}

// ---- Report ------------------------------------------------------------------------------
console.log(`\nSearch path: ${via}. Top 3 matches (score 0-1) per report:\n`);
for (const r of seed.reports) {
  console.log(`${r.key.padEnd(3)} [${r.type}] ${r.title}`);
  const top = (results.get(r.key) ?? []).slice(0, 3);
  if (top.length === 0) console.log("      (no match above 0.50)");
  for (const m of top) console.log(`      ${m.score.toFixed(2)}  ${m.itemId.padEnd(3)} ${byKey.get(m.itemId)?.title ?? "?"}`);
}

console.log("\nFlags:");
const isPair = (a: string, b: string) => seed.truePairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
let flags = 0;
const scoreOf = (from: string, to: string) => results.get(from)?.find((m) => m.itemId === to)?.score;

for (const [a, b] of seed.truePairs) {
  for (const [from, to] of [[a, b], [b, a]]) {
    const s = scoreOf(from, to);
    if (s === undefined || s < TRUE_PAIR_MIN) {
      flags++;
      console.log(`  TRUE PAIR below ${TRUE_PAIR_MIN}: ${from} -> ${to} scored ${s === undefined ? "<=0.50 (not returned)" : s.toFixed(2)}`);
    }
  }
}
// Any match above the limit that is not a true pair involves a decoy (or a wrong partner).
for (const [from, matches] of results) {
  for (const m of matches) {
    if (m.score >= DECOY_FLAG_MIN && !isPair(from, m.itemId)) {
      flags++;
      console.log(`  DECOY at ${DECOY_FLAG_MIN} or higher: ${from} -> ${m.itemId} scored ${m.score.toFixed(2)} (${byKey.get(from)!.title} / ${byKey.get(m.itemId)!.title})`);
    }
  }
}
console.log(flags === 0 ? "  none" : `  ${flags} flag(s)`);
// These decoys are deliberately close in meaning, so they score well above unrelated pairs but
// must stay under the backend's 0.90 link line, which is what the flag rule above enforces.
console.log("\nNote: D4/D17 (0.88) and D1/D12 (0.70) are expected near misses that stay below the 0.90 link line.");

await closeDb();
