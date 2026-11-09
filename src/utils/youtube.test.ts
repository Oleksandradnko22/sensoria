import { test } from "node:test";
import assert from "node:assert/strict";
import { isYoutubeUrl, youtubeId } from "./youtube.ts";

test("a real YouTube id is exactly 11 characters", () => {
  assert.equal(youtubeId("https://youtu.be/_bc0HnxvtZQ"), "_bc0HnxvtZQ");
  assert.equal(youtubeId("https://youtu.be/_bc0HnxvtZQ?si=FdzpbfblrHFmfFaV"), "_bc0HnxvtZQ");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=8TBzt9H11cE&t=5s"), "8TBzt9H11cE");
  assert.equal(youtubeId("https://m.youtube.com/shorts/8TBzt9H11cE"), "8TBzt9H11cE");
  assert.equal(youtubeId("https://www.youtube.com/embed/8TBzt9H11cE?rel=0"), "8TBzt9H11cE");
});

test("too short, too long or foreign links are rejected", () => {
  assert.equal(isYoutubeUrl("https://youtu.be/abcdef"), false);
  assert.equal(isYoutubeUrl("https://youtu.be/_bc0HnxvtZQextra"), false);
  assert.equal(isYoutubeUrl("https://www.youtube.com/watch?v=abc"), false);
  assert.equal(isYoutubeUrl("https://www.youtube.com/embed/abc123"), false);
  assert.equal(isYoutubeUrl("https://vimeo.com/123456789"), false);
  assert.equal(isYoutubeUrl(""), false);
});
