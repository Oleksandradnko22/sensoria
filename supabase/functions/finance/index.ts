// Sensoria — finance Edge Function (own finance module).
//
// GENERATED FILE: supabase/functions/finance/index.ts is built from
//   - src/utils/financeEngine.ts  (the tested calculation engine), and
//   - scripts/finance-handler.ts  (this file: loading state, calling finance_apply)
// by `npm run build:finance`. Edit those two, not the output.
//
// Money is taken by monobank (split payments): see the "monobank" section below. Until MONO_TOKEN is set
// and finance_settings.mode is 'live', payments are TEST: a test token from api.monobank.ua moves no real money.
//
// DEPLOY: Dashboard -> Edge Functions -> "finance" -> paste -> Deploy.
// Secrets: CRON_SECRET (for runJobs), RESEND_API_KEY / RESEND_FROM (emails),
// ADMIN_REQUIRE_2FA (as for admin-data). Schedule `runJobs` daily with the
// header  x-cron-secret: <CRON_SECRET>.
//
// Actions (POST { action, ... }):
//   buyer   (own JWT):  monoCheckout, monoStatus     (+ webhook: POST ?hook=mono, signed by the bank)
//   author  (own JWT):  touchActivity, requestPayout, markNotificationsRead
//   admin   (2FA, owner): overview, authors, author, confirmPayment, refund,
//                         markDisputed, repayDebt, setStatus, payoutConfirm,
//                         payoutFail, setSettings, verify
//   cron:               runJobs

import { createClient } from "npm:@supabase/supabase-js@2";

// ── engine (src/utils/financeEngine.ts) ───────────────────────────────────
// Sensoria — own finance engine (pure logic, no I/O).
//
// Every function here takes the CURRENT state (as read from the database) and
// returns a PLAN: the immutable ledger lines plus the row changes to apply in
// ONE transaction (supabase/finance-migration.sql → finance_apply). The same
// file is copied into the `finance` Edge Function by scripts/build-finance.mjs,
// so what the tests below check is what runs in production.
//
// Money model:
//  * the buyer pays the PRICE only. The bank's acquiring fee is paid by SENSORIA (the operator's FOP) out of
//    its own commission; the author's share is exactly price − commission and is never reduced by the fee;
//  * the author's share is paid to the author's own VERIFIED bank account
//    (IBAN checked, holder confirmed by an administrator) — never anywhere else.
//
// Rules this file enforces:
//  * all money is an integer number of kopecks — no fractions anywhere;
//  * the split (70/30 catalog, 85/15 author referral) and every other percentage come from `Settings`, and a
//    payment FREEZES the shares it was made with: later settings changes never
//    touch old orders;
//  * the ledger is append-only: a mistake is fixed by a compensating line;
//  * nothing is accrued before the money is confirmed as received;
//  * a refund is always paid to the buyer in full; the author's part comes from
//    this sale's hold, its reserve, the author's available balance and only the
//    remainder becomes a debt (never a reason to cut the refund).
//
// This module does NOT move real money. Real payments/payouts need the banking
// layer after the legal review (see docs/finance-engine.md).

export type Kop = number;

export type Settings = {
  authorBps: number; // 7000 = 70 % (catalog sale)
  commissionBps: number; // 3000 = 30 % (catalog sale: the buyer came through Sensoria)
  referralCommissionBps: number; // 1500 = 15 % (the buyer came through the author's own referral link)
  holdDays: number; // approval period before the author's share becomes available
  reserveBps: number; // share of the author's net earning put into the refund reserve
  reserveDays: number; // how long the reserve is held
  inactivityDays: number; // 14
  warningGraceDays: number; // 3
  reminderDays: number; // remind this many days before the inactivity limit
  minPayoutKop: number; // 500 UAH
  bankFeeBps: number; // bank's percentage of the amount the buyer pays (e.g. 150 = 1.5 %)
  bankFeeFixedKop: number; // bank's fixed part per payment (also covers the transfer to the author)
  splitAtSource: number; // 1 = the acquirer/bank splits every payment at once: the commission (30 % catalog / 15 % author referral) to Sensoria's FOP account, the rest to the author's (no hold, no payouts)
  autoPayout: number; // 1 = auto-distribution: released money is paid to the verified account automatically, no minimum, no manual requests
};

export const DEFAULT_SETTINGS: Settings = {
  authorBps: 7000,
  commissionBps: 3000,
  referralCommissionBps: 1500,
  holdDays: 14,
  reserveBps: 0, // set after the legal/financial review — not guessed in code
  reserveDays: 0,
  inactivityDays: 14,
  warningGraceDays: 3,
  reminderDays: 3,
  minPayoutKop: 50000,
  bankFeeBps: 0, // set from the bank's tariff — not guessed in code
  bankFeeFixedKop: 0,
  splitAtSource: 1,
  autoPayout: 1,
};

// ── ledger ──────────────────────────────────────────────────────────────────

export type LedgerType =
  | "PAYMENT_RECEIVED"
  | "AUTHOR_EARNING"
  | "SENSORIA_COMMISSION"
  | "AUTHOR_PAYOUT"
  | "REFUND"
  | "PARTIAL_REFUND"
  | "AUTHOR_DEBT_CREATED"
  | "AUTHOR_DEBT_REPAID"
  | "REFUND_RESERVE_CREATED"
  | "REFUND_RESERVE_RELEASED"
  | "CHARGEBACK"
  | "MANUAL_ADJUSTMENT"
  | "HOLD_RELEASED"
  | "BANK_FEE_COLLECTED"
  | "BANK_FEE_PAID";

export type LedgerAccount =
  | "cash_in" // money confirmed as received (+) …
  | "cash_out" // … and money paid out to buyers/authors (+)
  | "sensoria_revenue"
  | "author_pending"
  | "author_available"
  | "author_reserved"
  | "author_debt" // positive = the author owes Sensoria
  | "payout_in_flight"
  | "bank_fee" // bank fee that Sensoria owes the bank until settled from the statement
  // statistics only (not part of the conservation check)
  | "author_paid_out"
  | "author_earned"
  | "author_refunded";

export type Line = {
  type: LedgerType;
  account: LedgerAccount;
  delta: Kop;
  authorId: string | null;
  paymentId?: string;
  refundId?: string;
  payoutId?: string;
  orderId?: string;
  buyerId?: string | null;
  authorShare?: Kop;
  sensoriaShare?: Kop;
  reason?: string;
  relatedKey?: string;
};

const STAT_ACCOUNTS: LedgerAccount[] = ["author_paid_out", "author_earned", "author_refunded"];

/** Conservation: confirmed cash in − cash out = everything we owe (debt owed to us counts against). */
export function conservationGap(lines: Line[]): number {
  let cash = 0;
  let owed = 0;
  for (const l of lines) {
    if (STAT_ACCOUNTS.includes(l.account)) continue;
    if (l.account === "cash_in") cash += l.delta;
    else if (l.account === "cash_out") cash -= l.delta;
    else if (l.account === "author_debt") owed -= l.delta;
    else owed += l.delta;
  }
  return cash - owed;
}

// ── state ───────────────────────────────────────────────────────────────────

export type AccountStatus =
  | "ACTIVE"
  | "DEBT"
  | "INACTIVE_WITH_DEBT"
  | "WARNING"
  | "SALES_SUSPENDED"
  | "DEBT_COLLECTION"
  | "CLOSURE_REQUESTED"
  | "CLOSED";

export type AccountState = {
  authorId: string;
  pending: Kop;
  available: Kop;
  reserved: Kop;
  debt: Kop;
  inFlight: Kop;
  lifetimeEarnings: Kop;
  totalPaidOut: Kop;
  totalRefunded: Kop;
  status: AccountStatus;
  adminHold: boolean; // sales suspended by an administrator: never auto-restored
  salesSuspended: boolean;
  lastMeaningfulActivityAt: string | null; // ISO
  warningAt: string | null;
  reminderSentAt: string | null;
  version: number;
};

export const emptyAccount = (authorId: string): AccountState => ({
  authorId,
  pending: 0,
  available: 0,
  reserved: 0,
  debt: 0,
  inFlight: 0,
  lifetimeEarnings: 0,
  totalPaidOut: 0,
  totalRefunded: 0,
  status: "ACTIVE",
  adminHold: false,
  salesSuspended: false,
  lastMeaningfulActivityAt: null,
  warningAt: null,
  reminderSentAt: null,
  version: 0,
});

export type DebtState = {
  id: string;
  originalKop: Kop;
  outstandingKop: Kop;
  status: "open" | "repaid";
  createdAt: string;
};

export type PaymentState = {
  id: string;
  purchaseId: string;
  authorId: string;
  buyerId: string | null;
  amountKop: Kop;
  feeKop: Kop; // the bank's fee, paid by Sensoria (older payments: the fee the buyer paid on top — see grossKop)
  grossKop?: Kop; // what the buyer was charged; > amountKop only for older payments where the buyer paid the fee
  authorKop: Kop; // frozen at confirmation
  sensoriaKop: Kop; // frozen at confirmation
  pendingKop: Kop; // part of the author's share still on hold
  holdUntil: string;
  refundedKop: Kop;
  authorRefundedKop: Kop;
  sensoriaRefundedKop: Kop;
  feeRefundedKop: Kop;
  disputed: boolean;
};

export type ReserveState = {
  id: string;
  paymentId: string;
  reservedKop: Kop;
  releasedKop: Kop;
  usedKop: Kop;
  releaseAt: string;
};
const reserveLeft = (r: ReserveState) => r.reservedKop - r.releasedKop - r.usedKop;

// ── ops that finance_apply writes ───────────────────────────────────────────

export type Notification = {
  eventType: string;
  dedupeKey: string;
  message: string;
  amountKop: Kop | null;
  relatedOperation: string | null;
};

export type Plan = {
  key: string; // idempotency key of the whole operation
  kind: string;
  authorId: string | null;
  expectedVersion: number | null; // optimistic lock on the author's account
  lines: Line[];
  account?: Partial<{
    status: AccountStatus;
    adminHold: boolean;
    salesSuspended: boolean;
    lastMeaningfulActivityAt: string;
    warningAt: string | null;
    reminderSentAt: string | null;
  }>;
  payments: Array<{ op: "insert" | "update"; row: Record<string, unknown> }>;
  debts: Array<{ op: "insert" | "update"; row: Record<string, unknown> }>;
  reserves: Array<{ op: "insert" | "update"; row: Record<string, unknown> }>;
  refunds: Array<{ op: "insert" | "update"; row: Record<string, unknown> }>;
  payouts: Array<{ op: "insert" | "update"; row: Record<string, unknown> }>;
  notifications: Notification[];
  statusLog: Array<{ from: AccountStatus; to: AccountStatus; reason: string }>;
  audit?: { action: string; reason: string; previous: unknown; next: unknown };
};

const newPlan = (key: string, kind: string, authorId: string | null, expectedVersion: number | null): Plan => ({
  key,
  kind,
  authorId,
  expectedVersion,
  lines: [],
  payments: [],
  debts: [],
  reserves: [],
  refunds: [],
  payouts: [],
  notifications: [],
  statusLog: [],
});

export class FinanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
const ms = (iso: string) => new Date(iso).getTime();

const assertKop = (n: number, name: string) => {
  if (!Number.isSafeInteger(n)) throw new FinanceError("bad_amount", `${name} має бути цілим числом копійок.`);
};

export function checkSettings(s: Settings): void {
  if (s.authorBps + s.commissionBps !== 10000) {
    throw new FinanceError("bad_settings", "Частка автора й комісія мають у сумі давати 100 %.");
  }
  if (s.referralCommissionBps > 10000) throw new FinanceError("bad_settings", "Реферальна комісія не може перевищувати 100 %.");
  for (const [k, v] of Object.entries(s)) {
    if (!Number.isInteger(v) || v < 0) throw new FinanceError("bad_settings", `Некоректне значення «${k}».`);
  }
  if (s.reserveBps > 10000) throw new FinanceError("bad_settings", "Резерв не може перевищувати 100 %.");
  if (s.bankFeeBps >= 10000) throw new FinanceError("bad_settings", "Комісія банку має бути меншою за 100 %.");
  if (s.splitAtSource !== 0 && s.splitAtSource !== 1) throw new FinanceError("bad_settings", "splitAtSource має бути 0 або 1.");
  if (s.autoPayout !== 0 && s.autoPayout !== 1) throw new FinanceError("bad_settings", "autoPayout має бути 0 або 1.");
}

/** Commission is rounded half-up from the order amount; the author gets the rest, so nothing is lost. */
export type SaleSource = "catalog" | "referral";

/**
 * Which rate applies: referral only when the buyer's attribution to THIS author was recorded
 * before the purchase and not longer than `windowDays` earlier. Anything else is a catalog sale.
 */
export function pickSaleSource(attributedAt: string | null, purchasedAt: string, windowDays = 30): SaleSource {
  if (!attributedAt) return "catalog";
  const a = Date.parse(attributedAt);
  const p = Date.parse(purchasedAt);
  if (!Number.isFinite(a) || !Number.isFinite(p)) return "catalog";
  if (a > p || p - a > windowDays * 86_400_000) return "catalog";
  return "referral";
}

/** The rate for this sale: lower when the author brought the buyer through their own referral link. */
export const commissionFor = (s: Settings, source: SaleSource = "catalog"): number =>
  source === "referral" ? s.referralCommissionBps : s.commissionBps;

