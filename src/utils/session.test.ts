import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionBookkeeper, shouldEvictSession, MAX_IDLE_MS } from "./session.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

// ── pure decision function ─────────────────────────────────────────

test("no prior bookkeeping (fresh tab, fresh login) is never evicted", () => {
  assert.equal(
    shouldEvictSession({ tabWasAlreadyOpen: true, lastActiveAt: null, now: 1000 }),
    false
  );
});

test("tab was not already open -> evict, regardless of idle time", () => {
  assert.equal(
    shouldEvictSession({ tabWasAlreadyOpen: false, lastActiveAt: 999, now: 1000 }),
    true
  );
});

test("idle under 3 hours in the same tab -> keep", () => {
  assert.equal(
    shouldEvictSession({
      tabWasAlreadyOpen: true,
      lastActiveAt: 1000,
      now: 1000 + MAX_IDLE_MS - 1,
    }),
    false
  );
});

test("idle over 3 hours, even in the same tab -> evict", () => {
  assert.equal(
    shouldEvictSession({
      tabWasAlreadyOpen: true,
      lastActiveAt: 1000,
      now: 1000 + MAX_IDLE_MS + 1,
    }),
    true
  );
});

// ── storage bookkeeping wrapper ────────────────────────────────────

test("first-ever boot: nothing to evict, tab gets marked open", () => {
  const bk = createSessionBookkeeper(fakeStorage(), fakeStorage(), () => 1000);
  assert.equal(bk.checkAndMarkTabOpen(), false);
});

test("refreshing the same tab after touch() keeps the session", () => {
  let clock = 1000;
  const bk = createSessionBookkeeper(fakeStorage(), fakeStorage(), () => clock);
  bk.checkAndMarkTabOpen();
  bk.touch();
  clock += 5 * 60 * 1000; // 5 minutes later, same tab
  assert.equal(bk.checkAndMarkTabOpen(), false);
});

test("closing and reopening the tab evicts, even immediately", () => {
  const local = fakeStorage();
  let clock = 1000;
  const firstTab = createSessionBookkeeper(local, fakeStorage(), () => clock);
  firstTab.checkAndMarkTabOpen();
  firstTab.touch();

  // Same localStorage, brand-new sessionStorage — a genuinely new tab.
  const reopenedTab = createSessionBookkeeper(local, fakeStorage(), () => clock + 1000);
  assert.equal(reopenedTab.checkAndMarkTabOpen(), true);
});

test("more than 3 hours idle evicts even in the same tab", () => {
  let clock = 1000;
  const bk = createSessionBookkeeper(fakeStorage(), fakeStorage(), () => clock);
  bk.checkAndMarkTabOpen();
  bk.touch();
  clock += MAX_IDLE_MS + 1000;
  assert.equal(bk.checkAndMarkTabOpen(), true);
});

test("clear() removes the last-active bookkeeping (used on logout)", () => {
  let clock = 1000;
  const bk = createSessionBookkeeper(fakeStorage(), fakeStorage(), () => clock);
  bk.checkAndMarkTabOpen();
  bk.touch();
  bk.clear();
  clock += 5 * 60 * 1000;
  // No lastActiveAt left -> nothing to evict, but also nothing proving
  // recent activity; the app is expected to treat "no active Supabase
  // session" as logged-out regardless of this return value.
  assert.equal(bk.checkAndMarkTabOpen(), false);
});
