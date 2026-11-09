import test from "node:test";
import assert from "node:assert/strict";
import { isActiveSession, activeCutoffIso, ACTIVE_SESSION_DAYS } from "./deviceSessionsView.ts";

const now = new Date("2026-10-27T12:00:00Z");

test("recent device is active, old one is not", () => {
  assert.equal(isActiveSession("2026-10-26T08:00:00Z", now), true);
  assert.equal(isActiveSession("2026-10-15T08:00:00Z", now), true);
  assert.equal(isActiveSession("2026-10-08T08:00:00Z", now), false);
  assert.equal(isActiveSession("garbage", now), false);
});

test("cutoff is exactly the window", () => {
  const d = (now.getTime() - new Date(activeCutoffIso(now)).getTime()) / 86400000;
  assert.equal(d, ACTIVE_SESSION_DAYS);
});
