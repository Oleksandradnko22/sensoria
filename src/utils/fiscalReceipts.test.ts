import assert from "node:assert/strict";
import test from "node:test";
import { FiscalError, cardComplete, cardDetailsOf, checkboxReceiptBody, nextAttemptAt, plannedReceipts, sendable, sendViaCheckbox, type FetchLike, type QueuedReceipt } from "./fiscalReceipts.ts";

const ids = { invoiceId: "a1b2c3d4-0000-4000-8000-000000000001", contentId: "c0ffee12-0000-4000-8000-000000000002" };
const card = cardDetailsOf({ maskedPan: "444403******1902", approvalCode: "662476", rrn: "060189181768", paymentSystem: "visa", tranId: "13194036" });

test("catalog 1000: author 1000 to the buyer, Sensoria 300 to the author", () => {
  const r = plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 30000, feeFiscal: true });
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].issuer, r[0].deliverTo, r[0].priceKop, r[0].discountKop, r[0].amountKop], ["author", "buyer", 100000, 0, 100000]);
  assert.deepEqual([r[1].issuer, r[1].deliverTo, r[1].amountKop], ["sensoria", "author", 30000]);
  assert.equal(r[0].itemName, "Доступ до цифрового освітнього матеріалу, код C0FFEE12");
  assert.equal(r[1].itemName, "Послуги технічного характеру Платформи Sensoria за замовленням № A1B2C3D4");
});

test("referral 1000: Sensoria 150", () => {
  const r = plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 15000, feeFiscal: true });
  assert.equal(r[1].amountKop, 15000);
});

test("promo −10 %: price 1000, discount 100.15, paid 899.85 — the bank's amount to the kopeck", () => {
  const r = plannedReceipts({ kind: "sale", ...ids, listKop: 100000, amountKop: 89985, sensoriaKop: 15000, feeFiscal: true });
  assert.deepEqual([r[0].priceKop, r[0].discountKop, r[0].amountKop], [100000, 10015, 89985]);
  const body = checkboxReceiptBody(r[0], card);
  assert.equal(body.payments[0].value, 89985);
  assert.equal(body.goods[0].discounts?.[0].value, 10015);
});

test("flag off (positive ІПК): only the author's receipt", () => {
  const r = plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 30000, feeFiscal: false });
  assert.deepEqual(r.map((x) => x.issuer), ["author"]);
});

test("no tariff: no Sensoria receipt", () => {
  assert.equal(plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 0, feeFiscal: true }).length, 1);
});

test("refund: return receipts need the sale receipt", () => {
  const r = plannedReceipts({ kind: "return", ...ids, amountKop: 100000, sensoriaKop: 30000, feeFiscal: true });
  assert.deepEqual(r.map((x) => `${x.issuer}:${x.kind}:${x.amountKop}`), ["author:return:100000", "sensoria:return:30000"]);
  assert.throws(() => checkboxReceiptBody(r[0], card), FiscalError);
  const body = checkboxReceiptBody(r[0], card, { relatedReceiptId: "rcpt-1" });
  assert.equal(body.goods[0].is_return, true);
  assert.equal(body.related_receipt_id, "rcpt-1");
});

test("money is never invented", () => {
  assert.throws(() => plannedReceipts({ kind: "sale", ...ids, amountKop: 0, sensoriaKop: 0, feeFiscal: true }), FiscalError);
  assert.throws(() => plannedReceipts({ kind: "sale", ...ids, listKop: 80000, amountKop: 89985, sensoriaKop: 15000, feeFiscal: true }), FiscalError);
  assert.throws(() => plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 100001, feeFiscal: true }), FiscalError);
  assert.throws(() => plannedReceipts({ kind: "sale", ...ids, amountKop: 100.5, sensoriaKop: 0, feeFiscal: true }), FiscalError);
});

test("card details: mask + authorization reference required", () => {
  assert.equal(cardComplete(card), true);
  assert.equal(cardComplete(cardDetailsOf({ maskedPan: "4444********1902" })), false);
  assert.equal(cardComplete(cardDetailsOf(null)), false);
});

