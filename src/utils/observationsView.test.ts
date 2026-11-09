import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChartSeries, buildInsights, groupByMonth } from "./observationsView.ts";
import type { StateChange } from "./stateChanges.ts";

let n = 0;
const rec = (over: Partial<StateChange> = {}): StateChange => ({
  key: `k${n++}`,
  source: "practice",
  context: "ctx",
  measure: "Самопочуття",
  beforeValue: 4,
  afterValue: 6,
  scale: 10,
  before: "4/10",
  after: "6/10",
  note: null,
  tags: [],
  at: "2026-10-01T00:00:00Z",
  target: null,
  ...over,
});

test("groupByMonth keeps order and splits on month change", () => {
  const g = groupByMonth(
    [{ d: "2026-10-05T12:00:00" }, { d: "2026-10-01T12:00:00" }, { d: "2026-08-28T12:00:00" }],
    (x) => x.d
  );
  assert.deepEqual(g.map((x) => [x.label, x.items.length]), [["Жовтень 2026", 2], ["Серпень 2026", 1]]);
});

test("no chart below 3 complete pairs on one scale", () => {
  assert.equal(buildChartSeries([rec(), rec()]).length, 0);
  assert.equal(buildChartSeries([rec(), rec(), rec({ beforeValue: null })]).length, 0);
});

test("chart uses only the dominant scale and is oldest→newest", () => {
  const list = [
    rec({ at: "2026-10-03T00:00:00Z" }),
    rec({ at: "2026-10-02T00:00:00Z" }),
    rec({ at: "2026-10-01T00:00:00Z" }),
    rec({ source: "meditation", scale: 5, measure: "Напруга" }),
  ];
  const s = buildChartSeries(list);
  assert.equal(s.length, 1);
  assert.equal(s[0].scale, 10);
  assert.deepEqual(s[0].points.map((p) => p.at), ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", "2026-10-03T00:00:00Z"]);
});

test("a different scale is never rescaled into the chart", () => {
  const s = buildChartSeries([
    rec({ source: "meditation", scale: 5 }),
    rec({ source: "meditation", scale: 5 }),
    rec({ source: "meditation", scale: 10 }),
  ]);
  assert.equal(s.length, 0);
});

test("insights are count-based and omitted without enough data", () => {
  assert.deepEqual(buildInsights([rec(), rec()]), []);
  const out = buildInsights([rec(), rec(), rec({ beforeValue: 5, afterValue: 5 }), rec({ source: "meditation" })]);
  assert.equal(out.length, 2);
  assert.match(out[0], /3 спостереження після практик і 1 після медитацій/);
  assert.match(out[1], /У 3 з 4/);
  assert.match(out[1], /за своєю шкалою/);
  assert.ok(!out.join(" ").match(/краще|гірше|покращ|знизил/));
});

test("the scale note is left out when every record shares one scale", () => {
  const out = buildInsights([rec(), rec(), rec()]);
  assert.ok(!out.join(" ").includes("за своєю шкалою"));
});
