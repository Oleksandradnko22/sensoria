import assert from "node:assert/strict";
import test from "node:test";
import { isBankPageUrl, isPending, paymentView } from "./payment.ts";

test("only monobank's https pages are followed", () => {
  assert.equal(isBankPageUrl("https://pay.mbnk.biz/p2_9ZgpZVsl3"), true);
  assert.equal(isBankPageUrl("https://monobank.ua/pay/x"), true);
  assert.equal(isBankPageUrl("http://pay.mbnk.biz/x"), false);
  assert.equal(isBankPageUrl("https://pay.mbnk.biz.evil.com/x"), false);
  assert.equal(isBankPageUrl("https://evilmonobank.ua/x"), false);
  assert.equal(isBankPageUrl("javascript:alert(1)"), false);
  assert.equal(isBankPageUrl("not a url"), false);
});

test("each status gets an honest message", () => {
  assert.equal(paymentView("success", false).kind, "paid");
  assert.equal(paymentView("failure", false).kind, "failed");
  assert.equal(paymentView("expired", false).kind, "failed");
  assert.equal(paymentView("reversed", false).kind, "failed");
  assert.equal(paymentView("needs_review", false).kind, "review");
  assert.equal(paymentView("processing", false).kind, "wait");
  assert.notEqual(paymentView("processing", false).title, paymentView("processing", true).title);
});

test("pending statuses keep polling", () => {
  for (const s of [null, "created", "processing", "hold"]) assert.equal(isPending(s), true);
  for (const s of ["success", "failure", "expired", "reversed", "needs_review"]) assert.equal(isPending(s), false);
});
