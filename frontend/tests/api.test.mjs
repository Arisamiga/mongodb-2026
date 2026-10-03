import {afterEach, test} from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server.js";
import {GET, POST} from "../app/api/backend/[...path]/route.ts";
import {api, apiAll, ApiError} from "../lib/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const context = path => ({params: Promise.resolve({path: path.split("/")})});
const request = (path, options = {}) => new NextRequest(`http://localhost:3000/api/backend/${path}`, options);

test("login keeps bearer token out of browser JSON and sets an HttpOnly cookie", async () => {
    globalThis.fetch = async (url, options) => {
        assert.ok(url.endsWith("/auth/login"));
        assert.equal(options.headers.get("Content-Type"), "application/json");
        return Response.json({access_token: "test-token", user: {id: "user-1"}});
    };
    const response = await POST(request("auth/login", {method: "POST",
        headers: {"X-Boomerang-Request": "1", "Content-Type": "application/json"},
        body: JSON.stringify({email: "test@example.com", password: "not-a-real-password"})}), context("auth/login"));
    assert.deepEqual(await response.json(), {user: {id: "user-1"}});
    assert.match(response.headers.get("set-cookie"), /boomerang-session=test-token/);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("mutations without the custom same-origin header are rejected", async () => {
    globalThis.fetch = () => { throw new Error("must not forward"); };
    const response = await POST(request("items", {method: "POST"}), context("items"));
    assert.equal(response.status, 403);
});

test("unknown paths cannot be used as an open proxy", async () => {
    globalThis.fetch = () => { throw new Error("must not forward"); };
    assert.equal((await GET(request("private"), context("private"))).status, 404);
});

test("protected image bytes are forwarded with session authentication and no caching", async () => {
    globalThis.fetch = async (url, options) => {
        assert.ok(url.endsWith("/items/item-1/images/image-1"));
        assert.equal(options.headers.get("Authorization"), "Bearer test-token");
        return new Response(new Uint8Array([1, 2, 3]), {headers: {"Content-Type": "image/png"}});
    };
    const path = "items/item-1/images/image-1";
    const response = await GET(request(path, {headers: {cookie: "boomerang-session=test-token"}}), context(path));
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("multipart image upload preserves the boundary and file field", async () => {
    const body = new FormData();
    body.append("file", new Blob(["image-bytes"], {type: "image/png"}), "photo.png");
    globalThis.fetch = async (_url, options) => {
        const forwarded = new Request("http://api/items/item-1/images", options);
        const file = (await forwarded.formData()).get("file");
        assert.equal(file.name, "photo.png");
        assert.equal(await file.text(), "image-bytes");
        return Response.json({id: "image-1"}, {status: 201});
    };
    const path = "items/item-1/images";
    const response = await POST(request(path, {method: "POST", headers: {"X-Boomerang-Request": "1"}, body}), context(path));
    assert.equal(response.status, 201);
});

test("expired authentication is surfaced and clears the session cookie", async () => {
    globalThis.fetch = async () => Response.json({detail: "Invalid token"}, {status: 401});
    const response = await GET(request("auth/me"), context("auth/me"));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("logout clears session without calling the backend", async () => {
    globalThis.fetch = () => { throw new Error("must not forward"); };
    const response = await POST(request("auth/logout", {method: "POST", headers: {"X-Boomerang-Request": "1"}}), context("auth/logout"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("upstream outages return an actionable API error", async () => {
    globalThis.fetch = async () => { throw new Error("connection refused"); };
    assert.equal((await GET(request("auth/me"), context("auth/me"))).status, 502);
});

test("browser API helper sends JSON and the mutation header", async () => {
    globalThis.fetch = async (url, options) => {
        assert.equal(url, "/api/backend/items");
        assert.equal(options.headers.get("X-Boomerang-Request"), "1");
        assert.equal(options.headers.get("Content-Type"), "application/json");
        return Response.json({_id: "item-1"});
    };
    assert.deepEqual(await api("/items", {method: "POST", body: "{}"}), {_id: "item-1"});
});

test("browser API helper reports backend validation failures", async () => {
    globalThis.fetch = async () => Response.json({detail: [{msg: "Invalid coordinates"}]}, {status: 422});
    await assert.rejects(api("/items"), error => error instanceof ApiError && error.status === 422 && error.message === "Invalid coordinates");
});

test("paginated lists include messages beyond the first page", async () => {
    const firstPage = Array.from({length: 100}, (_, id) => ({id}));
    const urls = [];
    globalThis.fetch = async url => {
        urls.push(url);
        return Response.json(url.endsWith("offset=0") ? firstPage : [{id: 100}]);
    };
    assert.equal((await apiAll("/conversations/chat-1/messages")).length, 101);
    assert.deepEqual(urls, ["/api/backend/conversations/chat-1/messages?limit=100&offset=0", "/api/backend/conversations/chat-1/messages?limit=100&offset=100"]);
});
