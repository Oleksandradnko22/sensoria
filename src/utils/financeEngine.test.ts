/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles read loosely-typed plan rows */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  FinanceError,
  applyToAccount,
  conservationGap,
  emptyAccount,
  planActivity,
  planAutoPayout,
  planBankFeeSettlement,
  bankFeeOnPrice,
  validateUaIban,
  validateTaxId,
  holderLooksLikeAuthor,
  type BankAccountState,
  planAdminStatus,
  planInactivity,
  planManualDebtRepayment,
  planPayoutConfirm,
  planPayoutRequest,
  pickSaleSource,
  planPaymentReceived,
  planRefund,
  planRelease,
  projectionMismatch,
  splitAmount,
  type AccountState,
  type DebtState,
  type Line,
  type PaymentState,
  type Plan,
  type ReserveState,
  type Settings,
} from "./financeEngine.ts";

// ── a tiny in-memory "database" that applies plans like finance_apply does ──

const AUTHOR = "author-1";
const BANK: BankAccountState = { id: "acc-1", iban: "UA213223130000026007233566001", holderName: "Іван Саєнко", taxId: "1234567890", bankName: "Монобанк", status: "verified" };
const T0 = "2026-11-01T10:00:00.000Z";
// tests of the engine mechanics use a clean 75/25 split; the real defaults (70/30, referral 15 %) are tested separately
const BASE_SETTINGS = { ...DEFAULT_SETTINGS, authorBps: 7500, commissionBps: 2500, referralCommissionBps: 1200 };
const day = (n: number, from = T0) => new Date(new Date(from).getTime() + n * 86_400_000).toISOString();

class World {
  account: AccountState = emptyAccount(AUTHOR);
  lines: Line[] = [];
  debts = new Map<string, DebtState>();
  payments = new Map<string, PaymentState>();
  reserves = new Map<string, ReserveState>();
  keys = new Set<string>();
  notifications = new Map<string, string>(); // dedupe key → event
  seq = 0;
  settings: Settings = { ...BASE_SETTINGS, splitAtSource: 0, splitAtSource: 0 };

  id(p: string) { return `${p}-${++this.seq}`; }

  apply(plan: Plan | null): Plan | null {
    if (!plan) return null;
    if (this.keys.has(plan.key)) throw new FinanceError("duplicate", "Операцію вже виконано.");
    if (plan.expectedVersion != null && plan.expectedVersion !== this.account.version) throw new FinanceError("version", "Конфлікт версій.");
    this.keys.add(plan.key);
    this.lines.push(...plan.lines);
    this.account = applyToAccount(this.account, plan);
    for (const o of plan.debts) {
      const r = o.row as Record<string, any>;
      if (o.op === "insert") this.debts.set(r.id, { id: r.id, originalKop: r.original_kop, outstandingKop: r.outstanding_kop, status: r.status, createdAt: T0 });
      else this.debts.set(r.id, { ...this.debts.get(r.id)!, outstandingKop: r.outstanding_kop, status: r.status });
    }
    for (const o of plan.payments) {
      const r = o.row as Record<string, any>;
      if (o.op === "insert") {
        this.payments.set(r.id, {
          id: r.id, purchaseId: r.purchase_id, authorId: r.author_id, buyerId: r.buyer_id, amountKop: r.amount_kop,
          feeKop: r.fee_kop, feeRefundedKop: 0, authorKop: r.author_kop, sensoriaKop: r.sensoria_kop, pendingKop: r.pending_kop, holdUntil: r.hold_until,
          refundedKop: 0, authorRefundedKop: 0, sensoriaRefundedKop: 0, disputed: false,
        });
      } else {
        const p = this.payments.get(r.id)!;
        this.payments.set(r.id, {
          ...p,
          pendingKop: r.pending_kop ?? p.pendingKop,
          refundedKop: r.refunded_kop ?? p.refundedKop,
          authorRefundedKop: r.author_refunded_kop ?? p.authorRefundedKop,
          sensoriaRefundedKop: r.sensoria_refunded_kop ?? p.sensoriaRefundedKop,
          feeRefundedKop: r.fee_refunded_kop ?? p.feeRefundedKop,
        });
      }
    }
    for (const o of plan.reserves) {
      const r = o.row as Record<string, any>;
      if (o.op === "insert") this.reserves.set(r.id, { id: r.id, paymentId: r.payment_id, reservedKop: r.reserved_kop, releasedKop: 0, usedKop: 0, releaseAt: r.release_at });
      else this.reserves.set(r.id, { ...this.reserves.get(r.id)!, releasedKop: r.released_kop ?? this.reserves.get(r.id)!.releasedKop, usedKop: r.used_kop ?? this.reserves.get(r.id)!.usedKop });
    }
    for (const n of plan.notifications) if (!this.notifications.has(n.dedupeKey)) this.notifications.set(n.dedupeKey, n.eventType);
    // invariants after EVERY operation
    assert.equal(conservationGap(this.lines), 0, "журнал не збалансований");
    assert.deepEqual(projectionMismatch(this.account, this.lines.filter((l) => l.authorId === AUTHOR)), [], "баланс не збігається з журналом");
    return plan;
  }

