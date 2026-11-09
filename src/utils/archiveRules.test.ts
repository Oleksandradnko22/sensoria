import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteDraft, ARCHIVE_COOLDOWN_DAYS, archiveBlockedLabel, archiveBlockedUntil } from "./archiveRules.ts";

const now = new Date("2026-11-04T12:00:00Z");

test("no purchases (or a bad date) never blocks archiving", () => {
  assert.equal(archiveBlockedUntil(undefined, now), null);
  assert.equal(archiveBlockedUntil(null, now), null);
  assert.equal(archiveBlockedUntil("not a date", now), null);
});

test("blocked for 14 days after the last purchase", () => {
  assert.equal(ARCHIVE_COOLDOWN_DAYS, 14);
  const until = archiveBlockedUntil("2026-11-01T12:00:00Z", now)!;
  assert.equal(until.toISOString(), "2026-11-15T12:00:00.000Z");
  assert.ok(archiveBlockedUntil("2026-10-21T12:00:01Z", now), "13 days 23h 59m: still blocked");
});

test("allowed exactly at 14 days and later", () => {
  assert.equal(archiveBlockedUntil("2026-10-21T12:00:00Z", now), null);
  assert.equal(archiveBlockedUntil("2026-01-01T00:00:00Z", now), null);
});

test("label names the day", () => {
  assert.equal(archiveBlockedLabel(new Date(2026, 10, 15)), "Архівувати можна з 15 листопада");
});

test("only a never-published, never-bought draft can be deleted", () => {
  assert.equal(canDeleteDraft({ status: "draft", everPublished: false, participants: 0 }), true);
  assert.equal(canDeleteDraft({ status: "draft", everPublished: true }), false);
  assert.equal(canDeleteDraft({ status: "draft" }), false);
  assert.equal(canDeleteDraft({ status: "published", everPublished: false }), false);
  assert.equal(canDeleteDraft({ status: "draft", everPublished: false, participants: 2 }), false);
});
