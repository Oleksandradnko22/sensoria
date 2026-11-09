import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_OPTIONS,
  FEELING_OPTIONS,
  joinChangeNote,
  normalizeOption,
  normalizeStates,
  optionLabel,
  parseChangeNote,
} from "./meditationCheckin.ts";

test("keys are unique across both lists and free of the delimiter", () => {
  const keys = [...FEELING_OPTIONS, ...CHANGE_OPTIONS].map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.ok(!k.includes(","), k);
});

test("old rows that stored the label still resolve to the key", () => {
  assert.equal(normalizeOption("Тривожно"), "anxious");
  assert.equal(normalizeOption("Стало спокійніше"), "calmer");
  assert.equal(normalizeOption("anxious"), "anxious");
});

test("unknown stored text is kept, not dropped", () => {
  assert.equal(normalizeOption("щось своє"), "щось своє");
  assert.equal(optionLabel("щось своє"), "щось своє");
});

test("labels are looked up by key, or by old label", () => {
  assert.equal(optionLabel("fewer_thoughts"), "Думок стало менше");
  assert.equal(optionLabel("Думок стало менше"), "Думок стало менше");
});

test("change note round-trips as keys, and an old comma-joined label string parses", () => {
  const note = joinChangeNote(["calmer", "more_support"]);
  assert.equal(note, "calmer, more_support");
  assert.deepEqual(parseChangeNote(note), ["calmer", "more_support"]);
  assert.deepEqual(parseChangeNote("Стало спокійніше, Важко сказати"), ["calmer", "hard_to_say"]);
  assert.deepEqual(parseChangeNote(null), []);
});

test("states normalise old labels", () => {
  assert.deepEqual(normalizeStates(["Втомлено", "tense"]), ["tired", "tense"]);
  assert.deepEqual(normalizeStates(null), []);
});
