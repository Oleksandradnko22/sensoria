import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import {
  MONO_CMS_NAME, MonoError, bankFeeKop, buildInvoiceBody, buildSplitBasket, cardOrigin, derToRawSignature, effectOf, isNewer, parseStatus, spkiFromPem,
  verifyWebhookSignature, withoutSplit,
} from "./monoAcquiring.ts";

const base = {
  amountKop: 100000,
  authorKop: 70000,
  sensoriaKop: 30000,
  title: "Програма: спокій у тривозі",
  contentCode: "c1",
  authorReceiverId: "rcv-author",
};

test("cms name is the one monobank asked for", () => {
  assert.equal(MONO_CMS_NAME, "sensoria");
});

test("basket: one item, the author's, at the full price; Sensoria's part goes as agentFeePercent", () => {
  const { amount, basketOrder, agentFeePercent } = buildSplitBasket(base);
  assert.equal(amount, 100000);
  assert.equal(basketOrder.length, 1);
  assert.equal(basketOrder[0].splitReceiverId, "rcv-author");
  assert.equal(basketOrder[0].sum, 100000);
  assert.equal(basketOrder[0].total, 100000);
  assert.equal(agentFeePercent, 30);
});

test("basket: the referral rate (15%) and a Sensoria-free sale", () => {
  assert.equal(buildSplitBasket({ ...base, authorKop: 85000, sensoriaKop: 15000 }).agentFeePercent, 15);
  assert.equal(buildSplitBasket({ ...base, authorKop: 100000, sensoriaKop: 0 }).agentFeePercent, 0);
});

test("basket: an odd price still gives Sensoria its part within a kopeck", () => {
  const amountKop = 33333;
  const sensoriaKop = 10000; // 30.0003%
  const { agentFeePercent } = buildSplitBasket({ ...base, amountKop, sensoriaKop, authorKop: amountKop - sensoriaKop });
  assert.ok(Math.abs(Math.round((amountKop * agentFeePercent) / 100) - sensoriaKop) <= 1);
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
});

test("basket: long titles are cut, the code is the content id", () => {
  const { basketOrder } = buildSplitBasket({ ...base, title: "А".repeat(300) });
  assert.ok(basketOrder[0].name.length <= 60);
  assert.equal(basketOrder[0].code, "c1");
});

test("invoice body carries our reference, urls, UAH and the agent fee", () => {
  const b = buildInvoiceBody({ ...base, reference: "intent-1", redirectUrl: "https://sensoria.courses/payment-result", webHookUrl: "https://x.supabase.co/functions/v1/mono-webhook" });
  assert.equal(b.ccy, 980);
  assert.equal(b.merchantPaymInfo.reference, "intent-1");
  assert.equal(b.amount, 100000);
  assert.equal(b.paymentType, "debit");
  assert.equal(b.agentFeePercent, 30);
  assert.ok(b.webHookUrl.endsWith("/mono-webhook"));
});

test("test mode: the same invoice without split fields", () => {
  const b = withoutSplit(buildInvoiceBody({ ...base, reference: "r", redirectUrl: "https://a", webHookUrl: "https://b" }));
  assert.equal("agentFeePercent" in b, false);
  assert.equal("splitReceiverId" in b.merchantPaymInfo.basketOrder[0], false);
  assert.equal(b.amount, 100000);
});

test("card origin and bank fee from paymentInfo", () => {
  assert.equal(cardOrigin({ country: "804" }), "ua");
  assert.equal(cardOrigin({ country: "840" }), "foreign");
  assert.equal(cardOrigin({}), "unknown");
  assert.equal(cardOrigin(null), "unknown");
  assert.equal(bankFeeKop({ fee: 1300 }), 1300);
  assert.equal(bankFeeKop({}), null);
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
