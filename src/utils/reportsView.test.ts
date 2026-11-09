import { test } from "node:test";
import assert from "node:assert/strict";
import { actionFor, secondaryActionsFor, countByGroup, filterReports, groupOf, openReportsByOwner } from "./reportsView.ts";

const rows = [
  { targetType: "person", status: "open" },
  { targetType: "comment", status: "open" },
  { targetType: "comment", status: "reviewed" },
  { targetType: "post", status: "open" },
  { targetType: "author", status: "open" },
  { targetType: "review", status: "open" },
  { targetType: "guide", status: "reviewed" },
];

test("groupOf maps every target type", () => {
  assert.equal(groupOf("meditation"), "content");
  assert.equal(groupOf("post"), "authors");
  assert.equal(groupOf("author"), "authors");
  assert.equal(groupOf("review"), "reviews");
});

test("filterReports by group and open-only", () => {
  assert.equal(filterReports(rows, "comments", true).length, 1);
  assert.equal(filterReports(rows, "comments", false).length, 2);
  assert.equal(filterReports(rows, "all", true).length, 5);
});

test("countByGroup", () => {
  const c = countByGroup(rows, true);
  assert.equal(c.all, 5);
  assert.equal(c.authors, 2);
  assert.equal(c.content, 0);
});

test("actionFor picks the right action", () => {
  assert.equal(actionFor({ source: "lesson_comment", targetType: "comment" }), "delete_comment");
  assert.equal(actionFor({ source: "entity", targetType: "post" }), "delete_post");
  assert.equal(actionFor({ source: "entity", targetType: "review" }), "delete_review");
  assert.equal(actionFor({ source: "entity", targetType: "author" }), null);
  assert.equal(actionFor({ source: "message", targetType: "person" }), null);
  assert.equal(actionFor({ source: "content", targetType: "guide", targetId: "breathing-guide" }), null);
  assert.equal(actionFor({ source: "content", targetType: "program", targetId: "3f2b8a52-1c3e-4c1a-9d57-0a1b2c3d4e5f" }), "unpublish_content");
});

test("openReportsByOwner counts only open ones", () => {
  const m = openReportsByOwner([
    { ownerId: "a", ownerEmail: "a@x", status: "open" },
    { ownerId: "a", ownerEmail: "a@x", status: "open" },
    { ownerId: "a", ownerEmail: "a@x", status: "reviewed" },
    { ownerId: null, ownerEmail: null, status: "open" },
  ]);
  assert.equal(m.get("a"), 2);
  assert.equal(m.size, 1);
});

test("secondaryActionsFor offers sale controls only for database content", () => {
  assert.deepEqual(secondaryActionsFor({ source: "content", targetType: "program", targetId: "3f2b8a52-1c3e-4c1a-9d57-0a1b2c3d4e5f" }), ["suspend_sale", "restore_sale"]);
  assert.deepEqual(secondaryActionsFor({ source: "content", targetType: "guide", targetId: "breathing-guide" }), []);
  assert.deepEqual(secondaryActionsFor({ source: "entity", targetType: "post" }), []);
});
