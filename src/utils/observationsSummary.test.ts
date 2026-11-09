import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeObservations } from "./observationsSummary.ts";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

test("empty list", () => {
  assert.deepEqual(summarizeObservations([], NOW), { recent: 0, total: 0, lastAt: null });
});

test("counts only the last 7 days as recent", () => {
  const ts = [
    new Date(NOW - 1 * day).toISOString(),
    new Date(NOW - 6 * day).toISOString(),
    new Date(NOW - 8 * day).toISOString(),
  ];
  assert.deepEqual(summarizeObservations(ts, NOW), { recent: 2, total: 3, lastAt: ts[0] });
});

test("exactly 7 days ago counts as recent", () => {
  assert.deepEqual(summarizeObservations([new Date(NOW - 7 * day).toISOString()], NOW), {
    recent: 1,
    total: 1,
    lastAt: new Date(NOW - 7 * day).toISOString(),
  });
});

test("lastAt is the newest real timestamp, regardless of order; invalid ignored", () => {
  const newest = new Date(NOW - 2 * day).toISOString();
  const r = summarizeObservations(["not-a-date", new Date(NOW - 9 * day).toISOString(), newest], NOW);
  assert.equal(r.lastAt, newest);
  assert.equal(r.total, 3);
});
