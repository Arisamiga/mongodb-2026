import {test} from "node:test";
import assert from "node:assert/strict";
import {validateItem} from "../lib/validation.ts";
import {publicItem} from "../lib/types.ts";
const valid = {
    title: "Black headphones",
    type: "LOST",
    category: "Electronics",
    description: "Black over-ear headphones with a blue carry case.",
    location: "DCU library",
    eventDate: "2026-01-01",
    contactEmail: "reporter@example.com",
    imageUrl: "",
};
test("validates and trims reports", () =>
    assert.equal(
        validateItem({...valid, title: "  Black headphones  "}).title,
        "Black headphones",
    ));
test("rejects invalid and overflowing fields", () => {
    for (const change of [
        {type: "OTHER"},
        {category: "Unknown"},
        {title: "x"},
        {description: "short"},
        {contactEmail: "not-an-email"},
        {eventDate: "2026-02-30"},
        {eventDate: "2099-01-01"},
        {imageUrl: "javascript:alert(1)"},
        {imageUrl: "http://example.com/photo.jpg"},
        {title: "x".repeat(101)},
    ])
        assert.throws(() => validateItem({...valid, ...change}));
});
test("only validated fields enter storage", () =>
    assert.equal(
        "embedding" in
            validateItem({...valid, embedding: [1, 2], status: "RESOLVED"}),
        false,
    ));
test("public representation excludes contact email", () => {
    const item = {
        ...validateItem(valid),
        id: "test",
        status: "OPEN" as const,
        createdAt: "",
        updatedAt: "",
        schemaVersion: 1 as const,
    };
    assert.equal("contactEmail" in publicItem(item), false);
});
