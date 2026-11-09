import { test } from "node:test";
import assert from "node:assert/strict";
import { isHighRisk, riskKeywordHit, riskKeywordWords, unknownRiskTopics } from "./riskTopics.ts";
import { validatePublishable } from "./programPublish.ts";
import type { AuthoredContent } from "../data/authorDashboard.ts";

const base = {
  id: "1", type: "meditation", title: "Спокійний вечір", description: "Коротка практика дихання", status: "draft",
  price: "0", participants: 0, revenue: 0, rating: null, reviewsCount: 0, createdAt: "", updatedAt: "",
} as unknown as AuthoredContent;

test("keywords and declared topics mark a material as high-risk", () => {
  assert.equal(riskKeywordHit("Робота з ПТСР"), true);
  assert.equal(riskKeywordHit("Лікування депресії"), true);
  assert.equal(riskKeywordHit("Спокійний вечір"), false);
  assert.equal(isHighRisk({ title: "Дихання", riskTopics: ["trauma"] }), true);
  assert.equal(isHighRisk({ title: "Дихання", description: "вечірня практика" }), false);
});

test("a non-specialist cannot publish a high-risk material; a specialist can", () => {
  const risky = { ...base, riskTopics: ["addiction"] } as AuthoredContent;
  assert.ok(validatePublishable(risky, { isSpecialist: false }).some((p) => p.code === "risk-topic"));
  assert.ok(!validatePublishable(risky, { isSpecialist: true }).some((p) => p.code === "risk-topic"));
  assert.ok(!validatePublishable(base, { isSpecialist: false }).some((p) => p.code === "risk-topic"));
});

test("the words that triggered the check are listed (lower-cased, without repeats, at most three)", () => {
  assert.deepEqual(riskKeywordWords("Допомога при ПТСР та залежність: діагноз, ліки, діагноз"), ["птср", "залежність", "діагноз"]);
  assert.deepEqual(riskKeywordWords("Спокійний ранок і дихання"), []);
});

test("old saved topic ids outside the six known ones are found, so they can be shown and removed", () => {
  assert.deepEqual(unknownRiskTopics(["trauma", "grief", "legacy-x"]), ["grief", "legacy-x"]);
  assert.deepEqual(unknownRiskTopics(["trauma", "children"]), []);
  assert.deepEqual(unknownRiskTopics(undefined), []);
});
