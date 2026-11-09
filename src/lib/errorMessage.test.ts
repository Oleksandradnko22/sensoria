import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "./errorMessage.ts";

test("real Error instance -> its .message", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
});

test("plain object with a string .message (e.g. Supabase's PostgrestError) -> that message, not '[object Object]'", () => {
  const postgrestLikeError = { message: "duplicate key value", details: "...", hint: null, code: "23505" };
  assert.equal(errorMessage(postgrestLikeError), "duplicate key value");
});

test("plain string thrown -> the string itself", () => {
  assert.equal(errorMessage("something broke"), "something broke");
});

test("object with no usable .message -> the fallback, not '[object Object]'", () => {
  assert.equal(errorMessage({ code: "23505" }), "Сталася невідома помилка.");
});

test("object with an empty-string .message -> the fallback, not an empty banner", () => {
  assert.equal(errorMessage({ message: "" }), "Сталася невідома помилка.");
});

test("null/undefined -> the fallback", () => {
  assert.equal(errorMessage(null), "Сталася невідома помилка.");
  assert.equal(errorMessage(undefined), "Сталася невідома помилка.");
});

test("custom fallback is honored", () => {
  assert.equal(errorMessage({}, "Спробуйте ще раз."), "Спробуйте ще раз.");
});