  debtList() { return [...this.debts.values()]; }

  /** a confirmed payment of `kop` kopecks */
  pay(kop: number, now = T0, purchaseId = this.id("purchase")) {
    const paymentId = this.id("pay");
    this.apply(planPaymentReceived({
      settings: this.settings, now, account: this.account, debts: this.debtList(),
      purchase: { purchaseId, authorId: AUTHOR, buyerId: "buyer-1", amountKop: kop },
      paymentId, reserveId: this.id("res"), externalReference: "TEST", mode: "test",
    }));
    return paymentId;
  }

  release(now: string) {
    return this.apply(planRelease({
      settings: this.settings, now, account: this.account, debts: this.debtList(),
      payments: [...this.payments.values()], reserves: [...this.reserves.values()],
    }));
  }

  refund(paymentId: string, kop: number, kind: "full" | "partial" | "chargeback" = "full", key = this.id("rq"), now = T0) {
    const p = this.payments.get(paymentId)!;
    const reserve = [...this.reserves.values()].find((r) => r.paymentId === paymentId) ?? null;
    return this.apply(planRefund({
      now, account: this.account, payment: p, reserve, refundId: this.id("ref"), debtId: this.id("debt"),
      idempotencyKey: key, amountKop: kop, kind, reason: "Не підійшло",
    }));
  }

  payout(kop: number, now = T0) {
    const payoutId = this.id("po");
    this.apply(planPayoutRequest({ settings: this.settings, now, account: this.account, payoutId, amountKop: kop, bankAccount: BANK }));
    this.apply(planPayoutConfirm({ now, account: this.account, payoutId, amountKop: kop, reference: "BANK-1", adminId: "admin", payoutBankAccountId: BANK.id, currentBankAccountId: BANK.id }));
    return payoutId;
  }
}

/** author holds 75 000 available (sale 1000 UAH, hold passed, nothing paid out yet) */
function worldWithAvailable() {
  const w = new World();
  const pid = w.pay(100000);
  w.release(day(15));
  return { w, pid };
}

// ── money basics ────────────────────────────────────────────────────────────

test("splitAmount: 1000 ₴ → 750 / 250, in kopecks", () => {
  assert.deepEqual(splitAmount(100000, BASE_SETTINGS), { authorKop: 75000, sensoriaKop: 25000 });
});

test("splitAmount: odd kopecks — nothing is lost, commission rounds half-up", () => {
  for (const kop of [1, 3, 99, 333, 19999, 100001]) {
    const { authorKop, sensoriaKop } = splitAmount(kop, BASE_SETTINGS);
    assert.equal(authorKop + sensoriaKop, kop);
    assert.ok(authorKop >= 0 && sensoriaKop >= 0);
  }
  assert.equal(splitAmount(333, BASE_SETTINGS).sensoriaKop, 83);
});

test("settings: shares must add up to 100 %", () => {
  assert.throws(() => planPaymentReceived({
    settings: { ...BASE_SETTINGS, splitAtSource: 0, authorBps: 8000 }, now: T0, account: emptyAccount(AUTHOR), debts: [],
    purchase: { purchaseId: "p", authorId: AUTHOR, buyerId: null, amountKop: 100 }, paymentId: "x", reserveId: "r", externalReference: null, mode: "test",
  }), /100/);
});

// ── scenarios 1–14 ──────────────────────────────────────────────────────────

test("1. ordinary purchase: 1000 ₴ → author 750 (on hold), Sensoria 250", () => {
  const w = new World();
  w.pay(100000);
  assert.equal(w.account.pending, 75000);
  assert.equal(w.account.available, 0);
  assert.equal(w.account.lifetimeEarnings, 75000);
  const commission = w.lines.filter((l) => l.account === "sensoria_revenue").reduce((s, l) => s + l.delta, 0);
  assert.equal(commission, 25000);
  assert.equal(w.account.status, "ACTIVE");
});

test("2. full refund before the author's share is paid: everything is reversed", () => {
  const w = new World();
  const pid = w.pay(100000);
  w.refund(pid, 100000);
  assert.equal(w.account.pending, 0);
  assert.equal(w.account.debt, 0);
  assert.equal(w.account.lifetimeEarnings, 0);
  assert.equal(w.lines.filter((l) => l.account === "sensoria_revenue").reduce((s, l) => s + l.delta, 0), 0);
  assert.equal(w.lines.filter((l) => l.account === "cash_out").reduce((s, l) => s + l.delta, 0), 100000); // buyer got all 1000
});

