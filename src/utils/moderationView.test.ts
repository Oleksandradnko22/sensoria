import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  filterRows,
  hasActiveFilters,
  needsAdminAttention,
  riskFilterUseful,
  sortNewestFirst,
  summarizeSenders,
  splitSenders,
  categoryLabel,
  type ModerationRow,
} from "./moderationView.ts";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const DAY = 86_400_000;
const row = (o: Partial<ModerationRow>): ModerationRow => ({
  id: "x",
  senderId: "u1",
  senderChatBan: { permanent: false, until: null, count: 0 },
  senderAccountBanned: false,
  senderName: "Sasha Lebedenko",
  senderEmail: "aleksandra.dnko@gmail.com",
  action: "ALLOW",
  riskScore: 0,
  categories: [],
  createdAt: new Date(NOW - DAY).toISOString(),
  ...o,
});

test("sortNewestFirst orders by date desc, bad dates last, no mutation", () => {
  const a = row({ id: "a", createdAt: new Date(NOW - 3 * DAY).toISOString() });
  const b = row({ id: "b", createdAt: new Date(NOW - DAY).toISOString() });
  const c = row({ id: "c", createdAt: "nope" });
  const input = [c, a, b];
  assert.deepEqual(sortNewestFirst(input).map((r) => r.id), ["b", "a", "c"]);
  assert.deepEqual(input.map((r) => r.id), ["c", "a", "b"]);
});

test("search is case-insensitive over name and email only", () => {
  const rows = [row({ id: "1" }), row({ id: "2", senderName: "Olena", senderEmail: "o@x.io" })];
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, query: "SASHA" }, NOW).map((r) => r.id), ["1"]);
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, query: "x.io" }, NOW).map((r) => r.id), ["2"]);
  assert.equal(filterRows(rows, { ...DEFAULT_FILTERS, query: "zzz" }, NOW).length, 0);
});

test("action filter", () => {
  const rows = [row({ id: "1" }), row({ id: "2", action: "BLOCK" })];
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, action: "BLOCK" }, NOW).map((r) => r.id), ["2"]);
});

test("risk filter: missing risk is neither risky nor zero", () => {
  const rows = [row({ id: "0", riskScore: 0 }), row({ id: "5", riskScore: 5 }), row({ id: "n", riskScore: null })];
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, risk: "risky" }, NOW).map((r) => r.id), ["5"]);
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, risk: "zero" }, NOW).map((r) => r.id), ["0"]);
});

test("period filter", () => {
  const rows = [
    row({ id: "new", createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    row({ id: "old", createdAt: new Date(NOW - 20 * DAY).toISOString() }),
  ];
  assert.deepEqual(filterRows(rows, { ...DEFAULT_FILTERS, days: 7 }, NOW).map((r) => r.id), ["new"]);
  assert.equal(filterRows(rows, { ...DEFAULT_FILTERS, days: 30 }, NOW).length, 2);
  assert.equal(filterRows(rows, DEFAULT_FILTERS, NOW).length, 2);
});

test("riskFilterUseful only when values vary", () => {
  assert.equal(riskFilterUseful([row({}), row({})]), false);
  assert.equal(riskFilterUseful([row({}), row({ riskScore: 3 })]), true);
  assert.equal(riskFilterUseful([]), false);
});

test("hasActiveFilters", () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, query: "  " }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, days: 7 }), true);
});

test("summarizeSenders: tallies WARN/BLOCK per sender, skips ALLOW, worst first", () => {
  const rows = [
    row({ id: "1", senderId: "a", senderName: "A", action: "WARN" }),
    row({ id: "2", senderId: "a", senderName: "A", action: "WARN" }),
    row({ id: "3", senderId: "b", senderName: "B", action: "BLOCK" }),
    row({ id: "4", senderId: "c", senderName: "C", action: "ALLOW" }),
  ];
  const s = summarizeSenders(rows);
  assert.deepEqual(s.map((x) => x.senderId), ["b", "a"]);
  assert.equal(s[1].warn, 2);
  assert.equal(s[1].total, 2);
  assert.equal(s[0].block, 1);
  assert.deepEqual(summarizeSenders([]), []);
});

test("needsAdminAttention: only from 10 BLOCKs, WARNs don't count", () => {
  assert.equal(needsAdminAttention({ block: 9 }), false);
  assert.equal(needsAdminAttention({ block: 10 }), true);
  const rows = Array.from({ length: 12 }, (_, i) => row({ id: String(i), senderId: "a", action: "WARN" }));
  assert.equal(needsAdminAttention(summarizeSenders(rows)[0]), false);
});

test("summarizeSenders carries the chat-ban flag", () => {
  const s = summarizeSenders([row({ senderId: "a", action: "BLOCK", senderChatBan: { permanent: true, until: null, count: 5 } })]);
  assert.equal(s[0].chatBan.permanent, true);
});

test("splitSenders: active chat ban or 10+ BLOCKs → needs action; the rest → watching", () => {
  const future = new Date(NOW + DAY).toISOString();
  const past = new Date(NOW - DAY).toISOString();
  const rows = [
    row({ id: "1", senderId: "banned", action: "BLOCK", senderChatBan: { permanent: false, until: future, count: 1 } }),
    row({ id: "2", senderId: "forever", action: "BLOCK", senderChatBan: { permanent: true, until: null, count: 5 } }),
    row({ id: "3", senderId: "expired", action: "BLOCK", senderChatBan: { permanent: false, until: past, count: 1 } }),
    row({ id: "4", senderId: "fresh", action: "WARN" }),
    ...Array.from({ length: 10 }, (_, i) => row({ id: `t${i}`, senderId: "ten", action: "BLOCK" })),
  ];
  const { needsAction, watching } = splitSenders(summarizeSenders(rows), NOW);
  assert.deepEqual(needsAction.map((s) => s.senderId).sort(), ["banned", "forever", "ten"]);
  assert.deepEqual(watching.map((s) => s.senderId).sort(), ["expired", "fresh"]);
});

test("categoryLabel falls back to the raw code", () => {
  assert.equal(categoryLabel("PROFANITY"), "Нецензурна лексика");
  assert.equal(categoryLabel("SOMETHING_NEW"), "SOMETHING_NEW");
});
