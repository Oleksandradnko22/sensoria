import test from "node:test";
import assert from "node:assert/strict";
import { pageForPath, pathForPage } from "./routes.ts";

test("page -> path", () => {
  assert.equal(pathForPage("home"), "/");
  assert.equal(pathForPage("catalog"), "/programs");
  assert.equal(pathForPage("test"), "/start");
  assert.equal(pathForPage("contacts"), "/contacts");
  assert.equal(pathForPage("terms"), "/terms");
  assert.equal(pathForPage("privacy"), "/privacy");
  assert.equal(pathForPage("refunds"), "/refunds");
  assert.equal(pathForPage("author-agreement"), "/author-agreement");
  assert.equal(pathForPage("payment-result"), "/payment-result");
  assert.equal(pathForPage("admin-dashboard"), "/account");
  assert.equal(pathForPage("author-profile", "a b"), "/authors/a%20b");
  assert.equal(pathForPage("author-profile", null), "/");
});

test("path -> page", () => {
  assert.deepEqual(pageForPath("/programs/"), { page: "catalog", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/privacy"), { page: "privacy", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/author-agreement"), { page: "author-agreement", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/payment-result"), { page: "payment-result", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/refunds"), { page: "refunds", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/terms"), { page: "terms", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/contacts"), { page: "contacts", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/start"), { page: "state-selection", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/authors/a%20b"), { page: "author-profile", authorId: "a b", programId: null });
  assert.deepEqual(pageForPath("/account"), { page: "home", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/nope"), { page: "home", authorId: null, programId: null });
  assert.deepEqual(pageForPath("/authors/%E0%A4%A"), { page: "home", authorId: null, programId: null });
});
