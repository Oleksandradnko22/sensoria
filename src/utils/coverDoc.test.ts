import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_HISTORY, addEl, fitWithin, layerLabel, cropEdge, cropPan, cropToRatio, cropZoom, commit, cropRect, duplicateEl, hitTest, newImage, newShape, newText, redo, removeEl, reorderEl, sizeOfPlain, snapToCenter, topHit, undo, updateEl,
  type CoverDoc,
} from "./coverDoc.ts";

const empty: CoverDoc = { background: { kind: "solid", color: "#000" }, deco: "none", elements: [] };

test("hit test follows rotation", () => {
  const s = { ...newShape("rect"), x: 100, y: 100, w: 200, h: 20, rotation: 0 };
  const size = { w: s.w, h: s.h };
  assert.equal(hitTest(s, size, { x: 200, y: 110 }), true);
  assert.equal(hitTest(s, size, { x: 200, y: 160 }), false);
  const r = { ...s, rotation: 90 }; // now tall instead of wide, around the same centre (200, 110)
  assert.equal(hitTest(r, size, { x: 200, y: 190 }), true);
  assert.equal(hitTest(r, size, { x: 290, y: 110 }), false);
});

test("topHit returns the layer drawn last", () => {
  const a = { ...newShape("rect"), x: 0, y: 0, w: 100, h: 100 };
  const b = { ...newShape("rect"), x: 50, y: 50, w: 100, h: 100 };
  const doc = addEl(addEl(empty, a), b);
  assert.equal(topHit(doc, sizeOfPlain, { x: 75, y: 75 })?.id, b.id);
  assert.equal(topHit(doc, sizeOfPlain, { x: 10, y: 10 })?.id, a.id);
  assert.equal(topHit(doc, sizeOfPlain, { x: 500, y: 500 }), null);
});

test("reorder, duplicate, remove, update", () => {
  const a = newText("title"), b = newShape("circle"), c = newShape("rect");
  let doc = addEl(addEl(addEl(empty, a), b), c);
  assert.deepEqual(reorderEl(doc, a.id, "front").elements.map((e) => e.id), [b.id, c.id, a.id]);
  assert.deepEqual(reorderEl(doc, c.id, "down").elements.map((e) => e.id), [a.id, c.id, b.id]);
  assert.deepEqual(reorderEl(doc, c.id, "up").elements.map((e) => e.id), [a.id, b.id, c.id]);
  assert.deepEqual(reorderEl(doc, c.id, "back").elements.map((e) => e.id), [c.id, a.id, b.id]);
  const dup = duplicateEl(doc, b.id);
  assert.equal(dup.doc.elements.length, 4);
  assert.notEqual(dup.id, b.id);
  doc = updateEl(doc, a.id, { color: "#123456" });
  assert.equal((doc.elements[0] as { color: string }).color, "#123456");
  assert.equal(removeEl(doc, a.id).elements.length, 2);
});

test("history: commit, undo, redo", () => {
  const d1 = addEl(empty, newText("title"));
  const d2 = addEl(d1, newShape("rect"));
  let h = commit(EMPTY_HISTORY, empty);
  h = commit(h, d1);
  const u = undo(h, d2)!;
  assert.equal(u.doc, d1);
  const r = redo(u.history, u.doc)!;
  assert.equal(r.doc, d2);
  assert.equal(undo(EMPTY_HISTORY, d1), null);
  assert.equal(redo(EMPTY_HISTORY, d1), null);
  assert.equal(commit(h, d2).future.length, 0);
});

test("image fits or covers the canvas", () => {
  const fit = newImage("x", 2000, 1000);
  assert.ok(fit.w <= 640 && fit.h <= 440);
  const cover = newImage("x", 2000, 1000, true);
  assert.ok(cover.w >= 1200 && cover.h >= 675);
});

