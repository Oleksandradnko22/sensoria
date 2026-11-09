import { test } from "node:test";
import assert from "node:assert/strict";
import { getObservationsVersion, notifyObservationsChanged, subscribeObservations } from "./observationsSignal.ts";

test("notify bumps the version and calls subscribers until they unsubscribe", () => {
  let calls = 0;
  const off = subscribeObservations(() => calls++);
  const v = getObservationsVersion();
  notifyObservationsChanged();
  assert.equal(getObservationsVersion(), v + 1);
  assert.equal(calls, 1);
  off();
  notifyObservationsChanged();
  assert.equal(calls, 1);
});
