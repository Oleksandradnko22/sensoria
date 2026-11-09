import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionProblem, priceProblem, titleProblem } from "./contentLimits.ts";

test("title length", () => {
  assert.ok(titleProblem(" "));
  assert.ok(titleProblem("abcd"));
  assert.equal(titleProblem("abcde"), null);
  assert.ok(titleProblem("a".repeat(81)));
});
test("description length", () => {
  assert.ok(descriptionProblem(""));
  assert.ok(descriptionProblem("коротко"));
  assert.equal(descriptionProblem("а".repeat(40)), null);
  assert.ok(descriptionProblem("а".repeat(601)));
});
test("price", () => {
  assert.equal(priceProblem("0"), null);
  assert.equal(priceProblem("250"), null);
  assert.ok(priceProblem(""));
  assert.ok(priceProblem("12.5"));
  assert.ok(priceProblem("100001"));
});
