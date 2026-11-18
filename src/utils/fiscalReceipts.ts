// Fiscal receipts (ПРРО): pure helpers, no network and no secrets. Copied into the finance Edge Function
// by scripts/build-finance.mjs and covered by unit tests.
//
// Model (docs/legal/internal/accountant-dps-review-2026-11-18.md, В1 і В3):
//  * the AUTHOR is the seller: a receipt on the author's PRRO for the FULL amount the buyer paid, to the buyer;
//    a promo-code discount is a discount line, so the receipt equals the bank's amount to the kopeck;
//  * SENSORIA, until a tax consultation (ІПК) says otherwise, also fiscalizes its own tariff on its own PRRO
//    (flag finance_settings.sensoria_fee_fiscal): a receipt for the tariff, to the AUTHOR (the customer of the service);
//  * a refund gives a return receipt for each sale receipt;
//  * a receipt is formed right after the bank confirms the payment. No "next working day": the cash service's
//    offline mode covers outages, the queue only retries.

export type FiscalIssuer = "author" | "sensoria";
export type FiscalKind = "sale" | "return";

export class FiscalError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Card details a receipt needs for a card payment, as monobank gives them in `paymentInfo`. */
export interface CardDetails {
  maskedPan: string | null;
  approvalCode: string | null;
  rrn: string | null;
  paymentSystem: string | null;
  tranId: string | null;
}

export const ACQUIRER_NAME = "АТ «УНІВЕРСАЛ БАНК»";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

export function cardDetailsOf(paymentInfo: unknown): CardDetails {
  const p = (paymentInfo ?? {}) as Record<string, unknown>;
  return { maskedPan: str(p.maskedPan), approvalCode: str(p.approvalCode), rrn: str(p.rrn), paymentSystem: str(p.paymentSystem), tranId: str(p.tranId) };
}

/** A receipt for a card payment must carry the card mask and an authorization reference. */
export const cardComplete = (c: CardDetails) => !!c.maskedPan && !!(c.approvalCode || c.rrn);

/** 8 upper-case characters of an id: the same order code the bank shows in `destination`. */
export const code8 = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

/** Neutral on purpose: a title may reveal health information; the code identifies the material. */
export const authorItemName = (contentId: string) => `Доступ до цифрового освітнього матеріалу, код ${code8(contentId)}`;
export const sensoriaItemName = (invoiceId: string) => `Послуги технічного характеру Платформи Sensoria за замовленням № ${code8(invoiceId)}`;

export interface ReceiptDraft {
  issuer: FiscalIssuer;
  kind: FiscalKind;
  /** who gets the receipt: the buyer (author's sale) or the author (Sensoria's tariff) */
  deliverTo: "buyer" | "author";
  itemCode: string;
  itemName: string;
  /** price of the item before the discount, kopecks */
  priceKop: number;
  discountKop: number;
  /** what the receipt says was paid / returned: priceKop − discountKop */
  amountKop: number;
}

export interface ReceiptInput {
  kind: FiscalKind;
  invoiceId: string;
  contentId: string;
  /** the price without the promo discount (null/undefined: no discount) */
  listKop?: number | null;
  /** what the bank charged */
  amountKop: number;
  /** Sensoria's tariff in this payment */
  sensoriaKop: number;
  /** finance_settings.sensoria_fee_fiscal */
  feeFiscal: boolean;
}

const isKop = (n: number) => Number.isInteger(n) && n >= 0;

/** The receipts one payment (or its full refund) needs. Never invents money: every check fails loudly. */
export function plannedReceipts(i: ReceiptInput): ReceiptDraft[] {
  const listKop = i.listKop ?? i.amountKop;
  if (![listKop, i.amountKop, i.sensoriaKop].every(isKop)) throw new FiscalError("bad_amount", "Суми мають бути цілими невід'ємними числами (копійки).");
  if (i.amountKop <= 0) throw new FiscalError("bad_amount", "Сума чека має бути більшою за нуль.");
  if (listKop < i.amountKop) throw new FiscalError("bad_amount", "Ціна без знижки менша за сплачену суму.");
  if (i.sensoriaKop > i.amountKop) throw new FiscalError("bad_amount", "Тариф Sensoria більший за суму оплати.");
  if (!i.invoiceId || !i.contentId) throw new FiscalError("bad_input", "Немає ідентифікатора замовлення або матеріалу.");
  const out: ReceiptDraft[] = [
    {
      issuer: "author", kind: i.kind, deliverTo: "buyer", itemCode: code8(i.contentId), itemName: authorItemName(i.contentId),
      // the discount is the list price minus what the bank really charged (rounding of agentFeePercent goes to the buyer)
      priceKop: listKop, discountKop: listKop - i.amountKop, amountKop: i.amountKop,
    },
  ];
  if (i.feeFiscal && i.sensoriaKop > 0) {
    out.push({
      issuer: "sensoria", kind: i.kind, deliverTo: "author", itemCode: `S${code8(i.invoiceId)}`, itemName: sensoriaItemName(i.invoiceId),
      priceKop: i.sensoriaKop, discountKop: 0, amountKop: i.sensoriaKop,
    });
  }
  return out;
}

// ── Checkbox (checkbox.ua) ──────────────────────────────────────────────────
// Body for POST /api/v1/receipts/sell. Quantity is in thousandths (1000 = 1 pc).
// Звірити назви полів платежу карткою й повернення з документацією Checkbox перед підключенням каси.

