import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";
import { createMatchingServer } from "./server.ts";

export async function start(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const databaseName = process.env.MONGODB_DATABASE || "lost_found";
  const port = Number(process.env.PORT ?? "8001");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(databaseName);
  await db.command({ ping: 1 });
  const server = createMatchingServer(db);
  server.on("error", () => {
    console.error("Matching service HTTP server failed");
    void client.close().finally(() => process.exitCode = 1);
  });
  server.listen(port, "0.0.0.0", () => console.log(`Matching service listening on port ${port}`));

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void client.close().then(() => process.exit(0), () => process.exit(1));
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    console.error("Matching service startup failed:", error instanceof Error ? error.constructor.name : "UnknownError");
    process.exitCode = 1;
  });
}
