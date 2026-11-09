import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GUIDE_FILTERS, GUIDE_SORT_OPTIONS, filterAndSortGuides, matchesGuidePrice, type GuideLike } from "./guideCatalogFilters.ts";

const G = (title: string, extra: Partial<GuideLike> = {}): GuideLike => ({ title, price: "0", tags: [], category: "PDF-гайди", ...extra });
const titles = (list: GuideLike[]) => list.map((g) => g.title);

const data = [
  G("Тривога", { price: "0", tags: ["anxiety", "stress"], category: "Міні-гайди", author: "Sensoria", publishedAt: "2026-10-06", rating: 4.2 }),
  G("Вигорання", { price: "1500", tags: ["burnout"], category: "Воркбуки", author: "Марія", publishedAt: "2026-03-01", rating: 4.9, tag: "Популярний" }),
  G("Самооцінка", { price: "2500", tags: ["selfEsteem"], category: "Чек-листи", author: "Андрій" }),
  G("Сон", { price: "500", tags: ["stress"], author: "Андрій", publishedAt: "2026-08-15" }),
];

test("default filters keep everything in catalog order", () => {
  assert.deepEqual(titles(filterAndSortGuides(data, DEFAULT_GUIDE_FILTERS)), ["Тривога", "Вигорання", "Самооцінка", "Сон"]);
});

test("state filter matches any selected tag", () => {
  const f = { ...DEFAULT_GUIDE_FILTERS, states: ["stress", "burnout"] };
  assert.deepEqual(titles(filterAndSortGuides(data, f)), ["Тривога", "Вигорання", "Сон"]);
});

test("search is trimmed, case-insensitive, by title or author", () => {
  assert.deepEqual(titles(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, search: "  ТРИВ " })), ["Тривога"]);
  assert.deepEqual(titles(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, search: "андрій" })), ["Самооцінка", "Сон"]);
  assert.deepEqual(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, search: "zzz" }), []);
});

test("price ranges do not overlap and free means exactly 0", () => {
  const price = (p: string) => titles(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, price: p }));
  assert.deepEqual(price("Безкоштовно"), ["Тривога"]);
  assert.deepEqual(price("До 1000₴"), ["Сон"]);
  assert.deepEqual(price("1000–2000₴"), ["Вигорання"]);
  assert.deepEqual(price("2000₴+"), ["Самооцінка"]);
  assert.equal(matchesGuidePrice(G("x", { price: "1000" }), "До 1000₴"), true);
  assert.equal(matchesGuidePrice(G("x", { price: "1000" }), "1000–2000₴"), false);
  assert.equal(matchesGuidePrice(G("x", { price: "" }), "Безкоштовно"), false);
});

test("format filter matches the guide category; filters combine", () => {
  assert.deepEqual(titles(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, format: "Воркбуки" })), ["Вигорання"]);
  assert.deepEqual(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, format: "Воркбуки", states: ["anxiety"] }), []);
});

test("sorting changes only the order", () => {
  const sort = (s: (typeof GUIDE_SORT_OPTIONS)[number]["id"]) => titles(filterAndSortGuides(data, { ...DEFAULT_GUIDE_FILTERS, sort: s }));
  assert.deepEqual(sort("cheap"), ["Тривога", "Сон", "Вигорання", "Самооцінка"]);
  assert.deepEqual(sort("expensive"), ["Самооцінка", "Вигорання", "Сон", "Тривога"]);
  assert.deepEqual(sort("rating"), ["Вигорання", "Тривога", "Самооцінка", "Сон"]);
  assert.deepEqual(sort("new"), ["Тривога", "Сон", "Вигорання", "Самооцінка"]); // undated last
  assert.deepEqual(sort("popular"), ["Вигорання", "Тривога", "Самооцінка", "Сон"]);
  assert.deepEqual(GUIDE_SORT_OPTIONS.map((o) => o.id), ["default", "popular", "rating", "new", "cheap", "expensive"]);
});

test("an unpriced guide never breaks a price sort", () => {
  const list = [G("a", { price: "300" }), G("b", { price: "" }), G("c", { price: "100" })];
  assert.deepEqual(titles(filterAndSortGuides(list, { ...DEFAULT_GUIDE_FILTERS, sort: "cheap" })), ["b", "c", "a"]);
});
