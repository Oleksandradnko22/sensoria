import test from "node:test";
import assert from "node:assert/strict";
import { checklistItems, checklistProblem, joinChecklist, splitChecklist } from "./lessonChecklist.ts";

test("title travels as the first entry and is split back out", () => {
  const stored = joinChecklist("Мій план", ["a", "b"]);
  assert.deepEqual(stored, ["# Мій план", "a", "b"]);
  assert.deepEqual(splitChecklist(stored), { title: "Мій план", items: ["a", "b"] });
  assert.deepEqual(splitChecklist(["a"]), { title: "", items: ["a"] });
});

test("empty checklist stores nothing; a title alone is not an item", () => {
  assert.equal(joinChecklist("  ", ["", " "]), undefined);
  assert.deepEqual(checklistItems(["# Назва"]), []);
});

test("checklist limits: 2-10 items of 3-80 chars", () => {
  assert.ok(checklistProblem(["один"]));
  assert.ok(checklistProblem(["ab", "cde"]));
  assert.ok(checklistProblem(["abc", "x".repeat(81)]));
  assert.ok(checklistProblem(Array.from({ length: 11 }, () => "пункт")));
  assert.equal(checklistProblem(["# Назва", "пункт 1", "пункт 2"]), null);
});
