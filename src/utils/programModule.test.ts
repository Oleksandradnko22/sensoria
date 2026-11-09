import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedDurationLabel, effectiveLessonCount, formatMinutes, moduleDurationLabel } from "./programModule.ts";

test("lesson count comes from the real lessons; the stored number only for modules without any", () => {
  assert.equal(effectiveLessonCount({ lessons: 9, items: [{}, {}, {}] }), 3);
  assert.equal(effectiveLessonCount({ lessons: 4, items: [] }), 4);
  assert.equal(effectiveLessonCount({ lessons: 4 }), 4);
  assert.equal(effectiveLessonCount({ lessons: -2 }), 0);
});

test("minutes format as хв / год", () => {
  assert.equal(formatMinutes(40), "40 хв");
  assert.equal(formatMinutes(70), "1 год 10 хв");
  assert.equal(formatMinutes(120), "2 год");
  assert.equal(formatMinutes(0), null);
});

test("derived duration needs every lesson to have a duration", () => {
  assert.equal(derivedDurationLabel([{ durationMinutes: 10 }, { durationMinutes: 30 }]), "40 хв");
  assert.equal(derivedDurationLabel([{ durationMinutes: 10 }, {}]), null);
  assert.equal(derivedDurationLabel([]), null);
  assert.equal(derivedDurationLabel(undefined), null);
});

test("the author's own duration text wins, else the derived one", () => {
  assert.equal(moduleDurationLabel({ duration: " 3 дні ", items: [{ durationMinutes: 5 }] }), "3 дні");
  assert.equal(moduleDurationLabel({ duration: "", items: [{ durationMinutes: 5 }] }), "5 хв");
  assert.equal(moduleDurationLabel({ items: [{}] }), "");
});
