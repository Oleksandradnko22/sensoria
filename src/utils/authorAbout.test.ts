import test from "node:test";
import assert from "node:assert/strict";
import { helpAreas, credentialLines, splitApproach } from "./authorAbout.ts";

test("helpAreas: only known topics, deduped, capped", () => {
  assert.deepEqual(helpAreas([]), []);
  assert.deepEqual(helpAreas(["nope"]), []);
  assert.equal(helpAreas(["stress", "stress"]).length, 1);
  assert.equal(helpAreas(["stress", "awareness", "emotionalBalance"]).length, 3);
  assert.equal(helpAreas(["anxiety", "stress", "burnout", "selfEsteem", "relationships", "motivation"]).length, 4);
});

test("helpAreas: no clinical wording", () => {
  const all = helpAreas(["anxiety", "stress", "burnout", "selfEsteem", "relationships", "motivation", "emotionalBalance", "innerPressure", "healthyBalance", "awareness", "recovery"], 20)
    .map((h) => `${h.title} ${h.line}`)
    .join(" ");
  assert.doesNotMatch(all, /лікув|діагноз|терап|розлад|вилік/i);
});

test("credentialLines splits and trims", () => {
  assert.deepEqual(credentialLines(""), []);
  assert.deepEqual(credentialLines(null), []);
  assert.deepEqual(credentialLines("Психологиня, КПТ\n• Сертифікат X;  - Курс Y"), ["Психологиня, КПТ", "Сертифікат X", "Курс Y"]);
});

test("splitApproach: first sentence is the statement, the rest supports it", () => {
  const t = "Я не обіцяю швидких рішень. Ми разом дивимося, що відбувається, і підбираємо практики — без тиску й самокритики.";
  const r = splitApproach(t);
  assert.equal(r.statement, "Я не обіцяю швидких рішень.");
  assert.equal(r.support, "Ми разом дивимося, що відбувається, і підбираємо практики — без тиску й самокритики.");
  assert.equal(`${r.statement} ${r.support}`, t);
});

test("splitApproach: single sentence, empty, overlong first sentence", () => {
  assert.deepEqual(splitApproach(""), { statement: "", support: "" });
  assert.deepEqual(splitApproach("Одне речення."), { statement: "Одне речення.", support: "" });
  const long = "а".repeat(130) + ". Далі.";
  assert.deepEqual(splitApproach(long), { statement: long, support: "" });
  assert.deepEqual(splitApproach("Без крапки в кінці"), { statement: "Без крапки в кінці", support: "" });
});
