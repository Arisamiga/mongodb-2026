import {
  API_KEY_ENV_VAR,
  EMBEDDING_API_URL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./config.ts";

// The title holds the key nouns ("AirPods case") and the description adds context
// ("near the library"), so we embed both. ". " keeps them as separate sentences.
function joinText(title: string, description: string): string {
  const text = [title.trim(), description.trim()].filter(Boolean).join(". ");
  if (!text) throw new Error("createEmbedding: title and description are both empty");
  return text;
}

// Turns a report's title + description into a vector for semantic matching.
export async function createEmbedding(title: string, description: string): Promise<number[]> {
  return (await createEmbeddings([{ title, description }]))[0];
}

// Same thing for many reports in ONE API call (seeding 25 reports is 1 request, not 25, which
// also keeps us clear of rate limits). Results come back in the same order as the input.
export async function createEmbeddings(
  reports: { title: string; description: string }[],
): Promise<number[][]> {
  const input = reports.map((r) => joinText(r.title, r.description));

  // Read from process.env and never log it. Next.js loads .env automatically; scripts import
  // env.ts first (see test-embedding.ts).
  const apiKey = process.env[API_KEY_ENV_VAR];
  if (!apiKey) throw new Error(`createEmbedding: ${API_KEY_ENV_VAR} is not set (add it to .env)`);

  // Plain fetch instead of an SDK: one HTTP call doesn't justify a dependency.
  const res = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input,
      model: EMBEDDING_MODEL,
      output_dimension: EMBEDDING_DIMENSIONS,
      // Lost and found reports are the same kind of text and are compared with each other,
      // not with a short search query, so both sides are embedded as "document".
      input_type: "document",
    }),
  });

  // The error body comes from Voyage and doesn't echo the key, so it's safe to include.
  if (!res.ok) {
    throw new Error(`createEmbedding: Voyage API ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // Sort by index so the order matches the input even if the API ever reorders.
  const vectors = [...(json.data ?? [])].sort((a, b) => a.index - b.index).map((d) => d.embedding);

  // Catch a count or model/dimension mismatch early, before a bad vector reaches the database.
  if (vectors.length !== input.length) {
    throw new Error(`createEmbedding: expected ${input.length} vectors, got ${vectors.length}`);
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`createEmbedding: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${v?.length ?? "none"}`);
    }
  }
  return vectors;
}