export function splitAmount(amountKop: Kop, s: Settings, source: SaleSource = "catalog"): { authorKop: Kop; sensoriaKop: Kop } {
  assertKop(amountKop, "Сума");
  const sensoriaKop = Math.floor((amountKop * commissionFor(s, source) + 5000) / 10000);
  return { authorKop: amountKop - sensoriaKop, sensoriaKop };
}

/**
 * The bank's acquiring fee for one payment: a percentage of the price plus a fixed part. Sensoria pays it from
 * its own commission; neither the buyer nor the author pays it. 0 until the bank's tariff is set in the settings.
 */
export function bankFeeOnPrice(priceKop: Kop, s: Pick<Settings, "bankFeeBps" | "bankFeeFixedKop">): Kop {
  assertKop(priceKop, "Ціна");
  if (priceKop <= 0) return 0;
  if (s.bankFeeBps === 0 && s.bankFeeFixedKop === 0) return 0;
  return Math.round((priceKop * s.bankFeeBps) / 10000) + s.bankFeeFixedKop;
}

// ── author's bank account ───────────────────────────────────────────────────

/** Ukrainian IBAN: UA + 27 digits, ISO 13616 checksum. Returns the normalised IBAN or an error text. */
export function validateUaIban(raw: string): { ok: true; iban: string } | { ok: false; error: string } {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^UA\d{27}$/.test(iban)) return { ok: false, error: "IBAN має бути у форматі UA + 27 цифр." };
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1 ? { ok: true, iban } : { ok: false, error: "IBAN не пройшов перевірку контрольної суми: перевірте цифри." };
}

/** РНОКПП (10 digits) or ЄДРПОУ (8 digits). */
export const validateTaxId = (raw: string) => /^(\d{8}|\d{10})$/.test(raw.replace(/\s+/g, ""));

/** Hint for the verifying administrator: does the holder's name share a word with the author's profile name? */
export function holderLooksLikeAuthor(holder: string, profileName: string): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
  const a = new Set(words(holder));
  return words(profileName).some((w) => a.has(w));
}

export type BankAccountState = {
  id: string;
  iban: string;
  holderName: string;
  taxId: string;
  bankName: string;
  status: "pending" | "verified" | "rejected" | "replaced";
};

/** Uah text for messages. */
export const uah = (kop: Kop) =>
  `${(kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: kop % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ₴`;

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "long", timeStyle: "short" });

function note(
  eventType: string,
  dedupeKey: string,
  now: string,
  parts: { what: string; amountKop?: Kop; reason?: string; operation?: string; next?: string }
): Notification {
  const lines = [
    `${fmtWhen(now)} — ${parts.what}`,
    parts.amountKop != null ? `Сума: ${uah(parts.amountKop)}` : null,
    parts.reason ? `Причина: ${parts.reason}` : null,
    parts.operation ? `Операція: ${parts.operation}` : null,
    "Фінансова історія: розділ «Фінанси» у кабінеті автора.",
    parts.next ? `Що далі: ${parts.next}` : null,
  ].filter(Boolean);
  return {
    eventType,
    dedupeKey,
    message: lines.join("\n"),
    amountKop: parts.amountKop ?? null,
    relatedOperation: parts.operation ?? null,
  };
}

/** Auto status from the balance (only the balance-driven states move on their own). */
export function settleStatus(
  status: AccountStatus,
  adminHold: boolean,
  debtAfter: Kop
): { status: AccountStatus; salesSuspended?: boolean } {
  if (debtAfter > 0 && status === "ACTIVE") return { status: "DEBT" };
  if (debtAfter === 0) {
    if (status === "DEBT" || status === "WARNING" || status === "INACTIVE_WITH_DEBT") return { status: "ACTIVE" };
    if (status === "SALES_SUSPENDED" && !adminHold) return { status: "ACTIVE", salesSuspended: false };
  }
  return { status };
}

/** Pay debts oldest-first; returns the updates and how much was really repaid. */
function repayDebts(debts: DebtState[], amount: Kop, now: string): { ops: Plan["debts"]; repaid: Kop } {
  let left = amount;
  const ops: Plan["debts"] = [];
  const open = debts.filter((d) => d.status === "open" && d.outstandingKop > 0).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  for (const d of open) {
    if (left <= 0) break;
    const pay = Math.min(left, d.outstandingKop);
    const outstanding = d.outstandingKop - pay;
    ops.push({
      op: "update",
      row: { id: d.id, outstanding_kop: outstanding, status: outstanding === 0 ? "repaid" : "open", resolved_at: outstanding === 0 ? now : null },
    });
    left -= pay;
  }
  return { ops, repaid: amount - left };
}

/** Applies the automatic status settle to a plan after its lines are known. */
function finishAccount(plan: Plan, acc: AccountState, debtAfter: Kop, now: string, reasonText: string) {
  const patch = settleStatus(plan.account?.status ?? acc.status, plan.account?.adminHold ?? acc.adminHold, debtAfter);
  const current = plan.account?.status ?? acc.status;
  if (patch.status !== current) {
    plan.account = { ...plan.account, status: patch.status };
    plan.statusLog.push({ from: current, to: patch.status, reason: reasonText });
  }
  if (patch.salesSuspended === false) plan.account = { ...plan.account, salesSuspended: false };
  if (current === "SALES_SUSPENDED" && patch.status === "ACTIVE") {
    plan.notifications.push(
      note("SALES_RESTORED", `sales-restored:${plan.key}`, now, {
        what: "Продажі ваших матеріалів відновлено — заборгованість погашено.",
        operation: plan.key,
      })
    );
  }
}

// ── 1. payment confirmed → accrual ──────────────────────────────────────────

export type PurchaseInput = {
  purchaseId: string;
  authorId: string;
  buyerId: string | null;
  amountKop: Kop; // the PRICE (the buyer pays exactly this; the bank fee is Sensoria's cost)
  contentId?: string | null;
  contentTitle?: string | null;
  source?: SaleSource; // where the buyer came from; defaults to the catalog rate
};

/**
 * Called ONLY when the money is confirmed as received. Freezes the shares,
 * puts new earnings against existing debt first, then to the hold (and reserve).
 * Calling it for an order that has no confirmed payment must not happen — the
 * caller (finance_apply) refuses a second accrual for the same purchase.
 */
export function planPaymentReceived(args: {
  settings: Settings;
  now: string;
  account: AccountState;
  debts: DebtState[];
  purchase: PurchaseInput;
  paymentId: string;
  reserveId: string;
  externalReference: string | null;
  mode: "test" | "live";
}): Plan {
  const { settings: s, now, account, debts, purchase, paymentId, reserveId } = args;
  checkSettings(s);
  if (purchase.amountKop <= 0) throw new FinanceError("free_order", "Безкоштовне замовлення не створює фінансових операцій.");
  const { authorKop, sensoriaKop } = splitAmount(purchase.amountKop, s, purchase.source);
  const feeKop = bankFeeOnPrice(purchase.amountKop, s); // Sensoria's cost; the author's share is untouched
  const grossKop = purchase.amountKop; // the buyer is charged the price only
  const plan = newPlan(`payment:${purchase.purchaseId}`, "PAYMENT_RECEIVED", purchase.authorId, account.version);
  const base = { authorId: purchase.authorId, paymentId, orderId: purchase.purchaseId, buyerId: purchase.buyerId };

  plan.lines.push(
    { ...base, type: "PAYMENT_RECEIVED", account: "cash_in", delta: grossKop, authorShare: authorKop, sensoriaShare: sensoriaKop },
    { ...base, authorId: null, type: "SENSORIA_COMMISSION", account: "sensoria_revenue", delta: sensoriaKop, authorShare: authorKop, sensoriaShare: sensoriaKop },
    { ...base, type: "AUTHOR_EARNING", account: "author_pending", delta: authorKop, authorShare: authorKop, sensoriaShare: sensoriaKop },
    { ...base, type: "AUTHOR_EARNING", account: "author_earned", delta: authorKop }
  );
  if (feeKop > 0) {
    // the bank keeps it out of the payment: owed to the bank until settled from the statement, and Sensoria's own cost
    plan.lines.push(
      { ...base, authorId: null, type: "BANK_FEE_COLLECTED", account: "bank_fee", delta: feeKop, reason: "Комісія банку за рахунок Sensoria" },
      { ...base, authorId: null, type: "BANK_FEE_COLLECTED", account: "sensoria_revenue", delta: -feeKop, reason: "Комісія банку за рахунок Sensoria" }
    );
  }

  // earnings go to debt first
  const { ops, repaid } = repayDebts(debts, Math.min(authorKop, account.debt), now);
  plan.debts.push(...ops);
  if (repaid > 0) {
    plan.lines.push(
      { ...base, type: "AUTHOR_DEBT_REPAID", account: "author_pending", delta: -repaid, reason: "Погашення заборгованості з нового нарахування" },
      { ...base, type: "AUTHOR_DEBT_REPAID", account: "author_debt", delta: -repaid, reason: "Погашення заборгованості з нового нарахування" }
    );
  }
  const net = authorKop - repaid;
  // Split at source: the payment is divided by the acquirer in the same moment. The author's leg is reduced by
  // the debt being repaid (that part goes to Sensoria, which paid the refund earlier). No hold, reserve or payout.
  const split = s.splitAtSource === 1;
  if (split && net > 0) {
    plan.lines.push(
      { ...base, type: "AUTHOR_PAYOUT", account: "author_pending", delta: -net, reason: "Розподіл при оплаті: частка автора йде на його рахунок" },
      { ...base, type: "AUTHOR_PAYOUT", account: "cash_out", delta: net, reason: "Розподіл при оплаті: частка автора йде на його рахунок" },
      { ...base, type: "AUTHOR_PAYOUT", account: "author_paid_out", delta: net, reason: "Розподіл при оплаті: частка автора йде на його рахунок" }
    );
  }
  const reserve = split ? 0 : Math.floor((net * s.reserveBps) / 10000);
  if (reserve > 0) {
    plan.lines.push(
      { ...base, type: "REFUND_RESERVE_CREATED", account: "author_pending", delta: -reserve },
      { ...base, type: "REFUND_RESERVE_CREATED", account: "author_reserved", delta: reserve }
    );
    plan.reserves.push({
      op: "insert",
      row: { id: reserveId, author_id: purchase.authorId, payment_id: paymentId, reserved_kop: reserve, released_kop: 0, used_kop: 0, status: "held", release_at: addDays(now, s.reserveDays) },
    });
  }
  plan.payments.push({
    op: "insert",
    row: {
      id: paymentId,
      purchase_id: purchase.purchaseId,
      author_id: purchase.authorId,
      buyer_id: purchase.buyerId,
      amount_kop: purchase.amountKop,
      fee_kop: feeKop,
      gross_kop: grossKop,
      content_id: purchase.contentId ?? null,
      content_title: purchase.contentTitle ?? null,
      currency: "UAH",
      payment_status: "received",
      external_reference: args.externalReference,
      mode: args.mode,
      author_bps: 10000 - commissionFor(s, purchase.source),
      commission_bps: commissionFor(s, purchase.source),
      sale_source: purchase.source ?? "catalog",
      author_kop: authorKop,
      sensoria_kop: sensoriaKop,
      pending_kop: split ? 0 : net - reserve,
      hold_until: split ? now : addDays(now, s.holdDays),
      split_author_kop: split ? net : null,
      split_sensoria_kop: split ? sensoriaKop + repaid : null,
      confirmed_at: now,
      received_at: now,
    },
  });

  const debtAfter = account.debt - repaid;
  if (repaid > 0) {
    plan.notifications.push(
      note(debtAfter === 0 ? "DEBT_REPAID_FULL" : "DEBT_REPAID_PARTIAL", `debt-repaid:${plan.key}`, now, {
        what: debtAfter === 0 ? "Заборгованість повністю погашено новим нарахуванням." : "Заборгованість частково погашено новим нарахуванням.",
        amountKop: repaid,
        reason: "Нове нарахування за продаж спрямовано на погашення боргу.",
        operation: plan.key,
        next: debtAfter > 0 ? `Залишок боргу: ${uah(debtAfter)}.` : undefined,
      })
    );
  }
  finishAccount(plan, account, debtAfter, now, "Баланс змінився після нарахування");
  return plan;
}

// ── 2. holds and reserves expire ────────────────────────────────────────────

