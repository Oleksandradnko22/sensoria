import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketSeries,
  bucketCountFor,
  chartFrom,
  deltaPercent,
  distribution,
  maskEmail,
} from "./adminAnalytics.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-27T12:00:00Z");

test("bucketSeries: counts land in the right bucket and sum to the in-range total", () => {
  const from = NOW - 7 * DAY;
  const ts = [
    new Date(NOW - 6.5 * DAY).toISOString(), // bucket 0
    new Date(NOW - 0.5 * DAY).toISOString(), // bucket 6
    new Date(NOW).toISOString(), // upper edge → last bucket
    new Date(NOW - 8 * DAY).toISOString(), // before range → ignored
    "garbage",
  ];
  const b = bucketSeries(ts, from, NOW, 7);
  assert.equal(b.length, 7);
  assert.equal(b[0].count, 1);
  assert.equal(b[6].count, 2);
  assert.equal(b.reduce((s, x) => s + x.count, 0), 3);
});

test("bucketSeries: empty input gives zeroed buckets, never throws", () => {
  const b = bucketSeries([], NOW - DAY, NOW, 5);
  assert.deepEqual(b.map((x) => x.count), [0, 0, 0, 0, 0]);
  assert.equal(bucketSeries([], NOW, NOW, 3).length, 3);
});

test("bucketCountFor", () => {
  assert.equal(bucketCountFor(7), 7);
  assert.equal(bucketCountFor(30), 30);
  assert.equal(bucketCountFor(90), 30);
  assert.equal(bucketCountFor(0), 30);
});

test("chartFrom: fixed period, all-time with data, all-time without data", () => {
  assert.equal(chartFrom(30, NOW, []), NOW - 30 * DAY);
  const first = new Date(NOW - 200 * DAY).toISOString();
  assert.equal(chartFrom(0, NOW, [first, new Date(NOW).toISOString()]), NOW - 200 * DAY);
  assert.equal(chartFrom(0, NOW, []), NOW - 30 * DAY);
  // a single brand-new record still yields a non-degenerate window
  assert.ok(chartFrom(0, NOW, [new Date(NOW).toISOString()]) < NOW);
});

test("deltaPercent: honest nulls instead of fake +0% / infinity", () => {
  assert.equal(deltaPercent(10, 5), 100);
  assert.equal(deltaPercent(5, 10), -50);
  assert.equal(deltaPercent(0, 4), -100);
  assert.equal(deltaPercent(3, 0), null);
  assert.equal(deltaPercent(0, 0), null);
  assert.equal(deltaPercent(null, 5), null);
  assert.equal(deltaPercent(5, null), null);
});

test("distribution: percentages, zero total, rounding", () => {
  const order = ["program", "guide", "meditation"] as const;
  const d = distribution({ program: 1, guide: 0, meditation: 0 }, order);
  assert.equal(d.total, 1);
  assert.equal(d.rows[0].percent, 100);
  const z = distribution({ program: 0, guide: 0, meditation: 0 }, order);
  assert.equal(z.total, 0);
  assert.ok(z.rows.every((r) => r.percent === 0 && !Number.isNaN(r.percent)));
  const t = distribution({ program: 1, guide: 1, meditation: 1 }, order);
  assert.deepEqual(t.rows.map((r) => r.percent), [33, 33, 33]);
});

test("maskEmail", () => {
  assert.equal(maskEmail("olena.k@gmail.com"), "ol…@gmail.com");
  assert.equal(maskEmail("a@x.io"), "a…@x.io");
  assert.equal(maskEmail("nonsense"), "—");
  assert.equal(maskEmail(""), "—");
});
