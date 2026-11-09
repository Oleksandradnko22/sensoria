import test from "node:test";
import assert from "node:assert/strict";
import { STORY_ICONS, DEFAULT_STEP_ICONS, DEFAULT_PRINCIPLE_ICONS, DEFAULT_OFFER_ICON, isStoryIcon, iconPath } from "./storyIcons.ts";

test("icon registry: unique ids, real paths, defaults exist", () => {
  const ids = STORY_ICONS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STORY_ICONS.length >= 20);
  for (const i of STORY_ICONS) assert.ok(i.path.length > 5 && i.label);
  for (const id of [...DEFAULT_STEP_ICONS, ...DEFAULT_PRINCIPLE_ICONS, DEFAULT_OFFER_ICON]) assert.ok(isStoryIcon(id));
});

test("unknown or empty icon id falls back to the default", () => {
  assert.equal(isStoryIcon("heart"), true);
  assert.equal(isStoryIcon("<script>"), false);
  assert.equal(iconPath("nope", "check"), iconPath("check", "heart"));
  assert.equal(iconPath(undefined, "heart"), iconPath("heart", "check"));
});
