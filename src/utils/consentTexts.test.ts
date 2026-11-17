import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTHOR_ITEMS, AUTHOR_PAID_ITEM, HEALTH_HINT, OTP_TEXT, PARTICIPANT_ITEMS } from "../data/consentTexts.ts";

const participantMd = readFileSync("docs/legal/participant-agreement.md", "utf8");
const authorMd = readFileSync("docs/legal/author-consent.md", "utf8");

test("participant checkbox texts match docs/legal/participant-agreement.md letter for letter", () => {
  for (const it of PARTICIPANT_ITEMS) assert.ok(participantMd.includes(`| ${it.key.slice(1)} | ${it.text} | ${it.required ? "так" : "ні"} |`), it.key);
  assert.ok(participantMd.includes(`Підказка під галочкою 4: «${HEALTH_HINT}»`));
});

test("author checkbox and code texts match docs/legal/author-consent.md letter for letter", () => {
  for (const it of [...AUTHOR_ITEMS, AUTHOR_PAID_ITEM]) assert.ok(authorMd.includes(`| ${it.key.toUpperCase()} | ${it.text} |`), it.key);
  assert.ok(authorMd.includes(`> ${OTP_TEXT}`));
  assert.ok(OTP_TEXT.includes("{{email автора}}"));
});
