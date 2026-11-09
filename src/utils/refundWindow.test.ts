import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinRefundWindow, REFUND_WINDOW_DAYS } from "./refundWindow.ts";

// Local-time constructors throughout, same reasoning as
// relativeTime.test.ts — avoids a timezone-fragile suite.
const NOW = new Date(2026, 7, 20, 12, 0); // 20 Aug 2026, noon

test("just-purchased item is within the refund window", () => {
  const justNow = new Date(2026, 7, 20, 11, 55).toISOString();
  assert.equal(isWithinRefundWindow(justNow, NOW), true);
});

test("item purchased 13 days ago is still within the refund window", () => {
  const d = new Date(2026, 7, 7, 12, 0).toISOString();
  assert.equal(isWithinRefundWindow(d, NOW), true);
});

test(`item purchased exactly ${REFUND_WINDOW_DAYS} days ago is still within the refund window`, () => {
  const d = new Date(2026, 7, 6, 12, 0).toISOString();
  assert.equal(isWithinRefundWindow(d, NOW), true);
});

test("item purchased 15 days ago is past the refund window", () => {
  const d = new Date(2026, 7, 5, 12, 0).toISOString();
  assert.equal(isWithinRefundWindow(d, NOW), false);
});

test("item purchased months ago is past the refund window", () => {
  const d = new Date(2026, 4, 1, 12, 0).toISOString();
  assert.equal(isWithinRefundWindow(d, NOW), false);
});

test("future-dated purchase (clock skew) is still within the refund window", () => {
  const d = new Date(2026, 7, 21, 12, 0).toISOString();
  assert.equal(isWithinRefundWindow(d, NOW), true);
});

test("invalid date string is treated as outside the refund window", () => {
  assert.equal(isWithinRefundWindow("not-a-date", NOW), false);
});
