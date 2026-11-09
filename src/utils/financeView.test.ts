import { test } from "node:test";
import assert from "node:assert/strict";
import { historyRows, statusExplanation, uahFromKop, type LedgerRow } from "./financeView.ts";

const row = (o: Partial<LedgerRow> & Pick<LedgerRow, "type" | "account" | "delta_kop">, i: number): LedgerRow => ({
  id: i, operation_key: "op1", reason: null, created_at: "2026-11-01T10:00:00Z", ...o,
});

test("an accrual is ONE history row, +750 ₴, not four raw lines", () => {
  const rows = historyRows([
    row({ type: "PAYMENT_RECEIVED", account: "cash_in", delta_kop: 100000 }, 1),
    row({ type: "SENSORIA_COMMISSION", account: "sensoria_revenue", delta_kop: 25000 }, 2),
    row({ type: "AUTHOR_EARNING", account: "author_pending", delta_kop: 75000 }, 3),
    row({ type: "AUTHOR_EARNING", account: "author_earned", delta_kop: 75000 }, 4),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "Нарахування за продаж");
  assert.equal(rows[0].amountKop, 75000);
});

test("a refund shows the author's share as a minus", () => {
  const rows = historyRows([
    row({ type: "REFUND", account: "cash_out", delta_kop: 100000 }, 1),
    row({ type: "REFUND", account: "author_refunded", delta_kop: 75000 }, 2),
    row({ type: "REFUND", account: "author_pending", delta_kop: -75000 }, 3),
  ]);
  assert.equal(rows[0].amountKop, -75000);
});

test("debt created / repaid keep their sign from the author's side", () => {
  const rows = historyRows([
    row({ type: "AUTHOR_DEBT_CREATED", account: "author_debt", delta_kop: 75000, operation_key: "a" }, 1),
    row({ type: "AUTHOR_DEBT_REPAID", account: "author_pending", delta_kop: -75000, operation_key: "b", created_at: "2026-11-02T10:00:00Z" }, 2),
    row({ type: "AUTHOR_DEBT_REPAID", account: "author_debt", delta_kop: -75000, operation_key: "b", created_at: "2026-11-02T10:00:00Z" }, 3),
  ]);
  assert.equal(rows[0].label, "Погашення заборгованості"); // newest first
  assert.equal(rows[0].amountKop, -75000);
  assert.equal(rows[1].amountKop, 75000);
});

test("status banner: debt is explained, never shown as a bare negative balance", () => {
  assert.match(statusExplanation("DEBT", 75000)!.text, /повернули гроші/);
  assert.equal(statusExplanation("ACTIVE", 0), null);
  assert.equal(statusExplanation("SALES_SUSPENDED", 100)!.tone, "danger");
});

test("uahFromKop", () => {
  assert.match(uahFromKop(75000), /750/);
  assert.match(uahFromKop(75050), /750,5/);
});