test("retries: 1, 5, 15, 60, 180, 360 minutes, then failed", () => {
  const t0 = "2026-11-18T10:00:00.000Z";
  assert.equal(nextAttemptAt(0, t0), "2026-11-18T10:01:00.000Z");
  assert.equal(nextAttemptAt(3, t0), "2026-11-18T11:00:00.000Z");
  assert.equal(nextAttemptAt(6, t0), null);
});

// ── sending order and the Checkbox client ──

const q = (o: Partial<QueuedReceipt> & Pick<QueuedReceipt, "issuer" | "kind">): QueuedReceipt => ({ id: `${o.issuer}-${o.kind}`, invoiceId: "inv", status: "pending", nextAttemptAt: "2026-11-18T10:00:00Z", ...o });

test("order: the author's receipt first; Sensoria's only after it; a return only after its sale", () => {
  const now = "2026-11-18T10:05:00Z";
  assert.deepEqual(sendable([q({ issuer: "author", kind: "sale" }), q({ issuer: "sensoria", kind: "sale" })], now).map((r) => r.id), ["author-sale"]);
  assert.deepEqual(sendable([q({ issuer: "author", kind: "sale", status: "done" }), q({ issuer: "sensoria", kind: "sale" })], now).map((r) => r.id), ["sensoria-sale"]);
  assert.deepEqual(sendable([q({ issuer: "author", kind: "return" })], now), []);
  assert.deepEqual(sendable([q({ issuer: "author", kind: "sale", status: "done" }), q({ issuer: "author", kind: "return" })], now).map((r) => r.id), ["author-return"]);
  // not yet due
  assert.deepEqual(sendable([q({ issuer: "author", kind: "sale", nextAttemptAt: "2026-11-18T11:00:00Z" })], now), []);
});

test("Checkbox: sign in with the license key and PIN, open a shift when closed, send the receipt", async () => {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    const body = url.endsWith("/signinPinCode") ? { access_token: "T" } : url.endsWith("/cashier/shift") ? { status: "CLOSED" } : url.endsWith("/shifts") ? { status: "OPENING" } : { id: "rcpt-1", fiscal_code: "FC-1" };
    return { ok: true, status: 200, json: async () => body, text: async () => "" };
  };
  const draft = plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 30000, feeFiscal: true })[0];
  const r = await sendViaCheckbox({ licenseKey: "LK", pin: "1234" }, checkboxReceiptBody(draft, card), fake, "https://x");
  assert.deepEqual(r, { providerReceiptId: "rcpt-1", fiscalCode: "FC-1", receiptUrl: "https://check.checkbox.ua/rcpt-1" });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace("https://x", "")}`), ["POST /api/v1/cashier/signinPinCode", "GET /api/v1/cashier/shift", "POST /api/v1/shifts", "POST /api/v1/receipts/sell"]);
  assert.equal(calls[0].headers["X-License-Key"], "LK");
  assert.equal(JSON.parse(calls[0].body ?? "{}").pin_code, "1234");
  assert.equal(calls[3].headers.Authorization, "Bearer T");
  assert.equal(JSON.parse(calls[3].body ?? "{}").payments[0].value, 100000);
});

test("Checkbox: an open shift is not reopened; a rejected PIN is a prro_auth error", async () => {
  const urls: string[] = [];
  const ok: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => (url.endsWith("/signinPinCode") ? { access_token: "T" } : url.endsWith("/cashier/shift") ? { status: "OPENED" } : { id: "r" }), text: async () => "" };
  };
  await sendViaCheckbox({ licenseKey: "LK", pin: "1" }, {}, ok, "https://x");
  assert.equal(urls.some((u) => u.endsWith("/shifts")), false);
  const denied: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "bad pin" });
  await assert.rejects(sendViaCheckbox({ licenseKey: "LK", pin: "0" }, {}, denied, "https://x"), (e: unknown) => e instanceof FiscalError && e.code === "prro_auth");
});
