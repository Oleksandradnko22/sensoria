import assert from "node:assert/strict";
import test from "node:test";
import {
  fileVisibilityProblem, guideFileProblems, meditationAudioProblems, meditationTranscriptProblems, meditationWhenProblems, stepKeysFor, stepLabelsFor, stepNumber, wordsFor,
} from "./contentSteps.ts";

test("each kind has as many keys as labels, and the program is unchanged", () => {
  for (const t of ["program", "meditation", "guide"] as const) assert.equal(stepKeysFor(t).length, stepLabelsFor(t).length);
  assert.equal(stepLabelsFor("program").length, 9);
  assert.equal(stepNumber("program", "cover"), 5);
  assert.equal(stepNumber("program", "risk"), 8);
  assert.equal(stepNumber("program", "modules"), 9);
});

test("meditation and guide: 7 steps, the shared ones come first in the same order", () => {
  assert.equal(stepKeysFor("meditation").length, 7);
  assert.equal(stepKeysFor("guide").length, 7);
  for (const t of ["meditation", "guide"] as const) {
    const k = stepKeysFor(t);
    assert.deepEqual(k.slice(0, 4), ["title", "price", "categories", "cover"]);
    assert.equal(k[k.length - 1], "risk");
  }
  assert.equal(stepNumber("meditation", "audio"), 5);
  assert.equal(stepNumber("guide", "file"), 5);
  assert.equal(stepNumber("meditation", "benefits"), 0);
});

test("the words agree in gender", () => {
  assert.equal(wordsFor("program").dem, "Ця програма");
  assert.equal(wordsFor("meditation").dem, "Ця медитація");
  assert.equal(wordsFor("guide").dem, "Цей гайд");
  assert.equal(wordsFor("guide").paid, "Платний гайд");
  assert.equal(wordsFor("guide").pron, "його");
  assert.ok(wordsFor("guide").freeNote.includes("доступний"));
  assert.ok(wordsFor("meditation").toPaid.startsWith("Медитація була безкоштовна"));
});

test("file visibility: paid needs a protected file, free needs a public one", () => {
  assert.equal(fileVisibilityProblem("paid:abc", 100), null);
  assert.equal(fileVisibilityProblem("https://x/y.mp3", 0), null);
  assert.match(fileVisibilityProblem("https://x/y.mp3", 100)!, /платний/);
  assert.match(fileVisibilityProblem("paid:abc", 0)!, /безкоштовний/);
  assert.equal(fileVisibilityProblem(null, 100), null);
});

test("meditation audio step", () => {
  assert.deepEqual(meditationAudioProblems({ fileUrl: "https://x/a.mp3", durationMinutes: "10", price: 0 }), []);
  assert.equal(meditationAudioProblems({ fileUrl: "", durationMinutes: "10", price: 0 })[0], "Завантажте аудіо медитації.");
  assert.ok(meditationAudioProblems({ fileUrl: "https://x/a.mp3", durationMinutes: "", price: 0 })[0].startsWith("Вкажіть тривалість"));
  assert.ok(meditationAudioProblems({ fileUrl: "https://x/a.mp3", durationMinutes: "0", price: 0 })[0].startsWith("Вкажіть тривалість"));
  assert.ok(meditationAudioProblems({ fileUrl: "https://x/a.mp3", durationMinutes: "61", price: 0 })[0].includes("60"));
  assert.equal(meditationAudioProblems({ fileUrl: "https://x/a.mp3", durationMinutes: "10", price: 50 }).length, 1);
});

test("meditation transcript is optional, but a started text must be real", () => {
  assert.deepEqual(meditationTranscriptProblems(""), []);
  assert.deepEqual(meditationTranscriptProblems("   "), []);
  assert.equal(meditationTranscriptProblems("Вдих").length, 1);
  assert.deepEqual(meditationTranscriptProblems("Спокійно вдихніть і видихніть, відпустіть напругу."), []);
  assert.equal(meditationTranscriptProblems("а".repeat(20001)).length, 1);
});

test("when it fits: 3 to 5 points of 5 to 100 characters", () => {
  assert.equal(meditationWhenProblems(["", "", ""]).length, 1);
  assert.equal(meditationWhenProblems(["Думки йдуть по колу", "Перед сном", ""]).length, 1);
  assert.equal(meditationWhenProblems(["Думки йдуть по колу", "Перед сном", "ок"]).length, 1);
  assert.deepEqual(meditationWhenProblems(["Думки йдуть по колу", "Перед сном", "Між справами"]), []);
  assert.equal(meditationWhenProblems(Array(6).fill("Перед сном")).length, 1);
  assert.equal(meditationWhenProblems(["Перед сном", "а".repeat(101)]).length, 1);
});

test("guide file step", () => {
  const ok = { fileUrl: "https://x/g.pdf", pages: "12", price: 0, structured: false };
  assert.deepEqual(guideFileProblems(ok), []);
  assert.equal(guideFileProblems({ ...ok, fileUrl: "" })[0], "Завантажте PDF-файл гайду.");
  assert.equal(guideFileProblems({ ...ok, pages: "" })[0], "Вкажіть кількість сторінок.");
  assert.ok(guideFileProblems({ ...ok, pages: "501" })[0].includes("500"));
  assert.deepEqual(guideFileProblems({ ...ok, fileUrl: "", pages: "", structured: true }), []);
  assert.equal(guideFileProblems({ ...ok, price: 100 }).length, 1);
});
