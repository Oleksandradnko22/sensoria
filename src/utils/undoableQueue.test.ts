import { test } from "node:test";
import assert from "node:assert/strict";
import { UndoableQueue, type UndoQueueState } from "./undoableQueue.ts";

function setup(onFailed?: (k: string) => void) {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const states: UndoQueueState[] = [];
  const q = new UndoableQueue({
    delayMs: 6000,
    onChange: (s) => states.push(s),
    onFailed,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cleared: boolean }).cleared = true;
    },
  });
  const fire = async (i = 0) => {
    if (!timers[i].cleared) timers[i].fn();
    await new Promise((r) => setImmediate(r));
  };
  return { q, timers, states, fire, last: () => states[states.length - 1] };
}

test("schedule hides immediately but does not delete yet", () => {
  const { q, last } = setup();
  let deleted = 0;
  q.schedule("a", async () => void deleted++);
  assert.equal(deleted, 0);
  assert.deepEqual(last(), { pending: ["a"], hidden: ["a"] });
});

test("after the delay the commit runs and the item is released", async () => {
  const { q, fire, last, timers } = setup();
  let deleted = 0;
  q.schedule("a", async () => void deleted++);
  assert.equal(timers[0].ms, 6000);
  await fire();
  assert.equal(deleted, 1);
  assert.deepEqual(last(), { pending: [], hidden: [] });
});

test("undo cancels the delete", async () => {
  const { q, fire, last } = setup();
  let deleted = 0;
  q.schedule("a", async () => void deleted++);
  assert.equal(q.undo("a"), true);
  await fire();
  assert.equal(deleted, 0);
  assert.deepEqual(last(), { pending: [], hidden: [] });
  assert.equal(q.undo("a"), false);
});

test("a failed delete reports and brings the item back", async () => {
  const failed: string[] = [];
  const { q, fire, last } = setup((k) => failed.push(k));
  q.schedule("a", async () => {
    throw new Error("offline");
  });
  await fire();
  assert.deepEqual(failed, ["a"]);
  assert.deepEqual(last(), { pending: [], hidden: [] });
});

test("item stays hidden while the delete is in flight", async () => {
  const { q, states, timers } = setup();
  let release!: () => void;
  q.schedule("a", () => new Promise<void>((r) => (release = r)));
  timers[0].fn();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(states[states.length - 1], { pending: [], hidden: ["a"] });
  release();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(states[states.length - 1], { pending: [], hidden: [] });
});

test("same key cannot be scheduled twice", () => {
  const { q } = setup();
  assert.equal(q.schedule("a", async () => {}), true);
  assert.equal(q.schedule("a", async () => {}), false);
});

test("flush commits everything pending immediately", async () => {
  const { q, last } = setup();
  const done: string[] = [];
  q.schedule("a", async () => void done.push("a"));
  q.schedule("b", async () => void done.push("b"));
  await q.flush();
  assert.deepEqual(done.sort(), ["a", "b"]);
  assert.deepEqual(last(), { pending: [], hidden: [] });
});
