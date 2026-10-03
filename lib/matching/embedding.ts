import {
  API_KEY_ENV_VAR,
  EMBEDDING_API_URL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "./config.ts";

// Turns a report's title + description into a vector for semantic matching.
export async function createEmbedding(title: string, description: string): Promise<number[]> {
  // The title holds the key nouns ("AirPods case") and the description adds context
  // ("near the library"), so we embed both. ". " keeps them as separate sentences.
  const text = [title.trim(), description.trim()].filter(Boolean).join(". ");
  if (!text) throw new Error("createEmbedding: title and description are both empty");

  // Read from process.env and never log it. Next.js loads .env automatically; scripts call
  // process.loadEnvFile() first (see test-embedding.ts).
  const apiKey = process.env[API_KEY_ENV_VAR];
  if (!apiKey) throw new Error(`createEmbedding: ${API_KEY_ENV_VAR} is not set (add it to .env)`);

  // Plain fetch instead of an SDK: one HTTP call doesn't justify a dependency.
  const res = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input: [text],
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

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const embedding = json.data?.[0]?.embedding;

  // Catch a model/dimension mismatch early, before a bad vector reaches the database.
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `createEmbedding: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding?.length ?? "none"}`,
    );
  }
  return embedding;
}
