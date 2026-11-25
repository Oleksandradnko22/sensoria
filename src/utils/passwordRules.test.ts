import test from "node:test";
import assert from "node:assert/strict";
import { isPasswordValid } from "./passwordRules.ts";

test("valid: 8+, latin, has a special character", () => {
  assert.equal(isPasswordValid("abcdef1!"), true);
  assert.equal(isPasswordValid("Pa55word."), true);
});

test("invalid: short, no special, non-latin, spaces", () => {
  assert.equal(isPasswordValid("abc1!"), false);
  assert.equal(isPasswordValid("abcdefgh1"), false);
  assert.equal(isPasswordValid("парольабв1!"), false);
  assert.equal(isPasswordValid("abcdef 1!"), false);
  assert.equal(isPasswordValid(""), false);
});

test("any non-letter symbol counts as special (€, №, £); Cyrillic still rejected", () => {
  assert.equal(isPasswordValid("Riss29272212€"), true);
  assert.equal(isPasswordValid("Password№1"), true);
  assert.equal(isPasswordValid("Пароль12345!"), false);
  assert.equal(isPasswordValid("Riss2927 2212!"), false);
});
