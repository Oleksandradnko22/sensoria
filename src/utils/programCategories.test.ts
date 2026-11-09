import test from "node:test";
import assert from "node:assert/strict";
import { categoriesProblem, categoryTags, makePrimaryCategory, orderTags, primaryCategory, toggleCategoryTag } from "./programCategories.ts";

test("primary category is the first category tag, other tags are ignored", () => {
  assert.equal(primaryCategory(["ai:none", "stress", "anxiety"]), "stress");
  assert.equal(primaryCategory(["ai:none"]), null);
  assert.deepEqual(categoryTags(undefined), []);
});

test("toggle respects the limit for categories only", () => {
  let t: string[] = [];
  for (const id of ["stress", "anxiety", "burnout", "recovery"]) t = toggleCategoryTag(t, id, 3);
  assert.deepEqual(t, ["stress", "anxiety", "burnout"]);
  assert.deepEqual(toggleCategoryTag(t, "stress", 3), ["anxiety", "burnout"]);
  assert.deepEqual(toggleCategoryTag(t, "x-other", 3), ["stress", "anxiety", "burnout", "x-other"]);
});

test("makePrimary moves a category to the front of the categories", () => {
  assert.deepEqual(makePrimaryCategory(["ai:none", "stress", "anxiety"], "anxiety"), ["anxiety", "stress", "ai:none"]);
  assert.deepEqual(makePrimaryCategory(["stress"], "missing"), ["stress"]);
});

test("orderTags puts categories first and keeps their order", () => {
  assert.deepEqual(orderTags(["ai:none", "anxiety", "benefit:x", "stress"]), ["anxiety", "stress", "ai:none", "benefit:x"]);
});

test("categoriesProblem: 1-3 required", () => {
  assert.ok(categoriesProblem([]));
  assert.equal(categoriesProblem(["stress"]), null);
  assert.ok(categoriesProblem(["stress", "anxiety", "burnout", "recovery"]));
});
