import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCaseDetails, caseNarrative, caseSections, caseLabels, validateCase, publishableCases, sortCases, detailsForSave, EMPTY_CASE_DETAILS } from "./authorCases.ts";

const d = (o = {}) => ({ ...normalizeCaseDetails(null), ...o });
const base = { title: "Постійна напруга після роботи", situation: "Людина складно вимикалася ввечері.", approach: "Короткі практики дихання щовечора.", details: d() };

test("normalize: null / junk / old rows are safe", () => {
  assert.deepEqual(normalizeCaseDetails(null), EMPTY_CASE_DETAILS);
  assert.deepEqual(normalizeCaseDetails("x"), EMPTY_CASE_DETAILS);
  assert.equal(normalizeCaseDetails({ topic: "nope" }).topic, "");
  assert.equal(normalizeCaseDetails({ topic: "stress" }).topic, "stress");
  assert.equal(normalizeCaseDetails({ tags: ["a", "добре", "ще", "три", "чотири"] }).tags.length, 3);
});

test("narrative shows only the parts the author wrote", () => {
  assert.deepEqual(caseNarrative(base).map((p) => p.key), ["request", "helps"]);
  assert.deepEqual(caseNarrative({ ...base, details: d({ focus: "Відновлення" }) }).map((p) => p.key), ["request", "focus", "helps"]);
});

test("sections are ordered and skip empty ones", () => {
  const s = caseSections({ ...base, details: d({ context: "Контекст тут", changes: "Стало легше" }) }).map((x) => x.label);
  assert.deepEqual(s, ["Контекст", "Запит", "Що змінилося", "Що допомогло"]);
});

test("labels never repeat the category as a tag", () => {
  const l = caseLabels({ details: d({ topic: "stress", tags: ["Стрес", "робота"] }) });
  assert.equal(l.category, "Стрес");
  assert.deepEqual(l.tags, ["робота"]);
});

test("validate: limits, content and contact details", () => {
  assert.equal(validateCase(base).ok, true);
  assert.equal(validateCase({ ...base, title: "" }).ok, false);
  assert.equal(validateCase({ ...base, situation: "Коротко" }).ok, false); // filled but too short
  assert.equal(validateCase({ ...base, approach: "" }).ok, false); // only one section
  assert.equal(validateCase({ ...base, approach: "", details: d({ changes: "Стало набагато легше засинати." }) }).ok, true); // any two
  assert.equal(validateCase({ ...base, situation: "", approach: "", details: d({ focus: "Відновлення сил і повернення опори.", context: "Довгий період постійного навантаження." }) }).ok, true);
  assert.equal(validateCase({ ...base, details: d({ summary: "а".repeat(161) }) }).ok, false);
  assert.equal(validateCase({ ...base, details: d({ tags: ["ab"] }) }).ok, false);
  const bad = validateCase({ ...base, situation: "Пишіть мені: test@example.com" });
  assert.equal(bad.ok, false);
});

test("detailsForSave: null when empty", () => {
  assert.equal(detailsForSave(d()), null);
  assert.notEqual(detailsForSave(d({ focus: "Фокус" })), null);
  assert.deepEqual(normalizeCaseDetails({ reviewImages: ["javascript:x"] }).reviewImages, []);
  assert.deepEqual(normalizeCaseDetails({ reviewImage: "https://x.co/a.png" }).reviewImages, ["https://x.co/a.png"]); // older single-image shape
  assert.equal(normalizeCaseDetails({ reviewImages: ["/a.png", "/b.png", "/c.png", "/d.png"] }).reviewImages.length, 3);
});

test("publishableCases hides legacy / invalid rows", () => {
  const bad = { ...base, approach: "", title: "Старий кейс" }; // one section only
  const leak = { ...base, situation: "Пишіть мені: test@example.com для деталей" };
  assert.deepEqual(publishableCases([base, bad, leak]), [base]);
});

test("sortCases: manual order first, the rest keep their order", () => {
  const mk = (id: string, order: number | null) => ({ id, details: d({ order }) });
  const out = sortCases([mk("a", null), mk("b", 1), mk("c", null), mk("d", 0)]).map((x) => x.id);
  assert.deepEqual(out, ["d", "b", "a", "c"]);
  assert.equal(normalizeCaseDetails({ order: -1 }).order, null);
  assert.equal(normalizeCaseDetails({ order: 2 }).order, 2);
});
