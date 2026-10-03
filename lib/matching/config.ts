// Embedding settings for the matching engine. Change them here only.
//
// Voyage AI is MongoDB's own embedding provider and the one Atlas Vector Search docs recommend.
// voyage-3.5-lite is the cheapest current Voyage model and plenty for short lost/found reports.
// It supports output dimensions of 256, 512, 1024 (default) or 2048.
//
// If you change the model or dimensions, re-embed every stored report and update the
// Atlas Vector Search index's numDimensions: vectors of different sizes can't be compared.
export const EMBEDDING_MODEL = "voyage-3.5-lite";
export const EMBEDDING_DIMENSIONS = 1024;

export const EMBEDDING_API_URL = "https://api.voyageai.com/v1/embeddings";

// Match score weights from the project plan. They must add up to 1.
export const WEIGHTS = { description: 0.6, location: 0.2, time: 0.1, category: 0.1 };

// Raw cosine similarity never reaches 0 for short texts about objects: the unrelated umbrella
// scored ~0.73 against the AirPods case and the true match ~0.88 (test-embedding.ts). So we
// stretch [FLOOR, CEILING] to [0, 1]. These numbers come from a single sample; retune them
// once there is more seed data.
export const DESCRIPTION_FLOOR = 0.7;
export const DESCRIPTION_CEILING = 0.9;

// The only categories the backend accepts (backend/app/schemas.py). Spelled exactly, so the
// category score can compare with plain equality.
export const CATEGORIES = [
  "Electronics",
  "Clothing",
  "Bags",
  "Keys",
  "Cards and IDs",
  "Books",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Time score halves every this many hours between the loss and the find.
export const TIME_HALF_LIFE_HOURS = 24;
// A found report dated slightly before the lost one is allowed (clocks and memory are fuzzy).
export const TIME_TOLERANCE_HOURS = 3;

// Location score is 100% at 0 m and falls linearly to 0% at this distance. 500 m is roughly
// "the other side of a campus"; a different building is already well below 100%.
export const LOCATION_MAX_DISTANCE_METRES = 500;

// The name of the env var holding the key, not the key itself. The key lives in .env (gitignored).
export const API_KEY_ENV_VAR = "VOYAGE_API_KEY";