/** Moves everything whose hold/reserve time has passed to «available», paying debt first. */
export function planRelease(args: {
  settings: Settings;
  now: string;
  account: AccountState;
  debts: DebtState[];
  payments: PaymentState[]; // this author's payments
  reserves: ReserveState[];
}): Plan | null {
  const { now, account, debts } = args;
  const duePayments = args.payments.filter((p) => !p.disputed && p.pendingKop > 0 && ms(p.holdUntil) <= ms(now));
  const dueReserves = args.reserves.filter((r) => reserveLeft(r) > 0 && ms(r.releaseAt) <= ms(now));
  if (!duePayments.length && !dueReserves.length) return null;

  const plan = newPlan(`release:${account.authorId}:${now}`, "RELEASE", account.authorId, account.version);
  let toAvailable = 0;
  for (const p of duePayments) {
    plan.lines.push(
      { type: "HOLD_RELEASED", account: "author_pending", delta: -p.pendingKop, authorId: account.authorId, paymentId: p.id, orderId: p.purchaseId },
      { type: "HOLD_RELEASED", account: "author_available", delta: p.pendingKop, authorId: account.authorId, paymentId: p.id, orderId: p.purchaseId }
    );
    plan.payments.push({ op: "update", row: { id: p.id, pending_kop: 0 } });
    toAvailable += p.pendingKop;
  }
  for (const r of dueReserves) {
    const left = reserveLeft(r);
    const pay = duePayments.find((p) => p.id === r.paymentId) ?? args.payments.find((p) => p.id === r.paymentId);
    plan.lines.push(
      { type: "REFUND_RESERVE_RELEASED", account: "author_reserved", delta: -left, authorId: account.authorId, paymentId: r.paymentId, orderId: pay?.purchaseId },
      { type: "REFUND_RESERVE_RELEASED", account: "author_available", delta: left, authorId: account.authorId, paymentId: r.paymentId, orderId: pay?.purchaseId }
    );
    plan.reserves.push({ op: "update", row: { id: r.id, released_kop: r.releasedKop + left, status: "released" } });
    toAvailable += left;
  }
  // released money first settles existing debt
  const { ops, repaid } = repayDebts(debts, Math.min(toAvailable, account.debt), now);
  plan.debts.push(...ops);
  if (repaid > 0) {
    plan.lines.push(
      { type: "AUTHOR_DEBT_REPAID", account: "author_available", delta: -repaid, authorId: account.authorId, reason: "Погашення заборгованості з коштів, що стали доступними" },
      { type: "AUTHOR_DEBT_REPAID", account: "author_debt", delta: -repaid, authorId: account.authorId, reason: "Погашення заборгованості з коштів, що стали доступними" }
    );
    plan.notifications.push(
      note(account.debt - repaid === 0 ? "DEBT_REPAID_FULL" : "DEBT_REPAID_PARTIAL", `debt-repaid:${plan.key}`, now, {
        what: "Заборгованість погашено з коштів, що стали доступними.",
        amountKop: repaid,
        operation: plan.key,
      })
    );
  }
  finishAccount(plan, account, account.debt - repaid, now, "Баланс змінився після завершення періоду підтвердження");
  return plan;
}

// ── 3. refunds ──────────────────────────────────────────────────────────────

export type RefundKind = "full" | "partial" | "chargeback";

/**
 * Buyer gets EVERYTHING that was approved. Shares follow the order's frozen
 * shares (cumulative rounding makes the pieces add up to the order exactly).
 * Author's part: this sale's hold → its reserve → author's available → debt.
 */
export function planRefund(args: {
  now: string;
  account: AccountState;
  payment: PaymentState;
  reserve: ReserveState | null;
  refundId: string;
  debtId: string;
  idempotencyKey: string; // unique per refund request: a repeat is rejected, not applied twice
  amountKop: Kop; // for kind=full pass payment.amountKop - payment.refundedKop
  kind: RefundKind;
  reason: string;
}): Plan {
  const { now, account, payment, reserve, kind } = args;
  assertKop(args.amountKop, "Сума повернення");
  if (args.amountKop <= 0) throw new FinanceError("bad_amount", "Сума повернення має бути більшою за нуль.");
  if (payment.refundedKop + args.amountKop > payment.amountKop) {
    throw new FinanceError("over_refund", "Сума повернень не може перевищувати суму оплати.");
  }
  const after = payment.refundedKop + args.amountKop;
  // author's cumulative share, rounded; the last refund closes the order exactly
  const authorTotalAfter = after === payment.amountKop ? payment.authorKop : Math.round((after * payment.authorKop) / payment.amountKop);
  const authorShare = authorTotalAfter - payment.authorRefundedKop;
  const sensoriaShare = args.amountKop - authorShare;
  // the buyer also gets the bank fee back, in the same proportion (the bank's own non-refundable cost stays a reconciliation item)
  // Only older payments, where the buyer paid the fee on top, return it to the buyer. Now the buyer gets the price back and
  // the bank does not return its fee, so it stays Sensoria's cost.
  const buyerPaidFee = payment.grossKop !== undefined && payment.grossKop > payment.amountKop;
  const feeTotalAfter = !buyerPaidFee ? 0 : after === payment.amountKop ? payment.feeKop : Math.round((after * payment.feeKop) / payment.amountKop);
  const feeShare = feeTotalAfter - payment.feeRefundedKop;

  const plan = newPlan(`refund:${args.idempotencyKey}`, "REFUND", payment.authorId, account.version);
  const lineType: LedgerType = kind === "chargeback" ? "CHARGEBACK" : after === payment.amountKop && kind === "full" ? "REFUND" : "PARTIAL_REFUND";
  const base = { paymentId: payment.id, orderId: payment.purchaseId, buyerId: payment.buyerId, refundId: args.refundId };

  plan.lines.push(
    { ...base, authorId: payment.authorId, type: lineType, account: "cash_out", delta: args.amountKop + feeShare, authorShare, sensoriaShare, reason: args.reason },
    { ...base, authorId: null, type: lineType, account: "sensoria_revenue", delta: -sensoriaShare, authorShare, sensoriaShare, reason: args.reason },
    { ...base, authorId: payment.authorId, type: lineType, account: "author_refunded", delta: authorShare },
    { ...base, authorId: payment.authorId, type: lineType, account: "author_earned", delta: -authorShare }
  );
  if (feeShare > 0) {
    plan.lines.push({ ...base, authorId: null, type: lineType, account: "bank_fee", delta: -feeShare, reason: "Повернення комісії банку покупцю" });
  }

  let left = authorShare;
  const fromPending = Math.min(left, payment.pendingKop, account.pending);
  left -= fromPending;
  const fromReserve = Math.min(left, reserve ? reserveLeft(reserve) : 0, account.reserved);
  left -= fromReserve;
  const fromAvailable = Math.min(left, account.available);
  left -= fromAvailable;
  const debtNew = left;

  if (fromPending) plan.lines.push({ ...base, authorId: payment.authorId, type: lineType, account: "author_pending", delta: -fromPending, reason: "З утримуваної частини цього продажу" });
  if (fromReserve) plan.lines.push({ ...base, authorId: payment.authorId, type: lineType, account: "author_reserved", delta: -fromReserve, reason: "З резерву на повернення" });
  if (fromAvailable) plan.lines.push({ ...base, authorId: payment.authorId, type: lineType, account: "author_available", delta: -fromAvailable, reason: "З доступного балансу автора" });
  if (debtNew > 0) {
    plan.lines.push({ ...base, authorId: payment.authorId, type: "AUTHOR_DEBT_CREATED", account: "author_debt", delta: debtNew, reason: "Частка автора у поверненні перевищила доступні кошти" });
    plan.debts.push({
      op: "insert",
      row: { id: args.debtId, author_id: payment.authorId, source_refund_id: args.refundId, original_kop: debtNew, outstanding_kop: debtNew, reason: `Повернення за замовленням ${payment.purchaseId}: ${args.reason}`, status: "open" },
    });
  }
  plan.payments.push({
    op: "update",
    row: {
      id: payment.id,
      pending_kop: payment.pendingKop - fromPending,
      refunded_kop: after,
      author_refunded_kop: payment.authorRefundedKop + authorShare,
      sensoria_refunded_kop: payment.sensoriaRefundedKop + sensoriaShare,
      fee_refunded_kop: payment.feeRefundedKop + feeShare,
    },
  });
  if (reserve && fromReserve) {
    plan.reserves.push({ op: "update", row: { id: reserve.id, used_kop: reserve.usedKop + fromReserve, status: reserveLeft(reserve) - fromReserve <= 0 ? "used" : "held" } });
  }
  plan.refunds.push({
    op: "insert",
    row: {
      id: args.refundId,
      payment_id: payment.id,
      order_id: payment.purchaseId,
      buyer_id: payment.buyerId,
      author_id: payment.authorId,
      total_refund_kop: args.amountKop,
      fee_refund_kop: feeShare,
      buyer_refund_kop: args.amountKop + feeShare,
      author_share_kop: authorShare,
      sensoria_share_kop: sensoriaShare,
      refund_type: kind,
      idempotency_key: args.idempotencyKey,
      status: "approved",
      reason: args.reason,
      completed_at: null,
    },
  });

  plan.notifications.push(
    note("REFUND_AFFECTED_BALANCE", `refund:${args.refundId}`, now, {
      what: "Покупцеві оформлено повернення коштів, це змінило ваш баланс.",
      amountKop: authorShare,
      reason: args.reason,
      operation: plan.key,
      next: debtNew > 0 ? `Створено заборгованість ${uah(debtNew)}: її погасять наступні нарахування за продажі.` : undefined,
    })
  );
  if (debtNew > 0) {
    plan.notifications.push(
      note("DEBT_CREATED", `debt-created:${args.refundId}`, now, {
        what: "Виникла заборгованість перед Sensoria.",
        amountKop: debtNew,
        reason: "Ваша частка у поверненні перевищила доступні кошти.",
        operation: plan.key,
        next: "Нові нарахування автоматично погашатимуть борг. Продажі не зупиняються, поки ви на зв'язку.",
      })
    );
  }
  const debtAfter = account.debt + debtNew;
  if (debtNew > 0 && account.debt > 0) {
    plan.notifications.push(
      note("DEBT_CHANGED", `debt-changed:${args.refundId}`, now, { what: `Розмір заборгованості змінився: тепер ${uah(debtAfter)}.`, amountKop: debtAfter, operation: plan.key })
    );
  }
  finishAccount(plan, account, debtAfter, now, "Баланс змінився після повернення");
  return plan;
}

// ── 4. debt: manual repayment ───────────────────────────────────────────────

/** An administrator records that a debt was paid (cash received) or offsets it with the author's own available money. */
export function planManualDebtRepayment(args: {
  now: string;
  account: AccountState;
  debts: DebtState[];
  amountKop: Kop;
  source: "cash" | "available";
  reason: string;
  adminId: string;
  idempotencyKey: string;
}): Plan {
  const { now, account } = args;
  assertKop(args.amountKop, "Сума");
  if (args.amountKop <= 0) throw new FinanceError("bad_amount", "Сума має бути більшою за нуль.");
  if (args.amountKop > account.debt) throw new FinanceError("over_repay", "Сума перевищує заборгованість.");
  if (args.source === "available" && args.amountKop > account.available) {
    throw new FinanceError("no_funds", "На доступному балансі недостатньо коштів.");
  }
  if (!args.reason.trim()) throw new FinanceError("reason_required", "Вкажіть причину.");
  const plan = newPlan(`manual-repay:${args.idempotencyKey}`, "MANUAL_REPAYMENT", account.authorId, account.version);
  const { ops, repaid } = repayDebts(args.debts, args.amountKop, now);
  plan.debts.push(...ops);
  const reason = `${args.reason} (адмін ${args.adminId})`;
  if (args.source === "cash") {
    plan.lines.push({ type: "MANUAL_ADJUSTMENT", account: "cash_in", delta: repaid, authorId: account.authorId, reason });
  } else {
    plan.lines.push({ type: "MANUAL_ADJUSTMENT", account: "author_available", delta: -repaid, authorId: account.authorId, reason });
  }
  plan.lines.push({ type: "AUTHOR_DEBT_REPAID", account: "author_debt", delta: -repaid, authorId: account.authorId, reason });
  plan.audit = { action: "manual_debt_repayment", reason: args.reason, previous: { debt: account.debt }, next: { debt: account.debt - repaid, source: args.source } };
  plan.notifications.push(
    note(account.debt - repaid === 0 ? "DEBT_REPAID_FULL" : "DEBT_REPAID_PARTIAL", `debt-repaid:${plan.key}`, now, {
      what: "Заборгованість погашено вручну (підтверджено адміністратором).",
      amountKop: repaid,
      operation: plan.key,
    })
  );
  finishAccount(plan, account, account.debt - repaid, now, "Ручне погашення боргу");
  return plan;
}

// ── 5. payouts ──────────────────────────────────────────────────────────────

export function planPayoutRequest(args: {
  settings: Settings;
  now: string;
  account: AccountState;
  payoutId: string;
  amountKop: Kop;
  bankAccount: BankAccountState | null; // the author's VERIFIED account — the only possible destination
  auto?: boolean;
}): Plan {
  const { settings: s, account, bankAccount } = args;
  assertKop(args.amountKop, "Сума виплати");
  if (account.status === "CLOSED") throw new FinanceError("closed", "Акаунт закрито.");
  if (account.debt > 0) throw new FinanceError("has_debt", "Виплата недоступна, поки є заборгованість.");
  if (!bankAccount || bankAccount.status !== "verified") {
    throw new FinanceError("no_destination", "Спершу вкажіть банківський рахунок і дочекайтесь його підтвердження.");
  }
  if (args.amountKop < s.minPayoutKop) throw new FinanceError("below_min", `Мінімальна сума виплати — ${uah(s.minPayoutKop)}.`);
  if (args.amountKop > account.available) throw new FinanceError("no_funds", "Сума перевищує доступний баланс.");
  const plan = newPlan(`payout-request:${args.payoutId}`, "PAYOUT_REQUEST", account.authorId, account.version);
  plan.lines.push(
    { type: "AUTHOR_PAYOUT", account: "author_available", delta: -args.amountKop, authorId: account.authorId, payoutId: args.payoutId, reason: args.auto ? "Автоматична виплата" : "Запит на виплату" },
    { type: "AUTHOR_PAYOUT", account: "payout_in_flight", delta: args.amountKop, authorId: account.authorId, payoutId: args.payoutId, reason: args.auto ? "Автоматична виплата" : "Запит на виплату" }
  );
  plan.payouts.push({
    op: "insert",
    row: {
      id: args.payoutId,
      author_id: account.authorId,
      amount_kop: args.amountKop,
      currency: "UAH",
      payout_status: "requested",
      destination: `${bankAccount.bankName || "Банк"} · IBAN ••••${bankAccount.iban.slice(-4)}`,
      bank_account_id: bankAccount.id,
      destination_iban: bankAccount.iban,
      destination_holder: bankAccount.holderName,
      destination_tax_id: bankAccount.taxId,
      is_auto: !!args.auto,
      requested_at: args.now,
    },
  });
  return plan;
}

