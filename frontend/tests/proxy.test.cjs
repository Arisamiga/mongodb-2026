const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const {NextRequest} = require("next/server");
const {unstable_doesMiddlewareMatch} = require("next/experimental/testing/server");

const filename = path.resolve(__dirname, "../proxy.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
});
const proxyModule = new Module(filename, module);
proxyModule.paths = module.paths;
proxyModule._compile(compiled.outputText, filename);
const {proxy, config} = proxyModule.exports;

test("admin route fails closed and requires correct server credentials", () => {
    const previous = {username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD};
    const request = (authorization) => new NextRequest("https://example.test/admin", {
        headers: authorization ? {authorization} : {},
    });
    try {
        delete process.env.ADMIN_USERNAME;
        delete process.env.ADMIN_PASSWORD;
        assert.equal(proxy(request()).status, 403);

        process.env.ADMIN_USERNAME = "test-admin";
        assert.equal(proxy(request()).status, 403);
        process.env.ADMIN_PASSWORD = "test-only-password";
        const unauthenticated = proxy(request());
        assert.equal(unauthenticated.status, 401);
        assert.match(unauthenticated.headers.get("WWW-Authenticate"), /^Basic /);
        assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");
        assert.equal(proxy(request("Basic invalid")).status, 401);
        const wrong = Buffer.from("test-admin:wrong").toString("base64");
        assert.equal(proxy(request(`Basic ${wrong}`)).status, 401);
        const valid = Buffer.from("test-admin:test-only-password").toString("base64");
        const authorized = proxy(request(`Basic ${valid}`));
        assert.equal(authorized.headers.get("x-middleware-next"), "1");
        assert.equal(authorized.headers.get("Cache-Control"), "no-store");
    } finally {
        for (const [key, value] of [["ADMIN_USERNAME", previous.username], ["ADMIN_PASSWORD", previous.password]]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test("authentication covers the admin board without blocking public routes", () => {
    for (const url of ["/admin", "/admin/reports"]) {
        assert.equal(unstable_doesMiddlewareMatch({config, nextConfig: {}, url}), true);
    }
    for (const url of ["/", "/search", "/report", "/items/demo-1", "/browse"]) {
        assert.equal(unstable_doesMiddlewareMatch({config, nextConfig: {}, url}), false);
    }
});
