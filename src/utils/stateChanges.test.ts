import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStateChanges, latestRecord, parseStateChangeKey, resolveScale, STATE_SOURCE_LABEL } from "./stateChanges.ts";
import type { MoodCheckInRecord } from "../lib/moodCheckins.ts";
import type { MeditationMoodCheckInRecord } from "../lib/meditationMoodCheckins.ts";

const practice = (over: Partial<MoodCheckInRecord> = {}): MoodCheckInRecord => ({
  id: "p1",
  contentItemId: "i1",
  programId: "prog",
  programTitle: "Підтримка емоційного балансу",
  itemTitle: "Дихальні техніки",
  beforeValue: 6,
  afterValue: 8,
  updatedAt: null,
  createdAt: "2026-10-01T10:00:00Z",
  ...over,
});

const meditation = (over: Partial<MeditationMoodCheckInRecord> = {}): MeditationMoodCheckInRecord => ({
  id: "m1",
  meditationId: "med",
  meditationTitle: "Швидке заземлення",
  states: [],
  beforeValue: 2,
  afterValue: 4,
  changeNote: null,
  updatedAt: null,
  createdAt: "2026-10-05T10:00:00Z",
  ...over,
});

test("practice and meditation records both appear in one list, each exactly once", () => {
  const list = buildStateChanges([practice(), practice({ id: "p2" })], [meditation()]);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map((x) => x.key)).size, 3);
  assert.deepEqual(list.map((x) => x.source).sort(), ["meditation", "practice", "practice"]);
});

test("values are shown exactly as recorded, per source", () => {
  const [m, p] = buildStateChanges([practice()], [meditation()]);
  assert.equal(p.before, "6/10");
  assert.equal(p.after, "8/10");
  assert.equal(p.context, "Підтримка емоційного балансу · Дихальні техніки");
  assert.equal(m.before, "2/5");
  assert.equal(m.after, "4/5");
  assert.equal(m.measure, "Напруга");
  assert.equal(m.context, "Швидке заземлення");
});

test("source is identified; labels cover both practices and meditations", () => {
  assert.equal(STATE_SOURCE_LABEL.practice, "Практика");
  assert.equal(STATE_SOURCE_LABEL.meditation, "Медитація");
});

test("newest first, using updatedAt over createdAt", () => {
  const list = buildStateChanges(
    [practice({ id: "old" }), practice({ id: "edited", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z" })],
    [meditation({ id: "mid", createdAt: "2026-10-05T00:00:00Z" })]
  );
  assert.deepEqual(list.map((x) => x.key), ["practice-edited", "meditation-mid", "practice-old"]);
});

test("navigation targets: program item / meditation; none without programId", () => {
  const list = buildStateChanges([practice(), practice({ id: "p2", programId: null })], [meditation()]);
  const byKey = Object.fromEntries(list.map((x) => [x.key, x.target]));
  assert.deepEqual(byKey["practice-p1"], { kind: "program", programId: "prog", itemId: "i1" });
  assert.equal(byKey["practice-p2"], null);
  assert.deepEqual(byKey["meditation-m1"], { kind: "meditation", meditationId: "med" });
});

test("meditation tags and change note are kept; no derived metrics are added", () => {
  const [m] = buildStateChanges([], [meditation({ states: ["calm"], changeNote: null })]);
  assert.equal(m.tags.length, 1);
  assert.deepEqual(Object.keys(m).sort(), ["after", "afterValue", "at", "before", "beforeValue", "context", "key", "measure", "note", "scale", "source", "tags", "target"]);
});

test("latestRecord picks the newest real timestamp and ignores missing/invalid", () => {
  const r = latestRecord([
    { label: "a", at: "2026-10-01T00:00:00Z" },
    { label: "b", at: "2026-10-05T00:00:00Z" },
    { label: "c", at: null },
    { label: "d", at: "garbage" },
  ]);
  assert.deepEqual(r, { label: "b", at: "2026-10-05T00:00:00Z" });
  assert.equal(latestRecord([]), null);
});

test("scale comes from the record: never an impossible value like 10/5", () => {
  const list = buildStateChanges([], [
    meditation({ id: "old", beforeValue: 6, afterValue: 10, createdAt: "2026-08-01T00:00:00Z" }),
    meditation({ id: "new", beforeValue: 2, afterValue: 4 }),
  ]);
  const old = list.find((x) => x.key === "meditation-old")!;
  const current = list.find((x) => x.key === "meditation-new")!;
  assert.equal(old.scale, 10);
  assert.equal(old.before, "6/10");
  assert.equal(old.after, "10/10");
  assert.equal(current.scale, 5);
  assert.equal(current.after, "4/5");
  assert.equal(resolveScale("meditation", [3, null]), 5);
  assert.equal(resolveScale("meditation", [3, 11]), null);
  assert.equal(resolveScale("practice", [1, 10]), 10);
  assert.equal(resolveScale("practice", [null, null]), 10);
});

test("a half-answered pair keeps the missing side as a dash", () => {
  const [p] = buildStateChanges([practice({ beforeValue: null })], []);
  assert.equal(p.before, "—");
  assert.equal(p.beforeValue, null);
});

test("parseStateChangeKey recovers the source and the real row id (ids may contain dashes)", () => {
  const [p] = buildStateChanges([practice({ id: "a-b-c" })], []);
  assert.deepEqual(parseStateChangeKey(p.key), { source: "practice", id: "a-b-c" });
  assert.deepEqual(parseStateChangeKey("meditation-xyz"), { source: "meditation", id: "xyz" });
  assert.equal(parseStateChangeKey("note-1"), null);
  assert.equal(parseStateChangeKey("practice-"), null);
});
