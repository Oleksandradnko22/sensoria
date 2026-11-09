import { test } from "node:test";
import assert from "node:assert/strict";
import { isReviewEditable, REVIEW_EDIT_WINDOW_DAYS } from "./reviewEditWindow.ts";

// Local-time constructors throughout, same reasoning as
// relativeTime.test.ts — avoids a timezone-fragile suite.
const NOW = new Date(2026, 7, 20, 12, 0); // 20 Aug 2026, noon

test("just-posted review is editable", () => {
  const justNow = new Date(2026, 7, 20, 11, 55).toISOString();
  assert.equal(isReviewEditable(justNow, NOW), true);
});

test("review posted 13 days ago is still editable", () => {
  const d = new Date(2026, 7, 7, 12, 0).toISOString();
  assert.equal(isReviewEditable(d, NOW), true);
});

test(`review posted exactly ${REVIEW_EDIT_WINDOW_DAYS} days ago is still editable`, () => {
  const d = new Date(2026, 7, 6, 12, 0).toISOString();
  assert.equal(isReviewEditable(d, NOW), true);
});

test("review posted 15 days ago is no longer editable", () => {
  const d = new Date(2026, 7, 5, 12, 0).toISOString();
  assert.equal(isReviewEditable(d, NOW), false);
});

test("review posted months ago is no longer editable", () => {
  const d = new Date(2026, 4, 1, 12, 0).toISOString();
  assert.equal(isReviewEditable(d, NOW), false);
});

test("future-dated review (clock skew) is still editable", () => {
  const d = new Date(2026, 7, 21, 12, 0).toISOString();
  assert.equal(isReviewEditable(d, NOW), true);
});

test("invalid date string is treated as not editable", () => {
  assert.equal(isReviewEditable("not-a-date", NOW), false);
});
