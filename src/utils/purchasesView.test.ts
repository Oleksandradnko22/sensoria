import test from "node:test";
import assert from "node:assert/strict";
import { purchaseStatus, purchasesToCsv, shortOrderId, grantsAccess, type PurchaseView } from "./purchasesView.ts";

test("free is not paid; refunded stays refunded; unknown is never paid", () => {
  assert.equal(purchaseStatus("completed", 1500), "paid");
  assert.equal(purchaseStatus("completed", 0), "free");
  assert.equal(purchaseStatus("refunded", 1500), "refunded");
  assert.equal(purchaseStatus("weird", 1500), "pending");
});

test("refunded purchase does not grant access", () => {
  assert.equal(grantsAccess({ status: "refunded" }), false);
  assert.equal(grantsAccess({ status: "paid" }), true);
});

test("order id is derived from the real id", () => {
  assert.equal(shortOrderId("12345678-aaaa-bbbb-cccc-dddddddddddd"), "#12345678");
});

test("csv escapes quotes and neutralises formulas", () => {
  const row: PurchaseView = { id: "12345678-aaaa", contentId: "c", kind: "guide", title: '=HYPERLINK("x")', author: 'A "B"', amount: 290, date: "2026-07-28T10:00:00Z", status: "paid" };
  const csv = purchasesToCsv([row], () => "28 липня 2026");
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(csv.includes('"A ""B"""'));
  assert.equal(csv.split("\r\n").length, 2);
});
