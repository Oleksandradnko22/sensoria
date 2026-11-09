import { test } from "node:test";
import assert from "node:assert/strict";

// localStorage doesn't exist under plain Node — a tiny in-memory stand-in
// is enough since the module only calls getItem/setItem.
(globalThis as any).localStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();

const { getSessionHistory, recordSessionStart, recordSessionCompleted, mergeSessionHistory, hydrateSessionHistory } = await import(
  "./meditationSessionStore.ts"
);

test("brand-new meditation has zeroed/null history", () => {
  const h = getSessionHistory("never-touched");
  assert.equal(h.sessionCount, 0);
  assert.equal(h.lastStartedAt, null);
  assert.equal(h.lastCompletedAt, null);
});

test("recordSessionStart increments count and sets lastStartedAt", () => {
  const h1 = recordSessionStart("m1");
  assert.equal(h1.sessionCount, 1);
  assert.ok(h1.lastStartedAt);
  const h2 = recordSessionStart("m1");
  assert.equal(h2.sessionCount, 2);
});

test("recordSessionCompleted sets lastCompletedAt without touching count", () => {
  recordSessionStart("m2");
  const before = getSessionHistory("m2");
  const after = recordSessionCompleted("m2");
  assert.equal(after.sessionCount, before.sessionCount);
  assert.ok(after.lastCompletedAt);
});

test("starting again after completion is allowed — meditations are reusable, not 'done once'", () => {
  recordSessionStart("m3");
  recordSessionCompleted("m3");
  const second = recordSessionStart("m3");
  assert.equal(second.sessionCount, 2);
  // lastCompletedAt from the first run persists until a new completion
  assert.ok(second.lastCompletedAt);
});

test("different meditations track independently", () => {
  recordSessionStart("a");
  recordSessionStart("b");
  recordSessionStart("b");
  assert.equal(getSessionHistory("a").sessionCount, 1);
  assert.equal(getSessionHistory("b").sessionCount, 2);
});

test("merge: larger count, later dates; no server data keeps local", () => {
  const local = { sessionCount: 5, lastStartedAt: "2026-10-01T10:00:00Z", lastCompletedAt: null };
  const server = { sessionCount: 2, lastStartedAt: "2026-10-03T10:00:00Z", lastCompletedAt: "2026-10-03T10:05:00Z" };
  assert.deepEqual(mergeSessionHistory(local, server), {
    sessionCount: 5,
    lastStartedAt: "2026-10-03T10:00:00Z",
    lastCompletedAt: "2026-10-03T10:05:00Z",
  });
  assert.deepEqual(mergeSessionHistory(local, undefined), local);
});

test("hydrate: a fresh device gets the account's history", () => {
  (globalThis as any).localStorage.clear();
  hydrateSessionHistory({ z: { sessionCount: 3, lastStartedAt: "2026-10-02T00:00:00Z", lastCompletedAt: null } });
  assert.equal(getSessionHistory("z").sessionCount, 3);
});
