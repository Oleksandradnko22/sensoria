import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPrice, isFreePrice, parsePrice } from "./price.ts";

// Grouping uses a no-break space in uk-UA; compare with all spaces normalised.
const norm = (s: string) => s.replace(/\s/g, " ");

test("every representation of zero is free", () => {
  for (const v of [0, "0", "0.00", "0.0", " 0 ", "000"]) {
    assert.equal(isFreePrice(v), true, JSON.stringify(v));
    assert.equal(formatPrice(v), "Безкоштовно", JSON.stringify(v));
  }
});

test("the legacy label «Безкоштовно» (hand-written demo data) is free", () => {
  assert.equal(isFreePrice("Безкоштовно"), true);
  assert.equal(isFreePrice("безкоштовно"), true);
  assert.equal(formatPrice("Безкоштовно"), "Безкоштовно");
});

test("an empty or missing price is never free", () => {
  for (const v of ["", "   ", null, undefined]) {
    assert.equal(isFreePrice(v), false, JSON.stringify(v));
    assert.equal(formatPrice(v), "Ціна не вказана", JSON.stringify(v));
    assert.equal(parsePrice(v), null);
  }
});

test("positive prices are formatted with grouping and the hryvnia sign", () => {
  assert.equal(norm(formatPrice("1500")), "1 500 ₴");
  assert.equal(norm(formatPrice(1500)), "1 500 ₴");
  assert.equal(norm(formatPrice("1500.00")), "1 500 ₴");
  assert.equal(norm(formatPrice("800")), "800 ₴");
  assert.equal(norm(formatPrice("1250.5")), "1 250,5 ₴");
  assert.equal(isFreePrice("1500"), false);
  assert.equal(isFreePrice(0.5), false);
});

test("never uses «грн»", () => {
  assert.ok(!formatPrice("1500").includes("грн"));
});

test("malformed values are not free and not shown as an amount", () => {
  for (const v of ["abc", "1e3", "12abc", "-5", -5, NaN, Infinity, "1,5", "0x10", "₴1500"]) {
    assert.equal(isFreePrice(v as never), false, String(v));
    assert.equal(formatPrice(v as never), "Ціна не вказана", String(v));
    assert.equal(parsePrice(v as never), null, String(v));
  }
});

test("parsePrice returns the amount for valid input", () => {
  assert.equal(parsePrice("1500"), 1500);
  assert.equal(parsePrice(250), 250);
  assert.equal(parsePrice("0.00"), 0);
});
