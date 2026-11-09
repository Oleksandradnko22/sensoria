import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveContentRef,
  isUuid,
  needsDaySeparator,
  formatDayLabel,
  formatListDate,
  shouldSendOnEnter,
  canSend,
  singleLine,
} from "./messagesView.ts";

test("resolveContentRef: general chat has no content", () => {
  assert.deepEqual(resolveContentRef(null, {}), { kind: null, title: null, unavailable: false });
});

test("resolveContentRef: catalogs set kind, db title means program, nothing means unavailable", () => {
  assert.equal(resolveContentRef("g", { guideTitle: "Гайд" }).kind, "guide");
  assert.equal(resolveContentRef("m", { meditationTitle: "Мед" }).kind, "meditation");
  const p = resolveContentRef("p", { programTitle: "Програма" });
  assert.equal(p.kind, "program");
  assert.equal(p.unavailable, false);
  const gone = resolveContentRef("x", { programTitle: null });
  assert.equal(gone.unavailable, true);
  assert.equal(gone.title, null);
});

test("isUuid", () => {
  assert.equal(isUuid("0b0d6c1e-3f5a-4c2e-9a3b-1c2d3e4f5a6b"), true);
  assert.equal(isUuid("quick-grounding"), false);
});

test("needsDaySeparator only on day change", () => {
  assert.equal(needsDaySeparator(null, "2026-10-06T10:00:00"), true);
  assert.equal(needsDaySeparator("2026-10-06T10:00:00", "2026-10-06T18:30:00"), false);
  assert.equal(needsDaySeparator("2026-10-06T23:59:00", "2026-10-07T00:01:00"), true);
});

test("day labels", () => {
  const now = new Date(2026, 9, 7, 12, 0);
  assert.equal(formatDayLabel(new Date(2026, 9, 7, 8, 0).toISOString(), now), "Сьогодні");
  assert.equal(formatDayLabel(new Date(2026, 9, 6, 8, 0).toISOString(), now), "Вчора");
  assert.equal(formatDayLabel(new Date(2026, 7, 10, 8, 0).toISOString(), now), "10 серпня");
  assert.equal(formatDayLabel(new Date(2025, 7, 10, 8, 0).toISOString(), now), "10 серпня 2025");
  assert.equal(formatListDate("2026-08-10", now), "10 серпня");
});

test("Enter behaviour", () => {
  const base = { key: "Enter", shiftKey: false, coarsePointer: false };
  assert.equal(shouldSendOnEnter(base), true);
  assert.equal(shouldSendOnEnter({ ...base, shiftKey: true }), false);
  assert.equal(shouldSendOnEnter({ ...base, isComposing: true }), false);
  assert.equal(shouldSendOnEnter({ ...base, coarsePointer: true }), false);
  assert.equal(shouldSendOnEnter({ ...base, key: "a" }), false);
});

test("canSend", () => {
  assert.equal(canSend("  ", false), false);
  assert.equal(canSend("hi", true), false);
  assert.equal(canSend("hi", false), true);
  assert.equal(canSend("x".repeat(2001), false), false);
});

test("singleLine", () => {
  assert.equal(singleLine("a\n\n b  c"), "a b c");
});
