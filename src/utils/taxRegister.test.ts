import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUP3_LIMIT_2026_KOP, differentQuarters, incomeBook, kyivDay, kyivQuarter, limitLevel, monthlyAct, quarterIncomeKop,
  refundOfEarlierQuarter, registerRow, rolling12Kop, vatLevel,
} from "./taxRegister.ts";

test("register: paid = tariff + bank fee + credited to the author, to the kopeck", () => {
  assert.deepEqual(registerRow({ paidKop: 100000, tariffKop: 30000 }), { paidKop: 100000, tariffKop: 30000, bankFeeKop: 1300, bankFeeEstimated: true, creditedToAuthorKop: 68700 });
  assert.deepEqual(registerRow({ paidKop: 89985, tariffKop: 15000 }), { paidKop: 89985, tariffKop: 15000, bankFeeKop: 1170, bankFeeEstimated: true, creditedToAuthorKop: 73815 });
  // the bank's own fee wins over the estimate
  const r = registerRow({ paidKop: 100000, tariffKop: 30000, bankFeeKop: 2000 });
  assert.equal(r.bankFeeEstimated, false);
  assert.equal(r.tariffKop + r.bankFeeKop + r.creditedToAuthorKop, r.paidKop);
});

test("quarters in Kyiv time: paid 31.03 at 23:50, credited 01.04 → «Різні квартали»", () => {
  const paid = "2026-03-31T20:50:00Z"; // 23:50 in Kyiv (UTC+3 after 29.03)
  const credited = "2026-04-01T07:00:00Z";
  assert.equal(kyivDay(paid), "2026-03-31");
  assert.equal(kyivQuarter(paid), "2026-Q1");
  assert.equal(kyivQuarter(credited), "2026-Q2");
  assert.equal(differentQuarters(paid, credited), true);
  assert.equal(differentQuarters(paid, null), false);
  assert.equal(refundOfEarlierQuarter(paid, "2026-04-05T10:00:00Z"), true);
});

test("monthly act: 3 catalog sales of 1000 and 1 refund → line 1: 3 / 900, line 3: 1 / 300, no net", () => {
  const sale = { tariffKop: 30000, source: "catalog" as const, paidKop: 100000, bankFeeKop: 1300 };
  const act = monthlyAct([sale, sale, sale], [{ tariffKop: 30000 }]);
  assert.deepEqual(act.tariff30, { count: 3, sumKop: 90000 });
  assert.deepEqual(act.tariff15, { count: 0, sumKop: 0 });
  assert.deepEqual(act.returnedTariff, { count: 1, sumKop: 30000 });
  assert.deepEqual(act.reference, { paymentsKop: 300000, bankFeeKop: 3900 });
  assert.equal("net" in act, false);
});

test("income book by the crediting day: two payments on 31.03 credited on 01.04 → 450 on 01.04, 0 in Q1", () => {
  const entries = [
    { creditedAt: "2026-04-01T07:00:00Z", paidAt: "2026-03-31T18:00:00Z", tariffKop: 30000, kind: "income" as const },
    { creditedAt: "2026-04-01T07:00:00Z", paidAt: "2026-03-31T19:00:00Z", tariffKop: 15000, kind: "income" as const },
  ];
  assert.deepEqual(incomeBook(entries), [{ day: "2026-04-01", incomeKop: 45000, refundKop: 0, totalKop: 45000 }]);
  assert.equal(quarterIncomeKop(entries, "2026-Q1"), 0);
  assert.equal(quarterIncomeKop(entries, "2026-Q2"), 45000);
});

test("limits: group 3 in 2026 warns at 80 % and 95 %; VAT watch at 800 000 and 1 000 000", () => {
  assert.equal(GROUP3_LIMIT_2026_KOP, 1_009_104_900);
  assert.equal(limitLevel(807_283_900), "warn80"); // 8 072 839 ₴
  assert.equal(limitLevel(807_283_800), "ok");
  assert.equal(limitLevel(958_649_700), "warn95");
  assert.equal(limitLevel(1_009_105_000), "over");
  assert.equal(vatLevel(79_999_999), "ok");
  assert.equal(vatLevel(80_000_000), "warn800k");
  assert.equal(vatLevel(100_000_000), "warn1m");
  const e = [
    { creditedAt: "2025-11-01T10:00:00Z", tariffKop: 50_000_000, kind: "income" as const },
    { creditedAt: "2026-06-01T10:00:00Z", tariffKop: 40_000_000, kind: "income" as const },
    { creditedAt: "2026-07-01T10:00:00Z", tariffKop: 1_000_000, kind: "refund" as const },
  ];
  assert.equal(rolling12Kop(e, "2026-11-18T12:00:00Z"), 39_000_000);
});