test("3. full refund AFTER payout: buyer gets 1000, author debt 750", () => {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  assert.equal(w.account.available, 0);
  assert.equal(w.account.totalPaidOut, 75000);
  w.refund(pid, 100000, "full", "r1", day(17));
  assert.equal(w.account.debt, 75000);
  assert.equal(w.account.status, "DEBT");
  const cashOutToBuyer = w.lines.filter((l) => l.type === "REFUND" && l.account === "cash_out").reduce((s, l) => s + l.delta, 0);
  assert.equal(cashOutToBuyer, 100000);
  assert.equal(w.debtList()[0].outstandingKop, 75000);
});

test("4. the next sale repays the debt in full", () => {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  w.refund(pid, 100000, "full", "r1", day(17));
  w.pay(100000, day(18));
  assert.equal(w.account.debt, 0);
  assert.equal(w.account.pending, 0); // all 750 went to the debt, nothing left to pay out
  assert.equal(w.account.available, 0);
  assert.equal(w.account.status, "ACTIVE");
  assert.equal(w.debtList()[0].status, "repaid");
  assert.ok([...w.notifications.values()].includes("DEBT_REPAID_FULL"));
});

test("4b. a bigger accrual repays the debt and leaves the rest", () => {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  w.refund(pid, 100000, "full", "r1", day(17));
  w.pay(133334, day(18)); // author share 100000 − commission 33334… = 100000
  assert.equal(w.account.debt, 0);
  assert.equal(w.account.pending, splitAmount(133334, BASE_SETTINGS).authorKop - 75000);
});

test("5. partial repayment: debt 750, new author share 300 → debt 450", () => {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  w.refund(pid, 100000, "full", "r1", day(17));
  w.pay(40000, day(18)); // commission 100, author 300
  assert.equal(w.account.debt, 45000);
  assert.equal(w.account.pending, 0);
  assert.equal(w.account.status, "DEBT");
  assert.equal(w.debtList()[0].outstandingKop, 45000);
});

test("6. sales continue with a negative balance while the author is active", () => {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  w.refund(pid, 100000, "full", "r1", day(17));
  w.apply(planActivity({ now: day(18), account: w.account, type: "login" }));
  w.pay(20000, day(19));
  w.pay(20000, day(20));
  assert.equal(w.account.status, "DEBT"); // not blocked
  assert.equal(w.account.salesSuspended, false);
  assert.equal(w.account.debt, 75000 - 15000 - 15000);
  assert.equal(planInactivity({ settings: w.settings, now: day(21), account: w.account, fallbackSince: T0 }), null); // active → nothing
});

function debtor() {
  const { w, pid } = worldWithAvailable();
  w.payout(75000, day(16));
  w.refund(pid, 100000, "full", "r1", day(17));
  w.apply(planActivity({ now: day(17), account: w.account, type: "login" }));
  return w;
}

test("7. debt + 14 days without activity → warning", () => {
  const w = debtor();
  assert.equal(planInactivity({ settings: w.settings, now: day(17 + 10), account: w.account, fallbackSince: T0 }), null); // 10 days: too early
  const early = planInactivity({ settings: w.settings, now: day(17 + 12), account: w.account, fallbackSince: T0 });
  assert.equal(early?.kind, "INACTIVITY_REMINDER"); // approaching
  w.apply(early);
  const warn = w.apply(planInactivity({ settings: w.settings, now: day(17 + 14), account: w.account, fallbackSince: T0 }));
  assert.equal(warn?.kind, "WARN_INACTIVE");
  assert.equal(w.account.status, "WARNING");
  assert.ok(warn!.notifications[0].message.includes("750"));
});

test("7b. no debt → inactivity never triggers anything", () => {
  const w = new World();
  w.pay(100000);
  assert.equal(planInactivity({ settings: w.settings, now: day(400), account: w.account, fallbackSince: T0 }), null);
});

test("8. no reaction for 3 more days → new sales suspended, buyers keep access", () => {
  const w = debtor();
  w.apply(planInactivity({ settings: w.settings, now: day(31), account: w.account, fallbackSince: T0 }));
  assert.equal(w.account.status, "WARNING");
  assert.equal(planInactivity({ settings: w.settings, now: day(33), account: w.account, fallbackSince: T0 }), null); // grace not over
  const s = w.apply(planInactivity({ settings: w.settings, now: day(34), account: w.account, fallbackSince: T0 }));
  assert.equal(s?.kind, "SUSPEND_SALES");
  assert.equal(w.account.status, "SALES_SUSPENDED");
  assert.equal(w.account.salesSuspended, true);
  assert.equal(w.account.debt, 75000); // debt is kept
  assert.equal(s!.lines.length, 0); // the suspension touches no money and no buyer's access
});

