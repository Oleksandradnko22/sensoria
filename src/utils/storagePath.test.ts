import { test } from "node:test";
import assert from "node:assert/strict";
import { contentFilePath } from "./storagePath.ts";

test("the object path is read from a public link, without the cache-busting query", () => {
  assert.equal(contentFilePath("https://abc.supabase.co/storage/v1/object/public/content-files/u1/c1/cover-card.jpg?v=1730000000"), "u1/c1/cover-card.jpg");
  assert.equal(contentFilePath("https://abc.supabase.co/storage/v1/object/public/content-files/u1/c1/cover.jpg"), "u1/c1/cover.jpg");
});
test("foreign or empty links give no path (so nothing outside our bucket is ever deleted)", () => {
  assert.equal(contentFilePath("https://example.com/cover.jpg"), null);
  assert.equal(contentFilePath("https://abc.supabase.co/storage/v1/object/public/other-bucket/u1/x.jpg"), null);
  assert.equal(contentFilePath(null), null);
  assert.equal(contentFilePath(""), null);
});
