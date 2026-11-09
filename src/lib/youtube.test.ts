import { test } from "node:test";
import assert from "node:assert/strict";
import { getYouTubeEmbedUrl } from "./youtube.ts";

test("youtube.com/watch?v= form", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://www.youtube.com/watch?v=7Ep5mKuRmAA"),
    "https://www.youtube.com/embed/7Ep5mKuRmAA"
  );
});

test("youtube.com/watch with extra query params (timestamp, playlist)", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://www.youtube.com/watch?v=7Ep5mKuRmAA&t=30s&list=abc"),
    "https://www.youtube.com/embed/7Ep5mKuRmAA"
  );
});

test("youtu.be short form", () => {
  assert.equal(getYouTubeEmbedUrl("https://youtu.be/7Ep5mKuRmAA"), "https://www.youtube.com/embed/7Ep5mKuRmAA");
});

test("youtu.be with trailing query", () => {
  assert.equal(getYouTubeEmbedUrl("https://youtu.be/7Ep5mKuRmAA?t=10"), "https://www.youtube.com/embed/7Ep5mKuRmAA");
});

test("already-embed form passes through", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://www.youtube.com/embed/7Ep5mKuRmAA"),
    "https://www.youtube.com/embed/7Ep5mKuRmAA"
  );
});

test("shorts form", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://www.youtube.com/shorts/7Ep5mKuRmAA"),
    "https://www.youtube.com/embed/7Ep5mKuRmAA"
  );
});

test("m.youtube.com mobile host", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://m.youtube.com/watch?v=7Ep5mKuRmAA"),
    "https://www.youtube.com/embed/7Ep5mKuRmAA"
  );
});

test("non-youtube url returns null", () => {
  assert.equal(getYouTubeEmbedUrl("https://vimeo.com/12345"), null);
});

test("garbage string returns null instead of throwing", () => {
  assert.equal(getYouTubeEmbedUrl("not a url"), null);
});

test("empty/undefined/null return null", () => {
  assert.equal(getYouTubeEmbedUrl(""), null);
  assert.equal(getYouTubeEmbedUrl(undefined), null);
  assert.equal(getYouTubeEmbedUrl(null), null);
});

test("youtube.com/watch with no v param returns null", () => {
  assert.equal(getYouTubeEmbedUrl("https://www.youtube.com/watch"), null);
});
