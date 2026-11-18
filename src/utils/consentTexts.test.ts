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

test("the immediate-access request in the payment server matches the agreement letter for letter", () => {
  const handler = readFileSync("scripts/finance-handler.ts", "utf8");
  const md = participantMd.match(/## Галочка на сторінці оплати[\s\S]*?\n> (.+)\n/);
  assert.ok(md, "checkbox text in participant-agreement.md");
  const text = md[1].replace("{{назва ФОП/ТОВ автора}}", "{{назва ФОП/ТОВ автора}}");
  assert.ok(handler.includes(JSON.stringify(text)), "IMMEDIATE_ACCESS_TEXT in finance-handler.ts");
  assert.ok(readFileSync("src/components/cart/CartPage.tsx", "utf8").includes(JSON.stringify(text)), "IMMEDIATE_TEMPLATE in CartPage.tsx");
});
