import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ANSWERS,
  canPersistScore,
  canSelectMore,
  checklistInsight,
  describeScaleChange,
  diffSelection,
  formatClock,
  isBlockAnswered,
  isSectionAnswered,
  pointsLabel,
  timerState,
  toggleChoice,
  type GuideAnswers,
} from "./guideInteraction.ts";
import { groupIntoSections, type ChecklistBlock } from "../data/guideContent.ts";
import { anxietyHitsContent } from "../data/guideContents/anxietyHitsContent.ts";

test("toggleChoice: multiple selects, deselects, keeps order", () => {
  let s: number[] = [];
  s = toggleChoice(s, 2, "multiple");
  s = toggleChoice(s, 0, "multiple");
  assert.deepEqual(s, [0, 2]);
  s = toggleChoice(s, 2, "multiple");
  assert.deepEqual(s, [0]);
});

test("toggleChoice: single replaces, and choosing the chosen one clears it", () => {
  assert.deepEqual(toggleChoice([1], 3, "single"), [3]);
  assert.deepEqual(toggleChoice([3], 3, "single"), []);
});

test("toggleChoice: an action plan never goes past its limit, but can always be reduced", () => {
  const full = [0, 1, 2];
  assert.deepEqual(toggleChoice(full, 4, "multiple", 3), full);
  assert.equal(canSelectMore(full, 3), false);
  assert.deepEqual(toggleChoice(full, 1, "multiple", 3), [0, 2]);
  assert.equal(canSelectMore([0, 2], 3), true);
  assert.equal(canSelectMore(full), true);
});

test("diffSelection: tells what to write to / delete from persistence", () => {
  assert.deepEqual(diffSelection([0, 1], [1, 2]), { add: [2], remove: [0] });
  assert.deepEqual(diffSelection([], []), { add: [], remove: [] });
});

const multi: ChecklistBlock = {
  id: "c",
  type: "checklist",
  prompt: "p",
  items: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  insight: { one: "ONE", several: "SEVERAL" },
};
const single: ChecklistBlock = {
  id: "c",
  type: "checklist",
  selection: "single",
  prompt: "p",
  items: [{ id: "a", label: "A", note: "note A" }, { id: "b", label: "B" }],
};

test("checklistInsight: nothing for nothing; one vs several; single uses the item's own note", () => {
  assert.equal(checklistInsight(multi, []), null);
  assert.equal(checklistInsight(multi, [0]), "ONE");
  assert.equal(checklistInsight(multi, [0, 1]), "SEVERAL");
  assert.equal(checklistInsight(single, [0]), "note A");
  assert.equal(checklistInsight(single, [1]), null);
  assert.equal(checklistInsight({ ...multi, insight: undefined }, [0]), null);
});

test("pointsLabel: Ukrainian plurals", () => {
  assert.equal(pointsLabel(1), "1 пункт");
  assert.equal(pointsLabel(3), "3 пункти");
  assert.equal(pointsLabel(5), "5 пунктів");
  assert.equal(pointsLabel(11), "11 пунктів");
  assert.equal(pointsLabel(-2), "2 пункти");
});

test("describeScaleChange: states the person's own numbers, both directions, and the no-change case", () => {
  assert.equal(describeScaleChange(8, 5).text, "Ваш стан змінився на 3 пункти: з 8 до 5.");
  assert.equal(describeScaleChange(3, 4).text, "Ваш стан змінився на 1 пункт: з 3 до 4.");
  assert.equal(describeScaleChange(6, 6).text, "Ваша оцінка не змінилася: 6 і 6.");
  assert.equal(describeScaleChange(8, 5).delta, -3);
});

test("describeScaleChange: never claims effectiveness, always carries the one-moment caveat", () => {
  for (const [b, a] of [[8, 2], [1, 9], [5, 5]] as const) {
    const change = describeScaleChange(b, a);
    assert.equal(/ефектив|допомогл|спрацювал|покращ|поліпш/i.test(change.text), false);
    assert.ok(change.caveat.includes("не оцінка"));
  }
});

test("canPersistScore: phased integer ratings of 0–10 are persisted", () => {
  assert.equal(canPersistScore({ phase: "before" }, 5), true);
  assert.equal(canPersistScore({ phase: "after" }, 10), true);
  assert.equal(canPersistScore({ phase: "before" }, 0), true);
  assert.equal(canPersistScore({ phase: "before" }, 11), false);
  assert.equal(canPersistScore({ phase: undefined }, 5), false);
  assert.equal(canPersistScore({ phase: "before" }, 5.5), false);
});

