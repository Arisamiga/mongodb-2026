import assert from "node:assert/strict";
import { rankCandidates, type Candidate, type QueryReport } from "./matching.ts";

const query: QueryReport = {
  type: "lost",
  category: "Bags",
  coordinates: [-0.12, 51.5],
  eventDate: new Date("2026-10-03T12:30:00Z"),
};
const sameScore = (id: string): Candidate => ({
  id,
  category: "Bags",
  coordinates: query.coordinates,
  eventDate: query.eventDate,
  cosine: 0.9,
});

assert.deepEqual(
  rankCandidates(query, [sameScore("z-report"), sameScore("a-report")]).map((match) => match.itemId),
  ["a-report", "z-report"],
);
console.log("Matching engine tests passed");