test("9. the author returns: warning cleared; suspension lifts only when the debt is gone", () => {
  const w = debtor();
  w.apply(planInactivity({ settings: w.settings, now: day(31), account: w.account, fallbackSince: T0 }));
  w.apply(planActivity({ now: day(32), account: w.account, type: "view_finance" }));
  assert.equal(w.account.status, "DEBT");
  assert.equal(w.account.warningAt, null);

  // suspended case
  const w2 = debtor();
  w2.apply(planInactivity({ settings: w2.settings, now: day(31), account: w2.account, fallbackSince: T0 }));
  w2.apply(planInactivity({ settings: w2.settings, now: day(34), account: w2.account, fallbackSince: T0 }));
  w2.apply(planActivity({ now: day(35), account: w2.account, type: "login" }));
  assert.equal(w2.account.status, "SALES_SUSPENDED"); // debt remains → an admin decides
  w2.apply(planManualDebtRepayment({ now: day(36), account: w2.account, debts: w2.debtList(), amountKop: 75000, source: "cash", reason: "Перекази на рахунок", adminId: "a", idempotencyKey: "m1" }));
  assert.equal(w2.account.debt, 0);
  assert.equal(w2.account.status, "ACTIVE");
  assert.equal(w2.account.salesSuspended, false); // restored automatically
});

test("10. closing with a debt: sales stop, the debt stays, payouts refused", () => {
  const w = debtor();
  w.apply(planAdminStatus({ now: day(20), account: w.account, action: "request_closure", reason: "Запит автора", adminId: "a", idempotencyKey: "c1" }));
  assert.equal(w.account.status, "CLOSURE_REQUESTED");
  w.apply(planAdminStatus({ now: day(21), account: w.account, action: "close", reason: "Договір розірвано", adminId: "a", idempotencyKey: "c2" }));
  assert.equal(w.account.status, "CLOSED");
  assert.equal(w.account.debt, 75000);
  assert.equal(w.account.salesSuspended, true);
  assert.throws(() => planPayoutRequest({ settings: w.settings, now: day(22), account: w.account, payoutId: "x", amountKop: 50000, bankAccount: BANK }), (e: any) => e.code === "closed");
  w.apply(planAdminStatus({ now: day(23), account: w.account, action: "start_collection", reason: "Автор не відповідає", adminId: "a", idempotencyKey: "c3" }));
  assert.equal(w.account.status, "DEBT_COLLECTION");
  assert.equal(w.account.debt, 75000);
});

test("11. double refund: the same request twice, and an over-refund, are both refused", () => {
  const w = new World();
  const pid = w.pay(100000);
  w.refund(pid, 100000, "full", "same-request");
  assert.throws(() => w.refund(pid, 100000, "full", "same-request"), (e: any) => e.code === "duplicate" || e.code === "over_refund");
  assert.throws(() => w.refund(pid, 100000, "full", "another-request"), (e: any) => e.code === "over_refund");
  assert.equal(w.payments.get(pid)!.refundedKop, 100000);
});

test("12. reserve too small: buyer still gets the full refund, the rest becomes debt", () => {
  const w = new World();
  w.settings = { ...BASE_SETTINGS, splitAtSource: 0, reserveBps: 2000, reserveDays: 30 }; // 20 % reserve (test value)
  const pid = w.pay(100000); // author 75000: pending 60000 + reserve 15000
  assert.equal(w.account.reserved, 15000);
  w.release(day(15)); // hold over → 60000 available; reserve still held
  w.payout(60000, day(16));
  assert.equal(w.account.available, 0);
  w.refund(pid, 100000, "full", "r1", day(17));
  assert.equal(w.account.reserved, 0); // reserve used
  assert.equal(w.account.debt, 75000 - 15000); // 60000 debt
  const buyer = w.lines.filter((l) => l.account === "cash_out" && l.refundId).reduce((s, l) => s + l.delta, 0);
  assert.equal(buyer, 100000);
});

test("13. partial refund: 400 of 1000 → author 300, Sensoria 100; later parts add up exactly", () => {
  const w = new World();
  const pid = w.pay(100000);
  const r = w.refund(pid, 40000, "partial", "p1")!;
  const row = r.refunds[0].row as any;
  assert.equal(row.author_share_kop, 30000);
  assert.equal(row.sensoria_share_kop, 10000);
  assert.equal(w.account.pending, 45000);
  w.refund(pid, 60000, "partial", "p2");
  assert.equal(w.account.pending, 0);
  assert.equal(w.payments.get(pid)!.authorRefundedKop, 75000);
  assert.equal(w.payments.get(pid)!.sensoriaRefundedKop, 25000);
});

