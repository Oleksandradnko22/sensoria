import test from "node:test";
import assert from "node:assert/strict";
import { moduleCountLabel } from "./moduleLabel.ts";

test("module count label uses correct Ukrainian plurals", () => {
  assert.equal(moduleCountLabel(1), "1 модуль");
  assert.equal(moduleCountLabel(2), "2 модулі");
  assert.equal(moduleCountLabel(4), "4 модулі");
  assert.equal(moduleCountLabel(5), "5 модулів");
  assert.equal(moduleCountLabel(11), "11 модулів");
  assert.equal(moduleCountLabel(21), "21 модуль");
  assert.equal(moduleCountLabel(22), "22 модулі");
});

test("no modules → nothing to show, never a time label", () => {
  assert.equal(moduleCountLabel(0), "");
  assert.equal(moduleCountLabel(undefined), "");
  assert.equal(moduleCountLabel(null), "");
  assert.equal(moduleCountLabel(NaN), "");
});
