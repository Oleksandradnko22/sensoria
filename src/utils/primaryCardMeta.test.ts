import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrimaryMeta, primaryActionVerb } from "./primaryCardMeta.ts";

test("program with summary", () => {
  assert.deepEqual(
    buildPrimaryMeta({ kind: "program", summary: { currentModuleIndex: 1, totalModules: 4, percent: 25 } }),
    { metaLine: "Модуль 2 із 4 · 25% завершено", percent: 25 }
  );
});

test("program without summary", () => {
  assert.deepEqual(buildPrimaryMeta({ kind: "program", summary: null }), { percent: null });
});

test("meditation: resumable position vs duration", () => {
  assert.equal(buildPrimaryMeta({ kind: "meditation", positionSeconds: 125, duration: "10 хв" }).metaLine, "Зупинено на 2:05");
  assert.equal(buildPrimaryMeta({ kind: "meditation", positionSeconds: null, duration: "10 хв" }).metaLine, "10 хв");
  assert.equal(buildPrimaryMeta({ kind: "meditation", positionSeconds: 0 }).metaLine, "Зупинено на 0:00");
  assert.equal(buildPrimaryMeta({ kind: "meditation", positionSeconds: null }).percent, null);
});

test("guide: sections viewed, clamped, percent", () => {
  assert.deepEqual(buildPrimaryMeta({ kind: "guide", viewed: 2, total: 4 }), {
    metaLine: "Ви переглянули 2 із 4 розділів",
    percent: 50,
  });
  assert.deepEqual(buildPrimaryMeta({ kind: "guide", viewed: 9, total: 4 }), {
    metaLine: "Ви переглянули 4 із 4 розділів",
    percent: 100,
  });
});

test("guide without sections falls back to sizeLabel / nothing", () => {
  assert.deepEqual(buildPrimaryMeta({ kind: "guide", viewed: 0, total: 0, sizeLabel: "PDF · 2 МБ" }), {
    metaLine: "PDF · 2 МБ",
    percent: null,
  });
  assert.deepEqual(buildPrimaryMeta({ kind: "guide", viewed: 0, total: 0 }), { metaLine: undefined, percent: null });
});

test("primaryActionVerb: only a program at real 0% is «Почати»", () => {
  assert.equal(primaryActionVerb("program", 0), "Почати");
  assert.equal(primaryActionVerb("program", 25), "Продовжити");
  assert.equal(primaryActionVerb("program", null), "Продовжити");
  assert.equal(primaryActionVerb("guide", 0), "Продовжити");
  assert.equal(primaryActionVerb("meditation", 0), "Продовжити");
});
