import { test } from "node:test";
import assert from "node:assert/strict";
import { getSavedVersion, notifySavedChanged, subscribeSaved } from "./savedSignal.ts";

test("notify bumps the version and calls subscribers until they unsubscribe", () => {
  let calls = 0;
  const off = subscribeSaved(() => calls++);
  const v = getSavedVersion();
  notifySavedChanged();
  assert.equal(getSavedVersion(), v + 1);
  assert.equal(calls, 1);
  off();
  notifySavedChanged();
  assert.equal(calls, 1);
});
