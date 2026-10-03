// Checks that embeddings separate a real match from an unrelated report.
// Run from the repo root:  node lib/matching/test-embedding.ts   (Node 22.18+ runs .ts directly)
import { createEmbedding } from "./embedding.ts";

// Load the API key from the repo-root .env. Nothing here prints it.
process.loadEnvFile(new URL("../../.env", import.meta.url));

const reports = [
  { label: "Lost: AirPods", title: "Black AirPods Pro charging case", description: "Lost near the library" },
  { label: "Found: earbud case", title: "Dark wireless earbud case", description: "Found outside the library entrance" },
  { label: "Lost: umbrella", title: "Blue umbrella", description: "Left in the lecture hall" },
];

// Cosine similarity: 1 = same direction (same meaning), lower = less related.
// This is the same metric we'll use for the Atlas Vector Search index.
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const vectors = await Promise.all(reports.map((r) => createEmbedding(r.title, r.description)));
console.log(`Embedded ${vectors.length} reports, ${vectors[0].length} dimensions each\n`);

for (let i = 0; i < reports.length; i++) {
  for (let j = i + 1; j < reports.length; j++) {
    const score = cosineSimilarity(vectors[i], vectors[j]);
    console.log(`${score.toFixed(3)}  ${reports[i].label}  <->  ${reports[j].label}`);
  }
}
