import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "./emailFormat.ts";

test("email: any domain is accepted, malformed addresses are not", () => {
  for (const ok of ["name@example.com", "a.b@ukr.net", "x@i.ua", "test+1@meta.ua", "me@mail.co.uk", " q@gmail.com "]) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ["", "name", "name@", "@ukr.net", "name@ukr", "name@ukr.", "ім'я@ukr.net", "a b@x.ua"]) assert.equal(isValidEmail(bad), false, bad);
});
