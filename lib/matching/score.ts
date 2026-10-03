import {
  DESCRIPTION_CEILING,
  DESCRIPTION_FLOOR,
  TIME_HALF_LIFE_HOURS,
  TIME_TOLERANCE_HOURS,
  WEIGHTS,
} from "./config.ts";

// The fields of a report that scoring needs. Matches the items document in the project plan.
export interface ScorableReport {
  type: "lost" | "found";
  category: string;
  location: { name: string };
  eventDate: Date;
}

export interface MatchScore {
  total: number; // 0-1, weighted sum
  description: number; // each signal is 0-1, so the UI can show them next to the total
  location: number;
  time: number;
  category: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Cosine similarity between two embedding vectors. Voyage vectors are unit length,
// but we normalise anyway so a different model can't silently break this.
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Stretches the useful cosine range to 0-1 (see the note in config.ts).
export function descriptionScore(cosine: number): number {
  return clamp01((cosine - DESCRIPTION_FLOOR) / (DESCRIPTION_CEILING - DESCRIPTION_FLOOR));
}

// Word overlap between location names, so "DCU Library" and "Library entrance" share "library".
// Cheap and explainable, but it can't tell "lobby" from "entrance"; embedding the location
// names would fix that at the cost of another API call per report.
export function locationScore(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wa = words(a), wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  // Divide by the smaller set so a short name fully inside a longer one scores 1.
  return shared / Math.min(wa.size, wb.size);
}

// Closer in time is more plausible, and an item can't be found before it was lost.
export function timeScore(lostDate: Date, foundDate: Date): number {
  const hours = (foundDate.getTime() - lostDate.getTime()) / 3_600_000;
  if (hours < -TIME_TOLERANCE_HOURS) return 0;
  return Math.pow(0.5, Math.max(0, hours) / TIME_HALF_LIFE_HOURS);
}

export function categoryScore(a: string, b: string): number {
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
}

// Scores one lost report against one found report. The caller supplies the cosine similarity
// (Atlas Vector Search returns it) so this function stays free of database and API calls.
export function scoreMatch(
  lost: ScorableReport,
  found: ScorableReport,
  cosine: number,
): MatchScore {
  const description = descriptionScore(cosine);
  const location = locationScore(lost.location.name, found.location.name);
  const time = timeScore(lost.eventDate, found.eventDate);
  const category = categoryScore(lost.category, found.category);
  const total =
    WEIGHTS.description * description +
    WEIGHTS.location * location +
    WEIGHTS.time * time +
    WEIGHTS.category * category;
  return { total, description, location, time, category };
}
