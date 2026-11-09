import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeSession,
  currentSessionFor,
  describeResult,
  isSessionOver,
  recordAfter,
  recordBefore,
  restoreSessions,
  serializeSessions,
  startSession,
  stopSession,
  RESULT_CAVEAT,
  type SessionList,
} from "./meditationSession.ts";

const T = (n: number) => `2026-10-06T10:0${n}:00Z`;
const start = (list: SessionList, id: string, n = 0, med = "m1") => startSession(list, { id, meditationId: med, now: T(n) });

test("a new session starts open, with no before/after", () => {
  const list = start([], "s1");
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { id: "s1", meditationId: "m1", startedAt: T(0), endedAt: null, status: "in_progress", before: null, after: null });
});

test("before and after are stored separately on the session", () => {
  let list = start([], "s1");
  list = recordBefore(list, "s1", { stateKeys: ["anxious"], intensity: 4 });
  assert.equal(list[0].after, null);
  list = recordAfter(list, "s1", { intensity: 2 });
  assert.deepEqual(list[0].before, { stateKeys: ["anxious"], intensity: 4 });
  assert.deepEqual(list[0].after, { intensity: 2, changeKeys: [] });
  list = recordAfter(list, "s1", { changeKeys: ["calmer"] });
  assert.deepEqual(list[0].after, { intensity: 2, changeKeys: ["calmer"] });
});

test("after can be recorded even when before was skipped, and after the session ended", () => {
  let list = start([], "s1");
  list = completeSession(list, "s1", T(4));
  list = recordAfter(list, "s1", { intensity: 3 });
  assert.equal(list[0].before, null);
  assert.equal(list[0].after?.intensity, 3);
  assert.equal(list[0].status, "completed");
});

test("repeating a meditation creates a new session and never overwrites the earlier one", () => {
  let list = start([], "s1");
  list = recordBefore(list, "s1", { stateKeys: [], intensity: 5 });
  list = recordAfter(list, "s1", { intensity: 3 });
  list = completeSession(list, "s1", T(4));
  const firstSnapshot = JSON.stringify(list[0]);
  list = start(list, "s2", 5);
  list = recordBefore(list, "s2", { stateKeys: [], intensity: 2 });
  assert.equal(JSON.stringify(list[0]), firstSnapshot);
  assert.equal(list.length, 2);
  assert.equal(list[1].before?.intensity, 2);
  assert.equal(list[1].after, null);
});

test("starting again while a session is open closes it as stopped, never deletes it", () => {
  let list = start([], "s1");
  list = start(list, "s2", 3);
  assert.equal(list[0].status, "stopped");
  assert.equal(list[0].endedAt, T(3));
  assert.equal(list[1].status, "in_progress");
  // a different meditation's open session is untouched
  list = start(list, "o1", 4, "other");
  assert.equal(list.find((s) => s.id === "s2")?.status, "in_progress");
});

test("completion: only an open session completes; a stopped one stays stopped", () => {
  let list = start([], "s1");
  list = stopSession(list, "s1", T(2));
  list = completeSession(list, "s1", T(3));
  assert.equal(list[0].status, "stopped");
  assert.equal(list[0].endedAt, T(2));
  let other = completeSession(start([], "s9"), "s9", T(4));
  other = completeSession(other, "s9", T(5));
  assert.equal(other[0].endedAt, T(4));
});

test("starting the same session id twice is a no-op", () => {
  const once = start([], "s1");
  assert.equal(start(once, "s1", 5), once);
});

test("currentSessionFor: the open session, else the latest one", () => {
  let list = start([], "s1");
  list = completeSession(list, "s1", T(2));
  assert.equal(currentSessionFor(list, "m1")?.id, "s1");
  list = start(list, "s2", 3);
  assert.equal(currentSessionFor(list, "m1")?.id, "s2");
  assert.equal(currentSessionFor(list, "nope"), null);
});

test("result is framed as the person's own report and never as an effect", () => {
  assert.deepEqual(describeResult(null), { kind: "none" });
  const pair = describeResult({ before: { stateKeys: [], intensity: 4 }, after: { intensity: 2, changeKeys: [] } });
  assert.equal(pair.kind, "pair");
  assert.equal((pair as { caveat: string }).caveat, RESULT_CAVEAT);
  for (const r of [
    describeResult({ before: { stateKeys: [], intensity: 4 }, after: null }),
    describeResult({ before: null, after: { intensity: 3, changeKeys: [] } }),
    pair,
    describeResult({ before: { stateKeys: [], intensity: 3 }, after: { intensity: 3, changeKeys: [] } }),
  ]) {
    if (r.kind === "none") continue;
    assert.ok(!/допомог|ліку|терап|ефектив|покращ|лікув/i.test(r.text), r.text);
    assert.ok(/особист/.test(r.caveat));
  }
  assert.match((pair as { text: string }).text, /4 з 5 до практики і 2 з 5 після/);
});

test("isSessionOver: ended flag, or paused at the very end; not while playing or at 0", () => {
  assert.equal(isSessionOver({ sessionEnded: true, duration: 0, currentTime: 0, isPlaying: false }), true);
  assert.equal(isSessionOver({ sessionEnded: false, duration: 240, currentTime: 239.8, isPlaying: false }), true);
  assert.equal(isSessionOver({ sessionEnded: false, duration: 240, currentTime: 239.8, isPlaying: true }), false);
  assert.equal(isSessionOver({ sessionEnded: false, duration: 240, currentTime: 100, isPlaying: false }), false);
  assert.equal(isSessionOver({ sessionEnded: false, duration: 0, currentTime: 0, isPlaying: false }), false);
});

test("persistence: sessions round-trip; corrupt or foreign data restores to empty, never throws", () => {
  let list = start([], "s1");
  list = recordBefore(list, "s1", { stateKeys: ["tense"], intensity: 4 });
  assert.deepEqual(restoreSessions(serializeSessions(list)), list);
  assert.deepEqual(restoreSessions("{not json"), []);
  assert.deepEqual(restoreSessions(null), []);
  assert.deepEqual(restoreSessions(JSON.stringify({ v: 2, sessions: [] })), []);
  assert.deepEqual(restoreSessions(JSON.stringify({ v: 1, sessions: [{ id: 1 }, list[0]] })), [list[0]]);
});

test("only the most recent sessions are kept", () => {
  let list: SessionList = [];
  for (let i = 0; i < 60; i += 1) list = startSession(list, { id: `s${i}`, meditationId: `m${i}`, now: T(0) });
  assert.equal(list.length, 50);
  assert.equal(list[49].id, "s59");
  assert.equal(restoreSessions(serializeSessions(list)).length, 50);
});
