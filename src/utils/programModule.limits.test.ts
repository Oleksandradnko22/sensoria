import test from "node:test";
import assert from "node:assert/strict";
import { MAX_LESSONS_PER_MODULE, MAX_LESSONS_TOTAL, lessonLimitReached } from "./programModule.ts";

const mod = (n: number) => ({ items: Array.from({ length: n }) });

test("per-module and total lesson caps", () => {
  assert.equal(lessonLimitReached([mod(MAX_LESSONS_PER_MODULE - 1)], 0), false);
  assert.equal(lessonLimitReached([mod(MAX_LESSONS_PER_MODULE)], 0), true);
  // 10 modules x 10 lessons is exactly the total cap, so the total never blocks before the per-module cap does.
  assert.equal(MAX_LESSONS_PER_MODULE * 10, MAX_LESSONS_TOTAL);
});
