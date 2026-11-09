import test from "node:test";
import assert from "node:assert/strict";
import { isFullName } from "./personName.ts";

test("isFullName", () => {
  assert.equal(isFullName("Олена Кравченко"), true);
  assert.equal(isFullName("  Марія   Шевченко-Ковальчук "), true);
  assert.equal(isFullName("Маша"), false);
  assert.equal(isFullName("Маша К."), false);
  assert.equal(isFullName(""), false);
  assert.equal(isFullName(null), false);
});