test("13b. refunds use the order's frozen shares, not today's commission", () => {
  const w = new World();
  const pid = w.pay(100000);
  w.settings = { ...BASE_SETTINGS, splitAtSource: 0, authorBps: 6000, commissionBps: 4000 }; // commission raised later
  const r = w.refund(pid, 100000, "full", "x")!;
  assert.equal((r.refunds[0].row as any).author_share_kop, 75000);
});

test("13c. odd amounts: cumulative refunds still add up to the order", () => {
  const w = new World();
  const pid = w.pay(33333);
  w.refund(pid, 11111, "partial", "a");
  w.refund(pid, 11111, "partial", "b");
  w.refund(pid, 11111, "partial", "c");
  const p = w.payments.get(pid)!;
  assert.equal(p.authorRefundedKop, p.authorKop);
  assert.equal(p.sensoriaRefundedKop, p.sensoriaKop);
  assert.equal(w.account.pending, 0);
});

test("14. no bank confirmation → nothing is accrued; a free order never touches the ledger", () => {
  const w = new World(); // order exists, payment never confirmed
  assert.equal(w.lines.length, 0);
  assert.equal(w.account.pending + w.account.available + w.account.lifetimeEarnings, 0);
  assert.throws(() => planPaymentReceived({
    settings: w.settings, now: T0, account: w.account, debts: [], purchase: { purchaseId: "free", authorId: AUTHOR, buyerId: null, amountKop: 0 },
    paymentId: "p", reserveId: "r", externalReference: null, mode: "test",
  }), (e: any) => e.code === "free_order");
  // the same order cannot be accrued twice
  w.pay(100000, T0, "order-1");
  assert.throws(() => w.pay(100000, T0, "order-1"), (e: any) => e.code === "duplicate");
});

// ── payouts, reserve, chargebacks, concurrency ──────────────────────────────

test("payout rules: minimum, balance, debt, destination", () => {
  const { w } = worldWithAvailable();
  const base = { settings: w.settings, now: day(16), account: w.account, payoutId: "p", bankAccount: BANK };
  assert.throws(() => planPayoutRequest({ ...base, amountKop: 49999 }), (e: any) => e.code === "below_min");
  assert.throws(() => planPayoutRequest({ ...base, amountKop: 75001 }), (e: any) => e.code === "no_funds");
  assert.throws(() => planPayoutRequest({ ...base, amountKop: 50000, bankAccount: null }), (e: any) => e.code === "no_destination");
  assert.throws(() => planPayoutRequest({ ...base, amountKop: 50000, bankAccount: { ...BANK, status: "pending" } }), (e: any) => e.code === "no_destination");
  w.apply(planPayoutRequest({ ...base, amountKop: 50000 }));
  assert.equal(w.account.available, 25000);
  assert.equal(w.account.inFlight, 50000);
  const d = debtor();
  assert.throws(() => planPayoutRequest({ settings: d.settings, now: day(40), account: { ...d.account, available: 99999 }, payoutId: "q", amountKop: 50000, bankAccount: BANK }), (e: any) => e.code === "has_debt");
});

test("hold is not released early, reserve released on its date", () => {
  const w = new World();
  w.settings = { ...BASE_SETTINGS, splitAtSource: 0, reserveBps: 1000, reserveDays: 30 };
  w.pay(100000);
  assert.equal(w.release(day(13)), null);
  w.release(day(14));
  assert.equal(w.account.available, 67500);
  assert.equal(w.account.reserved, 7500);
  w.release(day(31));
  assert.equal(w.account.reserved, 0);
  assert.equal(w.account.available, 75000);
});

test("released money first settles an existing debt", () => {
  const w = new World();
  w.pay(100000, T0, "o1");
  w.refund([...w.payments.keys()][0], 100000, "full", "r0", day(1)); // clean
  const w2 = new World();
  const p1 = w2.pay(100000, T0, "a");
  w2.release(day(15));
  w2.payout(75000, day(16));
  const p2 = w2.pay(100000, day(17), "b"); // 750 on hold
  w2.refund(p1, 100000, "full", "r1", day(18)); // debt: nothing available/pending of p1 → pending of p2 is not touched → debt 750
  assert.equal(w2.account.debt, 75000);
  assert.ok(p2);
  w2.release(day(32)); // p2's hold ends: 750 → repays the debt
  assert.equal(w2.account.debt, 0);
  assert.equal(w2.account.available, 0);
});

test("chargeback uses the same path and is recorded as CHARGEBACK", () => {
  const w = new World();
  const pid = w.pay(100000);
  const r = w.refund(pid, 100000, "chargeback", "cb1")!;
  assert.ok(r.lines.some((l) => l.type === "CHARGEBACK"));
});

