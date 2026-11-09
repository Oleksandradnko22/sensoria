import test from "node:test";
import assert from "node:assert/strict";
import { buildReferralLink, parseRefParam, readStoredReferral, serializeReferral, REFERRAL_WINDOW_DAYS } from "./referral.ts";

const A = "0a8637b3-bccb-42aa-93fd-eb791b8b58e9";
const NOW = Date.UTC(2026, 10, 10);

test("parseRefParam accepts only a uuid", () => {
  assert.equal(parseRefParam(`?ref=${A}`), A);
  assert.equal(parseRefParam(`?x=1&ref=${A.toUpperCase()}`), A);
  assert.equal(parseRefParam("?ref=andrii"), null);
  assert.equal(parseRefParam("?ref="), null);
  assert.equal(parseRefParam(""), null);
  assert.equal(parseRefParam(`?ref=${A}'; drop table`), null);
});

test("link is built for the author's own profile", () => {
  assert.equal(buildReferralLink("https://sensoria.app/", A), `https://sensoria.app/authors/${A}?ref=${A}`);
});

test("stored referral: valid, expired, future, corrupt", () => {
  assert.deepEqual(readStoredReferral(serializeReferral(A, NOW), NOW + 1000), { authorId: A, at: NOW });
  assert.ok(readStoredReferral(serializeReferral(A, NOW), NOW + (REFERRAL_WINDOW_DAYS - 1) * 86_400_000));
  assert.equal(readStoredReferral(serializeReferral(A, NOW), NOW + (REFERRAL_WINDOW_DAYS + 1) * 86_400_000), null);
  assert.equal(readStoredReferral(serializeReferral(A, NOW + 3_600_000), NOW), null);
  assert.equal(readStoredReferral("not json", NOW), null);
  assert.equal(readStoredReferral(JSON.stringify({ authorId: "x", at: NOW }), NOW), null);
  assert.equal(readStoredReferral(null, NOW), null);
});
