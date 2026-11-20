import test from "node:test";
import assert from "node:assert/strict";
import { rankMatches, matchScore, patternTags, selectionReason, needsGentle } from "./relevantContent.ts";

const item = (id: string, tags: string[], extra: Partial<{ price: string; durationMinutes: number; title: string; description: string }> = {}) =>
  ({ id, tags, title: id, description: "", ...extra });

test("only real matches, chosen state before the second one before an elevated topic", () => {
  const list = [item("none", ["motivation"]), item("topic", ["burnout"]), item("second", ["stress"]), item("main", ["anxiety"])];
  assert.deepEqual(rankMatches(list, "anxiety", "stress", { extraTags: ["burnout"] }).map((x) => x.id), ["main", "second", "topic"]);
  assert.deepEqual(rankMatches(list, "anxiety", null).map((x) => x.id), ["main"], "no padding with unrelated items");
  assert.equal(matchScore(item("x", ["relationships"]), "anxiety", null, []), 0);
});

test("version 1 signal categories map to states", () => {
  assert.deepEqual(patternTags(["emotionalBalance"]), ["stress", "anxiety"]);
  assert.deepEqual(patternTags(["innerPressure", "burnout"]), ["selfEsteem", "burnout"]);
  assert.equal(matchScore(item("x", ["stress"]), "motivation", null, ["emotionalBalance"]), 1);
});

test("gentle: free first, then shorter, deep topics last", () => {
  const list = [
    item("paid-long", ["anxiety"], { price: "900", durationMinutes: 30 }),
    item("free-long", ["anxiety"], { price: "0", durationMinutes: 25 }),
    item("free-short", ["anxiety"], { price: "0", durationMinutes: 5 }),
    item("deep", ["anxiety"], { price: "0", durationMinutes: 3, riskTopics: ["trauma"] } as never),
  ];
  assert.deepEqual(rankMatches(list, "anxiety", null, { gentle: true }).map((x) => x.id), ["free-short", "free-long", "paid-long", "deep"]);
  assert.deepEqual(rankMatches(list, "anxiety", null).map((x) => x.id), ["paid-long", "free-long", "free-short", "deep"], "authored order otherwise");
});

test("reason line and gentle flag", () => {
  assert.match(selectionReason("anxiety", "stress", ["burnout"]), /«тривожність» і «стрес», а також «вигорання»/);
  assert.equal(needsGentle({ safety: true }), true);
  assert.equal(needsGentle({ details: { safety: true } }), true);
  assert.equal(needsGentle({ intensity: "high" }), false);
  assert.equal(needsGentle(null), false);
});