test("crop rects and centre snapping", () => {
  const sq = cropRect(1);
  assert.equal(sq.w, 675);
  assert.equal(sq.x, (1200 - 675) / 2);
  const card = cropRect(3);
  assert.equal(card.w, 1200);
  assert.equal(card.h, 400);
  const s = snapToCenter(500, 300, { w: 200, h: 75 });
  assert.equal(s.x, 500);
  assert.equal(s.guideX, true);
  assert.equal(s.guideY, true);
  assert.equal(snapToCenter(10, 10, { w: 200, h: 75 }).guideX, false);
});

test("dragging a crop edge keeps the photo in place and stops at the photo's border", () => {
  const img = { ...newImage("x", 1000, 500), x: 0, y: 0, w: 400, h: 200 };
  const cut = cropEdge(img, "w", 100); // pull the left edge in by 100px of frame
  assert.equal(cut.w, 300);
  assert.equal(cut.left, 100);
  assert.ok(Math.abs(cut.crop.l - 0.25) < 1e-9);
  const back = cropEdge({ ...img, ...{ crop: cut.crop, w: cut.w } }, "w", -500); // cannot grow past the photo
  assert.equal(back.w, 400);
  assert.ok(Math.abs(back.crop.l) < 1e-9);
  assert.equal(cropEdge(img, "e", 50).w, 400); // nothing to grow into on an uncropped photo
  assert.ok(cropEdge(img, "e", -1000).w >= 40); // never smaller than the minimum
});

test("crop pan, zoom and circle stay inside the photo", () => {
  const img = { ...newImage("x", 1000, 500), x: 0, y: 0, w: 400, h: 200, crop: { l: 0.2, t: 0, r: 0.2, b: 0 } };
  const moved = cropPan(img, 10000, 0);
  assert.ok(moved.l >= 0 && moved.r >= 0);
  assert.ok(Math.abs(1 - moved.l - moved.r - 0.6) < 1e-9); // the visible part keeps its size
  const zoomed = cropZoom(img, 100);
  assert.ok(zoomed.l >= 0 && zoomed.r >= 0 && zoomed.t >= 0 && zoomed.b >= 0);
  const closer = cropZoom(img, 1.5);
  assert.ok(1 - closer.l - closer.r < 0.6 - 1e-9); // zooming in shows less of the photo
  const plain = { ...newImage("x", 1000, 500), x: 0, y: 0, w: 400, h: 200 };
  assert.ok(1 - cropZoom(plain, 2).l - cropZoom(plain, 2).r < 1 - 1e-9); // works from an uncropped photo too
  const sq = cropToRatio(img, 1);
  assert.equal(sq.h, 400);
  const visW = (1 - sq.crop.l - sq.crop.r) * 1000, visH = (1 - sq.crop.t - sq.crop.b) * 500;
  assert.ok(Math.abs(visW - visH) < 1e-6);
});

test("clicking the empty corner of a circle does not select it", () => {
  const circle = { ...newShape("circle"), x: 0, y: 0, w: 100, h: 100, rotation: 0 };
  const size = { w: 100, h: 100 };
  assert.equal(hitTest(circle, size, { x: 50, y: 50 }), true);
  assert.equal(hitTest(circle, size, { x: 3, y: 3 }), false);
  const photo = { ...newImage("x", 100, 100), x: 0, y: 0, w: 100, h: 100, mask: "circle" as const };
  assert.equal(hitTest(photo, size, { x: 3, y: 97 }), false);
  assert.equal(hitTest({ ...photo, mask: "rect" }, size, { x: 3, y: 97 }), true);
});

test("big photos are shrunk to the limit, small ones stay as they are", () => {
  assert.deepEqual(fitWithin(4800, 2400, 2400), { w: 2400, h: 1200, scaled: true });
  assert.deepEqual(fitWithin(1000, 500, 2400), { w: 1000, h: 500, scaled: false });
  assert.ok(fitWithin(1, 100000, 2400).w >= 1);
});

test("layer labels describe each layer", () => {
  assert.equal(layerLabel({ ...newText("title", "Привіт") }), "Текст: Привіт");
  assert.equal(layerLabel({ ...newText("title", "  ") }), "Текст: порожній");
  assert.equal(layerLabel({ ...newImage("x", 10, 10, true) }), "Фонове фото");
  assert.equal(layerLabel(newShape("rect")), "Фігура");
});
