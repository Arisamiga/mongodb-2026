import {
  type Category,
  DESCRIPTION_CEILING,
  DESCRIPTION_FLOOR,
  LOCATION_MAX_DISTANCE_METRES,
  TIME_HALF_LIFE_HOURS,
  TIME_TOLERANCE_HOURS,
  WEIGHTS,
} from "./config.ts";

// The fields of a report that scoring needs. Matches the items document in the project plan.
export interface ScorableReport {
  type: "lost" | "found";
  category: Category;
  // [longitude, latitude], the same order MongoDB GeoJSON and the backend use. No place name.
  location: { coordinates?: [number, number] };
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

// Great-circle distance in metres between two [longitude, latitude] points (haversine).
// Accurate to well under a metre per kilometre at campus scale, which is all we need.
export function haversineMetres(a: [number, number], b: [number, number]): number {
  const EARTH_RADIUS_M = 6_371_000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// 100% at 0 m, linearly down to 0% at LOCATION_MAX_DISTANCE_METRES. The backend contract only
// has coordinates (no place names), so a report without them can't be placed and scores 0.
export function locationScore(a: ScorableReport["location"], b: ScorableReport["location"]): number {
  if (!a.coordinates || !b.coordinates) return 0;
  return clamp01(1 - haversineMetres(a.coordinates, b.coordinates) / LOCATION_MAX_DISTANCE_METRES);
}

// Closer in time is more plausible, and an item can't be found before it was lost.
export function timeScore(lostDate: Date, foundDate: Date): number {
  const hours = (foundDate.getTime() - lostDate.getTime()) / 3_600_000;
  if (hours < -TIME_TOLERANCE_HOURS) return 0;
  return Math.pow(0.5, Math.max(0, hours) / TIME_HALF_LIFE_HOURS);
}

// Categories are a fixed list, so exact equality is enough.
export function categoryScore(a: Category, b: Category): number {
  return a === b ? 1 : 0;
}

// The score the backend's /matches response wants: a number from 0 to 1. scoreMatch's total is
// already 0-1 (the weights add up to 1), so nothing is divided by 100 here; dividing again would
// turn 0.92 into 0.0092 and nothing would ever reach the backend's 0.90 threshold. This only
// clamps away floating-point drift and rounds to 4 places for a tidy JSON number.
export function contractScore(score: MatchScore): number {
  return Math.round(clamp01(score.total) * 10_000) / 10_000;
}

// Scores one lost report against one found report. The caller supplies the cosine similarity
// (Atlas Vector Search returns it) so this function stays free of database and API calls.
export function scoreMatch(
  lost: ScorableReport,
  found: ScorableReport,
  cosine: number,
): MatchScore {
  const description = descriptionScore(cosine);
  const location = locationScore(lost.location, found.location);
  const time = timeScore(lost.eventDate, found.eventDate);
  const category = categoryScore(lost.category, found.category);
  const total =
    WEIGHTS.description * description +
    WEIGHTS.location * location +
    WEIGHTS.time * time +
    WEIGHTS.category * category;
  return { total, description, location, time, category };
}
