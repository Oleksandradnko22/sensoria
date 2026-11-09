import { test } from "node:test";
import assert from "node:assert/strict";
import { banStepLabel, chatBanState, formatRemaining, nextBanLabel, nextChatBan } from "./chatBan.ts";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const DAY = 86_400_000;

test("ladder: 3 → 7 → 14 → 30 days → permanent", () => {
  const days = (n: number) => {
    const b = nextChatBan(n, NOW);
    return b.permanent ? "forever" : Math.round((Date.parse(b.untilIso!) - NOW) / DAY);
  };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(days), [3, 7, 14, 30, "forever", "forever", "forever"]);
  assert.equal(nextChatBan(0, NOW).count, 1);
  assert.equal(nextChatBan(4, NOW).untilIso, null);
});

test("chatBanState: active, expired, permanent, none", () => {
  assert.deepEqual(chatBanState(null, NOW), { active: false });
  assert.deepEqual(chatBanState({ permanent: false, untilIso: null }, NOW), { active: false });
  assert.deepEqual(chatBanState({ permanent: false, untilIso: new Date(NOW - 1).toISOString() }, NOW), { active: false });
  assert.deepEqual(chatBanState({ permanent: false, untilIso: "garbage" }, NOW), { active: false });
  assert.deepEqual(chatBanState({ permanent: true, untilIso: null }, NOW), { active: true, permanent: true });
  const s = chatBanState({ permanent: false, untilIso: new Date(NOW + 2 * DAY).toISOString() }, NOW);
  assert.equal(s.active && !s.permanent && s.remainingMs, 2 * DAY);
});

test("formatRemaining", () => {
  assert.equal(formatRemaining(2 * DAY + 14 * 3_600_000 + 5 * 60_000 + 9_000), "2 д 14 год 05 хв 09 с");
  assert.equal(formatRemaining(3_661_000), "01 год 01 хв 01 с");
  assert.equal(formatRemaining(-5), "00 год 00 хв 00 с");
});

test("labels", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(banStepLabel), ["3 дні", "7 днів", "14 днів", "30 днів", "назавжди"]);
  assert.equal(nextBanLabel(0), "3 дні");
  assert.equal(nextBanLabel(4), "назавжди");
});

test("send-message carries an identical copy of the ladder", async () => {
  const { readFileSync } = await import("node:fs");
  const take = (file: string) => {
    const s = readFileSync(new URL(file, import.meta.url), "utf8");
    const a = s.indexOf("// ---- BEGIN CHATBAN ----");
    const b = s.indexOf("// ---- END CHATBAN ----");
    assert.ok(a >= 0 && b > a, `markers missing in ${file}`);
    return s.slice(a, b).replace(/export (type|function)/g, "$1");
  };
  assert.equal(take("../../supabase/functions/send-message/index.ts"), take("./chatBan.ts"));
});
