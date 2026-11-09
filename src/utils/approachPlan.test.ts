import test from "node:test";
import assert from "node:assert/strict";
import { approachPlan } from "./approachPlan.ts";
import { EMPTY_STORY, normalizeStory, storyForSave, type AuthorStory } from "./authorStory.ts";

const story = (over: Partial<AuthorStory> = {}): AuthorStory => ({ ...EMPTY_STORY, hidden: { ...EMPTY_STORY.hidden }, ...over });
const steps2 = [{ title: "Помітити", text: "Звернути увагу на стан." }, { title: "Зрозуміти", text: "Дослідити причини." }];
const steps3 = [...steps2, { title: "Спробувати", text: "Обрати невеликий крок." }];
const counts = { program: 2, meditation: 0, guide: 1 };

test("every optional module absent → the section is not rendered at all", () => {
  const p = approachPlan(story(), { counts: { program: 0, meditation: 0, guide: 0 }, canOpen: true });
  assert.equal(p.show, false);
  assert.equal(p.text, "");
  assert.equal(p.stepCols, 0);
  assert.equal(p.lower, "none");
});

test("only the author's words → a complete section, no empty columns", () => {
  const p = approachPlan(story({ viewpoint: "Не кожну емоцію треба виправляти." }), { counts: {}, canOpen: true });
  assert.equal(p.show, true);
  assert.deepEqual([p.text, p.lead, p.body], ["Не кожну емоцію треба виправляти.", "Не кожну емоцію треба виправляти.", ""]);
  assert.deepEqual([p.stepCols, p.lower, p.principleCols, p.extras, p.notOffers.length], [0, "none", 0, "none", 0]);
});

test("heading and sub-heading stay separate fields", () => {
  const p = approachPlan(story({ viewpoint: "Думка.", viewpointNote: "Пояснення." }), {});
  assert.deepEqual([p.lead, p.body, p.text], ["Думка.", "Пояснення.", "Думка. Пояснення."]);
});

test("profile «Підхід» copy stands in only when the story has no words of its own; hidden statement takes its note with it", () => {
  assert.equal(approachPlan(story({ viewpoint: "Думка.", viewpointNote: "Нотатка." }), { approach: "Профіль." }).text, "Думка. Нотатка.");
  assert.equal(approachPlan(story(), { approach: "Як я працюю." }).text, "Як я працюю.");
  const hidden = approachPlan(story({ viewpoint: "Думка.", viewpointNote: "Нотатка.", hidden: { ...EMPTY_STORY.hidden, viewpoint: true } }), {});
  assert.equal(hidden.text, "");
  assert.equal(hidden.show, false);
});

test("practical steps: partial steps are not shown; 2 → two columns, 3 → three", () => {
  assert.equal(approachPlan(story({ steps: [steps2[0]] }), {}).stepCols, 0);
  assert.equal(approachPlan(story({ steps: [steps2[0], { title: "Без пояснення", text: "" }] }), {}).stepCols, 0);
  assert.equal(approachPlan(story({ steps: steps2 }), {}).stepCols, 2);
  assert.equal(approachPlan(story({ steps: steps3 }), {}).stepCols, 3);
  const more = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Крок ${i + 1}`, text: `Опис ${i + 1}` }));
  assert.deepEqual([4, 5, 6].map((n) => approachPlan(story({ steps: more(n) }), {}).stepCols), [2, 3, 3]);
  // at most six steps are kept
  assert.equal(normalizeStory({ steps: more(9) }).steps.length, 6);
});

test("one or two principles render as a compact row, in a single column when nothing else is beside them", () => {
  const one = approachPlan(story({ principles: ["Без тиску"] }), { counts: {}, canOpen: true });
  assert.deepEqual([one.principles.map((x) => x.text), one.lower, one.hasValues], [["Без тиску"], "single", true]);
  const two = approachPlan(story({ principles: ["Без тиску", "Свій темп"] }), { counts: {}, canOpen: true });
  assert.equal(two.lower, "single");
});

test("published content: only categories with real items; no navigation → no links; values + catalog → split", () => {
  const p = approachPlan(story({ principles: ["Без тиску"] }), { counts, canOpen: true });
  assert.deepEqual(p.kinds, ["program", "guide"]); // meditation has 0 → absent, not shown as "0"
  assert.equal(p.lower, "split");
  assert.deepEqual(approachPlan(story({ viewpoint: "Д." }), { counts, canOpen: false }).kinds, []);
  const only = approachPlan(story(), { counts, canOpen: true });
  assert.deepEqual([only.lower, only.hasValues, only.show], ["single", false, true]);
  assert.equal(approachPlan(story(), { counts: { program: 0, meditation: 0, guide: 0 }, canOpen: true }).show, false);
});

test("boundaries only when written", () => {
  assert.equal(approachPlan(story({ offers: ["Практики"] }), {}).notOffers.length, 0);
  assert.deepEqual(approachPlan(story({ notOffers: ["Не ставлю діагнозів"] }), {}).notOffers, ["Не ставлю діагнозів"]);
  const shown = approachPlan(story({ offers: ["А"], notOffers: ["Б"] }), {});
  assert.equal(shown.offers.length + shown.notOffers.length, 2);
});

test("long Ukrainian text is kept (capped by the story limits), never dropped", () => {
  const s = normalizeStory({ viewpoint: "ґ".repeat(500), viewpointNote: "є".repeat(500), principles: ["і".repeat(300)] });
  const p = approachPlan(s, {});
  assert.equal(p.text.length, 100 + 1 + 260);
  assert.equal(p.principles[0].text.length, 90);
});

test("editing one part of the saved story keeps all the others", () => {
  const saved = normalizeStory({
    intro: "Вступ.", viewpoint: "Стара думка.", viewpointNote: "Пояснення.", steps: steps3,
    principles: ["Без тиску"], offers: ["Практики"], notOffers: ["Не ставлю діагнозів"], personal: "Історія.",
    media: { kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", duration: "1:24" },
  });
  const edited = normalizeStory(storyForSave({ ...saved, viewpoint: "Нова думка." }));
  assert.equal(edited.viewpoint, "Нова думка.");
  assert.deepEqual({ ...edited, viewpoint: "" }, { ...saved, viewpoint: "" });
});

test("principle tiles never leave a half-empty row; extras only split when both exist", () => {
  const cols = (n: number) => approachPlan(story({ principles: ["а", "б", "в", "г"].slice(0, n) }), {}).principleCols;
  assert.deepEqual([0, 1, 2, 3, 4].map(cols), [0, 1, 2, 3, 2]);
  assert.equal(approachPlan(story({ offers: ["А"] }), { counts, canOpen: true }).extras, "split");
  assert.equal(approachPlan(story({ offers: ["А"] }), { counts: {}, canOpen: true }).extras, "single");
  assert.equal(approachPlan(story(), { counts: {}, canOpen: true }).extras, "none");
});
