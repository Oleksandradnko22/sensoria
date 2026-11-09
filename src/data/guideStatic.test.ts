import { test } from "node:test";
import assert from "node:assert/strict";
import { staticToPlainText, toStaticBlock, toStaticBlocks, formatSeconds } from "./guideStatic.ts";
import { INTERACTIVE_BLOCK_TYPES, type GuideBlockV2 } from "./guideContent.ts";
import { anxietyHitsContent } from "./guideContents/anxietyHitsContent.ts";

test("static scale: a numbered row 0…10 with printable instructions", () => {
  const block = toStaticBlock({
    id: "s",
    type: "scale",
    prompt: "Наскільки сильна тривога зараз?",
    min: 0,
    max: 10,
    static: { prompt: "Наскільки сильна ваша тривога зараз?" },
  });
  assert.ok(block && block.kind === "number_scale");
  assert.deepEqual(block.values, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(block.prompt, "Наскільки сильна ваша тривога зараз?");
  assert.equal(block.instructions, "Оцініть свій стан від 0 до 10:");
});

test("static checklist: empty boxes, one per option, with how-many instruction", () => {
  const multi = toStaticBlock({ id: "c", type: "checklist", prompt: "p", items: [{ id: "a", label: "A" }, { id: "b", label: "B" }] });
  const single = toStaticBlock({ id: "c", type: "checklist", prompt: "p", selection: "single", items: [{ id: "a", label: "A" }] });
  assert.ok(multi && multi.kind === "checkboxes" && single && single.kind === "checkboxes");
  assert.deepEqual(multi.items, ["A", "B"]);
  assert.equal(multi.instructions, "Позначте все, що підходить.");
  assert.equal(single.instructions, "Позначте один варіант.");
});

test("static timer: the same phases become numbered written steps with their durations", () => {
  const block = toStaticBlock({
    id: "t",
    type: "timer_practice",
    title: "Практика",
    phases: [
      { seconds: 15, text: "Один" },
      { seconds: 60, text: "Два" },
    ],
    doneText: "Готово",
  });
  assert.ok(block && block.kind === "instructions");
  assert.deepEqual(block.steps, ["Один (≈ 15 с)", "Два (≈ 1 хв)"]);
  assert.equal(block.doneText, "Готово");
});

test("static reflection: a blank writing area, line count configurable", () => {
  const a = toStaticBlock({ id: "r", type: "reflection", prompt: "Що ви помітили?" });
  const b = toStaticBlock({ id: "r", type: "reflection", prompt: "p", staticLines: 8 });
  assert.ok(a && a.kind === "writing_area" && b && b.kind === "writing_area");
  assert.equal(a.lines, 5);
  assert.equal(b.lines, 8);
});

test("static decision tree: every branch keeps its label AND its next step", () => {
  const block = toStaticBlock({
    id: "d",
    type: "decision_tree",
    prompt: "Що заважає?",
    branches: [{ id: "a", label: "думки", step: "Запишіть" }],
  });
  assert.ok(block && block.kind === "tree");
  assert.deepEqual(block.branches, [{ label: "думки", step: "Запишіть" }]);
});

test("static action plan: boxes plus the limit said in words", () => {
  const block = toStaticBlock({ id: "a", type: "action_plan", prompt: "p", max: 3, items: [{ id: "x", label: "X" }] });
  assert.ok(block && block.kind === "checkboxes");
  assert.equal(block.instructions, "Оберіть не більше 3.");
});

test("static recommendation: never printed — web-only links stay out of the PDF", () => {
  assert.equal(toStaticBlock({ id: "r", type: "recommendation", limit: 1 }), null);
});

test("static: a section that was only recommendations disappears whole, and headings renumber without a gap", () => {
  const blocks = toStaticBlocks(anxietyHitsContent);
  const text = staticToPlainText(blocks);
  assert.equal(text.includes("Що може допомогти далі"), false);
  assert.equal(text.includes("Швидке заземлення"), false);
  const headings = blocks.filter((b) => b.kind === "heading");
  assert.equal(headings.length, 9);
  assert.deepEqual(headings.map((h) => h.kind === "heading" && h.number), ["01","02","03","04","05","06","07","08","09"]);
});

test("static: the static output is plain data — JSON round-trips, so no function or browser state can hide in it", () => {
  const blocks = toStaticBlocks(anxietyHitsContent);
  const json = JSON.stringify(blocks);
  assert.equal(JSON.stringify(JSON.parse(json)), json);
  assert.ok(!json.includes("function"));
});

test("static: EVERY interactive block of the demo guide still yields its full psychological content on paper", () => {
  for (const block of anxietyHitsContent) {
    if (!INTERACTIVE_BLOCK_TYPES.includes(block.type)) continue;
    const s = toStaticBlock(block);
    assert.ok(s, `${block.id} produced nothing`);
    const text = staticToPlainText([s]);
    assert.ok(text.length > 10, `${block.id} static text is too thin`);
  }
});

test("static: the written practice of the demo contains every instruction of the interactive timer", () => {
  const practice = anxietyHitsContent.find((b) => b.type === "timer_practice");
  assert.ok(practice && practice.type === "timer_practice");
  const text = staticToPlainText(toStaticBlocks([practice]));
  for (const phase of practice.phases) assert.ok(text.includes(phase.text));
});

test("static: the demo's choices all appear as checkboxes, the tree's four branches all appear", () => {
  const text = staticToPlainText(toStaticBlocks(anxietyHitsContent));
  for (const label of ["Мені важко зупинити думки", "починаю все контролювати", "зробити коротку паузу"]) {
    assert.ok(text.includes(`☐ ${label}`), label);
  }
  for (const branch of ["думки", "тіло", "уникання", "невизначеність"]) {
    assert.ok(text.includes(`Якщо: ${branch} →`), branch);
  }
});

test("formatSeconds", () => {
  assert.equal(formatSeconds(45), "45 с");
  assert.equal(formatSeconds(120), "2 хв");
  assert.equal(formatSeconds(90), "90 с");
});
