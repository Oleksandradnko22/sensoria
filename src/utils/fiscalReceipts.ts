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

/** The platform's reward as the bank really paid it (`paymentInfo.agentFee`, kopecks); null when the bank did not say. */
export function agentFeeKopOf(paymentInfo: unknown): number | null {
  const v = (paymentInfo as { agentFee?: unknown } | null)?.agentFee;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
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

/**
 * `commissionKop` — the acquirer's fee deducted from THIS payment under the acquiring contract (receipt line
 * «Комісія еквайра»; Checkbox support 19.11.2026, ЗІР id 42872). For the author's sale it is the bank's real fee
 * (monobank withholds it from the author's share); Sensoria's tariff carries none. Field name `commission` —
 * to be confirmed on the test register (the line must show the amount).
 */
export function checkboxReceiptBody(d: ReceiptDraft, card: CardDetails, opts: { email?: string | null; relatedReceiptId?: string | null; commissionKop?: number | null } = {}) {
  const commission = opts.commissionKop != null && Number.isInteger(opts.commissionKop) && opts.commissionKop > 0 ? opts.commissionKop : null;
  if (d.priceKop - d.discountKop !== d.amountKop) throw new FiscalError("bad_amount", "Сума чека не збігається з ціною та знижкою.");
  if (d.kind === "return" && !opts.relatedReceiptId) throw new FiscalError("no_related", "Чек повернення потребує фіскального чека продажу.");
  const good = {
    good: { code: d.itemCode, name: d.itemName, price: d.priceKop },
    quantity: 1000,
    ...(d.kind === "return" ? { is_return: true } : {}),
    ...(d.discountKop > 0 ? { discounts: [{ type: "DISCOUNT", mode: "VALUE", value: d.discountKop, name: "Знижка" }] } : {}),
  };
  // Sensoria's tariff receipt goes to the AUTHOR: no buyer card data in it. Card requisites (ЕПЗ, auth code, RRN,
  // acquirer fee) are mandatory for payments through a payment device (POS / Tap to phone), not for internet acquiring
  // (Положення № 13; Checkbox support and ЗІР 42872, 19.11.2026), so the buyer's data is not passed on needlessly.
  if (d.issuer === "sensoria") {
    return {
      goods: [good],
      payments: [{ type: "CASHLESS", value: d.amountKop, label: "Інтернет-еквайринг (розподіл платежу)" }],
      ...(opts.relatedReceiptId ? { related_receipt_id: opts.relatedReceiptId } : {}),
      ...(opts.email ? { delivery: { email: opts.email } } : {}),
    };
  }
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
      ...(commission != null ? { commission } : {}),
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
// docs: https://api.checkbox.ua/api/redoc — the cashier signs in with the cash register's license key + PIN,
// a shift is opened if needed, then the receipt is sent. Field names are to be confirmed on a test cash register.

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;
export interface CheckboxCreds { licenseKey: string; pin: string }
export interface CheckboxResult { providerReceiptId: string; fiscalCode: string | null; receiptUrl: string }

// Checkbox support (18.11.2026): one host for testing and fiscal work. A test register differs by its LICENSE KEY,
// not by the address — so test mode must never be given a real register's key.
export const CHECKBOX_API = "https://api.checkbox.ua";
export const checkboxReceiptUrl = (id: string) => `https://check.checkbox.ua/${id}`;
/** Waiting for a shift to open: up to 10 × 1.5 s. */
export const SHIFT_WAIT_MS = 1500;
export const SHIFT_WAIT_TRIES = 10;
/** A shift may stay open for at most 24 h (Checkbox: shift.opened_too_long); we close and reopen it after 23 h. */
export const SHIFT_MAX_AGE_MS = 23 * 3_600_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    /**
     * Opens a shift if there is none, and WAITS until it is OPENED: Checkbox opens a shift asynchronously
     * (OPENING for a few seconds while the opening is signed), and a receipt sent meanwhile gets
     * 400 shift.not_opened (seen on the test register, 18.11.2026). A shift open for 23 h or more is closed first
     * (Z-report) and a new one opened: after 24 h Checkbox refuses receipts with shift.opened_too_long (20.11.2026).
     */
    async ensureShift(token: string, wait: (ms: number) => Promise<void> = sleep, now = Date.now(), forceNew = false): Promise<void> {
      const shiftOf = async () => {
        const cur = await call("/api/v1/cashier/shift", "GET", token).catch(() => null);
        const status = cur && typeof cur.status === "string" ? cur.status : null;
        const openedAt = cur && typeof cur.opened_at === "string" ? Date.parse(cur.opened_at) : NaN;
        return { status, openedAt };
      };
      let cur = await shiftOf();
      const tooOld = cur.status === "OPENED" && (forceNew || (Number.isFinite(cur.openedAt) && now - cur.openedAt >= SHIFT_MAX_AGE_MS));
      if (cur.status === "OPENED" && !tooOld) return;
      if (tooOld || cur.status === "CLOSING") {
        if (tooOld) await call("/api/v1/shifts/close", "POST", token, {});
        for (let i = 0; i < SHIFT_WAIT_TRIES; i++) {
          await wait(SHIFT_WAIT_MS);
          cur = await shiftOf();
          if (cur.status !== "OPENED" && cur.status !== "CLOSING") break;
        }
        if (cur.status === "OPENED" || cur.status === "CLOSING") throw new FiscalError("prro_error", "Зміна в касі закривається довше, ніж очікувалося. Чек буде надіслано повторно.");
      }
      if (cur.status !== "OPENING") await call("/api/v1/shifts", "POST", token, {});
      for (let i = 0; i < SHIFT_WAIT_TRIES; i++) {
        await wait(SHIFT_WAIT_MS);
        if ((await shiftOf()).status === "OPENED") return;
      }
      throw new FiscalError("prro_error", "Зміна в касі відкривається довше, ніж очікувалося. Чек буде надіслано повторно.");
    },
    /** The cashier and the organization (FOP/LLC) the register belongs to. */
    async me(token: string): Promise<Record<string, unknown>> {
      return call("/api/v1/cashier/me", "GET", token);
    },
    /** The register itself: fiscal number, test or not. */
    async registerInfo(token: string): Promise<Record<string, unknown>> {
      return call("/api/v1/cash-registers/info", "GET", token);
    },
    async sell(token: string, body: unknown): Promise<CheckboxResult> {
      const r = await call("/api/v1/receipts/sell", "POST", token, body);
      const id = typeof r.id === "string" ? r.id : "";
      if (!id) throw new FiscalError("prro_error", "Каса не повернула номер чека.");
      return { providerReceiptId: id, fiscalCode: typeof r.fiscal_code === "string" ? r.fiscal_code : null, receiptUrl: checkboxReceiptUrl(id) };
    },
  };
}