test("optimistic lock: a plan made on a stale account is rejected", () => {
  const w = new World();
  const stale = planPaymentReceived({
    settings: w.settings, now: T0, account: w.account, debts: [], purchase: { purchaseId: "o", authorId: AUTHOR, buyerId: null, amountKop: 1000 },
    paymentId: "p", reserveId: "r", externalReference: null, mode: "test",
  });
  w.pay(5000); // someone else changed the account first
  assert.throws(() => w.apply(stale), (e: any) => e.code === "version");
});

test("manual repayment from the author's available money; admin must give a reason", () => {
  const w = new World();
  w.pay(100000, T0, "a");
  w.release(day(15));
  const d = debtor();
  assert.throws(() => planManualDebtRepayment({ now: day(40), account: d.account, debts: d.debtList(), amountKop: 100, source: "cash", reason: " ", adminId: "a", idempotencyKey: "k" }), (e: any) => e.code === "reason_required");
  assert.throws(() => planManualDebtRepayment({ now: day(40), account: d.account, debts: d.debtList(), amountKop: 100, source: "available", reason: "x", adminId: "a", idempotencyKey: "k" }), (e: any) => e.code === "no_funds");
  d.apply(planManualDebtRepayment({ now: day(40), account: d.account, debts: d.debtList(), amountKop: 25000, source: "cash", reason: "Частковий переказ", adminId: "a", idempotencyKey: "k2" }));
  assert.equal(d.account.debt, 50000);
});

test("notifications are deduplicated by key", () => {
  const w = debtor();
  const a = planInactivity({ settings: w.settings, now: day(31), account: w.account, fallbackSince: T0 })!;
  const b = planInactivity({ settings: w.settings, now: day(31), account: w.account, fallbackSince: T0 })!;
  assert.equal(a.notifications[0].dedupeKey, b.notifications[0].dedupeKey);
});

test("every plan keeps the ledger balanced (random walk)", () => {
  const w = new World();
  w.settings = { ...BASE_SETTINGS, splitAtSource: 0, reserveBps: 1000, reserveDays: 20 };
  let t = 0;
  const ids: string[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300; i += 1) {
    t += Math.floor(rnd() * 5);
    const now = day(t);
    const roll = rnd();
    try {
      if (roll < 0.4) ids.push(w.pay(Math.floor(rnd() * 90000) + 1000, now));
      else if (roll < 0.6) w.release(now);
      else if (roll < 0.8 && ids.length) {
        const pid = ids[Math.floor(rnd() * ids.length)];
        const p = w.payments.get(pid)!;
        const left = p.amountKop - p.refundedKop;
        if (left > 0) w.refund(pid, Math.max(1, Math.floor(left * rnd())), "partial", w.id("k"), now);
      } else if (w.account.available >= DEFAULT_SETTINGS.minPayoutKop && w.account.debt === 0) w.payout(w.account.available, now);
    } catch (e) {
      if (!(e instanceof FinanceError)) throw e;
    }
  }
  assert.equal(conservationGap(w.lines), 0);
  assert.ok(w.account.available >= 0 && w.account.pending >= 0 && w.account.reserved >= 0 && w.account.debt >= 0);
});


// ── v4: the bank's fee is Sensoria's own cost; the buyer pays the price, the author gets price − commission ──

const FEE_SETTINGS: Settings = { ...BASE_SETTINGS, splitAtSource: 0, bankFeeBps: 150, bankFeeFixedKop: 500 }; // 1.5 % + 5 ₴ (test tariff)
const sumOf = (w: World, account: string) => w.lines.filter((l) => l.account === account).reduce((n, l) => n + l.delta, 0);

test("bankFeeOnPrice: a percentage of the price plus the fixed part; nothing until a tariff is set", () => {
  assert.equal(bankFeeOnPrice(100000, FEE_SETTINGS), 1500 + 500);
  assert.equal(bankFeeOnPrice(99999, FEE_SETTINGS), Math.round(99999 * 0.015) + 500);
  assert.equal(bankFeeOnPrice(100000, DEFAULT_SETTINGS), 0);
  assert.equal(bankFeeOnPrice(0, FEE_SETTINGS), 0);
});

test("the buyer pays only the price; the author's share is untouched; the fee reduces Sensoria's revenue", () => {
  const w = new World();
  w.settings = FEE_SETTINGS;
  w.pay(100000);
  const fee = bankFeeOnPrice(100000, FEE_SETTINGS);
  assert.equal(sumOf(w, "cash_in"), 100000);
  assert.equal(w.account.pending, 75000); // author: exactly price − commission
  assert.equal(sumOf(w, "sensoria_revenue"), 25000 - fee); // commission minus the bank's fee
  assert.equal(sumOf(w, "bank_fee"), fee); // owed to the bank until settled
});

