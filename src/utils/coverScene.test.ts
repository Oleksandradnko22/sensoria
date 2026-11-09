import test from "node:test";
import assert from "node:assert/strict";
import { coverVariant, sceneForTags } from "./coverScene.ts";

test("each topic gets its own scene", () => {
  assert.equal(sceneForTags(["emotionalBalance"]), "balance");
  assert.equal(sceneForTags(["stress"]), "path");
  assert.equal(sceneForTags(["selfEsteem"]), "bloom");
  assert.equal(sceneForTags(["relationships"]), "connection");
  assert.equal(sceneForTags(["awareness"]), "sunrise");
  assert.equal(sceneForTags(["motivation"]), "growth");
  assert.equal(sceneForTags(["burnout"]), "calm");
});

test("unknown or missing tags fall back to a branded default; first known tag wins", () => {
  assert.equal(sceneForTags([]), "balance");
  assert.equal(sceneForTags(undefined), "balance");
  assert.equal(sceneForTags(["nope", "stress", "selfEsteem"]), "path");
});

test("variant is stable per id and varies between ids", () => {
  assert.deepEqual(coverVariant("a"), coverVariant("a"));
  assert.deepEqual(coverVariant(undefined), { shift: 0, mirror: false, zoom: false });
  const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(coverVariant(`program-${i}`))));
  assert.ok(seen.size >= 8);
});
