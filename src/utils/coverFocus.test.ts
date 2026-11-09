import test from "node:test";
import assert from "node:assert/strict";
import { focusForNewCover, coverImageStyle, coverUrlForFrame, withFrameImage, focusForFrame, withFrameFocus, coverObjectPosition, parseCoverFocus } from "./coverFocus.ts";
import { isYoutubeUrl, youtubeId } from "./youtube.ts";

test("focus is validated and clamped", () => {
  assert.deepEqual(parseCoverFocus({ x: 120, y: -5 }), { x: 100, y: 0 });
  assert.equal(parseCoverFocus({ x: "a", y: 1 }), undefined);
  assert.equal(parseCoverFocus(null), undefined);
});
test("object position", () => {
  assert.equal(coverObjectPosition({ x: 30, y: 70 }), "30% 70%");
  assert.equal(coverObjectPosition(undefined), undefined);
});
test("youtube links", () => {
  assert.ok(isYoutubeUrl("https://youtu.be/abc123XYZ01"));
  assert.ok(isYoutubeUrl("https://www.youtube.com/watch?v=abc123XYZ01"));
  assert.ok(!isYoutubeUrl("https://vimeo.com/1"));
  assert.ok(!isYoutubeUrl("https://youtube.com/watch"));
  assert.ok(!isYoutubeUrl("not a url"));
});
test("youtube id", () => {
  assert.equal(youtubeId("https://youtu.be/abc123XYZ01"), "abc123XYZ01");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=abc123XYZ01&t=5"), "abc123XYZ01");
  assert.equal(youtubeId("https://vimeo.com/123456"), null);
});

test("each frame can have its own point; frames without one use the common point", () => {
  const base = { x: 40, y: 60 };
  const f = withFrameFocus(base, "cart", { x: 10, y: 90 });
  assert.equal(coverObjectPosition(f, "cart"), "10% 90%");
  assert.equal(coverObjectPosition(f, "card"), "40% 60%");
  assert.equal(coverObjectPosition(f), "40% 60%");
  assert.deepEqual(focusForFrame(undefined, "card"), undefined);
});

test("moving one frame never changes the others", () => {
  let f = withFrameFocus({ x: 50, y: 50 }, "card", { x: 20, y: 30 });
  f = withFrameFocus(f, "square", { x: 80, y: 10 });
  f = withFrameFocus(f, "card", { x: 25, y: 35 });
  assert.equal(coverObjectPosition(f, "card"), "25% 35%");
  assert.equal(coverObjectPosition(f, "square"), "80% 10%");
  assert.equal(coverObjectPosition(f, "wide"), "50% 50%");
});

test("saved focus with per-frame points round-trips and old data still parses", () => {
  const f = withFrameFocus({ x: 50, y: 50 }, "wide", { x: 12.4, y: 99.6 });
  assert.deepEqual(parseCoverFocus(JSON.parse(JSON.stringify(f))), { x: 50, y: 50, frames: { wide: { x: 12, y: 100 } } });
  assert.deepEqual(parseCoverFocus({ x: 30, y: 70 }), { x: 30, y: 70 });
  assert.deepEqual(parseCoverFocus({ x: 30, y: 70, frames: { card: { x: "a" }, bogus: { x: 1, y: 1 } } }), { x: 30, y: 70 });
});

test("zoom is limited to 1..3 and only stored when it enlarges", () => {
  assert.deepEqual(parseCoverFocus({ x: 50, y: 50, zoom: 9 }), { x: 50, y: 50, zoom: 3 });
  assert.deepEqual(parseCoverFocus({ x: 50, y: 50, zoom: 0.4 }), { x: 50, y: 50 });
  const f = withFrameFocus({ x: 50, y: 50 }, "card", { x: 30, y: 40, zoom: 1.5 });
  assert.deepEqual(coverImageStyle(f, "card"), { objectPosition: "30% 40%", scale: "1.5", transformOrigin: "30% 40%" });
  assert.deepEqual(coverImageStyle(f, "wide"), { objectPosition: "50% 50%" });
  assert.deepEqual(coverImageStyle(undefined, "card"), {});
});

test("a frame can have its own photo; the others keep the program cover", () => {
  const COVER = "https://x/cover.jpg";
  const OWN = "https://x/cover-cart.jpg";
  const f = withFrameImage({ x: 50, y: 50 }, "cart", OWN);
  assert.equal(coverUrlForFrame(COVER, f, "cart"), OWN);
  assert.equal(coverUrlForFrame(COVER, f, "card"), COVER);
  assert.equal(coverUrlForFrame(COVER, undefined, "cart"), COVER);
  // moving / zooming the frame keeps its photo
  const moved = withFrameFocus(f, "cart", { x: 20, y: 70, zoom: 2 });
  assert.equal(coverUrlForFrame(COVER, moved, "cart"), OWN);
  assert.equal(coverObjectPosition(moved, "cart"), "20% 70%");
  // going back to the shared photo
  assert.equal(coverUrlForFrame(COVER, withFrameImage(moved, "cart", undefined), "cart"), COVER);
});

test("per-frame photos survive saving and loading; bad links are dropped", () => {
  const f = withFrameImage({ x: 50, y: 50 }, "square", "https://x/sq.jpg");
  assert.equal(parseCoverFocus(JSON.parse(JSON.stringify(f)))?.frames?.square?.url, "https://x/sq.jpg");
  assert.equal(parseCoverFocus({ x: 1, y: 1, frames: { card: { x: 5, y: 5, url: "javascript:alert(1)" } } })?.frames?.card?.url, undefined);
});

test("a replaced main picture forgets old positions but keeps frames' own photos", () => {
  let f = withFrameFocus({ x: 20, y: 30 }, "card", { x: 5, y: 5, zoom: 2 });
  f = withFrameImage(f, "cart", "https://x/cart.jpg");
  f = withFrameFocus(f, "cart", { x: 70, y: 40, zoom: 1.5 });
  const n = focusForNewCover(f);
  assert.equal(coverObjectPosition(n), "50% 50%");
  assert.equal(coverObjectPosition(n, "card"), "50% 50%");
  assert.equal(coverObjectPosition(n, "cart"), "70% 40%");
  assert.equal(coverUrlForFrame("https://x/new.jpg", n, "cart"), "https://x/cart.jpg");
  assert.deepEqual(focusForNewCover({ x: 9, y: 9 }), { x: 50, y: 50 });
});
