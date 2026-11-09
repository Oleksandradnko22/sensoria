import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, normalizeSearch, sortSaved } from "./savedLibrary.ts";

test("normalizeSearch: case, apostrophes, spaces", () => {
  assert.equal(normalizeSearch("  Об’єм   ТРИВОГИ "), "об'єм тривоги");
  assert.equal(normalizeSearch("ʼ"), "'");
});

test("empty query matches everything", () => {
  assert.equal(matchesSearch(["x"], ""), true);
  assert.equal(matchesSearch([], "   "), true);
});

test("matches across fields, any order, case-insensitive", () => {
  const f = ["Техніка дихання", "Робота зі стресом", "Марія Шевченко"];
  assert.equal(matchesSearch(f, "стрес"), true);
  assert.equal(matchesSearch(f, "ШЕВЧЕНКО дихання"), true);
  assert.equal(matchesSearch(f, "медитація"), false);
});

test("every word must match; null/undefined fields are ignored", () => {
  assert.equal(matchesSearch(["a", null, undefined, "b"], "a b"), true);
  assert.equal(matchesSearch(["a"], "a b"), false);
});

test("apostrophe variants match each other", () => {
  assert.equal(matchesSearch(["Об'єм"], "об’єм"), true);
});

const it = (title: string, at: string) => ({ title, at });

test("sort recent: newest first, invalid last, ties stable", () => {
  const r = sortSaved(
    [it("a", "2026-09-01T00:00:00Z"), it("bad", "x"), it("b", "2026-10-01T00:00:00Z"), it("c", "2026-09-01T00:00:00Z")],
    "recent"
  );
  assert.deepEqual(r.map((x) => x.title), ["b", "a", "c", "bad"]);
});

test("sort az / za with Ukrainian collation and numbers", () => {
  const items = [it("Яблуко", ""), it("Алфавіт", ""), it("Їжак", ""), it("Урок 10", ""), it("Урок 2", "")];
  assert.deepEqual(sortSaved(items, "az").map((x) => x.title), ["Алфавіт", "Їжак", "Урок 2", "Урок 10", "Яблуко"]);
  assert.deepEqual(sortSaved(items, "za").map((x) => x.title), ["Яблуко", "Урок 10", "Урок 2", "Їжак", "Алфавіт"]);
});

test("sort does not mutate or drop items", () => {
  const items = [it("b", "2026-01-01T00:00:00Z"), it("a", "2026-02-01T00:00:00Z")];
  const r = sortSaved(items, "az");
  assert.equal(r.length, 2);
  assert.deepEqual(items.map((x) => x.title), ["b", "a"]);
});
