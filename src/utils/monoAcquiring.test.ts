import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import {
  MONO_CMS_NAME, MonoError, buildInvoiceBody, buildSplitBasket, derToRawSignature, effectOf, isNewer, parseStatus, spkiFromPem,
  verifyWebhookSignature,
} from "./monoAcquiring.ts";

const base = {
  amountKop: 100000,
  authorKop: 70000,
  sensoriaKop: 30000,
  title: "Програма: спокій у тривозі",
  contentCode: "c1",
  authorReceiverId: "rcv-author",
  sensoriaReceiverId: "rcv-sensoria",
};

test("cms name is the one monobank asked for", () => {
  assert.equal(MONO_CMS_NAME, "sensoria");
});

test("basket: two items, each to its own receiver, totals add up to the price", () => {
  const { amount, basketOrder } = buildSplitBasket(base);
  assert.equal(amount, 100000);
  assert.equal(basketOrder.length, 2);
  assert.deepEqual(basketOrder.map((b) => b.splitReceiverId), ["rcv-author", "rcv-sensoria"]);
  assert.equal(basketOrder.reduce((s, b) => s + b.total, 0), amount);
  for (const b of basketOrder) {
    assert.equal(b.qty, 1);
    assert.equal(b.sum, b.total);
  }
});

test("basket: a zero part is left out", () => {
  const only = buildSplitBasket({ ...base, authorKop: 100000, sensoriaKop: 0 });
  assert.equal(only.basketOrder.length, 1);
  assert.equal(only.basketOrder[0].splitReceiverId, "rcv-author");
});

test("basket: refuses parts that do not add up", () => {
  assert.throws(() => buildSplitBasket({ ...base, sensoriaKop: 29999 }), (e) => e instanceof MonoError && e.code === "split_mismatch");
});

test("basket: refuses fractions, negatives and zero price", () => {
  for (const bad of [{ authorKop: 700.5 }, { authorKop: -1, sensoriaKop: 100001 }, { amountKop: 0, authorKop: 0, sensoriaKop: 0 }]) {
    assert.throws(() => buildSplitBasket({ ...base, ...bad }), MonoError);
  }
});

test("basket: an author who is not connected to split blocks the sale", () => {
  assert.throws(() => buildSplitBasket({ ...base, authorReceiverId: "" }), (e) => e instanceof MonoError && e.code === "no_author_receiver");
  assert.throws(() => buildSplitBasket({ ...base, sensoriaReceiverId: "" }), (e) => e instanceof MonoError && e.code === "no_sensoria_receiver");
});

test("basket: long titles are cut, codes are stable", () => {
  const { basketOrder } = buildSplitBasket({ ...base, title: "А".repeat(300) });
  assert.ok(basketOrder[0].name.length <= 60);
  assert.ok(basketOrder[1].name.length <= 100);
  assert.equal(basketOrder[0].code, "c1:author");
  assert.equal(basketOrder[1].code, "c1:platform");
});

test("invoice body carries our reference, urls and UAH", () => {
  const b = buildInvoiceBody({ ...base, reference: "intent-1", redirectUrl: "https://sensoria.courses/payment-result", webHookUrl: "https://x.supabase.co/functions/v1/mono-webhook" });
  assert.equal(b.ccy, 980);
  assert.equal(b.merchantPaymInfo.reference, "intent-1");
  assert.equal(b.amount, 100000);
  assert.equal(b.paymentType, "debit");
  assert.ok(b.webHookUrl.endsWith("/mono-webhook"));
});

test("statuses: only success pays", () => {
  assert.equal(parseStatus("success"), "success");
  assert.equal(parseStatus("nonsense"), null);
  assert.equal(parseStatus(undefined), null);
  assert.equal(effectOf("success"), "paid");
  assert.equal(effectOf("reversed"), "reversed");
  assert.equal(effectOf("failure"), "failed");
  assert.equal(effectOf("expired"), "failed");
  for (const s of ["created", "processing", "hold"] as const) assert.equal(effectOf(s), "wait");
});

test("ordering: the newer modifiedDate wins", () => {
  assert.equal(isNewer("2026-11-09T10:00:05Z", "2026-11-09T10:00:01Z"), true);
  assert.equal(isNewer("2026-11-09T10:00:01Z", "2026-11-09T10:00:05Z"), false);
  assert.equal(isNewer("2026-11-09T10:00:01Z", "2026-11-09T10:00:01Z"), false);
  assert.equal(isNewer("2026-11-09T10:00:01Z", null), true);
  assert.equal(isNewer(undefined, "2026-11-09T10:00:01Z"), false);
  assert.equal(isNewer("garbage", "2026-11-09T10:00:01Z"), false);
});

test("DER signature converts to a fixed 64-byte r||s, also with leading zero bytes", () => {
  const r = new Uint8Array(32).fill(1);
  const s = new Uint8Array(32).fill(2);
  r[0] = 0x81; // high bit set: DER adds a 0x00 prefix
  const der = new Uint8Array([0x30, 0x45, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s]);
  const raw = derToRawSignature(der);
  assert.equal(raw.length, 64);
  assert.deepEqual(Array.from(raw.slice(0, 32)), Array.from(r));
  assert.deepEqual(Array.from(raw.slice(32)), Array.from(s));
  assert.throws(() => derToRawSignature(new Uint8Array([1, 2, 3])), MonoError);
});

test("webhook signature: a real ECDSA signature verifies, a changed body or key does not", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const body = JSON.stringify({ invoiceId: "p2_x", status: "success", amount: 100000, modifiedDate: "2026-11-09T10:00:00Z" });
  const sig = createSign("SHA256").update(body).sign(privateKey).toString("base64");

  assert.equal(await verifyWebhookSignature(body, sig, pem), true);
  // monobank hands the key as base64 of the PEM text
  assert.equal(await verifyWebhookSignature(body, sig, Buffer.from(pem).toString("base64")), true);
  assert.equal(await verifyWebhookSignature(body.replace("100000", "1"), sig, pem), false);
  const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "pem" }) as string;
  assert.equal(await verifyWebhookSignature(body, sig, other), false);
});

test("webhook signature: missing or broken input is simply false", async () => {
  assert.equal(await verifyWebhookSignature("{}", null, "x"), false);
  assert.equal(await verifyWebhookSignature("{}", "abc", ""), false);
  assert.equal(await verifyWebhookSignature("{}", "not base64 !!", "also not a key"), false);
  assert.ok(spkiFromPem("-----BEGIN PUBLIC KEY-----\nQUJD\n-----END PUBLIC KEY-----").length === 3);
});
