import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRelativeTime } from "./relativeTime.ts";

// Built via the local-time Date constructor (not hand-written UTC ISO
// strings) so these assertions hold regardless of the machine's
// timezone — formatRelativeTime buckets by *local* calendar day
// (getFullYear/getMonth/getDate), and comparing that against a
// manually-offset UTC string would silently break on any non-UTC box.
const NOW = new Date(2026, 7, 20, 14, 30, 0); // 2026-08-20 14:30 local

function minutesBefore(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}

test("under a minute ago -> щойно", () => {
  assert.equal(formatRelativeTime(minutesBefore(0.25), NOW), "щойно");
});

test("30 minutes ago -> N хв тому", () => {
  assert.equal(formatRelativeTime(minutesBefore(30), NOW), "30 хв тому");
});

test("3 hours ago, same calendar day -> N год тому", () => {
  const threeHoursAgo = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 11, 30, 0);
  assert.equal(formatRelativeTime(threeHoursAgo.toISOString(), NOW), "3 год тому");
});

test("earlier today, just after local midnight -> N год тому, not Вчора", () => {
  const earlyThisMorning = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 0, 30, 0);
  assert.equal(formatRelativeTime(earlyThisMorning.toISOString(), NOW), "14 год тому");
});

test("yesterday, same time -> Вчора", () => {
  const yesterday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 14, 30, 0);
  assert.equal(formatRelativeTime(yesterday.toISOString(), NOW), "Вчора");
});

test("yesterday, just before local midnight -> Вчора, not 2 days ago math", () => {
  const lateYesterday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 23, 45, 0);
  assert.equal(formatRelativeTime(lateYesterday.toISOString(), NOW), "Вчора");
});

test("older, same year -> day + genitive month", () => {
  const earlierThisYear = new Date(NOW.getFullYear(), 7, 12, 9, 0, 0);
  assert.equal(formatRelativeTime(earlierThisYear.toISOString(), NOW), "12 серпня");
});

test("older, different year -> day + genitive month + year", () => {
  const lastYear = new Date(NOW.getFullYear() - 1, 7, 12, 9, 0, 0);
  assert.equal(formatRelativeTime(lastYear.toISOString(), NOW), "12 серпня 2025");
});

test("future timestamp (clock skew) -> щойно, not negative", () => {
  const aMinuteAhead = new Date(NOW.getTime() + 60_000);
  assert.equal(formatRelativeTime(aMinuteAhead.toISOString(), NOW), "щойно");
});
