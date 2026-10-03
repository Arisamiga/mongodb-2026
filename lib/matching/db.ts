import "./env.ts";
import { MongoClient, type Collection, type Document } from "mongodb";

// Names are read on every call (not at import) so a test can point at a scratch database by
// setting the env vars before its first query. The defaults match the backend.
export function dbSettings() {
  return {
    uri: process.env.MONGODB_URI,
    database: process.env.MONGODB_DATABASE || "lost_found",
    collection: process.env.ITEMS_COLLECTION || "items",
  };
}

let client: MongoClient | undefined;

export async function getItems(): Promise<Collection<Document>> {
  const { uri, database, collection } = dbSettings();
  // Our own message on purpose: the URI contains credentials, so it is never put in an error.
  if (!uri) throw new Error("MONGODB_URI is not set (add it to .env)");
  client ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect(); // a no-op once connected
  return client.db(database).collection(collection);
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
}
