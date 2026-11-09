import { test } from "node:test";
import assert from "node:assert/strict";
import { viewedKeys } from "./guideSectionKeys.ts";

const keys = ["h-a", "h-b", "h-c"];

test("rows with a section id count by id, old rows by position", () => {
  assert.deepEqual(viewedKeys([{ sectionId: "h-c" }, { sectionIndex: 0 }], keys).sort(), ["h-a", "h-c"]);
});

test("a section removed from the guide is ignored, never counted", () => {
  assert.deepEqual(viewedKeys([{ sectionId: "h-gone" }, { sectionIndex: 9 }], keys), []);
});

test("a reordered guide keeps progress with the section, not the position", () => {
  const reordered = ["h-c", "h-a", "h-b"];
  assert.deepEqual(viewedKeys([{ sectionId: "h-a" }], reordered), ["h-a"]);
});

test("duplicates collapse", () => {
  assert.deepEqual(viewedKeys([{ sectionId: "h-a" }, { sectionIndex: 0 }], keys), ["h-a"]);
});
