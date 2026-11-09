import { test } from "node:test";
import assert from "node:assert/strict";
import { isResumablePosition, RESUME_EDGE_THRESHOLD_SECONDS } from "../utils/meditationResume.ts";

test("resumable only when clearly inside the track, not within 10 s of either edge", () => {
  assert.equal(RESUME_EDGE_THRESHOLD_SECONDS, 10);
  assert.equal(isResumablePosition(null), false);
  assert.equal(isResumablePosition({ positionSeconds: 5, durationSeconds: 240 }), false);
  assert.equal(isResumablePosition({ positionSeconds: 60, durationSeconds: 240 }), true);
  assert.equal(isResumablePosition({ positionSeconds: 235, durationSeconds: 240 }), false);
  assert.equal(isResumablePosition({ positionSeconds: 60, durationSeconds: null }), true);
});

test("a fresh, authoritative duration overrides the stored one (audio was replaced)", () => {
  // stored duration 240 says 235 is near the end; the new file is 600 s long
  assert.equal(isResumablePosition({ positionSeconds: 235, durationSeconds: 240 }, 600), true);
  // stored duration is long, but the new file is only 100 s: 95 is near its end
  assert.equal(isResumablePosition({ positionSeconds: 95, durationSeconds: 600 }, 100), false);
});
