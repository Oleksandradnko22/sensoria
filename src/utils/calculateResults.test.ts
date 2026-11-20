import test from "node:test";
import assert from "node:assert/strict";
import { scoreAssessment, getIntensity } from "./calculateResults.ts";
import { buildQuestionnaire, ASSESSMENT_VERSION, type AssessmentAnswer } from "../components/test/questions.ts";
import type { PrimaryStateId } from "../store/funnelStore.ts";

// Answers every question of the questionnaire: `pick(question) → 0..3`.
function answer(primary: PrimaryStateId, secondary: PrimaryStateId | null, pick: (id: string) => number): AssessmentAnswer[] {
  return buildQuestionnaire(primary, secondary).map((q) => {
    const i = pick(q.id);
    return { questionId: q.id, answerIndex: i, kind: q.kind, scores: q.answers[i].scores };
  });
}
const flat = (core: number, screen = 0, impact = 0) => (id: string) =>
  id === "impact" ? impact : id.endsWith("-screen") ? screen : core;

test("questionnaire: 10 questions for one state, 13 for two, every one about the last 2 weeks", () => {
  const one = buildQuestionnaire("anxiety");
  assert.equal(one.length, 10);
  assert.equal(one.filter((q) => q.kind === "core").length, 4);
  assert.equal(one.filter((q) => q.kind === "screen").length, 5);
  assert.equal(buildQuestionnaire("anxiety", "stress").length, 13);
  assert.equal(buildQuestionnaire("anxiety", "anxiety").length, 10);
  assert.ok(one.every((q) => q.lead === "За останні 2 тижні" && q.answers.length === 4));
  assert.equal(new Set(one.map((q) => q.question)).size, one.length, "no duplicate questions");
});

test("intensity bands", () => {
  assert.equal(getIntensity(0), "low");
  assert.equal(getIntensity(25), "low");
  assert.equal(getIntensity(26), "moderate");
  assert.equal(getIntensity(50), "moderate");
  assert.equal(getIntensity(75), "high");
  assert.equal(getIntensity(76), "critical");
});

test("level comes from the core questions of the chosen state only", () => {
  assert.equal(scoreAssessment("stress", null, answer("stress", null, flat(0, 3))).intensity, "low");
  assert.equal(scoreAssessment("stress", null, answer("stress", null, flat(1))).intensity, "moderate"); // 33%
  assert.equal(scoreAssessment("stress", null, answer("stress", null, flat(2))).intensity, "high"); // 67%
  const top = scoreAssessment("stress", null, answer("stress", null, flat(3)));
  assert.equal(top.intensity, "critical");
  assert.equal(top.primaryScore, 100);
  assert.equal(top.version, ASSESSMENT_VERSION);
  assert.equal(top.primaryState, "stress", "the state is never reassigned");
});

test("impact on daily life only raises the level", () => {
  assert.equal(scoreAssessment("anxiety", null, answer("anxiety", null, flat(0, 0, 1))).intensity, "low");
  assert.equal(scoreAssessment("anxiety", null, answer("anxiety", null, flat(0, 0, 2))).intensity, "moderate");
  const strong = scoreAssessment("anxiety", null, answer("anxiety", null, flat(0, 0, 3)));
  assert.equal(strong.intensity, "high");
  assert.equal(strong.safety, true);
  assert.equal(scoreAssessment("anxiety", null, answer("anxiety", null, flat(3, 0, 0))).intensity, "critical");
});

test("safety: a very pronounced state or a strong impact", () => {
  assert.equal(scoreAssessment("burnout", null, answer("burnout", null, flat(3))).safety, true);
  assert.equal(scoreAssessment("burnout", null, answer("burnout", null, flat(2, 0, 2))).safety, false);
});

test("supporting patterns: screening «often» or more, at most 2, strongest first", () => {
  const r = scoreAssessment("anxiety", null, answer("anxiety", null, (id) =>
    id === "motivation-screen" ? 3 : id === "stress-screen" || id === "burnout-screen" ? 2 : id === "selfEsteem-screen" ? 1 : 1));
  assert.deepEqual(r.supportingPatterns.map((p) => p.category), ["motivation", "stress"]);
  assert.equal(r.supportingPatterns[0].normalizedScore, 100);
  assert.ok(!r.supportingPatterns.some((p) => p.category === "selfEsteem"));
});

test("another state is suggested only when the chosen one is mild and the other is almost constant", () => {
  const mild = scoreAssessment("relationships", null, answer("relationships", null, (id) => (id === "burnout-screen" ? 3 : id.endsWith("-screen") ? 0 : 1)));
  assert.equal(mild.suggestedState, "burnout");
  assert.equal(mild.primaryState, "relationships", "only suggested, never switched");
  const notMild = scoreAssessment("relationships", null, answer("relationships", null, (id) => (id === "burnout-screen" ? 3 : id.endsWith("-screen") ? 0 : 2)));
  assert.equal(notMild.suggestedState, null);
  const often = scoreAssessment("relationships", null, answer("relationships", null, (id) => (id === "burnout-screen" ? 2 : 0)));
  assert.equal(often.suggestedState, null);
});

test("two chosen states: the second gets its own level and is not a supporting pattern", () => {
  const r = scoreAssessment("anxiety", "stress", answer("anxiety", "stress", (id) => (id.startsWith("stress-") ? 3 : id.endsWith("-screen") ? 2 : 0)));
  assert.equal(r.intensity, "low");
  assert.equal(r.secondaryIntensity, "critical");
  assert.ok(!r.supportingPatterns.some((p) => p.category === "stress"));
  assert.equal(scoreAssessment("anxiety", null, answer("anxiety", null, flat(1))).secondaryIntensity, null);
});
