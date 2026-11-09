import { test } from "node:test";
import assert from "node:assert/strict";
import { pluralUk } from "./plural.ts";

const w = (n: number) => pluralUk(n, "урок", "уроки", "уроків");

test("1, 21, 101 → one", () => {
  for (const n of [1, 21, 31, 101]) assert.equal(w(n), "урок", String(n));
});
test("2–4, 22–24 → few", () => {
  for (const n of [2, 3, 4, 22, 23, 24, 102]) assert.equal(w(n), "уроки", String(n));
});
test("0, 5–20, 25–30, 111–114 → many", () => {
  for (const n of [0, 5, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 111, 112, 113, 114]) assert.equal(w(n), "уроків", String(n));
});
test("negative numbers follow the same rule", () => {
  assert.equal(w(-1), "урок");
  assert.equal(w(-3), "уроки");
});
