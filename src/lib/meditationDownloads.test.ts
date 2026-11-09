import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRoomFor } from "./meditationDownloads.ts";

test("hasRoomFor: needs the file plus a 20 % margin; unknown quota is allowed", () => {
  assert.equal(hasRoomFor({ quota: 1000, usage: 100 }, 500), true);
  assert.equal(hasRoomFor({ quota: 1000, usage: 600 }, 400), false);
  assert.equal(hasRoomFor({ quota: 1000, usage: 400 }, 500), true);
  assert.equal(hasRoomFor({}, 10 ** 12), true);
  assert.equal(hasRoomFor(undefined, 10 ** 12), true);
});
