import test from "node:test";
import assert from "node:assert/strict";
import { makeSlug, slugify, SLUG_PATTERN } from "./materialSlug.ts";

test("slugify transliterates Ukrainian", () => {
  assert.equal(slugify("Швидке заземлення"), "shvydke-zazemlennia");
  assert.equal(slugify("  Що робити, коли накриває?! "), "shcho-robyty-koly-nakryvaie");
});

test("makeSlug is valid, bounded and unique by suffix", () => {
  const s = makeSlug("Дихання 4-7-8", "A1b2-c3d4-e5");
  assert.match(s, SLUG_PATTERN);
  assert.ok(s.endsWith("-a1b2c3"));
  assert.ok(makeSlug("я".repeat(300), "abcdef").length <= 80);
  assert.match(makeSlug("???", "zz"), SLUG_PATTERN);
});
