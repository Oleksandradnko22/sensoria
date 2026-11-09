import { test } from "node:test";
import assert from "node:assert/strict";

// localStorage doesn't exist under plain Node — same tiny in-memory
// stand-in as meditationSessionStore.test.ts.
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

const { getItemProgress, setItemProgress } = await import("./demoProgressStore.ts");

// 2026-09-21 correctness fix — see the allowSeed comment on
// getItemProgress itself for the full root-cause story: demoSeedProgress
// has hand-authored entries for "stress-course"/"mindfulness-course"
// (data/programModules.ts) describing the built-in demo narrative. A
// real signed-in participant's OWN progress must never start from that
// seed — only a genuinely local/server-confirmed value.

test("allowSeed=true (default): an untouched seeded program reads the seed, unchanged from before this fix", () => {
  const progress = getItemProgress("user-a", "stress-course");
  assert.equal(progress["stress-course__m1__i1"], "completed");
});

test("allowSeed=false: the exact same untouched seeded program reads as genuinely empty", () => {
  const progress = getItemProgress("user-a", "stress-course", false);
  assert.deepEqual(progress, {});
});

test("allowSeed=false: an unseeded program was already empty either way", () => {
  assert.deepEqual(getItemProgress("user-a", "no-such-program", false), {});
  assert.deepEqual(getItemProgress("user-a", "no-such-program", true), {});
});

test("allowSeed=false never hides REAL locally-stored progress — only gates the seed fallback", () => {
  setItemProgress("user-b", "mindfulness-course", { "mindfulness-course__m1__i1": "completed" });
  const withSeed = getItemProgress("user-b", "mindfulness-course", true);
  const withoutSeed = getItemProgress("user-b", "mindfulness-course", false);
  assert.deepEqual(withSeed, { "mindfulness-course__m1__i1": "completed" });
  assert.deepEqual(withoutSeed, { "mindfulness-course__m1__i1": "completed" });
});

// 2026-09-21 bug fix — the actual regression test for the reported bug:
// Sasha opened a program on an account that had genuinely never touched
// it and saw it already 38% done. Root cause: the old storage key was
// global to the browser (not scoped per account), so ANY account that
// ever touched a program on that browser left data that silently
// applied to whichever account next opened the same program. These two
// tests pin down the fix directly: two different userIds must never see
// each other's progress for the exact same contentId, and a null userId
// (logged-out/preview) must never read or write real per-user data.

test("two different userIds never see each other's progress for the same contentId", () => {
  setItemProgress("user-real-activity", "healthy-balance", {
    "healthy-balance__m1__i1": "completed",
    "healthy-balance__m2__i1": "in_progress",
  });
  // A DIFFERENT account opening the exact same program for the first
  // time must read genuinely empty — not user-real-activity's data.
  const freshAccount = getItemProgress("user-never-touched-it", "healthy-balance", false);
  assert.deepEqual(freshAccount, {});
  // The original account's own data is untouched and still there.
  const originalAccount = getItemProgress("user-real-activity", "healthy-balance", false);
  assert.equal(originalAccount["healthy-balance__m1__i1"], "completed");
});

test("userId=null (logged-out/preview) never reads real per-user data, even if some account has it", () => {
  setItemProgress("some-real-account", "healthy-balance", { "healthy-balance__m1__i1": "completed" });
  assert.deepEqual(getItemProgress(null, "healthy-balance", false), {});
  // allowSeed still works normally for a null userId — it just can never
  // read someone else's real progress.
  assert.equal(getItemProgress(null, "stress-course", true)["stress-course__m1__i1"], "completed");
});