const phases = [
  { seconds: 10, text: "a" },
  { seconds: 20, text: "b" },
  { seconds: 30, text: "c" },
];

test("timerState: walks through phases and reports remaining time", () => {
  assert.deepEqual(
    (({ phaseIndex, phaseRemaining, remaining, done }) => ({ phaseIndex, phaseRemaining, remaining, done }))(timerState(phases, 0)),
    { phaseIndex: 0, phaseRemaining: 10, remaining: 60, done: false }
  );
  const mid = timerState(phases, 10);
  assert.equal(mid.phaseIndex, 1);
  assert.equal(mid.phaseRemaining, 20);
  const late = timerState(phases, 45);
  assert.equal(late.phaseIndex, 2);
  assert.equal(late.phaseRemaining, 15);
  assert.equal(Math.round(late.progress * 100), 75);
});

test("timerState: done exactly at the end, clamps past it and below zero", () => {
  const end = timerState(phases, 60);
  assert.equal(end.done, true);
  assert.equal(end.remaining, 0);
  assert.equal(end.phaseIndex, 2);
  assert.equal(timerState(phases, 999).elapsed, 60);
  assert.equal(timerState(phases, -5).elapsed, 0);
  assert.equal(timerState([], 5).done, false);
});

test("formatClock", () => {
  assert.equal(formatClock(60), "1:00");
  assert.equal(formatClock(59.2), "1:00");
  assert.equal(formatClock(9), "0:09");
  assert.equal(formatClock(-3), "0:00");
});

test("isBlockAnswered: each interactive kind reads its own slice of the answers", () => {
  const answers: GuideAnswers = {
    selections: { c: [1], a: [] },
    scales: { s: 0 },
    reflections: { r: true },
    branches: { d: "body" },
    practices: { p: true },
  };
  const b = (o: object) => o as never;
  assert.equal(isBlockAnswered(b({ id: "c", type: "checklist" }), answers), true);
  assert.equal(isBlockAnswered(b({ id: "a", type: "action_plan" }), answers), false);
  assert.equal(isBlockAnswered(b({ id: "s", type: "scale" }), answers), true); // 0 is an answer
  assert.equal(isBlockAnswered(b({ id: "r", type: "reflection" }), answers), true);
  assert.equal(isBlockAnswered(b({ id: "d", type: "decision_tree" }), answers), true);
  assert.equal(isBlockAnswered(b({ id: "p", type: "timer_practice" }), answers), true);
  assert.equal(isBlockAnswered(b({ id: "x", type: "rich_text" }), answers), false);
  assert.equal(isBlockAnswered(b({ id: "zz", type: "checklist" }), EMPTY_ANSWERS), false);
});

test("isSectionAnswered: only sections that ask for a response, and only when all of them have one", () => {
  const sections = groupIntoSections(anxietyHitsContent);
  const sectionOf = (headingId: string) => sections.find((s) => s.heading?.id === headingId)!;
  // 02 asks for nothing → never marked
  assert.equal(isSectionAnswered(sectionOf("h-what-happens"), EMPTY_ANSWERS), false);
  // 04 asks for a rating AND a practice
  const s04 = sectionOf("h-try");
  assert.equal(isSectionAnswered(s04, { ...EMPTY_ANSWERS, scales: { "s-before": 7 } }), false);
  assert.equal(
    isSectionAnswered(s04, { ...EMPTY_ANSWERS, scales: { "s-before": 7 }, practices: { "p-grounding": true } }),
    true
  );
});

import { buildGuideSummary } from "./guideInteraction.ts";
import type { GuideContent as SummaryContent } from "../data/guideContent.ts";

test("buildGuideSummary: own before/after and chosen plan steps only", () => {
  const content: SummaryContent = [
    { id: "s1", type: "scale", phase: "before", prompt: "p", min: 0, max: 10 },
    { id: "s2", type: "scale", phase: "after", compareWith: "s1", prompt: "p", min: 0, max: 10 },
    { id: "ap", type: "action_plan", prompt: "p", max: 2, items: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  ];
  const empty = buildGuideSummary(content, EMPTY_ANSWERS);
  assert.equal(empty.change, null);
  assert.deepEqual(empty.plan, []);
  const full = buildGuideSummary(content, { ...EMPTY_ANSWERS, scales: { s1: 8, s2: 5 }, selections: { ap: [1] } });
  assert.equal(full.change?.delta, -3);
  assert.deepEqual(full.plan, ["B"]);
  const half = buildGuideSummary(content, { ...EMPTY_ANSWERS, scales: { s1: 8 } });
  assert.equal(half.change, null);
});
