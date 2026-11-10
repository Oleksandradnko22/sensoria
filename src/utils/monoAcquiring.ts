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
