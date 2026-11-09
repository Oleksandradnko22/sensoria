import test from "node:test";
import assert from "node:assert/strict";
import { heroVisualForTags, HERO_ART_BY_TAG, HERO_VISUALS, FALLBACK_HERO_ART } from "./heroVisual.ts";

test("each category resolves to its documented visual", () => {
  assert.equal(heroVisualForTags(["stress"]).art, "water");
  assert.equal(heroVisualForTags(["anxiety"]).art, "grounding");
  assert.equal(heroVisualForTags(["burnout"]).art, "sunrise");
  assert.equal(heroVisualForTags(["relationships"]).art, "connection");
  assert.equal(heroVisualForTags(["selfEsteem"]).art, "openSpace");
  assert.equal(heroVisualForTags(["motivation"]).art, "momentum");
  assert.equal(heroVisualForTags(["emotionalBalance"]).art, "balance");
  assert.equal(heroVisualForTags(["recovery"]).art, "moon");
});

test("deterministic, first known tag wins, service tags ignored", () => {
  assert.equal(heroVisualForTags(["ai-used", "mystery", "stress", "anxiety"]).art, "water");
  assert.equal(heroVisualForTags(["stress"]), heroVisualForTags(["stress"]));
});

test("unknown / missing tags use the fallback", () => {
  for (const t of [undefined, null, [], ["nope"], ["ai-none"]]) assert.equal(heroVisualForTags(t as string[]).art, FALLBACK_HERO_ART);
});

test("every mapped art exists and categories are distinguishable", () => {
  for (const art of Object.values(HERO_ART_BY_TAG)) assert.ok(HERO_VISUALS[art]);
  const backgrounds = new Set(Object.values(HERO_VISUALS).map((v) => v.background));
  assert.equal(backgrounds.size, Object.keys(HERO_VISUALS).length);
});
