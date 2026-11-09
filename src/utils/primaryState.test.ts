import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrimaryStateId, isIntensity, clampScore } from "./primaryState.ts";

test("isPrimaryStateId accepts every real state id", () => {
  for (const id of ["anxiety", "stress", "burnout", "selfEsteem", "relationships", "motivation"]) {
    assert.equal(isPrimaryStateId(id), true);
  }
});

test("isPrimaryStateId rejects an unknown/corrupted value", () => {
  assert.equal(isPrimaryStateId("depression"), false);
  assert.equal(isPrimaryStateId(""), false);
});

test("isIntensity accepts every real intensity", () => {
  for (const level of ["low", "moderate", "high", "critical"]) {
    assert.equal(isIntensity(level), true);
  }
});

test("isIntensity rejects an unknown/corrupted value", () => {
  assert.equal(isIntensity("severe"), false);
  assert.equal(isIntensity(""), false);
});

test("clampScore passes through an already-valid score", () => {
  assert.equal(clampScore(0), 0);
  assert.equal(clampScore(100), 100);
  assert.equal(clampScore(57), 57);
});

test("clampScore rounds a fractional score", () => {
  assert.equal(clampScore(74.6), 75);
});

test("clampScore clamps a value above the valid range", () => {
  assert.equal(clampScore(140), 100);
});

test("clampScore clamps a negative value", () => {
  assert.equal(clampScore(-12), 0);
});

test("clampScore defaults NaN/undefined/null/non-numeric to 0, never NaN", () => {
  assert.equal(clampScore(NaN), 0);
  assert.equal(clampScore(undefined), 0);
  assert.equal(clampScore(null), 0);
  assert.equal(clampScore("not-a-number"), 0);
});
