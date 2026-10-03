import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ObjectId, type Db } from "mongodb";
import { createMatchingServer } from "../server.ts";

const vector = (first: number, second = 0): number[] => [first, second, ...Array(1022).fill(0)];

function report(overrides: Record<string, unknown> = {}) {
  return {
    _id: "lost-report",
    type: "lost",
    title: "Blue backpack",
    description: "Blue canvas backpack left in the library.",
    category: "Bags",
    location: { coordinates: [-0.12, 51.5] },
    eventDate: new Date("2026-10-03T12:30:00Z"),
    userId: "owner-lost",
    status: "open",
    embedding: vector(1),
    ...overrides,
  };
}

function fakeDb(documents: Record<string, unknown>[]) {
  const items = {
    async findOne(filter: { _id: { $in: unknown[] } }) {
      return documents.find((document) =>
        filter._id.$in.some((id) => {
          const left = document._id instanceof ObjectId ? document._id.toHexString() : document._id;
          const right = id instanceof ObjectId ? id.toHexString() : id;
          return left === right;
        }),
      ) ?? null;
    },
    find(filter: { type: string; status: string }) {
      const results = documents.filter((document) => document.type === filter.type && document.status === filter.status);
      return {
        batchSize(size: number) {
          assert.equal(size, 250);
          return this;
        },
        async *[Symbol.asyncIterator]() {
          yield* results;
        },
      };
    },
  };
  return {
    collection: (name: string) => {
      assert.equal(name, "items");
      return items;
    },
    command: async () => ({ ok: 1 }),
  } as unknown as Db;
}

const matchingPayload = {
  itemId: "lost-report",
  type: "lost",
  title: "Blue backpack",
  description: "Blue canvas backpack left in the library.",
  category: "Bags",
  location: { coordinates: [-0.12, 51.5] },
  eventDate: "2026-10-03T12:30:00Z",
  userId: "owner-lost",
};

async function withService<T>(
  db: Db,
  run: (url: string) => Promise<T>,
  options: { embed?: (title: string, description: string) => Promise<number[]>; token?: string } = {},
): Promise<T> {
  const server = createMatchingServer(db, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(url: string, path: string, body: unknown, token?: string) {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("matching service HTTP contract", () => {
  it("serves health only when MongoDB responds to ping", async () => {
    await withService(fakeDb([]), async (url) => {
      const response = await fetch(`${url}/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    });
  });

  it("embeds valid input and rejects invalid vectors", async () => {
    await withService(fakeDb([]), async (url) => {
      const response = await post(url, "/embeddings", { title: "Backpack", description: "Blue" });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { embedding: vector(1) });
    }, { embed: async () => vector(1) });

    for (const invalidVector of [
      [1, 0],
      [NaN, ...Array(1023).fill(0)],
      Array(1024).fill(0),
    ]) {
      await withService(fakeDb([]), async (url) => {
        const response = await post(url, "/embeddings", { title: "Backpack", description: "Blue" });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "Embedding service unavailable" });
      }, { embed: async () => invalidVector });
    }
  });

  it("sanitizes embedding provider errors", async () => {
    await withService(fakeDb([]), async (url) => {
      const response = await post(url, "/embeddings", { title: "Backpack", description: "Blue" });
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /secret|provider/i);
    }, { embed: async () => { throw new Error("provider secret detail"); } });
  });

  it("requires the configured bearer token", async () => {
    await withService(fakeDb([]), async (url) => {
      assert.equal((await post(url, "/embeddings", { title: "A", description: "B" })).status, 401);
      assert.equal((await post(url, "/embeddings", { title: "A", description: "B" }, "wrong")).status, 401);
      assert.equal((await post(url, "/embeddings", { title: "A", description: "B" }, "private-token")).status, 200);
    }, { token: "private-token", embed: async () => vector(1) });
  });

  it("ranks candidates with the shared cosine and score engine", async () => {
    const exact = report({ _id: "exact", type: "found", userId: "owner-found" });
    const lower = report({
      _id: "lower",
      type: "found",
      userId: "owner-other",
      category: "Electronics",
      location: { coordinates: [0, 0] },
      eventDate: new Date("2026-10-04T12:30:00Z"),
      embedding: vector(0.8, 0.6),
    });
    await withService(fakeDb([report(), exact, lower]), async (url) => {
      const response = await post(url, "/matches", matchingPayload);
      assert.equal(response.status, 200);
      const result = await response.json() as { matches: { itemId: string; score: number }[] };
      assert.deepEqual(result.matches.map((match) => match.itemId), ["exact", "lower"]);
      assert.equal(result.matches[0]?.score, 1);
      assert.ok(Math.abs((result.matches[1]?.score ?? 0) - 0.35) < 1e-12);
    });
  });

  it("uses saved owner and report fields, excluding same-owner, wrong-side, closed, and malformed candidates", async () => {
    const candidates = [
      report({ _id: "own", type: "found", userId: "owner-lost" }),
      report({ _id: "same-side", type: "lost", userId: "another" }),
      report({ _id: "closed", type: "found", status: "matched", userId: "another" }),
      report({ _id: "bad-vector", type: "found", userId: "another", embedding: [1, 0] }),
      report({ _id: "bad-coordinates", type: "found", userId: "another", location: { coordinates: [181, 0] } }),
      report({ _id: "valid", type: "found", userId: "another" }),
    ];
    await withService(fakeDb([report(), ...candidates]), async (url) => {
      const forged = { ...matchingPayload, userId: "another", type: "found", category: "Other" };
      const response = await post(url, "/matches", forged);
      assert.equal(response.status, 200);
      const result = await response.json() as { matches: { itemId: string }[] };
      assert.deepEqual(result.matches.map((match) => match.itemId), ["valid"]);
    });
  });

  it("looks up ObjectId-backed reports by their opaque string ID", async () => {
    const id = new ObjectId("64a1" + "b2c3" + "d4e5" + "f607" + "1829" + "30ab");
    const current = report({ _id: id });
    const candidate = report({ _id: "found-report", type: "found", userId: "owner-found" });
    await withService(fakeDb([current, candidate]), async (url) => {
      const response = await post(url, "/matches", { ...matchingPayload, itemId: id.toHexString() });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { matches: [{ itemId: "found-report", score: 1 }] });
    });
  });

  it("distinguishes missing and unmatchable stored reports", async () => {
    await withService(fakeDb([]), async (url) => {
      assert.equal((await post(url, "/matches", matchingPayload)).status, 404);
    });
    await withService(fakeDb([report({ embedding: [1, 0] })]), async (url) => {
      assert.equal((await post(url, "/matches", matchingPayload)).status, 409);
    });
  });

  it("rejects malformed JSON payloads and unknown routes", async () => {
    await withService(fakeDb([]), async (url) => {
      const malformed = await fetch(`${url}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(malformed.status, 400);
      assert.equal((await post(url, "/matches", { ...matchingPayload, itemId: "" })).status, 400);
      const oversized = await fetch(`${url}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(1024 * 1024 + 1),
      });
      assert.equal(oversized.status, 413);
      assert.equal((await fetch(`${url}/unknown`)).status, 404);
    });
  });
});
