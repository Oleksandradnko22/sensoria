// Tests for the messaging moderation pipeline (docs/messaging-moderation-architecture.md).
//
// Uses Node's built-in test runner (node:test), not vitest/jest — this
// sandbox has no npm registry access to install a new dependency, and the
// built-in runner needs nothing extra. Run with:
//   npm test
// (equivalent to: node --experimental-strip-types --test src/utils/*.test.ts)
// Swapping to vitest/jest later, if the project ends up wanting one for
// other reasons, is a small mechanical change — the test bodies below
// don't depend on which runner executes them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { moderateMessage, recordViolation } from "./contactFilter.ts";

const SHOULD_BLOCK = [
  "Напишіть мені в Instagram",
  "Давайте продовжимо в Telegram",
  "Скиньте свій номер",
  "Ось мій WhatsApp",
  "Мій email нижче",
  "Зв'яжіться зі мною напряму",
  "Можемо поговорити поза платформою",
  "tg: username",
  "нік: username",
  "instagram.com/username",
  "name [at] gmail.com",
  "name at gmail dot com",
  "+380 67 123 45 67",
  "067.123.45.67",
  "скину реквізити",
  "оплата на карту",
  "Якщо хочете індивідуальну роботу, пишіть мені в Telegram.",
  "Дайте ваш номер.",
  "Можна ваш Instagram?",
  "і н с т а @username",
  "Напишіть мені в тг",
  "напишіть на інст",
];

const SHOULD_ALLOW = [
  "Соціальні мережі можуть посилювати тривожність.",
  "Практика проходить у Києві.",
  "Дякую за курс, дуже допомогло!",
  "support@sensoria.app",
  "Модуль 2 відкриється завтра.",
  "Давайте зробимо цю вправу разом на наступному занятті.",
  "Мій прогрес значно покращився за цей тиждень.",
  "У мене є інст, але я туди рідко заходжу.",
];

test("blocks clear contact-exchange / off-platform attempts", () => {
  for (const text of SHOULD_BLOCK) {
    const result = moderateMessage(text);
    assert.equal(
      result.action,
      "BLOCK",
      `expected BLOCK for "${text}", got ${result.action} (score ${result.riskScore})`
    );
  }
});

test("allows benign messages, including Sensoria's own email", () => {
  for (const text of SHOULD_ALLOW) {
    const result = moderateMessage(text);
    assert.equal(
      result.action,
      "ALLOW",
      `expected ALLOW for "${text}", got ${result.action} (score ${result.riskScore})`
    );
  }
});

test("flags an unknown shortener link as WARN, not a hard BLOCK", () => {
  const result = moderateMessage("Подивіться https://tinyurl.com/abc123");
  assert.equal(result.action, "WARN");
});

test("empty input is always ALLOW", () => {
  assert.equal(moderateMessage("").action, "ALLOW");
  assert.equal(moderateMessage("   ").action, "ALLOW");
});

test("recordViolation counts per conversation key independently", () => {
  const key = `test-${Date.now()}`;
  assert.equal(recordViolation(key), 1);
  assert.equal(recordViolation(key), 2);
  assert.equal(recordViolation(key), 3);
  assert.equal(recordViolation(`${key}-other`), 1);
});

import { containsProfanity, moderateMessage as moderateWithProfanity } from "./contactFilter.ts";
import { test as profTest } from "node:test";
import profAssert from "node:assert/strict";

profTest("profanity is BLOCKed on its own and reported as PROFANITY", () => {
  const r = moderateWithProfanity("ти повний мудак");
  profAssert.equal(r.action, "BLOCK");
  profAssert.ok(r.categories.includes("PROFANITY"));
  profAssert.equal(containsProfanity("ти повний мудак"), true);
  profAssert.equal(containsProfanity("Дякую, дуже корисна програма!"), false);
});

profTest("a contact-only message is not labelled profanity", () => {
  const r = moderateWithProfanity("пишіть мені на test@gmail.com");
  profAssert.equal(r.categories.includes("PROFANITY"), false);
});