/** Auto-distribution: the whole released balance goes to the author's verified account (no minimum; the bank fee is Sensoria's cost and never reduces it). */
export function planAutoPayout(args: { settings: Settings; now: string; account: AccountState; payoutId: string; bankAccount: BankAccountState | null; hasOpenPayout: boolean }): Plan | null {
  const { settings: s, account } = args;
  if (!s.autoPayout || args.hasOpenPayout) return null;
  if (account.debt > 0 || account.status === "CLOSED" || account.available <= 0) return null; // auto-distribution: every released kopeck goes out, the minimum does not apply
  if (!args.bankAccount || args.bankAccount.status !== "verified") return null;
  return planPayoutRequest({ settings: s, now: args.now, account, payoutId: args.payoutId, amountKop: account.available, bankAccount: args.bankAccount, auto: true });
}

export function planPayoutConfirm(args: {
  now: string;
  account: AccountState;
  payoutId: string;
  amountKop: Kop;
  reference: string;
  adminId: string;
  payoutBankAccountId: string | null; // the account the order was made for
  currentBankAccountId: string | null; // the author's verified account NOW
}): Plan {
  if (!args.reference.trim()) throw new FinanceError("reference_required", "Потрібне підтвердження виконання (номер платежу).");
  if (!args.payoutBankAccountId || args.payoutBankAccountId !== args.currentBankAccountId) {
    throw new FinanceError("account_changed", "Рахунок автора змінився після запиту: скасуйте виплату й створіть нову на підтверджений рахунок.");
  }
  const plan = newPlan(`payout-confirm:${args.payoutId}`, "PAYOUT_CONFIRM", args.account.authorId, args.account.version);
  const b = { authorId: args.account.authorId, payoutId: args.payoutId, reason: `Підтверджено: ${args.reference}` };
  plan.lines.push(
    { ...b, type: "AUTHOR_PAYOUT", account: "payout_in_flight", delta: -args.amountKop },
    { ...b, type: "AUTHOR_PAYOUT", account: "cash_out", delta: args.amountKop },
    { ...b, type: "AUTHOR_PAYOUT", account: "author_paid_out", delta: args.amountKop }
  );
  plan.payouts.push({ op: "update", row: { id: args.payoutId, payout_status: "paid", processed_at: args.now, confirmation_reference: args.reference } });
  plan.audit = { action: "payout_confirmed", reason: args.reference, previous: { status: "requested" }, next: { status: "paid", adminId: args.adminId } };
  return plan;
}

export function planPayoutFail(args: { now: string; account: AccountState; payoutId: string; amountKop: Kop; reason: string; adminId: string }): Plan {
  if (!args.reason.trim()) throw new FinanceError("reason_required", "Вкажіть причину.");
  const plan = newPlan(`payout-fail:${args.payoutId}`, "PAYOUT_FAIL", args.account.authorId, args.account.version);
  const b = { authorId: args.account.authorId, payoutId: args.payoutId, reason: `Виплату не виконано: ${args.reason}` };
  plan.lines.push(
    { ...b, type: "MANUAL_ADJUSTMENT", account: "payout_in_flight", delta: -args.amountKop },
    { ...b, type: "MANUAL_ADJUSTMENT", account: "author_available", delta: args.amountKop }
  );
  plan.payouts.push({ op: "update", row: { id: args.payoutId, payout_status: "failed", processed_at: args.now, failure_reason: args.reason } });
  plan.audit = { action: "payout_failed", reason: args.reason, previous: { status: "requested" }, next: { status: "failed", adminId: args.adminId } };
  return plan;
}

// ── 5b. the bank's real charges ─────────────────────────────────────────────

/**
 * Records what the bank actually charged (from the statement). The fee collected
 * from buyers is released; any surplus can be moved to Sensoria, a shortfall is
 * Sensoria's own cost (never taken from the author).
 */
export function planBankFeeSettlement(args: { now: string; paidKop: Kop; collectedLeftKop: Kop; moveSurplusToSensoria: boolean; reason: string; adminId: string; idempotencyKey: string }): Plan {
  assertKop(args.paidKop, "Сума");
  if (args.paidKop <= 0) throw new FinanceError("bad_amount", "Сума має бути більшою за нуль.");
  if (!args.reason.trim()) throw new FinanceError("reason_required", "Вкажіть причину.");
  const plan = newPlan(`bank-fee:${args.idempotencyKey}`, "BANK_FEE_PAID", null, null);
  const reason = `${args.reason} (адмін ${args.adminId})`;
  const fromCollected = Math.min(args.paidKop, args.collectedLeftKop);
  const extra = args.paidKop - fromCollected; // charged beyond what buyers paid: Sensoria's own cost
  plan.lines.push({ type: "BANK_FEE_PAID", account: "cash_out", delta: args.paidKop, authorId: null, reason });
  if (fromCollected > 0) plan.lines.push({ type: "BANK_FEE_PAID", account: "bank_fee", delta: -fromCollected, authorId: null, reason });
  if (extra > 0) plan.lines.push({ type: "BANK_FEE_PAID", account: "sensoria_revenue", delta: -extra, authorId: null, reason: `Витрата Sensoria понад зібрану комісію. ${reason}` });
  const surplus = args.collectedLeftKop - fromCollected;
  if (args.moveSurplusToSensoria && surplus > 0) {
    plan.lines.push(
      { type: "MANUAL_ADJUSTMENT", account: "bank_fee", delta: -surplus, authorId: null, reason: `Надлишок комісії, зібраної з покупців. ${reason}` },
      { type: "MANUAL_ADJUSTMENT", account: "sensoria_revenue", delta: surplus, authorId: null, reason: `Надлишок комісії, зібраної з покупців. ${reason}` }
    );
  }
  plan.audit = { action: "bank_fee_settled", reason: args.reason, previous: { collectedLeftKop: args.collectedLeftKop }, next: { paidKop: args.paidKop, extraSensoriaCostKop: extra, surplusMovedKop: args.moveSurplusToSensoria ? surplus : 0 } };
  return plan;
}

// ── 6. activity and sales protection ────────────────────────────────────────

/** Only these count as the author being really present. */
export const MEANINGFUL_ACTIVITY = ["login", "view_finance", "manage_content", "ack_notification"] as const;
export type ActivityType = (typeof MEANINGFUL_ACTIVITY)[number];
export const isMeaningful = (t: string): t is ActivityType => (MEANINGFUL_ACTIVITY as readonly string[]).includes(t);

/** A meaningful action: resets the inactivity clock; a warned author is taken off «WARNING». */
export function planActivity(args: { now: string; account: AccountState; type: ActivityType }): Plan | null {
  const { now, account } = args;
  const sameMinute = account.lastMeaningfulActivityAt && ms(now) - ms(account.lastMeaningfulActivityAt) < 60_000;
  const needsStatus = account.status === "WARNING" || account.status === "INACTIVE_WITH_DEBT";
  if (sameMinute && !needsStatus) return null; // avoid a write per click
  const plan = newPlan(`activity:${account.authorId}:${now}`, "ACTIVITY", account.authorId, account.version);
  plan.account = { lastMeaningfulActivityAt: now };
  if (needsStatus) {
    plan.account.status = account.debt > 0 ? "DEBT" : "ACTIVE";
    plan.account.warningAt = null;
    plan.statusLog.push({ from: account.status, to: plan.account.status, reason: "Автор знову активний" });
  }
  if (account.status === "SALES_SUSPENDED" && !account.adminHold) {
    // returning author: sales are restored only once the debt is gone; otherwise an admin decides
    if (account.debt === 0) {
      plan.account.status = "ACTIVE";
      plan.account.salesSuspended = false;
      plan.statusLog.push({ from: account.status, to: "ACTIVE", reason: "Автор повернувся, боргу немає" });
    }
  }
  return plan;
}

/**
 * Debt + no meaningful activity for N days → warning; no reaction for another
 * M days → new sales suspended (existing buyers keep access — that is enforced
 * by the access rules, nothing here touches them). No debt → never triggers.
 */
export function planInactivity(args: { settings: Settings; now: string; account: AccountState; fallbackSince: string }): Plan | null {
  const { settings: s, now, account } = args;
  if (account.debt <= 0) return null;
  if (!["DEBT", "INACTIVE_WITH_DEBT", "WARNING"].includes(account.status)) return null;
  const last = ms(account.lastMeaningfulActivityAt ?? args.fallbackSince);
  const idleDays = (ms(now) - last) / DAY;

  if (account.status === "WARNING") {
    const warned = account.warningAt ? ms(account.warningAt) : null;
    if (warned == null || last > warned) return null; // reacted after the warning
    if ((ms(now) - warned) / DAY < s.warningGraceDays) return null;
    const plan = newPlan(`suspend:${account.authorId}:${account.warningAt}`, "SUSPEND_SALES", account.authorId, account.version);
    plan.account = { status: "SALES_SUSPENDED", salesSuspended: true };
    plan.statusLog.push({ from: "WARNING", to: "SALES_SUSPENDED", reason: "Немає реакції на попередження" });
    plan.notifications.push(
      note("SALES_SUSPENDED", `suspended:${account.authorId}:${account.warningAt}`, now, {
        what: "Нові продажі ваших матеріалів тимчасово призупинено.",
        amountKop: account.debt,
        reason: "Є непогашена заборгованість і немає активності в акаунті.",
        next: "Матеріали, які вже придбали, залишаються доступними покупцям. Увійдіть у кабінет, щоб побачити історію боргу й умови відновлення.",
      })
    );
    return plan;
  }

  if (idleDays >= s.inactivityDays) {
    const plan = newPlan(`warn:${account.authorId}:${now.slice(0, 10)}`, "WARN_INACTIVE", account.authorId, account.version);
    plan.statusLog.push({ from: account.status, to: "INACTIVE_WITH_DEBT", reason: `Немає активності ${s.inactivityDays} днів` }, { from: "INACTIVE_WITH_DEBT", to: "WARNING", reason: "Надіслано попередження" });
    plan.account = { status: "WARNING", warningAt: now };
    plan.notifications.push(
      note("INACTIVITY_WARNING", `warning:${account.authorId}:${now.slice(0, 10)}`, now, {
        what: "Попередження: за наявності боргу в акаунті немає активності.",
        amountKop: account.debt,
        reason: "Борг виник через повернення коштів покупцям після того, як ви вже отримали свою частку.",
        next: `Увійдіть у кабінет протягом ${s.warningGraceDays} днів, інакше нові продажі буде призупинено.`,
      })
    );
    return plan;
  }

  const daysLeft = s.inactivityDays - idleDays;
  if (daysLeft <= s.reminderDays && !account.reminderSentAt) {
    const plan = newPlan(`reminder:${account.authorId}:${now.slice(0, 10)}`, "INACTIVITY_REMINDER", account.authorId, account.version);
    plan.account = { reminderSentAt: now };
    plan.notifications.push(
      note("INACTIVITY_APPROACHING", `approaching:${account.authorId}:${now.slice(0, 10)}`, now, {
        what: "Наближається термін неактивності за наявності боргу.",
        amountKop: account.debt,
        next: "Увійдіть у кабінет, щоб уникнути попередження та призупинення продажів.",
      })
    );
    return plan;
  }
  return null;
}

// ── 7. administrative actions ───────────────────────────────────────────────

export function planAdminStatus(args: {
  now: string;
  account: AccountState;
  action: "suspend_sales" | "restore_sales" | "start_collection" | "request_closure" | "close";
  reason: string;
  adminId: string;
  idempotencyKey: string;
}): Plan {
  const { account, action } = args;
  if (!args.reason.trim()) throw new FinanceError("reason_required", "Вкажіть причину.");
  const plan = newPlan(`admin:${action}:${args.idempotencyKey}`, "ADMIN_STATUS", account.authorId, account.version);
  const to: AccountStatus =
    action === "suspend_sales" ? "SALES_SUSPENDED"
    : action === "start_collection" ? "DEBT_COLLECTION"
    : action === "request_closure" ? "CLOSURE_REQUESTED"
    : action === "close" ? "CLOSED"
    : account.debt > 0 ? "DEBT" : "ACTIVE";
  plan.account = {
    status: to,
    adminHold: action === "suspend_sales",
    salesSuspended: action === "restore_sales" ? false : action === "request_closure" ? account.salesSuspended : true,
  };
  if (action === "restore_sales") plan.account.warningAt = null;
  plan.statusLog.push({ from: account.status, to, reason: args.reason });
  plan.audit = { action: `finance_${action}`, reason: args.reason, previous: { status: account.status, debt: account.debt }, next: { status: to, adminId: args.adminId } };
  if (action === "suspend_sales" || action === "restore_sales") {
    plan.notifications.push(
      note(action === "suspend_sales" ? "SALES_SUSPENDED" : "SALES_RESTORED", `admin-${action}:${args.idempotencyKey}`, args.now, {
        what: action === "suspend_sales" ? "Нові продажі ваших матеріалів призупинено адміністратором." : "Продажі ваших матеріалів відновлено.",
        reason: args.reason,
      })
    );
  }
  return plan;
}

