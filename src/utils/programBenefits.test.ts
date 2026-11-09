import test from "node:test";
import assert from "node:assert/strict";
import { benefitsFromTags, withBenefits, stripBenefitTags, cleanBenefit, MAX_BENEFIT_CHARS } from "./programBenefits.ts";

test("benefits round-trip through tags and keep other tags", () => {
  const tags = withBenefits(["stress", "ai-none"], ["  Менше   напруги ", "Більше енергії"]);
  assert.deepEqual(tags, ["stress", "ai-none", "benefit:Менше напруги", "benefit:Більше енергії"]);
  assert.deepEqual(benefitsFromTags(tags), ["Менше напруги", "Більше енергії"]);
  assert.deepEqual(stripBenefitTags(tags), ["stress", "ai-none"]);
});

test("replacing never duplicates; empty entries are dropped; max three", () => {
  const first = withBenefits(["stress"], ["a", "b"]);
  const again = withBenefits(first, ["x", "", "y", "z", "w"]);
  assert.deepEqual(benefitsFromTags(again), ["x", "y", "z"]);
  assert.equal(again.filter((t) => t.startsWith("benefit:")).length, 3);
});

test("reading is forgiving: duplicates, blanks, missing tags, long text", () => {
  assert.deepEqual(benefitsFromTags(undefined), []);
  assert.deepEqual(benefitsFromTags(["stress", "benefit:", "benefit:  "]), []);
  assert.deepEqual(benefitsFromTags(["benefit:Так", "benefit:так"]), ["Так"]);
  assert.equal(cleanBenefit("я".repeat(500)).length, MAX_BENEFIT_CHARS);
  assert.equal(MAX_BENEFIT_CHARS, 40);
});

test("cleanBenefit cuts by characters, never in the middle of an emoji", () => {
  const out = cleanBenefit("😀".repeat(50));
  assert.equal([...out].length, MAX_BENEFIT_CHARS);
  assert.ok(!out.includes("�"));
});
