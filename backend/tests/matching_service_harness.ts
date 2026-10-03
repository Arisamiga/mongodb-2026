import { readFileSync } from "node:fs";
import { createMatchingServer } from "../matching-service/server.ts";

const snapshot = process.argv[2];
function reports() {
  return JSON.parse(readFileSync(snapshot, "utf8")).map((report: Record<string, unknown>) => ({
    ...report, eventDate: new Date(report.eventDate as string),
  }));
}

const database = {
  async command() { return { ok: 1 }; },
  collection() {
    return {
      async findOne(query: { _id: { $in: unknown[] } }) {
        return reports().find((report: { _id: string }) =>
          query._id.$in.some((id) => String(id) === report._id)) ?? null;
      },
      find(query: { type: string; status: string }) {
        return {
          batchSize() { return this; },
          async *[Symbol.asyncIterator]() {
            for (const report of reports()) {
              if (report.type === query.type && report.status === query.status) yield report;
            }
          },
        };
      },
    };
  },
};

const server = createMatchingServer(database as never, {
  token: "integration-test-token",
  embed: async () => [1, ...Array(1023).fill(0)],
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`http://127.0.0.1:${address.port}`);
  }
});
process.once("SIGTERM", () => server.close(() => process.exit(0)));