// ── 8. consistency ──────────────────────────────────────────────────────────

/** Sums ledger lines per account — the balance must equal this at all times. */
export function balancesFromLines(lines: Pick<Line, "account" | "delta">[]): Record<LedgerAccount, Kop> {
  const r = {} as Record<LedgerAccount, Kop>;
  for (const l of lines) r[l.account] = (r[l.account] ?? 0) + l.delta;
  return r;
}

export function projectionMismatch(account: AccountState, lines: Pick<Line, "account" | "delta">[]): string[] {
  const b = balancesFromLines(lines);
  const g = (a: LedgerAccount) => b[a] ?? 0;
  const pairs: Array<[string, Kop, Kop]> = [
    ["pending", account.pending, g("author_pending")],
    ["available", account.available, g("author_available")],
    ["reserved", account.reserved, g("author_reserved")],
    ["debt", account.debt, g("author_debt")],
    ["inFlight", account.inFlight, g("payout_in_flight")],
    ["lifetimeEarnings", account.lifetimeEarnings, g("author_earned")],
    ["totalPaidOut", account.totalPaidOut, g("author_paid_out")],
    ["totalRefunded", account.totalRefunded, g("author_refunded")],
  ];
  return pairs.filter(([, a, c]) => a !== c).map(([n, a, c]) => `${n}: проєкція ${a} ≠ журнал ${c}`);
}

/** Applies a plan's lines to an account in memory (used by tests and by the Edge Function's dry check). */
export function applyToAccount(account: AccountState, plan: Plan): AccountState {
  const b = balancesFromLines(plan.lines.filter((l) => l.authorId === account.authorId));
  const g = (a: LedgerAccount) => b[a] ?? 0;
  return {
    ...account,
    pending: account.pending + g("author_pending"),
    available: account.available + g("author_available"),
    reserved: account.reserved + g("author_reserved"),
    debt: account.debt + g("author_debt"),
    inFlight: account.inFlight + g("payout_in_flight"),
    lifetimeEarnings: account.lifetimeEarnings + g("author_earned"),
    totalPaidOut: account.totalPaidOut + g("author_paid_out"),
    totalRefunded: account.totalRefunded + g("author_refunded"),
    ...(plan.account ?? {}),
    version: account.version + 1,
  };
}

// ── /engine ───────────────────────────────────────────────────────────────

// ── monobank core (src/utils/monoAcquiring.ts) ────────────────────────────
// monobank acquiring (split payments): pure helpers, no network and no secrets.
// Used by the Edge Functions (copied in by scripts) and covered by unit tests.
//
// Docs: https://monobank.ua/api-docs/acquiring/methods/split/post--api--merchant--invoice--create
//  - a split invoice carries a basket (merchantPaymInfo.basketOrder); every item
//    names the receiver of its money in `splitReceiverId`;
//  - sum is per unit in kopecks, total = qty * sum, amount = sum of totals;
//  - the header X-Cms must be "sensoria" (monobank asked for it).

export const MONO_CMS_NAME = "sensoria";

export interface MonoBasketItem {
  name: string;
  qty: number;
  /** price of one unit, kopecks */
  sum: number;
  /** qty * sum, kopecks */
  total: number;
  code: string;
  splitReceiverId: string;
}

export interface SplitInput {
  /** what the buyer pays, kopecks */
  amountKop: number;
  /** the author's part, kopecks (price minus Sensoria's commission) */
  authorKop: number;
  /** Sensoria's part, kopecks */
  sensoriaKop: number;
  title: string;
  /** stable code of the content, e.g. its id */
  contentCode: string;
  authorReceiverId: string;
  sensoriaReceiverId: string;
}

export class MonoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const trimTitle = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * The basket of a split invoice: one item for the author, one for Sensoria.
 * A part that is zero is left out (monobank rejects empty items). The totals must add up
 * to the price exactly, otherwise nothing is built: money must never be lost or invented.
 */
export function buildSplitBasket(i: SplitInput): { amount: number; basketOrder: MonoBasketItem[] } {
  const all = [i.amountKop, i.authorKop, i.sensoriaKop];
  if (!all.every((n) => Number.isInteger(n) && n >= 0)) throw new MonoError("bad_amount", "Суми мають бути цілими невід'ємними числами в копійках.");
  if (i.amountKop <= 0) throw new MonoError("bad_amount", "Сума оплати має бути більшою за нуль.");
  if (i.authorKop + i.sensoriaKop !== i.amountKop) throw new MonoError("split_mismatch", "Частини автора й Sensoria не дають суму оплати.");
  if (i.authorKop > 0 && !i.authorReceiverId) throw new MonoError("no_author_receiver", "Автор ще не підключений до розщеплення платежів.");
  if (i.sensoriaKop > 0 && !i.sensoriaReceiverId) throw new MonoError("no_sensoria_receiver", "Не задано отримувача Sensoria.");

  const title = trimTitle(i.title || "Матеріал", 60);
  const basketOrder: MonoBasketItem[] = [];
  if (i.authorKop > 0) {
    basketOrder.push({ name: title, qty: 1, sum: i.authorKop, total: i.authorKop, code: `${i.contentCode}:author`, splitReceiverId: i.authorReceiverId });
  }
  if (i.sensoriaKop > 0) {
    basketOrder.push({ name: `Послуги платформи Sensoria: ${title}`.slice(0, 100), qty: 1, sum: i.sensoriaKop, total: i.sensoriaKop, code: `${i.contentCode}:platform`, splitReceiverId: i.sensoriaReceiverId });
  }
  return { amount: i.amountKop, basketOrder };
}

/**
 * Body for POST /api/merchant/invoice/create. `reference` is OUR payment-intent id:
 * the webhook brings it back, so the order is never guessed from the amount.
 */
export function buildInvoiceBody(args: SplitInput & { reference: string; redirectUrl: string; webHookUrl: string; validitySec?: number }) {
  const { amount, basketOrder } = buildSplitBasket(args);
  return {
    amount,
    ccy: 980,
    merchantPaymInfo: {
      reference: args.reference,
      destination: trimTitle(`Оплата: ${args.title || "матеріал"}`, 100),
      basketOrder,
    },
    redirectUrl: args.redirectUrl,
    webHookUrl: args.webHookUrl,
    validity: args.validitySec ?? 3600,
    paymentType: "debit",
  };
}

// ── statuses ────────────────────────────────────────────────────────────────

export type MonoStatus = "created" | "processing" | "hold" | "success" | "failure" | "reversed" | "expired";
const KNOWN: readonly string[] = ["created", "processing", "hold", "success", "failure", "reversed", "expired"];

export function parseStatus(raw: unknown): MonoStatus | null {
  return typeof raw === "string" && KNOWN.includes(raw) ? (raw as MonoStatus) : null;
}

/** Only `success` pays; `reversed` takes the money back; the rest changes nothing. */
export function effectOf(status: MonoStatus): "paid" | "reversed" | "failed" | "wait" {
  if (status === "success") return "paid";
  if (status === "reversed") return "reversed";
  if (status === "failure" || status === "expired") return "failed";
  return "wait";
}

/**
 * Webhooks may arrive out of order ("success" before "processing"). The newer modifiedDate wins;
 * a message without a date never overwrites one that has it.
 */
export function isNewer(incomingModified: string | undefined, storedModified: string | null | undefined): boolean {
  if (!incomingModified) return !storedModified;
  if (!storedModified) return true;
  const a = Date.parse(incomingModified);
  const b = Date.parse(storedModified);
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a > b;
}

// ── signature ───────────────────────────────────────────────────────────────

/** monobank signs the raw body with ECDSA/SHA-256; the signature comes as base64 DER (ASN.1). WebCrypto wants raw r||s. */
export function derToRawSignature(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> {
  let p = 0;
  if (der[p++] !== 0x30) throw new MonoError("bad_signature", "Підпис має неочікуваний формат.");
  const len = der[p++];
  if (len & 0x80) p += len & 0x7f; // long form length: skip the length bytes
  const readInt = (): Uint8Array<ArrayBuffer> => {
    if (der[p++] !== 0x02) throw new MonoError("bad_signature", "Підпис має неочікуваний формат.");
    const l = der[p++];
    let v: Uint8Array = der.slice(p, p + l);
    p += l;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new MonoError("bad_signature", "Підпис має неочікуваний формат.");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

const b64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** SPKI bytes of a PEM public key (monobank's /api/merchant/pubkey returns base64 of the PEM). */
export function spkiFromPem(pemOrBase64: string): Uint8Array<ArrayBuffer> {
  let text = pemOrBase64.trim();
  if (!text.includes("BEGIN")) {
    try {
      const decoded = atob(text);
      if (decoded.includes("BEGIN")) text = decoded;
    } catch { /* not base64 text: treat as bare key below */ }
  }
  const body = text.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return b64(body);
}

/** True only when the signature over the exact raw body is valid. Never throws on bad input. */
export async function verifyWebhookSignature(rawBody: string, xSign: string | null, pubkey: string): Promise<boolean> {
  if (!xSign || !pubkey) return false;
  try {
    const key = await crypto.subtle.importKey("spki", spkiFromPem(pubkey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sig = derToRawSignature(b64(xSign));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, new TextEncoder().encode(rawBody));
  } catch {
    return false;
  }
}

// ── /monobank core ────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ── loading state ───────────────────────────────────────────────────────────

async function loadSettings(): Promise<Settings> {
  const { data } = await admin.from("finance_settings").select("*").eq("id", 1).single();
  if (!data) return DEFAULT_SETTINGS;
  return {
    authorBps: data.author_bps,
    commissionBps: data.commission_bps,
    referralCommissionBps: data.referral_commission_bps ?? 1500,
    holdDays: data.hold_days,
    reserveBps: data.reserve_bps,
    reserveDays: data.reserve_days,
    inactivityDays: data.inactivity_days,
    warningGraceDays: data.warning_grace_days,
    reminderDays: data.reminder_days,
    minPayoutKop: Number(data.min_payout_kop),
    bankFeeBps: data.bank_fee_bps,
    bankFeeFixedKop: Number(data.bank_fee_fixed_kop),
    autoPayout: data.auto_payout ? 1 : 0,
    splitAtSource: data.split_at_source === false ? 0 : 1,
  };
}

// deno-lint-ignore no-explicit-any
const toBank = (r: any): BankAccountState => ({
  id: r.id,
  iban: r.iban,
  holderName: r.holder_name,
  taxId: r.tax_id,
  bankName: r.bank_name ?? "",
  status: r.status,
});

async function loadVerifiedBank(authorId: string): Promise<BankAccountState | null> {
  const { data } = await admin.from("author_bank_accounts").select("*").eq("author_id", authorId).eq("status", "verified").maybeSingle();
  return data ? toBank(data) : null;
}

// deno-lint-ignore no-explicit-any
const toAccount = (r: any): AccountState => ({
  authorId: r.author_id,
  pending: Number(r.pending_kop),
  available: Number(r.available_kop),
  reserved: Number(r.reserved_kop),
  debt: Number(r.debt_kop),
  inFlight: Number(r.in_flight_kop),
  lifetimeEarnings: Number(r.lifetime_earnings_kop),
  totalPaidOut: Number(r.total_paid_out_kop),
  totalRefunded: Number(r.total_refunded_kop),
  status: r.account_status,
  adminHold: r.admin_hold,
  salesSuspended: r.sales_suspended,
  lastMeaningfulActivityAt: r.last_meaningful_activity_at,
  warningAt: r.warning_at,
  reminderSentAt: r.reminder_sent_at,
  version: r.version,
});

async function loadAccount(authorId: string): Promise<AccountState> {
  const { data } = await admin.from("author_financial_accounts").select("*").eq("author_id", authorId).maybeSingle();
  return data ? toAccount(data) : emptyAccount(authorId);
}

async function loadDebts(authorId: string): Promise<DebtState[]> {
  const { data } = await admin.from("author_debts").select("*").eq("author_id", authorId).eq("status", "open");
  return (data ?? []).map((d) => ({
    id: d.id,
    originalKop: Number(d.original_kop),
    outstandingKop: Number(d.outstanding_kop),
    status: d.status,
    createdAt: d.created_at,
  }));
}

// deno-lint-ignore no-explicit-any
const toPayment = (p: any): PaymentState => ({
  id: p.id,
  purchaseId: p.purchase_id,
  authorId: p.author_id,
  buyerId: p.buyer_id,
  amountKop: Number(p.amount_kop),
  feeKop: Number(p.fee_kop ?? 0),
  grossKop: p.gross_kop == null ? undefined : Number(p.gross_kop),
  authorKop: Number(p.author_kop),
  sensoriaKop: Number(p.sensoria_kop),
  pendingKop: Number(p.pending_kop),
  holdUntil: p.hold_until,
  refundedKop: Number(p.refunded_kop),
  authorRefundedKop: Number(p.author_refunded_kop),
  sensoriaRefundedKop: Number(p.sensoria_refunded_kop),
  feeRefundedKop: Number(p.fee_refunded_kop ?? 0),
  disputed: !!p.disputed,
});

// deno-lint-ignore no-explicit-any
const toReserve = (r: any): ReserveState => ({
  id: r.id,
  paymentId: r.payment_id,
  reservedKop: Number(r.reserved_kop),
  releasedKop: Number(r.released_kop),
  usedKop: Number(r.used_kop),
  releaseAt: r.release_at,
});

async function loadPaymentsFor(authorId: string): Promise<PaymentState[]> {
  const { data } = await admin.from("finance_payments").select("*").eq("author_id", authorId).gt("pending_kop", 0);
  return (data ?? []).map(toPayment);
}
async function loadReservesFor(authorId: string): Promise<ReserveState[]> {
  const { data } = await admin.from("refund_reserves").select("*").eq("author_id", authorId).eq("status", "held");
  return (data ?? []).map(toReserve);
}

// ── applying plans ──────────────────────────────────────────────────────────

/** Rebuilds the plan from fresh state and retries when the account changed in between. */
async function applyWithRetry(build: () => Promise<Plan | null>, actor: string | null): Promise<Plan | null> {
  for (let i = 0; i < 4; i += 1) {
    const plan = await build();
    if (!plan) return null;
    const { error } = await admin.rpc("finance_apply", { p: plan, p_actor: actor });
    if (!error) return plan;
    const msg = String(error.message);
    if (msg.includes("finance_version_conflict")) continue;
    if (msg.includes("finance_duplicate")) throw new FinanceError("duplicate", "Цю операцію вже виконано.");
    throw new Error(msg);
  }
  throw new FinanceError("busy", "Баланс зараз оновлюється, повторіть спробу.");
}

// ── emails ──────────────────────────────────────────────────────────────────

async function sendPendingEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";
  const { data: rows } = await admin
    .from("financial_notifications")
    .select("id, author_id, message, event_type")
    .eq("delivery_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const n of rows ?? []) {
    const { data: prof } = await admin.from("profiles").select("email").eq("id", n.author_id).maybeSingle();
    let status: "sent" | "skipped" | "failed" = "skipped";
    if (key && prof?.email) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: prof.email, subject: "Sensoria: фінансове сповіщення", text: n.message }),
        });
        status = res.ok ? "sent" : "failed";
      } catch {
        status = "failed";
      }
    }
    await admin.from("financial_notifications").update({ delivery_status: status }).eq("id", n.id);
    out[status] += 1;
  }
  return out;
}

