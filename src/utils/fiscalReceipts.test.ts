import assert from "node:assert/strict";
import test from "node:test";
import { FiscalError, agentFeeKopOf, cardComplete, checkRegister, verifyViaCheckbox, cardDetailsOf, checkboxClient, checkboxReceiptBody, nextAttemptAt, plannedReceipts, sendable, sendViaCheckbox, type FetchLike, type QueuedReceipt } from "./fiscalReceipts.ts";

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

const noWait = async () => {};

test("Checkbox: sign in with the license key and PIN, open a shift when closed, WAIT until it is opened, send the receipt", async () => {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  let polls = 0;
  let opened = false;
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    if (url.endsWith("/shifts")) opened = true;
    // the shift is OPENING for a while after it is asked to open (18.11.2026: a receipt sent then got shift.not_opened)
    const shift = !url.endsWith("/cashier/shift") ? "" : !opened ? "CLOSED" : ++polls < 3 ? "OPENING" : "OPENED";
    const body = url.endsWith("/signinPinCode") ? { access_token: "T" } : url.endsWith("/cashier/shift") ? { status: shift } : url.endsWith("/shifts") ? { status: "OPENING" } : { id: "rcpt-1", fiscal_code: "FC-1" };
    return { ok: true, status: 200, json: async () => body, text: async () => "" };
  };
  const draft = plannedReceipts({ kind: "sale", ...ids, amountKop: 100000, sensoriaKop: 30000, feeFiscal: true })[0];
  const r = await sendViaCheckbox({ licenseKey: "LK", pin: "1234" }, checkboxReceiptBody(draft, card), fake, "https://x", noWait);
  assert.deepEqual(r, { providerReceiptId: "rcpt-1", fiscalCode: "FC-1", receiptUrl: "https://check.checkbox.ua/rcpt-1" });
  const seq = calls.map((c) => `${c.method} ${c.url.replace("https://x", "")}`);
  assert.deepEqual(seq, ["POST /api/v1/cashier/signinPinCode", "GET /api/v1/cashier/shift", "POST /api/v1/shifts", "GET /api/v1/cashier/shift", "GET /api/v1/cashier/shift", "GET /api/v1/cashier/shift", "POST /api/v1/receipts/sell"]);
  assert.equal(calls[0].headers["X-License-Key"], "LK");
  assert.equal(JSON.parse(calls[0].body ?? "{}").pin_code, "1234");
  const sell = calls[calls.length - 1];
  assert.equal(sell.headers.Authorization, "Bearer T");
  assert.equal(JSON.parse(sell.body ?? "{}").payments[0].value, 100000);
});

test("Checkbox: a shift that never opens is a retryable error, no receipt is sent", async () => {
  const urls: string[] = [];
  const stuck: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => (url.endsWith("/signinPinCode") ? { access_token: "T" } : { status: "OPENING" }), text: async () => "" };
  };
  await assert.rejects(sendViaCheckbox({ licenseKey: "LK", pin: "1" }, {}, stuck, "https://x", noWait), (e: unknown) => e instanceof FiscalError && e.code === "prro_error");
  assert.equal(urls.some((u) => u.endsWith("/receipts/sell")), false);
  assert.equal(urls.some((u) => u.endsWith("/shifts")), false); // already OPENING: not asked to open again
});

test("Checkbox: an open shift is not reopened; a rejected PIN is a prro_auth error", async () => {
  const urls: string[] = [];
  const ok: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => (url.endsWith("/signinPinCode") ? { access_token: "T" } : url.endsWith("/cashier/shift") ? { status: "OPENED" } : { id: "r" }), text: async () => "" };
  };
  await sendViaCheckbox({ licenseKey: "LK", pin: "1" }, {}, ok, "https://x", noWait);
  assert.equal(urls.some((u) => u.endsWith("/shifts")), false);
  const denied: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => "bad pin" });
  await assert.rejects(sendViaCheckbox({ licenseKey: "LK", pin: "0" }, {}, denied, "https://x", noWait), (e: unknown) => e instanceof FiscalError && e.code === "prro_auth");
});

test("the tariff from the bank: paymentInfo.agentFee in kopecks; nothing usable → null (our estimate is used)", () => {
  assert.equal(agentFeeKopOf({ agentFee: 15000 }), 15000);
  assert.equal(agentFeeKopOf({ agentFee: "30000" }), 30000);
  assert.equal(agentFeeKopOf({ agentFee: 150.5 }), null);
  assert.equal(agentFeeKopOf({}), null);
  assert.equal(agentFeeKopOf(null), null);
});

// ── is it the author's own, real register? ──

const realInfo = { fiscal_number: "4000123456", is_test: false };
const meOf = (edrpou: string) => ({ full_name: "Касир", organization: { title: "ФОП Іванова", edrpou } });

test("register check: the author's own fiscal register passes", () => {
  const r = checkRegister(meOf("3837304242"), realInfo, "3837304242");
  assert.deepEqual([r.ok, r.fiscalNumber, r.taxId, r.isTest], [true, "4000123456", "3837304242", false]);
});

test("register check: a test register is refused (by flag or by a TEST fiscal number)", () => {
  assert.equal(checkRegister(meOf("3837304242"), { fiscal_number: "4000123456", is_test: true }, "3837304242").ok, false);
  const r = checkRegister(meOf("3837304242"), { fiscal_number: "TEST730329" }, "3837304242");
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /тестова каса/);
});

test("register check: someone else's register is refused", () => {
  const r = checkRegister(meOf("1111111111"), realInfo, "3837304242");
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /інший ФОП/);
});

