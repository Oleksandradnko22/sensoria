import { test } from "node:test";
import assert from "node:assert/strict";
import { COVER_MAX_INPUT_BYTES, coverFileProblem, fitWithin, lowResolutionWarning, needsPreparing } from "./coverFile.ts";

test("JPG and PNG are accepted, large originals too (they are prepared before upload)", () => {
  assert.equal(coverFileProblem({ type: "image/jpeg", size: 1000 }), null);
  assert.equal(coverFileProblem({ type: "image/png", size: COVER_MAX_INPUT_BYTES }), null);
});
test("other formats are refused with a friendly message", () => {
  for (const type of ["image/gif", "image/webp", "image/heic", "image/svg+xml", "application/pdf", ""]) {
    assert.match(coverFileProblem({ type, size: 1000 }) ?? "", /JPG або PNG/);
  }
});
test("absurdly big and empty files are refused", () => {
  assert.match(coverFileProblem({ type: "image/jpeg", size: COVER_MAX_INPUT_BYTES + 1 }) ?? "", /завеликий/);
  assert.match(coverFileProblem({ type: "image/png", size: 0 }) ?? "", /порожній/);
});
test("the picture is scaled by its longer side, proportionally, and never enlarged", () => {
  assert.deepEqual(fitWithin(4800, 2700), { width: 2400, height: 1350 });
  assert.deepEqual(fitWithin(2700, 4800), { width: 1350, height: 2400 });
  assert.deepEqual(fitWithin(1600, 900), { width: 1600, height: 900 });
});
test("good small files are left untouched; heavy or huge ones are prepared", () => {
  assert.equal(needsPreparing({ type: "image/jpeg", size: 400_000 }, 1600, 900), false);
  assert.equal(needsPreparing({ type: "image/jpeg", size: 4_000_000 }, 1600, 900), true);
  assert.equal(needsPreparing({ type: "image/jpeg", size: 900_000 }, 5000, 3000), true);
});
test("a picture below 1200 × 675 gets a gentle warning, not an error", () => {
  assert.equal(lowResolutionWarning(1200, 675), null);
  assert.equal(lowResolutionWarning(1920, 1080), null);
  assert.match(lowResolutionWarning(800, 450) ?? "", /800 × 450/);
  assert.match(lowResolutionWarning(1600, 500) ?? "", /1600 × 500/);
});