test("a full refund: buyer gets the price, the commission is returned, the bank's fee is Sensoria's loss", () => {
  const w = new World();
  w.settings = FEE_SETTINGS;
  const pid = w.pay(100000);
  const fee = bankFeeOnPrice(100000, FEE_SETTINGS);
  w.refund(pid, 100000, "full", "r1");
  assert.equal(sumOf(w, "cash_out"), 100000); // exactly what the buyer paid
  assert.equal(w.account.pending, 0);
  assert.equal(w.account.debt, 0); // the author loses nothing
  assert.equal(sumOf(w, "sensoria_revenue"), -fee); // Sensoria: commission back, fee gone
  assert.equal(sumOf(w, "bank_fee"), fee);
});

test("partial refunds add up exactly; the author is never charged the fee", () => {
  const w = new World();
  w.settings = FEE_SETTINGS;
  const pid = w.pay(99999);
  const fee = bankFeeOnPrice(99999, FEE_SETTINGS);
  w.refund(pid, 33333, "partial", "a");
  w.refund(pid, 33333, "partial", "b");
  w.refund(pid, 33333, "partial", "c");
  assert.equal(sumOf(w, "cash_out"), 99999);
  assert.equal(sumOf(w, "sensoria_revenue"), -fee);
  assert.equal(w.account.debt, 0);
});

test("bank statement: the real fee is recorded; a shortfall is Sensoria's cost, never the author's", () => {
  const w = new World();
  w.settings = FEE_SETTINGS;
  w.pay(100000);
  const collected = sumOf(w, "bank_fee");
  w.apply(planBankFeeSettlement({ now: T0, paidKop: collected + 300, collectedLeftKop: collected, moveSurplusToSensoria: false, reason: "Виписка за листопад", adminId: "a", idempotencyKey: "s1" }));
  assert.equal(sumOf(w, "bank_fee"), 0);
  assert.equal(sumOf(w, "sensoria_revenue"), 25000 - collected - 300);
  assert.equal(w.account.pending, 75000); // the author's share is untouched by the statement
  assert.throws(() => planBankFeeSettlement({ now: T0, paidKop: 100, collectedLeftKop: 0, moveSurplusToSensoria: false, reason: " ", adminId: "a", idempotencyKey: "s2" }), (e: any) => e.code === "reason_required");
});

test("bank statement: a surplus can be moved to Sensoria", () => {
  const w = new World();
  w.settings = FEE_SETTINGS;
  w.pay(100000);
  const collected = sumOf(w, "bank_fee");
  w.apply(planBankFeeSettlement({ now: T0, paidKop: collected - 200, collectedLeftKop: collected, moveSurplusToSensoria: true, reason: "Виписка", adminId: "a", idempotencyKey: "s3" }));
  assert.equal(sumOf(w, "bank_fee"), 0);
  assert.equal(sumOf(w, "sensoria_revenue"), 25000 - collected + 200);
});

function validIban(body = "3223130000026007233566001") {
  // build a UA IBAN with a correct check number
  const rearranged = body + "3010" + "00"; // "UA00" → digits
  let rem = 0;
  for (const ch of rearranged) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, "0");
  return `UA${check}${body}`;
}

test("IBAN: a correct Ukrainian IBAN passes, a typo does not", () => {
  const ok = validIban();
  assert.deepEqual(validateUaIban(ok), { ok: true, iban: ok });
  assert.deepEqual(validateUaIban(ok.replace(/(.{4})/g, "$1 ").toLowerCase()), { ok: true, iban: ok }); // spaces and case are normalised
  const typo = ok.slice(0, 10) + (ok[10] === "1" ? "2" : "1") + ok.slice(11);
  assert.equal(validateUaIban(typo).ok, false);
  assert.equal(validateUaIban("DE89370400440532013000").ok, false); // not Ukrainian
  assert.equal(validateUaIban("UA12").ok, false);
});

test("tax id and holder hints", () => {
  assert.equal(validateTaxId("1234567890"), true);
  assert.equal(validateTaxId("12345678"), true);
  assert.equal(validateTaxId("12345"), false);
  assert.equal(holderLooksLikeAuthor("САЄНКО ІВАН ПЕТРОВИЧ", "Іван Саєнко"), true);
  assert.equal(holderLooksLikeAuthor("ТОВ Ромашка", "Іван Саєнко"), false);
});

test("payouts go ONLY to the verified account and are refused if it changed before confirmation", () => {
  const { w } = worldWithAvailable();
  const payoutId = "po-x";
  w.apply(planPayoutRequest({ settings: w.settings, now: day(16), account: w.account, payoutId, amountKop: 75000, bankAccount: BANK }));
  assert.throws(() => planPayoutConfirm({ now: day(17), account: w.account, payoutId, amountKop: 75000, reference: "B", adminId: "a", payoutBankAccountId: BANK.id, currentBankAccountId: "other-account" }), (e: any) => e.code === "account_changed");
  w.apply(planPayoutConfirm({ now: day(17), account: w.account, payoutId, amountKop: 75000, reference: "B", adminId: "a", payoutBankAccountId: BANK.id, currentBankAccountId: BANK.id }));
  assert.equal(w.account.totalPaidOut, 75000);
});