test("register check: no fiscal number yet, no bank connection, or an unreadable owner — never ok", () => {
  assert.equal(checkRegister(meOf("3837304242"), { is_test: false }, "3837304242").ok, false);
  assert.equal(checkRegister(meOf("3837304242"), realInfo, null).ok, false);
  assert.equal(checkRegister({ full_name: "Касир" }, realInfo, "3837304242").ok, false);
  assert.equal(checkRegister(null, null, "3837304242").ok, false);
});

test("register check over the API: sign in, read cashier and register; a refused PIN throws", async () => {
  const urls: string[] = [];
  const fake: FetchLike = async (url) => {
    urls.push(url);
    const body = url.endsWith("/signinPinCode") ? { access_token: "T" } : url.endsWith("/cashier/me") ? meOf("3837304242") : realInfo;
    return { ok: true, status: 200, json: async () => body, text: async () => "" };
  };
  const r = await verifyViaCheckbox({ licenseKey: "LK", pin: "1234" }, "3837304242", fake, "https://x");
  assert.equal(r.ok, true);
  assert.ok(urls.some((u) => u.endsWith("/api/v1/cash-registers/info")));
  assert.equal(urls.some((u) => u.endsWith("/receipts/sell")), false); // checking never sends a receipt
  const denied: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => "" });
  await assert.rejects(verifyViaCheckbox({ licenseKey: "LK", pin: "0" }, "3837304242", denied, "https://x"), (e: unknown) => e instanceof FiscalError && e.code === "prro_auth");
});

test("register check over the API: a register that does not answer is not «broken» — prro_error, never prro_auth", async () => {
  const flaky: FetchLike = async (url) => (url.endsWith("/signinPinCode")
    ? { ok: true, status: 200, json: async () => ({ access_token: "T" }), text: async () => "" }
    : { ok: false, status: 502, json: async () => ({}), text: async () => "bad gateway" });
  await assert.rejects(verifyViaCheckbox({ licenseKey: "LK", pin: "1" }, "3837304242", flaky, "https://x"), (e: unknown) => e instanceof FiscalError && e.code === "prro_error");
});

test("«Комісія еквайра»: the bank's fee goes to the payment as `commission` (kopecks); none when absent or zero", () => {
  const draft = plannedReceipts({ kind: "sale", ...ids, amountKop: 45000, sensoriaKop: 13500, feeFiscal: true })[0];
  assert.equal(checkboxReceiptBody(draft, card, { commissionKop: 585 }).payments[0].commission, 585);
  assert.equal("commission" in checkboxReceiptBody(draft, card, { commissionKop: 0 }).payments[0], false);
  assert.equal("commission" in checkboxReceiptBody(draft, card).payments[0], false);
});

test("Checkbox: a shift open for 23 h or more is closed and a new one opened before the receipt", async () => {
  const seq: string[] = [];
  let phase: "old" | "closing" | "closed" | "opening" | "open" = "old";
  const fake: FetchLike = async (url, init) => {
    const path = url.replace("https://x", "");
    seq.push(`${init.method} ${path}`);
    if (path.endsWith("/signinPinCode")) return { ok: true, status: 200, json: async () => ({ access_token: "T" }), text: async () => "" };
    if (path === "/api/v1/shifts/close") { phase = "closing"; return { ok: true, status: 200, json: async () => ({}), text: async () => "" }; }
    if (path === "/api/v1/shifts") { phase = "opening"; return { ok: true, status: 200, json: async () => ({}), text: async () => "" }; }
    if (path === "/api/v1/cashier/shift") {
      const body = phase === "old" ? { status: "OPENED", opened_at: "2026-11-19T08:00:00Z" } : phase === "closing" ? ((phase = "closed"), { status: "CLOSING" }) : phase === "closed" ? { status: "CLOSED" } : phase === "opening" ? ((phase = "open"), { status: "OPENING" }) : { status: "OPENED", opened_at: "2026-11-20T09:00:00Z" };
      return { ok: true, status: 200, json: async () => body, text: async () => "" };
    }
    return { ok: true, status: 200, json: async () => ({ id: "rc" }), text: async () => "" };
  };
  const c = checkboxClient({ licenseKey: "LK", pin: "1" }, fake, "https://x");
  await c.ensureShift("T", noWait, Date.parse("2026-11-20T09:00:00Z"));
  assert.ok(seq.includes("POST /api/v1/shifts/close"));
  assert.ok(seq.indexOf("POST /api/v1/shifts/close") < seq.indexOf("POST /api/v1/shifts"));
});

test("Checkbox: a receipt refused with shift.opened_too_long → close, reopen, send again once", async () => {
  const calls: string[] = [];
  let shift = "OPENED"; // opened_at unknown: only the refusal tells it is too old
  let sells = 0;
  const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b, text: async () => "" });
  const fake: FetchLike = async (url, init) => {
    const path = url.replace("https://x", "");
    calls.push(`${init.method} ${path}`);
    if (path.endsWith("/signinPinCode")) return ok({ access_token: "T" });
    if (path === "/api/v1/cashier/shift") return ok({ status: shift });
    if (path === "/api/v1/shifts/close") { shift = "CLOSED"; return ok({}); }
    if (path === "/api/v1/shifts") { shift = "OPENED"; return ok({}); }
    sells += 1;
    return sells === 1 ? { ok: false, status: 400, json: async () => ({}), text: async () => '{"code":"shift.opened_too_long"}' } : ok({ id: "rc2" });
  };
  const r = await sendViaCheckbox({ licenseKey: "LK", pin: "1" }, {}, fake, "https://x", noWait);
  assert.equal(r.providerReceiptId, "rc2");
  assert.equal(sells, 2);
  assert.ok(calls.indexOf("POST /api/v1/shifts/close") < calls.indexOf("POST /api/v1/shifts"));
});