// ── cron ────────────────────────────────────────────────────────────────────

async function runJobs() {
  const settings = await loadSettings();
  const now = nowIso();
  const res = { released: 0, inactivity: 0, autoPayouts: 0, distributed: 0, emails: { sent: 0, skipped: 0, failed: 0 }, errors: [] as string[] };

  // 1) holds and reserves that expired
  const authors = new Set<string>();
  const { data: due } = await admin.from("finance_payments").select("author_id").gt("pending_kop", 0).eq("disputed", false).lte("hold_until", now);
  for (const r of due ?? []) authors.add(r.author_id);
  const { data: dueRes } = await admin.from("refund_reserves").select("author_id").eq("status", "held").lte("release_at", now);
  for (const r of dueRes ?? []) authors.add(r.author_id);
  for (const authorId of authors) {
    try {
      const plan = await applyWithRetry(async () => {
        const [account, debts, payments, reserves] = await Promise.all([loadAccount(authorId), loadDebts(authorId), loadPaymentsFor(authorId), loadReservesFor(authorId)]);
        return planRelease({ settings, now, account, debts, payments, reserves });
      }, null);
      if (plan) res.released += 1;
    } catch (e) {
      res.errors.push(`release ${authorId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 2) debtors who went quiet
  const { data: debtors } = await admin
    .from("author_financial_accounts")
    .select("author_id, created_at")
    .gt("debt_kop", 0)
    .in("account_status", ["DEBT", "INACTIVE_WITH_DEBT", "WARNING"]);
  for (const d of debtors ?? []) {
    try {
      const plan = await applyWithRetry(async () => {
        const account = await loadAccount(d.author_id);
        return planInactivity({ settings, now, account, fallbackSince: d.created_at });
      }, null);
      if (plan) res.inactivity += 1;
    } catch (e) {
      res.errors.push(`inactivity ${d.author_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 3) automatic payouts: the available balance, once the minimum is reached, to the VERIFIED account
  if (settings.autoPayout) {
    const { data: rich } = await admin
      .from("author_financial_accounts")
      .select("author_id")
      .gt("available_kop", 0)
      .eq("debt_kop", 0);
    for (const r of rich ?? []) {
      try {
        const { data: open } = await admin.from("payouts").select("id").eq("author_id", r.author_id).in("payout_status", ["requested", "processing"]).limit(1);
        const bankAccount = await loadVerifiedBank(r.author_id);
        const plan = await applyWithRetry(async () => planAutoPayout({
          settings, now, account: await loadAccount(r.author_id), payoutId: uuid(), bankAccount, hasOpenPayout: (open?.length ?? 0) > 0,
        }), null);
        if (plan) res.autoPayouts += 1;
      } catch (e) {
        res.errors.push(`auto payout ${r.author_id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // 4) execution of auto-distribution orders. TEST mode: simulated bank confirmation.
  //    LIVE mode: orders wait for the banking layer (split/mass payout), nothing is marked paid here.
  const { data: modeRow } = await admin.from("finance_settings").select("mode").eq("id", 1).single();
  if (settings.autoPayout && (modeRow?.mode ?? "test") === "test") {
    const { data: orders } = await admin.from("payouts").select("*").eq("is_auto", true).eq("payout_status", "requested").limit(200);
    for (const po of orders ?? []) {
      try {
        await applyWithRetry(async () => planPayoutConfirm({
          now, account: await loadAccount(po.author_id), payoutId: po.id, amountKop: Number(po.amount_kop),
          reference: `TEST-DISTRIBUTION-${String(po.id).slice(0, 8)}`, adminId: "system",
          payoutBankAccountId: po.bank_account_id, currentBankAccountId: (await loadVerifiedBank(po.author_id))?.id ?? null,
        }), null);
        res.distributed += 1;
      } catch (e) {
        res.errors.push(`distribution ${po.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  res.emails = await sendPendingEmails();
  return res;
}

// ── admin helpers ───────────────────────────────────────────────────────────


async function authorOverview(authorId: string) {
  const [acc, debts, ledger, payouts, notes, activity, statusLog, payments, reserves] = await Promise.all([
    admin.from("author_financial_accounts").select("*").eq("author_id", authorId).maybeSingle(),
    admin.from("author_debts").select("*").eq("author_id", authorId).order("created_at", { ascending: false }),
    admin.from("ledger_entries").select("*").eq("author_id", authorId).order("id", { ascending: false }).limit(150),
    admin.from("payouts").select("*").eq("author_id", authorId).order("requested_at", { ascending: false }).limit(30),
    admin.from("financial_notifications").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("author_activity").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(20),
    admin.from("author_status_log").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("finance_payments").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("refund_reserves").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
  ]);
  const { data: prof } = await admin.from("profiles").select("id, name, email").eq("id", authorId).maybeSingle();
  return {
    profile: prof,
    account: acc.data,
    debts: debts.data ?? [],
    ledger: ledger.data ?? [],
    payouts: payouts.data ?? [],
    notifications: notes.data ?? [],
    activity: activity.data ?? [],
    statusLog: statusLog.data ?? [],
    payments: payments.data ?? [],
    reserves: reserves.data ?? [],
  };
}

// ── monobank (split payments) ───────────────────────────────────────────────
// The buyer pays on monobank's page; monobank splits the money between the author's and Sensoria's FOP.
// A purchase and its ledger entries are created ONLY here, after a webhook with a valid signature
// (or a status check against the bank) says `success`. The amount and the order are never taken from the browser.
// Secrets: MONO_TOKEN (test token from api.monobank.ua first), SITE_URL (default https://sensoria.courses).

const MONO_API = "https://api.monobank.ua";
const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://sensoria.courses").replace(/\/+$/, "");
const allowedOrigins = () => [siteUrl(), "https://www.sensoria.courses", "http://localhost:5173", "http://127.0.0.1:5173"];

async function monoCall(path: string, body?: unknown) {
  const token = Deno.env.get("MONO_TOKEN");
  if (!token) throw new FinanceError("payments_not_configured", "Оплату ще не підключено.");
  const res = await fetch(`${MONO_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Token": token, "X-Cms": MONO_CMS_NAME, "X-Cms-Version": "1", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    console.error("monobank", path, res.status, text.slice(0, 500));
    throw new FinanceError("mono_error", `Банк не прийняв запит (${res.status}). Спробуйте пізніше.`);
  }
  return data;
}

let cachedPubkey: string | null = null;
async function monoPubkey(force = false): Promise<string> {
  if (!cachedPubkey || force) cachedPubkey = (await monoCall("/api/merchant/pubkey"))?.key ?? null;
  return cachedPubkey ?? "";
}
async function verifyMonoWebhook(raw: string, sign: string | null): Promise<boolean> {
  if (await verifyWebhookSignature(raw, sign, await monoPubkey())) return true;
  return await verifyWebhookSignature(raw, sign, await monoPubkey(true)); // the bank may have rotated its key
}

interface MonoRow {
  id: string; buyer_id: string; content_id: string; author_id: string;
  amount_kop: number; author_kop: number; sensoria_kop: number; sale_source: SaleSource;
  mono_invoice_id: string | null; page_url: string | null; status: string; mono_modified: string | null;
  mode: "test" | "live";
}

async function monoCheckout(userId: string, payload: Record<string, unknown>) {
  const contentId = String(payload.contentId ?? "");
  const { data: content } = await admin.from("content").select("id, author_id, title, price, status, sale_status").eq("id", contentId).maybeSingle();
  if (!content || content.status !== "published") throw new FinanceError("not_for_sale", "Цей матеріал недоступний для купівлі.");
  if (content.sale_status && !["published", "restored"].includes(content.sale_status)) throw new FinanceError("not_for_sale", "Продаж цього матеріалу тимчасово призупинено.");
  if (content.author_id === userId) throw new FinanceError("own_content", "Власний матеріал купувати не потрібно.");
  const amountKop = Math.round(Number(content.price) * 100);
  if (!Number.isFinite(amountKop) || amountKop <= 0) throw new FinanceError("free", "Цей матеріал безкоштовний: оплата не потрібна.");
  const { data: owned } = await admin.from("purchases").select("id").eq("participant_id", userId).eq("content_id", content.id).eq("status", "completed").limit(1);
  if (owned?.length) throw new FinanceError("already_bought", "Ви вже придбали цей матеріал.");

  // the same unpaid invoice is reused for 50 minutes: a double click or a reload never creates a second one
  const since = new Date(Date.now() - 50 * 60_000).toISOString();
  const { data: open } = await admin.from("mono_invoices").select("id, page_url, amount_kop").eq("buyer_id", userId).eq("content_id", content.id)
    .in("status", ["created", "processing"]).not("page_url", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (open?.[0] && Number(open[0].amount_kop) === amountKop) return { pageUrl: open[0].page_url as string, ref: open[0].id as string, reused: true };

  const settings = await loadSettings();
  const { data: cfg } = await admin.from("finance_settings").select("mode, mono_sensoria_receiver_id").eq("id", 1).single();
  const mode: "test" | "live" = cfg?.mode === "live" ? "live" : "test";
  const { data: rcv } = await admin.from("author_mono_receivers").select("receiver_id").eq("author_id", content.author_id).maybeSingle();
  // referral rate only on the server's own record of the buyer's click (never from the client)
  const { data: attr } = await admin.from("referral_attributions").select("created_at").eq("buyer_id", userId).eq("author_id", content.author_id).maybeSingle();
  const source = pickSaleSource(attr?.created_at ?? null, nowIso());
  const { authorKop, sensoriaKop } = splitAmount(amountKop, settings, source);

  const ref = uuid();
  const requested = String(payload.origin ?? "");
  const origin = allowedOrigins().includes(requested) ? requested : siteUrl();
  const body = buildInvoiceBody({
    amountKop, authorKop, sensoriaKop, title: content.title, contentCode: content.id,
    authorReceiverId: rcv?.receiver_id ?? "", sensoriaReceiverId: cfg?.mono_sensoria_receiver_id ?? "",
    reference: ref, redirectUrl: `${origin}/payment-result?pay=${ref}`, webHookUrl: `${SUPABASE_URL}/functions/v1/finance?hook=mono`,
  });

  const { error: insErr } = await admin.from("mono_invoices").insert({
    id: ref, buyer_id: userId, content_id: content.id, author_id: content.author_id,
    amount_kop: amountKop, author_kop: authorKop, sensoria_kop: sensoriaKop, sale_source: source, mode,
  });
  if (insErr) throw new Error(insErr.message);
  try {
    const inv = await monoCall("/api/merchant/invoice/create", body);
    if (!inv?.invoiceId || !inv?.pageUrl) throw new FinanceError("mono_error", "Банк не повернув посилання на оплату.");
    await admin.from("mono_invoices").update({ mono_invoice_id: inv.invoiceId, page_url: inv.pageUrl, updated_at: nowIso() }).eq("id", ref);
    return { pageUrl: inv.pageUrl as string, ref };
  } catch (e) {
    await admin.from("mono_invoices").update({ status: "failure", review_reason: "invoice_create_failed", updated_at: nowIso() }).eq("id", ref);
    throw e;
  }
}

async function recordPaid(row: MonoRow, p: Record<string, unknown>) {
  const { error: pErr } = await admin.from("purchases").upsert(
    { id: row.id, participant_id: row.buyer_id, content_id: row.content_id, amount: Number((row.amount_kop / 100).toFixed(2)), status: "completed", purchased_at: nowIso() },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (pErr) throw new Error(pErr.message);
  const { data: content } = await admin.from("content").select("title, kind").eq("id", row.content_id).maybeSingle();
  // the paid material shows up in «Моє навчання» (the same table free materials go to)
  if (content?.kind) {
    const { error: aErr } = await admin.from("acquired_content").upsert(
      { user_id: row.buyer_id, kind: content.kind, content_id: row.content_id },
      { onConflict: "user_id,kind,content_id", ignoreDuplicates: true },
    );
    if (aErr) throw new Error(aErr.message);
  }
  const settings = await loadSettings();
  const expected = splitAmount(row.amount_kop, settings, row.sale_source);
  if (expected.authorKop !== Number(row.author_kop)) {
    // settings changed between the invoice and the payment: the bank already split by the invoice, so the books need a human look
    await admin.from("finance_audit_log").insert({
      administrator_id: null, action: "mono_split_mismatch", entity_type: "payment", entity_id: row.id, reason: "Частки в рахунку банку відрізняються від поточних налаштувань",
      previous_value: { authorKop: row.author_kop, sensoriaKop: row.sensoria_kop }, new_value: { authorKop: expected.authorKop, sensoriaKop: expected.sensoriaKop },
    });
  }
  await applyWithRetry(async () => {
    const [account, debts] = await Promise.all([loadAccount(row.author_id), loadDebts(row.author_id)]);
    return planPaymentReceived({
      settings, now: nowIso(), account, debts,
      purchase: { purchaseId: row.id, authorId: row.author_id, buyerId: row.buyer_id, amountKop: row.amount_kop, contentId: row.content_id, contentTitle: content?.title ?? "", source: row.sale_source },
      paymentId: uuid(), reserveId: uuid(), externalReference: String(p.invoiceId ?? row.mono_invoice_id ?? "").slice(0, 120), mode: row.mode,
    });
  }, null).catch((e) => {
    if (e instanceof FinanceError && e.code === "duplicate") return null; // the same payment was already recorded
    throw e;
  });
}

async function recordReversal(row: MonoRow) {
  const { data: pay } = await admin.from("finance_payments").select("*").eq("purchase_id", row.id).maybeSingle();
  if (!pay) return;
  await applyWithRetry(async () => {
    const [account, fresh, reserveRows] = await Promise.all([
      loadAccount(row.author_id),
      admin.from("finance_payments").select("*").eq("id", pay.id).single(),
      admin.from("refund_reserves").select("*").eq("payment_id", pay.id).limit(1),
    ]);
    const payment = toPayment(fresh.data);
    const amountKop = payment.amountKop - payment.refundedKop;
    if (amountKop <= 0) return null; // already refunded in the books
    return planRefund({
      now: nowIso(), account, payment, reserve: reserveRows.data?.[0] ? toReserve(reserveRows.data[0]) : null,
      refundId: uuid(), debtId: uuid(), idempotencyKey: `mono-reversed:${row.id}`, amountKop, kind: "full", reason: "Повернення коштів через monobank",
    });
  }, null).catch((e) => {
    if (e instanceof FinanceError && e.code === "duplicate") return null;
    throw e;
  });
  await admin.from("purchases").update({ status: "refunded" }).eq("id", row.id);
}

/** One place for webhooks and status checks. Throws on a real failure so that the bank retries the webhook. */
async function applyMonoStatus(row: MonoRow, p: Record<string, unknown>): Promise<{ applied: boolean; reason?: string }> {
  const status = parseStatus(p.status);
  if (!status) return { applied: false, reason: "unknown_status" };
  const modified = typeof p.modifiedDate === "string" ? p.modifiedDate : undefined;
  if (!isNewer(modified, row.mono_modified)) return { applied: false, reason: "stale" };
  if (typeof p.amount === "number" && p.amount !== Number(row.amount_kop)) {
    await admin.from("mono_invoices").update({ status: "needs_review", review_reason: "amount_mismatch", updated_at: nowIso() }).eq("id", row.id);
    return { applied: false, reason: "amount_mismatch" };
  }
  const effect = effectOf(status);
  if (effect === "paid") await recordPaid(row, p);
  if (effect === "reversed") await recordReversal(row);
  await admin.from("mono_invoices").update({ status, mono_modified: modified ?? row.mono_modified, updated_at: nowIso() }).eq("id", row.id);
  return { applied: true };
}

async function handleMonoWebhook(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!(await verifyMonoWebhook(raw, req.headers.get("x-sign")))) return json({ error: "bad_signature" }, 403);
  let p: Record<string, unknown>;
  try { p = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  const invoiceId = String(p.invoiceId ?? "");
  let { data: row } = await admin.from("mono_invoices").select("*").eq("mono_invoice_id", invoiceId).maybeSingle();
  if (!row && typeof p.reference === "string") {
    row = (await admin.from("mono_invoices").select("*").eq("id", p.reference).maybeSingle()).data;
    if (row && invoiceId) await admin.from("mono_invoices").update({ mono_invoice_id: invoiceId }).eq("id", row.id);
  }
  if (!row) return json({ ok: true, ignored: "unknown_invoice" }); // not ours: answer 200 so the bank stops retrying
  const out = await applyMonoStatus(row as MonoRow, p);
  return json({ ok: true, ...out });
}

/** The buyer's return page asks here; if the webhook is late, the bank is asked directly. */
async function monoStatusFor(userId: string, ref: string) {
  const { data: row } = await admin.from("mono_invoices").select("*").eq("id", ref).eq("buyer_id", userId).maybeSingle();
  if (!row) throw new FinanceError("no_invoice", "Оплату не знайдено.");
  let cur = row as MonoRow;
  if (["created", "processing", "hold"].includes(cur.status) && cur.mono_invoice_id) {
    const bank = await monoCall(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(cur.mono_invoice_id)}`);
    if (bank) {
      await applyMonoStatus(cur, bank);
      cur = (await admin.from("mono_invoices").select("*").eq("id", ref).single()).data as MonoRow;
    }
  }
  return { status: cur.status, purchaseId: cur.status === "success" ? cur.id : null, contentId: cur.content_id };
}

/** A full refund of a payment made through monobank goes back to the buyer's card first; only then the books change. */
async function monoCancelIfNeeded(purchaseId: string, kind: RefundKind, requestKey: string) {
  if (kind === "chargeback") return; // the bank already took the money
  const { data: inv } = await admin.from("mono_invoices").select("mono_invoice_id, status").eq("id", purchaseId).maybeSingle();
  if (!inv || inv.status !== "success" || !inv.mono_invoice_id) return; // not a monobank payment (e.g. a TEST confirmation)
  if (kind !== "full") throw new FinanceError("mono_partial_refund", "Часткове повернення через банк ще не підтримується: зверніться до розробника.");
  const res = await monoCall("/api/merchant/invoice/cancel", { invoiceId: inv.mono_invoice_id, extRef: requestKey.slice(0, 60) });
  if (res?.status === "failure") throw new FinanceError("mono_cancel_failed", "Банк відхилив повернення коштів.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // monobank webhook: no user, authenticated only by the bank's signature
  if (new URL(req.url).searchParams.get("hook") === "mono") {
    try {
      return await handleMonoWebhook(req);
    } catch (e) {
      console.error("mono webhook", e);
      return json({ error: "server_error" }, 500); // not 200: the bank will retry
    }
  }

  try {
    const payload = await req.json().catch(() => null);
    const action = payload?.action as string | undefined;
    if (!action) return json({ error: "bad_request" }, 400);

    // ── cron ──
    if (action === "runJobs") {
      const secret = Deno.env.get("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
      return json(await runJobs());
    }

    // ── who is calling ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Не авторизовано." }, 401);
    const user = userData.user;
    const { data: prof } = await admin.from("profiles").select("id, role, is_admin, admin_role").eq("id", user.id).single();

    // ── any signed-in user: pay for a material on monobank ──
    if (action === "monoCheckout") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      return json({ ok: true, ...(await monoCheckout(user.id, payload)) });
    }
    if (action === "monoStatus") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      return json({ ok: true, ...(await monoStatusFor(user.id, String(payload.ref ?? ""))) });
    }

    // ── an author's own actions ──
    if (action === "touchActivity" || action === "requestPayout" || action === "markNotificationsRead" || action === "saveBankAccount") {
      if (prof?.role !== "author") return json({ error: "Лише для авторів." }, 403);
      const settings = await loadSettings();

      if (action === "touchActivity") {
        const type = String(payload.type ?? "");
        if (!isMeaningful(type)) return json({ ok: true, counted: false });
        const plan = await applyWithRetry(async () => {
          const account = await loadAccount(user.id);
          return planActivity({ now: nowIso(), account, type });
        }, null);
        if (plan) await admin.from("author_activity").insert({ author_id: user.id, activity_type: type, is_meaningful: true });
        return json({ ok: true, counted: !!plan });
      }

      if (action === "markNotificationsRead") {
        await admin.from("financial_notifications").update({ read_at: nowIso() }).eq("author_id", user.id).is("read_at", null);
        // reading the notifications is itself meaningful activity
        await applyWithRetry(async () => planActivity({ now: nowIso(), account: await loadAccount(user.id), type: "ack_notification" }), null);
        return json({ ok: true });
      }

      if (action === "saveBankAccount") {
        const ibanCheck = validateUaIban(String(payload.iban ?? ""));
        if (!ibanCheck.ok) throw new FinanceError("bad_iban", ibanCheck.error);
        const holderName = String(payload.holderName ?? "").trim().replace(/\s+/g, " ");
        const taxId = String(payload.taxId ?? "").replace(/\s+/g, "");
        const bankName = String(payload.bankName ?? "").trim().slice(0, 80);
        if (holderName.length < 5) throw new FinanceError("bad_holder", "Вкажіть ПІБ власника рахунку повністю, як у банку.");
        if (!validateTaxId(taxId)) throw new FinanceError("bad_tax_id", "РНОКПП має містити 10 цифр (ЄДРПОУ — 8).");
        const { data: same } = await admin.from("author_bank_accounts").select("id, status, holder_name, tax_id").eq("author_id", user.id).eq("iban", ibanCheck.iban).in("status", ["pending", "verified"]).maybeSingle();
        if (same && same.holder_name === holderName && same.tax_id === taxId) return json({ ok: true, id: same.id, status: same.status, unchanged: true });
        // a newer request replaces the previous pending one; a verified account keeps working until the new one is verified
        await admin.from("author_bank_accounts").update({ status: "rejected", reject_reason: "Замінено новішим запитом автора" }).eq("author_id", user.id).eq("status", "pending");
        const { data: ins, error: insErr } = await admin
          .from("author_bank_accounts")
          .insert({ author_id: user.id, iban: ibanCheck.iban, bank_name: bankName, holder_name: holderName, tax_id: taxId })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        await admin.from("finance_audit_log").insert({ administrator_id: null, action: "bank_account_submitted", entity_type: "author", entity_id: user.id, reason: "Автор вказав банківський рахунок", previous_value: null, new_value: { accountId: ins.id, iban: `••••${ibanCheck.iban.slice(-4)}` } });
        return json({ ok: true, id: ins.id, status: "pending" });
      }

      if (settings.autoPayout) throw new FinanceError("auto_only", "Виплати відбуваються автоматично після періоду підтвердження — запит не потрібен.");
      // requestPayout: always to the author's VERIFIED account, never to anything typed in the request
      const amountKop = Number(payload.amountKop);
      const bankAccount = await loadVerifiedBank(user.id);
      const payoutId = uuid();
      await applyWithRetry(async () => planPayoutRequest({ settings, now: nowIso(), account: await loadAccount(user.id), payoutId, amountKop, bankAccount }), user.id);
      return json({ ok: true, payoutId });
    }

    // ── administrators ──
    if (!prof?.is_admin) return json({ error: "Доступ лише для команди Sensoria." }, 403);
    const adminRole = prof.admin_role === "support" ? "support" : "owner";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    let aal = "aal1";
    try {
      aal = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1";
    } catch { /* keep aal1 */ }
    if (!(Deno.env.get("ADMIN_REQUIRE_2FA") === "false" || aal === "aal2")) {
      return json({ error: "Потрібна двофакторна автентифікація." }, 403);
    }
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    const settings = await loadSettings();

    // reads (owner and support)
    if (action === "overview") {
      const [{ data: totals }, { data: bad }, { data: accounts }, { data: pend }, { count: ntest }] = await Promise.all([
        admin.rpc("finance_totals"),
        admin.rpc("finance_verify"),
        admin.from("author_financial_accounts").select("author_id, account_status, debt_kop"),
        admin.from("payouts").select("id").eq("payout_status", "requested"),
        admin.from("finance_payments").select("id", { count: "exact", head: true }).eq("mode", "test"),
      ]);
      const list = accounts ?? [];
      return json({
        mode: (await admin.from("finance_settings").select("mode").eq("id", 1).single()).data?.mode ?? "test",
        settings,
        totals,
        mismatches: bad ?? [],
        authorsWithDebt: list.filter((a) => Number(a.debt_kop) > 0).length,
        authorsSuspended: list.filter((a) => ["SALES_SUSPENDED", "DEBT_COLLECTION"].includes(a.account_status)).length,
        pendingPayouts: (pend ?? []).length,
        pendingBankAccounts: (await admin.from("author_bank_accounts").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0,
        testPayments: ntest ?? 0,
        role: adminRole,
      });
    }
    if (action === "authors") {
      const { data: accounts } = await admin.from("author_financial_accounts").select("*").order("debt_kop", { ascending: false }).limit(300);
      const ids = (accounts ?? []).map((a) => a.author_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
      // deno-lint-ignore no-explicit-any
      const byId = new Map<string, any>((profs ?? []).map((p: { id: string }) => [p.id, p]));
      return json({ authors: (accounts ?? []).map((a) => ({ ...a, name: byId.get(a.author_id)?.name ?? "—", email: byId.get(a.author_id)?.email ?? "" })) });
    }
    if (action === "author") return json(await authorOverview(String(payload.authorId)));
    if (action === "verify") return json({ mismatches: (await admin.rpc("finance_verify")).data ?? [] });
    if ((action === "bankAccounts" || action === "payoutRegistry") && adminRole !== "owner") {
      return json({ error: "Банківські реквізити авторів доступні лише власнику." }, 403);
    }
    if (action === "bankAccounts") {
      const { data: rows } = await admin.from("author_bank_accounts").select("*").in("status", ["pending"]).order("created_at", { ascending: true }).limit(100);
      const ids = (rows ?? []).map((r) => r.author_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
      // deno-lint-ignore no-explicit-any
      const byId = new Map<string, any>((profs ?? []).map((p: { id: string }) => [p.id, p]));
      return json({
        accounts: (rows ?? []).map((r) => ({
          ...r,
          authorName: byId.get(r.author_id)?.name ?? "—",
          authorEmail: byId.get(r.author_id)?.email ?? "",
          holderMatches: holderLooksLikeAuthor(r.holder_name, byId.get(r.author_id)?.name ?? ""),
        })),
      });
    }
    if (action === "payoutRegistry") {
      // A file for the bank client's bulk-payment import. The order is built from each payout's own snapshot of the verified account.
      const { data: rows } = await admin.from("payouts").select("*").eq("payout_status", "requested").order("requested_at", { ascending: true });
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [["payout_id", "amount_uah", "iban", "holder", "tax_id", "purpose"].join(";")];
      for (const r of rows ?? []) {
        lines.push([
          r.id, (Number(r.amount_kop) / 100).toFixed(2), r.destination_iban, esc(r.destination_holder), r.destination_tax_id,
          esc(`Авторська винагорода Sensoria, виплата ${String(r.id).slice(0, 8)}`),
        ].join(";"));
      }
      return json({ count: rows?.length ?? 0, csv: lines.join("\n"), totalKop: (rows ?? []).reduce((s, r) => s + Number(r.amount_kop), 0) });
    }
    if (action === "payoutQueue") {
      const { data } = await admin.from("payouts").select("*").in("payout_status", ["requested", "processing"]).order("requested_at", { ascending: true });
      return json({ payouts: data ?? [] });
    }

    // everything below changes money or statuses: owner only, with a reason
    if (adminRole !== "owner") return json({ error: "Фінансові дії доступні лише власнику." }, 403);
    const authorIdOf = async (table: string, id: string) => (await admin.from(table).select("author_id").eq("id", id).single()).data?.author_id as string;

    if (action === "confirmPayment") {
      const mode = (await admin.from("finance_settings").select("mode").eq("id", 1).single()).data?.mode ?? "test";
      if (mode !== "test") return json({ error: "live_not_ready", message: "Реальний режим недоступний: банківський шар ще не підключено." }, 400);
      const { data: pu } = await admin.from("purchases").select("id, participant_id, content_id, amount, status, purchased_at").eq("id", payload.purchaseId).single();
      if (!pu) throw new FinanceError("no_purchase", "Покупку не знайдено.");
      if (pu.status !== "completed") throw new FinanceError("bad_status", "Покупка не в статусі «completed».");
      const { data: content } = await admin.from("content").select("author_id, title").eq("id", pu.content_id).single();
      if (!content) throw new FinanceError("no_content", "Матеріал не знайдено.");
      const amountKop = Math.round(Number(pu.amount) * 100);
      if (settings.splitAtSource && !(await loadVerifiedBank(content.author_id as string))) {
        throw new FinanceError("author_no_bank", "У автора немає підтвердженого банківського рахунку: розподіл оплати неможливий.");
      }
      // referral rate only on the server's own record of the buyer's click (never from the client)
      const { data: attr } = await admin.from("referral_attributions").select("created_at")
        .eq("buyer_id", pu.participant_id).eq("author_id", content.author_id).maybeSingle();
      const source = pickSaleSource(attr?.created_at ?? null, pu.purchased_at);
      const plan = await applyWithRetry(async () => {
        const authorId = content.author_id as string;
        const [account, debts] = await Promise.all([loadAccount(authorId), loadDebts(authorId)]);
        return planPaymentReceived({
          settings, now: nowIso(), account, debts,
          purchase: { purchaseId: pu.id, authorId, buyerId: pu.participant_id, amountKop, contentId: pu.content_id, contentTitle: content.title, source },
          paymentId: uuid(), reserveId: uuid(), externalReference: String(payload.reference ?? "TEST").slice(0, 120), mode: "test",
        });
      }, user.id);
      return json({ ok: true, key: plan?.key });
    }

    if (action === "refund") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const requestKey = String(payload.requestKey ?? "");
      if (requestKey.length < 8) throw new FinanceError("no_key", "Бракує ключа запиту (захист від подвійного повернення).");
      const { data: pay } = await admin.from("finance_payments").select("*").eq(payload.paymentId ? "id" : "purchase_id", payload.paymentId ?? payload.purchaseId).single();
      if (!pay) throw new FinanceError("no_payment", "Платіж не знайдено: оплату ще не підтверджено.");
      const kind = (payload.kind as RefundKind) ?? "full";
      const authorId = pay.author_id as string;
      await monoCancelIfNeeded(pay.purchase_id as string, kind, requestKey);
      const plan = await applyWithRetry(async () => {
        const [account, fresh, reserveRows] = await Promise.all([
          loadAccount(authorId),
          admin.from("finance_payments").select("*").eq("id", pay.id).single(),
          admin.from("refund_reserves").select("*").eq("payment_id", pay.id).limit(1),
        ]);
        const payment = toPayment(fresh.data);
        const amountKop = kind === "partial" ? Number(payload.amountKop) : payment.amountKop - payment.refundedKop;
        return planRefund({
          now: nowIso(), account, payment, reserve: reserveRows.data?.[0] ? toReserve(reserveRows.data[0]) : null,
          refundId: uuid(), debtId: uuid(), idempotencyKey: requestKey, amountKop, kind, reason,
        });
      }, user.id);
      // a fully refunded order no longer gives the buyer access
      const after = (await admin.from("finance_payments").select("amount_kop, refunded_kop, purchase_id").eq("id", pay.id).single()).data;
      if (after && Number(after.refunded_kop) >= Number(after.amount_kop)) {
        await admin.from("purchases").update({ status: "refunded" }).eq("id", after.purchase_id);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: `refund_${kind}`, entity_type: "payment", entity_id: pay.id, reason, previous_value: null, new_value: { key: plan?.key } });
      return json({ ok: true });
    }

    if (action === "markDisputed") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const paymentId = String(payload.paymentId);
      const disputed = !!payload.disputed;
      const authorId = await authorIdOf("finance_payments", paymentId);
      const plan: Plan = {
        key: `dispute:${paymentId}:${disputed}:${nowIso()}`, kind: "DISPUTE", authorId, expectedVersion: null,
        lines: [], payments: [{ op: "update", row: { id: paymentId, disputed } }], debts: [], reserves: [], refunds: [], payouts: [],
        notifications: [], statusLog: [], audit: { action: disputed ? "payment_disputed" : "payment_dispute_closed", reason, previous: { disputed: !disputed }, next: { disputed } },
      };
      const { error } = await admin.rpc("finance_apply", { p: plan, p_actor: user.id });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "repayDebt") {
      const authorId = String(payload.authorId);
      const source = payload.source === "available" ? "available" : "cash";
      await applyWithRetry(async () => {
        const [account, debts] = await Promise.all([loadAccount(authorId), loadDebts(authorId)]);
        return planManualDebtRepayment({ now: nowIso(), account, debts, amountKop: Number(payload.amountKop), source, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()) });
      }, user.id);
      return json({ ok: true });
    }

    if (action === "setStatus") {
      const authorId = String(payload.authorId);
      await applyWithRetry(async () =>
        planAdminStatus({ now: nowIso(), account: await loadAccount(authorId), action: payload.statusAction, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()) }), user.id);
      return json({ ok: true });
    }

    if (action === "verifyBankAccount") {
      const approve = !!payload.approve;
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину (що саме ви перевірили).");
      const { data: acct } = await admin.from("author_bank_accounts").select("*").eq("id", payload.accountId).single();
      if (!acct || acct.status !== "pending") throw new FinanceError("bad_account", "Рахунок не знайдено або вже опрацьовано.");
      if (approve) {
        await admin.from("author_bank_accounts").update({ status: "replaced" }).eq("author_id", acct.author_id).eq("status", "verified");
        await admin.from("author_bank_accounts").update({ status: "verified", verified_by: user.id, verified_at: nowIso() }).eq("id", acct.id);
        // payout orders made for the OLD account can no longer be confirmed (see planPayoutConfirm)
      } else {
        await admin.from("author_bank_accounts").update({ status: "rejected", reject_reason: reason }).eq("id", acct.id);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: approve ? "bank_account_verified" : "bank_account_rejected", entity_type: "author", entity_id: acct.author_id, reason, previous_value: { status: "pending" }, new_value: { accountId: acct.id, iban: `••••${String(acct.iban).slice(-4)}`, holder: acct.holder_name } });
      await admin.from("financial_notifications").insert({
        author_id: acct.author_id, event_type: approve ? "BANK_ACCOUNT_VERIFIED" : "BANK_ACCOUNT_REJECTED", dedupe_key: `bank:${acct.id}:${approve}`,
        message: approve ? "Ваш банківський рахунок підтверджено: виплати надходитимуть на нього." : `Банківський рахунок не підтверджено. Причина: ${reason}`,
      });
      return json({ ok: true });
    }

    if (action === "bankFeeSettle") {
      const { data: totals } = await admin.rpc("finance_totals");
      await applyWithRetry(async () => planBankFeeSettlement({
        now: nowIso(), paidKop: Number(payload.paidKop), collectedLeftKop: Number(totals?.bank_fee_owed_kop ?? 0),
        moveSurplusToSensoria: !!payload.moveSurplus, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()),
      }), user.id);
      return json({ ok: true });
    }

    if (action === "payoutConfirm" || action === "payoutFail") {
      const payoutId = String(payload.payoutId);
      const { data: po } = await admin.from("payouts").select("*").eq("id", payoutId).single();
      if (!po || !["requested", "processing"].includes(po.payout_status)) throw new FinanceError("bad_payout", "Виплату не знайдено або вже опрацьовано.");
      const authorId = po.author_id as string;
      await applyWithRetry(async () => {
        const account = await loadAccount(authorId);
        return action === "payoutConfirm"
          ? planPayoutConfirm({
              now: nowIso(), account, payoutId, amountKop: Number(po.amount_kop), reference: String(payload.reference ?? ""), adminId: user.id,
              payoutBankAccountId: po.bank_account_id, currentBankAccountId: (await loadVerifiedBank(authorId))?.id ?? null,
            })
          : planPayoutFail({ now: nowIso(), account, payoutId, amountKop: Number(po.amount_kop), reason, adminId: user.id });
      }, user.id);
      return json({ ok: true });
    }

    if (action === "setSettings") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const next: Settings = { ...settings, ...(payload.settings ?? {}) };
      checkSettings(next);
      await admin.from("finance_settings").update({
        author_bps: next.authorBps, commission_bps: next.commissionBps, referral_commission_bps: next.referralCommissionBps, hold_days: next.holdDays, reserve_bps: next.reserveBps,
        reserve_days: next.reserveDays, inactivity_days: next.inactivityDays, warning_grace_days: next.warningGraceDays,
        reminder_days: next.reminderDays, min_payout_kop: next.minPayoutKop, bank_fee_bps: next.bankFeeBps,
        bank_fee_fixed_kop: next.bankFeeFixedKop, auto_payout: !!next.autoPayout, split_at_source: !!next.splitAtSource,
        ...(payload.sensoriaIban !== undefined ? { sensoria_iban: String(payload.sensoriaIban).replace(/\s+/g, "") || null, sensoria_account_holder: String(payload.sensoriaHolder ?? "").trim() || null } : {}),
        updated_at: nowIso(),
      }).eq("id", 1);
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "settings_changed", entity_type: "settings", entity_id: "1", reason, previous_value: settings, new_value: next });
      return json({ ok: true, settings: next });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    if (e instanceof FinanceError || e instanceof MonoError) return json({ error: e.code, message: e.message }, 400);
    return json({ error: "server_error", message: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
