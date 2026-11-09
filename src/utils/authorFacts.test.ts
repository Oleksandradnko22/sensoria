import test from "node:test";
import assert from "node:assert/strict";
import { backgroundFacts, backgroundMissing } from "./authorFacts.ts";

const edu = (title: string, degree: "bachelor" | "master" | null = null) => ({ kind: "education" as const, title, degree });
const cert = (title: string) => ({ kind: "certificate" as const, title, degree: null });
const course = (title: string) => ({ kind: "training" as const, title, degree: null });

test("always three columns, otherwise the block is not shown", () => {
  assert.deepEqual(backgroundFacts({ credentials: [], experience: [], year: 2026 }), []);
  assert.deepEqual(backgroundFacts({ credentials: [edu("Психологія"), cert("A")], experience: [], year: 2026 }), []);
  assert.deepEqual(backgroundFacts({ credentials: [edu("Психологія")], experience: [{ startYear: 2010 }], year: 2026 }), []);
});

test("education: highest degree + field; years; certificates only (courses excluded)", () => {
  const f = backgroundFacts({
    credentials: [edu("Психологія", "bachelor"), edu("[demo] Клінічна психологія", "master"), cert("A"), cert("C"), course("B")],
    experience: [{ startYear: 2021 }, { startYear: 2018 }, { startYear: 2000, isPublic: false }],
    year: 2026,
  });
  assert.deepEqual(f.map((x) => [x.key, x.value, x.label]), [
    ["education", "Магістр", "Клінічна психологія"],
    ["years", "8 років", "Професійного досвіду"],
    ["certificates", "2", "Сертифікати"],
  ]);
});

test("plural forms and no named degree", () => {
  const f = backgroundFacts({ credentials: [edu("Психологія"), cert("A")], experience: [{ startYear: 2024 }], year: 2026 });
  assert.deepEqual(f.map((x) => [x.value, x.label]), [["Освіта", "Психологія"], ["2 роки", "Професійного досвіду"], ["1", "Сертифікат"]]);
});

test("backgroundMissing names what to add", () => {
  assert.deepEqual(backgroundMissing({ credentials: [edu("П")], experience: [], year: 2026 }), ["досвід із роком початку (щонайменше рік тому)", "сертифікат"]);
  assert.deepEqual(backgroundMissing({ credentials: [edu("П"), cert("A")], experience: [{ startYear: 2010 }], year: 2026 }), []);
});
