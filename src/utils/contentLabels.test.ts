import test from "node:test";
import assert from "node:assert/strict";
import { aiDeclaration, isAiProgram, isSensoriaAuthor, withAiDeclaration } from "./contentLabels.ts";

test("AI declaration is read from the reserved tags", () => {
  assert.equal(aiDeclaration(undefined), null);
  assert.equal(aiDeclaration(["stress"]), null);
  assert.equal(aiDeclaration(["stress", "ai-none"]), "none");
  assert.equal(aiDeclaration(["ai-used", "ai-none"]), "used");
  assert.equal(isAiProgram(["ai-used"]), true);
  assert.equal(isAiProgram(["ai-none"]), false);
  assert.equal(isAiProgram(null), false);
});

test("withAiDeclaration replaces, never duplicates, and keeps other tags", () => {
  assert.deepEqual(withAiDeclaration(["stress"], "used"), ["stress", "ai-used"]);
  assert.deepEqual(withAiDeclaration(["stress", "ai-used"], "none"), ["stress", "ai-none"]);
  assert.deepEqual(withAiDeclaration(["ai-none", "ai-none"], "used"), ["ai-used"]);
});

test("only the platform's own account counts as Sensoria", () => {
  assert.equal(isSensoriaAuthor("Sensoria"), true);
  assert.equal(isSensoriaAuthor("  sensoria "), true);
  assert.equal(isSensoriaAuthor("Sensoria Team"), false);
  assert.equal(isSensoriaAuthor(""), false);
  assert.equal(isSensoriaAuthor(undefined), false);
});
