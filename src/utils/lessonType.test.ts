import test from "node:test";
import assert from "node:assert/strict";
import { deriveLessonType } from "./lessonType.ts";

test("lesson type follows attachments in priority order", () => {
  assert.equal(deriveLessonType({}, false), "text");
  assert.equal(deriveLessonType({ imageUrl: "x" }, true), "image");
  assert.equal(deriveLessonType({ fileUrl: "x", imageUrl: "y" }, false), "pdf");
  assert.equal(deriveLessonType({ audioUrl: "x", fileUrl: "y" }, false), "audio");
  assert.equal(deriveLessonType({ videoUrl: "https://youtu.be/x", audioUrl: "y" }, false), "video");
  assert.equal(deriveLessonType({ videoUrl: "  " }, true), "checklist");
});
