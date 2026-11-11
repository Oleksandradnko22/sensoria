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