export function checkboxReceiptBody(d: ReceiptDraft, card: CardDetails, opts: { email?: string | null; relatedReceiptId?: string | null } = {}) {
  if (d.priceKop - d.discountKop !== d.amountKop) throw new FiscalError("bad_amount", "Сума чека не збігається з ціною та знижкою.");
  if (d.kind === "return" && !opts.relatedReceiptId) throw new FiscalError("no_related", "Чек повернення потребує фіскального чека продажу.");
  const good = {
    good: { code: d.itemCode, name: d.itemName, price: d.priceKop },
    quantity: 1000,
    ...(d.kind === "return" ? { is_return: true } : {}),
    ...(d.discountKop > 0 ? { discounts: [{ type: "DISCOUNT", mode: "VALUE", value: d.discountKop, name: "Знижка" }] } : {}),
  };
  return {
    goods: [good],
    payments: [{
      type: "CASHLESS",
      value: d.amountKop,
      label: "Картка",
      card_mask: card.maskedPan,
      auth_code: card.approvalCode,
      rrn: card.rrn,
      payment_system: card.paymentSystem,
      bank_name: ACQUIRER_NAME,
    }],
    ...(opts.relatedReceiptId ? { related_receipt_id: opts.relatedReceiptId } : {}),
    ...(opts.email ? { delivery: { email: opts.email } } : {}),
  };
}

// ── retries ────────────────────────────────────────────────────────────────

/** Pauses between attempts, minutes. After the last one the receipt is `failed` and the admin is alerted. */
export const RETRY_MINUTES = [1, 5, 15, 60, 180, 360] as const;
/** An unsent receipt older than this raises an admin alert (the cash service's offline mode should have taken it). */
export const ALERT_AFTER_MINUTES = 60;

export function nextAttemptAt(attempts: number, nowIso: string): string | null {
  const m = RETRY_MINUTES[attempts];
  return m === undefined ? null : new Date(Date.parse(nowIso) + m * 60_000).toISOString();
}

// ── sending order ──────────────────────────────────────────────────────────

export interface QueuedReceipt { id: string; invoiceId: string; issuer: FiscalIssuer; kind: FiscalKind; status: "pending" | "done" | "failed"; nextAttemptAt: string }

/**
 * Which pending receipts may go now: the author's receipt first, Sensoria's after it; a return only after the
 * matching sale receipt is done (it must name the sale's fiscal receipt).
 */
export function sendable(all: QueuedReceipt[], nowIso: string): QueuedReceipt[] {
  const done = new Set(all.filter((r) => r.status === "done").map((r) => `${r.invoiceId}|${r.issuer}|${r.kind}`));
  const now = Date.parse(nowIso);
  return all
    .filter((r) => r.status === "pending" && Date.parse(r.nextAttemptAt) <= now)
    .filter((r) => r.issuer === "author" || done.has(`${r.invoiceId}|author|${r.kind}`))
    .filter((r) => r.kind === "sale" || done.has(`${r.invoiceId}|${r.issuer}|sale`))
    .sort((a, b) => (a.issuer === b.issuer ? 0 : a.issuer === "author" ? -1 : 1));
}

// ── Checkbox client ────────────────────────────────────────────────────────
// docs: https://api.checkbox.in.ua/api/redoc — the cashier signs in with the cash register's license key + PIN,
// a shift is opened if needed, then the receipt is sent. Field names are to be confirmed on a test cash register.

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;
export interface CheckboxCreds { licenseKey: string; pin: string }
export interface CheckboxResult { providerReceiptId: string; fiscalCode: string | null; receiptUrl: string }

export const CHECKBOX_API = "https://api.checkbox.in.ua";
export const checkboxReceiptUrl = (id: string) => `https://check.checkbox.ua/${id}`;

export function checkboxClient(creds: CheckboxCreds, fetchFn: FetchLike, base = CHECKBOX_API) {
  const head = (token?: string): Record<string, string> => ({
    "Content-Type": "application/json",
    "X-License-Key": creds.licenseKey,
    "X-Client-Name": "Sensoria",
    "X-Client-Version": "1.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const call = async (path: string, method: string, token?: string, body?: unknown) => {
    const res = await fetchFn(`${base}${path}`, { method, headers: head(token), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) {
      const t = (await res.text().catch(() => "")).slice(0, 300);
      throw new FiscalError(res.status === 401 || res.status === 403 ? "prro_auth" : "prro_error", `Каса відповіла ${res.status}: ${t}`);
    }
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  };
  return {
    async signIn(): Promise<string> {
      const r = await call("/api/v1/cashier/signinPinCode", "POST", undefined, { pin_code: creds.pin });
      const token = typeof r.access_token === "string" ? r.access_token : "";
      if (!token) throw new FiscalError("prro_auth", "Каса не видала токен касира: перевірте ключ ліцензії й PIN.");
      return token;
    },
    /** Opens a shift if there is none open. */
    async ensureShift(token: string): Promise<void> {
      const cur = await call("/api/v1/cashier/shift", "GET", token).catch(() => null);
      const status = cur && typeof cur.status === "string" ? cur.status : null;
      if (status === "OPENED" || status === "OPENING") return;
      await call("/api/v1/shifts", "POST", token, {});
    },
    async sell(token: string, body: unknown): Promise<CheckboxResult> {
      const r = await call("/api/v1/receipts/sell", "POST", token, body);
      const id = typeof r.id === "string" ? r.id : "";
      if (!id) throw new FiscalError("prro_error", "Каса не повернула номер чека.");
      return { providerReceiptId: id, fiscalCode: typeof r.fiscal_code === "string" ? r.fiscal_code : null, receiptUrl: checkboxReceiptUrl(id) };
    },
  };
}

/** One receipt end to end: sign in, make sure a shift is open, send. */
export async function sendViaCheckbox(creds: CheckboxCreds, body: unknown, fetchFn: FetchLike, base = CHECKBOX_API): Promise<CheckboxResult> {
  const c = checkboxClient(creds, fetchFn, base);
  const token = await c.signIn();
  await c.ensureShift(token);
  return c.sell(token, body);
}
