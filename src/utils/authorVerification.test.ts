import { test } from "node:test";
import assert from "node:assert/strict";
import { missingProfileParts, validateVerificationFiles } from "./authorVerification.ts";

test("validateVerificationFiles", () => {
  assert.ok(validateVerificationFiles([]));
  assert.equal(validateVerificationFiles([{ type: "image/jpeg", size: 1000 }]), null);
  assert.ok(validateVerificationFiles([{ type: "image/gif", size: 1000 }]));
  assert.ok(validateVerificationFiles([{ type: "application/pdf", size: 9 * 1024 * 1024 }]));
  assert.ok(validateVerificationFiles(Array.from({ length: 4 }, () => ({ type: "image/png", size: 1 }))));
});

test("missingProfileParts lists what is empty", () => {
  assert.deepEqual(missingProfileParts({ name: "A", title: "T", bio: "B" }), []);
  assert.equal(missingProfileParts({ name: "A", title: " ", bio: "" }).length, 2);
});