test("automatic payout: only above the minimum, without debt, with a verified account, one open at a time", () => {
  const { w } = worldWithAvailable();
  const base = { settings: w.settings, now: day(16), account: w.account, payoutId: "auto-1", bankAccount: BANK, hasOpenPayout: false };
  const plan = planAutoPayout(base)!;
  assert.equal((plan.payouts[0].row as any).amount_kop, 75000);
  assert.equal((plan.payouts[0].row as any).destination_iban, BANK.iban);
  assert.equal((plan.payouts[0].row as any).is_auto, true);
  assert.equal(planAutoPayout({ ...base, hasOpenPayout: true }), null);
  assert.equal(planAutoPayout({ ...base, bankAccount: { ...BANK, status: "pending" } }), null);
  assert.equal(planAutoPayout({ ...base, settings: { ...w.settings, autoPayout: 0 } }), null);
  assert.equal(planAutoPayout({ ...base, account: { ...w.account, available: 0 } }), null);
  assert.equal(planAutoPayout({ ...base, account: { ...w.account, debt: 1 } }), null);
});

// ── split at source (as on Prom: 25 % to Sensoria's account, 75 % to the author's, at once) ──

test("split: payment is divided at once, nothing is held or left to pay out", () => {
  const w = new World();
  w.settings = { ...BASE_SETTINGS, splitAtSource: 1 };
  w.pay(100000);
  assert.equal(w.account.pending, 0);
  assert.equal(w.account.available, 0);
  assert.equal(w.account.totalPaidOut, 75000);
  assert.equal(w.account.lifetimeEarnings, 75000);
  assert.equal(conservationGap(w.lines), 0);
});

test("split: refund after the split becomes author debt; the next sale's author leg repays it", () => {
  const w = new World();
  w.settings = { ...BASE_SETTINGS, splitAtSource: 1 };
  const p = w.pay(100000);
  w.refund(p, 100000, "full", undefined, day(3));
  assert.equal(w.account.debt, 75000); // buyer got everything back; the author's share was already paid out
  w.pay(100000, day(5));
  assert.equal(w.account.debt, 0);
  assert.equal(w.account.totalPaidOut, 75000 + 0); // second sale: 75 000 all went to the debt, author leg = 0
  const last = [...w.payments.values()].pop()!;
  assert.equal(last.pendingKop, 0);
  assert.equal(conservationGap(w.lines), 0);
});

test("default rates: 30 % catalog, 15 % referral", () => {
  assert.deepEqual(splitAmount(100000, DEFAULT_SETTINGS), { authorKop: 70000, sensoriaKop: 30000 });
  assert.deepEqual(splitAmount(100000, DEFAULT_SETTINGS, "referral"), { authorKop: 85000, sensoriaKop: 15000 });
  assert.equal(DEFAULT_SETTINGS.authorBps + DEFAULT_SETTINGS.commissionBps, 10000);
});

test("referral sale: the lower rate is frozen on the payment, split goes to the author", () => {
  const w = new World();
  w.settings = { ...DEFAULT_SETTINGS, splitAtSource: 1 };
  const plan = planPaymentReceived({
    settings: w.settings, now: T0, account: w.account, debts: [],
    purchase: { purchaseId: "p-ref", authorId: AUTHOR, buyerId: "b", amountKop: 100000, source: "referral" },
    paymentId: "pay-ref", reserveId: "res-ref", externalReference: "T", mode: "test",
  });
  const row = plan.payments[0].row as Record<string, unknown>;
  assert.equal(row.commission_bps, 1500);
  assert.equal(row.author_bps, 8500);
  assert.equal(row.split_author_kop, 85000);
  assert.equal(row.split_sensoria_kop, 15000);
  assert.equal(row.sale_source, "referral");
});

test("pickSaleSource: referral only for a record made before the purchase and inside 30 days", () => {
  const buy = "2026-11-10T12:00:00Z";
  assert.equal(pickSaleSource(null, buy), "catalog");
  assert.equal(pickSaleSource("2026-11-09T12:00:00Z", buy), "referral");
  assert.equal(pickSaleSource("2026-10-12T12:00:00Z", buy), "referral"); // 29 days
  assert.equal(pickSaleSource("2026-10-10T12:00:00Z", buy), "catalog"); // 31 days
  assert.equal(pickSaleSource("2026-11-11T12:00:00Z", buy), "catalog"); // click after the purchase
  assert.equal(pickSaleSource("garbage", buy), "catalog");
});
