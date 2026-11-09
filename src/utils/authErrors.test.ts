import test from "node:test";
import assert from "node:assert/strict";
import { friendlyAuthError } from "./authErrors.ts";

test("known Supabase errors are translated", () => {
  assert.match(friendlyAuthError(new Error("New password should be different from the old password."), "x"), /відрізнятися/);
  assert.match(friendlyAuthError({ message: "Invalid TOTP code entered" }, "x"), /Невірний код/);
  assert.match(friendlyAuthError(new Error("AAL2 session is required to update email or password when MFA is enabled."), "x"), /повторний вхід/);
  assert.match(friendlyAuthError(new Error("email rate limit exceeded"), "x"), /Забагато/);
});

test("own Ukrainian messages pass through, unknown English falls back", () => {
  assert.equal(friendlyAuthError(new Error("Поточний пароль невірний."), "x"), "Поточний пароль невірний.");
  assert.equal(friendlyAuthError(new Error("Some weird internal thing"), "Не вдалося."), "Не вдалося.");
  assert.equal(friendlyAuthError(undefined, "Не вдалося."), "Не вдалося.");
});

test("expired session and 2FA setup errors get their own messages", () => {
  assert.match(friendlyAuthError({ message: "invalid claim: missing sub claim" }, "x"), /Сеанс завершився/);
  assert.match(friendlyAuthError(new Error("Auth session missing!"), "x"), /Сеанс завершився/);
  assert.match(friendlyAuthError(new Error("A factor with the friendly name already exists"), "x"), /не завершено/);
});