// ── is this the author's own, real register? ────────────────────────────────
// A sign-in alone proves only that the key and PIN work. Three more things must hold before an author may sell:
//  1) the register is not a TEST one (its receipts are not fiscal: a sale would go without a receipt);
//  2) it belongs to the author's own FOP/LLC (the tax id connected at monobank), not to someone else;
//  3) it has a fiscal number.
// Field names follow Checkbox's API and are read defensively; an unknown answer is never treated as "ok".

export interface RegisterCheck {
  ok: boolean;
  /** why not, in Ukrainian, for the author */
  reason: string | null;
  fiscalNumber: string | null;
  taxId: string | null;
  isTest: boolean;
}

const pick = (o: unknown, ...paths: string[]): string | null => {
  for (const p of paths) {
    let v: unknown = o;
    for (const k of p.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

export function checkRegister(me: unknown, info: unknown, expectedTaxId: string | null): RegisterCheck {
  const fiscalNumber = pick(info, "fiscal_number", "fiscalNumber");
  const isTest = (info as { is_test?: unknown } | null)?.is_test === true || /^TEST/i.test(fiscalNumber ?? "");
  const taxId = pick(me, "organization.edrpou", "organization.tax_number", "organization.tax_code", "organization.nin")
    ?? pick(info, "organization.edrpou", "organization.tax_number", "organization.tax_code");
  const out = { fiscalNumber, taxId, isTest };
  if (isTest) return { ok: false, reason: "Це тестова каса: її чеки не фіскальні. Підключіть основну касу з кабінету Checkbox.", ...out };
  if (!fiscalNumber) return { ok: false, reason: "Каса ще не має фіскального номера. Дочекайтеся реєстрації в ДПС (статус «Активна») і підключіть ще раз.", ...out };
  if (!expectedTaxId) return { ok: false, reason: "Спершу підключіть приймання оплат у розділі «Приймання оплат»: касу перевіряємо за кодом вашого ФОП.", ...out };
  if (!taxId) return { ok: false, reason: "Не вдалося перевірити, на кого зареєстрована каса. Напишіть у підтримку Sensoria.", ...out };
  if (taxId.replace(/\D/g, "") !== expectedTaxId.replace(/\D/g, "")) return { ok: false, reason: "Каса зареєстрована на інший ФОП або ТОВ. Підключіть касу свого ФОП — того, на який приходять оплати.", ...out };
  return { ok: true, reason: null, ...out };
}

/** Sign in and check the register (connect and the daily recheck). Throws on network/auth errors: a register
 *  that did not answer is NOT a broken one (prro_error — try later); only prro_auth means the key/PIN were refused. */
export async function verifyViaCheckbox(creds: CheckboxCreds, expectedTaxId: string | null, fetchFn: FetchLike, base = CHECKBOX_API): Promise<RegisterCheck> {
  const c = checkboxClient(creds, fetchFn, base);
  const token = await c.signIn();
  const [me, info] = await Promise.all([c.me(token), c.registerInfo(token)]);
  return checkRegister(me, info, expectedTaxId);
}

/** One receipt end to end: sign in, make sure a shift is open, send. */
export async function sendViaCheckbox(creds: CheckboxCreds, body: unknown, fetchFn: FetchLike, base = CHECKBOX_API, wait: (ms: number) => Promise<void> = sleep): Promise<CheckboxResult> {
  const c = checkboxClient(creds, fetchFn, base);
  const token = await c.signIn();
  await c.ensureShift(token, wait);
  try {
    return await c.sell(token, body);
  } catch (e) {
    // the shift outlived 24 h (its opening time was unknown) or closed meanwhile: a new shift, then one more try
    if (e instanceof FiscalError && /shift\.(opened_too_long|not_opened)/.test(e.message)) {
      await c.ensureShift(token, wait, Date.now(), /opened_too_long/.test(e.message));
      return c.sell(token, body);
    }
    throw e;
  }
}
