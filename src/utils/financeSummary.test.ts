import { test } from "node:test";
import assert from "node:assert/strict";
import { financeTotals, incomeByMaterial, monthlyIncome, netAuthorKop, type SaleLike } from "./financeView.ts";

const sale = (o: Partial<SaleLike>): SaleLike => ({ confirmedAt: "2026-11-05T10:00:00Z", title: "Програма", priceKop: 100000, authorKop: 70000, refundedKop: 0, authorRefundedKop: 0, source: "catalog", ...o });
const NOW = new Date("2026-11-20T12:00:00Z");

test("net share after refunds", () => {
  assert.equal(netAuthorKop(sale({})), 70000);
  assert.equal(netAuthorKop(sale({ refundedKop: 100000, authorRefundedKop: 70000 })), 0);
});

test("monthly income splits catalog and referral, oldest month first", () => {
  const m = monthlyIncome([sale({}), sale({ source: "referral", authorKop: 85000 }), sale({ confirmedAt: "2026-10-03T10:00:00Z" })], 3, NOW);
  assert.deepEqual(m.map((x) => x.label), ["вер", "жов", "лис"]);
  assert.equal(m[2].catalogKop, 70000);
  assert.equal(m[2].referralKop, 85000);
  assert.equal(m[2].sales, 2);
  assert.equal(m[1].catalogKop, 70000);
});

test("by material: refunded sales do not count, most earning first", () => {
  const r = incomeByMaterial([sale({ title: "А" }), sale({ title: "Б", authorKop: 85000, source: "referral" }), sale({ title: "Б", refundedKop: 100000, authorRefundedKop: 85000, authorKop: 85000 })]);
  assert.equal(r[0].title, "Б");
  assert.equal(r[0].sales, 1);
  assert.equal(r[0].referralShare, 1);
});

test("totals", () => {
  const t = financeTotals([sale({}), sale({ source: "referral", authorKop: 85000 }), sale({ confirmedAt: "2026-09-01T00:00:00Z", refundedKop: 100000, authorRefundedKop: 70000 })], NOW);
  assert.equal(t.monthKop, 155000);
  assert.equal(t.salesCount, 2);
  assert.equal(t.referralCount, 1);
  assert.equal(t.refundsCount, 1);
});
