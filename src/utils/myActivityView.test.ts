import test from "node:test";
import assert from "node:assert/strict";
import { filterReports, reportCounts, filterReviews, reviewCounts, sortNewest } from "./myActivityView.ts";

test("report counts match filtered rows", () => {
  const r = [{ status: "open" as const }, { status: "reviewed" as const }, { status: "open" as const }];
  const c = reportCounts(r);
  assert.deepEqual(c, { all: 3, open: 2, reviewed: 1 });
  assert.equal(filterReports(r, "open").length, c.open);
  assert.equal(filterReports(r, "all").length, c.all);
});

test("review counts match filtered rows, author reviews are their own bucket", () => {
  const r = [
    { kind: "content" as const, contentKind: "guide" as const },
    { kind: "content" as const, contentKind: null },
    { kind: "author" as const, contentKind: null },
  ];
  const c = reviewCounts(r);
  assert.equal(c.all, 3);
  assert.equal(c.guide, 1);
  assert.equal(c.author, 1);
  assert.equal(filterReviews(r, "author").length, 1);
  assert.equal(filterReviews(r, "program").length, 0);
});

test("sortNewest is deterministic", () => {
  const x = [{ id: "b", d: "2026-01-01" }, { id: "a", d: "2026-01-01" }, { id: "c", d: "2026-02-01" }];
  assert.deepEqual(sortNewest(x, (t) => t.d).map((t) => t.id), ["c", "a", "b"]);
});
