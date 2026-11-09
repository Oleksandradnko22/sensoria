import { test } from "node:test";
import assert from "node:assert/strict";
import { INTRO_PROFILE_TAG, resolveIntroVideo, usesProfileIntro, withProfileIntro } from "./introVideoSource.ts";
import { categoryTags } from "./programCategories.ts";

test("the mark is added once and removed cleanly", () => {
  const on = withProfileIntro(["stress", "ai-none"], true);
  assert.deepEqual(on, ["stress", "ai-none", INTRO_PROFILE_TAG]);
  assert.deepEqual(withProfileIntro(on, true), on);
  assert.deepEqual(withProfileIntro(on, false), ["stress", "ai-none"]);
  assert.equal(usesProfileIntro(on), true);
  assert.equal(usesProfileIntro(["stress"]), false);
  assert.equal(usesProfileIntro(undefined), false);
});

test("the reserved tag is never taken for a category", () => {
  assert.deepEqual(categoryTags(["stress", INTRO_PROFILE_TAG]), ["stress"]);
});

const OWN = "https://youtu.be/ownVideo001";
const PROFILE = "https://youtu.be/profVid0001";

test("a program marked «from profile» follows the current profile video", () => {
  assert.equal(resolveIntroVideo({ tags: [INTRO_PROFILE_TAG], programUrl: OWN, profileUrl: PROFILE }), PROFILE);
});
test("without the mark the program's own link is shown", () => {
  assert.equal(resolveIntroVideo({ tags: ["stress"], programUrl: OWN, profileUrl: PROFILE }), OWN);
});
test("when the profile video is gone or not YouTube, the saved link is the fallback", () => {
  assert.equal(resolveIntroVideo({ tags: [INTRO_PROFILE_TAG], programUrl: OWN, profileUrl: null }), OWN);
  assert.equal(resolveIntroVideo({ tags: [INTRO_PROFILE_TAG], programUrl: OWN, profileUrl: "https://vimeo.com/123" }), OWN);
});
test("nothing is shown without a valid YouTube link", () => {
  assert.equal(resolveIntroVideo({ tags: [], programUrl: "", profileUrl: PROFILE }), null);
  assert.equal(resolveIntroVideo({ tags: [], programUrl: "https://vimeo.com/1", profileUrl: null }), null);
});
