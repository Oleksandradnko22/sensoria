import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS, SORT_OPTIONS, activeChips, applyClear, categoriesForTags, categoryLabelForTags, normalizeCategories, filterAndSortPrograms, toggleCategory, type CatalogProgram,
} from "./catalogFilters.ts";

const P = (title: string, price: string, tags: string[] = [], rating?: number): CatalogProgram => ({ title, price, tags, rating });
const data = [
  P("Підтримка балансу", "0", ["healthyBalance"]),
  P("Робота зі стресом", "1500", ["stress"], 4.5),
  P("Самооцінка", "0", ["selfEsteem"], 4.9),
  P("Здорові стосунки", "1800", ["relationships", "emotionalBalance"]),
  P("Усвідомленість", "900", ["awareness"]),
  P("Спокій", "2500", ["stress", "burnout"]),
];
const titles = (l: CatalogProgram[]) => l.map((p) => p.title);

test("defaults keep everything in source order", () => {
  assert.deepEqual(titles(filterAndSortPrograms(data, DEFAULT_FILTERS)), titles(data));
});

test("search is by title, case-insensitive", () => {
  assert.deepEqual(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, search: "СТРЕС" })), ["Робота зі стресом"]);
});

test("price buckets: free is only real zero; low ≤1000, high >2000", () => {
  const f = (price: "free" | "low" | "medium" | "high") => titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, price }));
  assert.deepEqual(f("free"), ["Підтримка балансу", "Самооцінка"]);
  assert.deepEqual(f("low"), ["Усвідомленість"]);
  assert.deepEqual(f("medium"), ["Робота зі стресом", "Здорові стосунки"]);
  assert.deepEqual(f("high"), ["Спокій"]);
  // an empty price is never "free"
  assert.equal(filterAndSortPrograms([P("x", "")], { ...DEFAULT_FILTERS, price: "free" }).length, 0);
});

test("categories are multi-select and match tags", () => {
  assert.deepEqual(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, categories: ["stress"] })), ["Робота зі стресом", "Спокій"]);
  assert.deepEqual(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, categories: ["burnout", "relationships"] })), ["Здорові стосунки", "Спокій"]);
});

test("sorting", () => {
  assert.deepEqual(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, sort: "cheap" })).slice(0, 2), ["Підтримка балансу", "Самооцінка"]);
  assert.equal(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, sort: "expensive" }))[0], "Спокій");
  assert.equal(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, sort: "rating" }))[0], "Самооцінка");
});

test("does not mutate the input", () => {
  const copy = titles(data);
  filterAndSortPrograms(data, { ...DEFAULT_FILTERS, sort: "expensive" });
  assert.deepEqual(titles(data), copy);
});

test("toggleCategory: 'all' clears, others toggle", () => {
  assert.deepEqual(toggleCategory([], "stress"), ["stress"]);
  assert.deepEqual(toggleCategory(["stress", "burnout"], "stress"), ["burnout"]);
  assert.deepEqual(toggleCategory(["stress"], "all"), []);
});

test("chips show only non-default filters and can be cleared one by one", () => {
  assert.deepEqual(activeChips(DEFAULT_FILTERS), []);
  const f = { search: " сон ", price: "free" as const, sort: "cheap" as const, categories: ["stress", "burnout"] };
  const chips = activeChips(f);
  assert.deepEqual(chips.map((c) => c.label), ["«сон»", "Стрес", "Вигорання", "Безкоштовно", "Дешеві"]);
  let cur = f;
  for (const c of chips) cur = applyClear(cur, c.clear);
  assert.deepEqual(cur, { search: "", price: "all", sort: "default", categories: [] });
});

test("card label is the first tag with a name, null otherwise", () => {
  assert.equal(categoryLabelForTags(["healthyBalance"]), "Емоційний баланс");
  assert.equal(categoryLabelForTags(["unknown", "awareness"]), "Усвідомленість");
  assert.equal(categoryLabelForTags(["unknown"]), null);
  assert.equal(categoryLabelForTags(undefined), null);
});

test("the card's category and the filter agree: healthyBalance is «Емоційний баланс», unnamed tags are «Інше»", () => {
  const f = (categories: string[]) => titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, categories }));
  assert.deepEqual(f(["emotionalBalance"]), ["Підтримка балансу", "Здорові стосунки"]);
  assert.deepEqual(f(["other"]), ["Усвідомленість"]);
  assert.deepEqual(categoriesForTags(["innerPressure"]), ["stress"]);
  assert.deepEqual(categoriesForTags(undefined), ["other"]);
});

test("search ignores surrounding spaces and also finds the author", () => {
  assert.deepEqual(titles(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, search: "  стрес " })), ["Робота зі стресом"]);
  const withAuthor = [{ ...P("Назва", "0"), author: "Маша Лопотова" }, P("Інша", "0")];
  assert.deepEqual(titles(filterAndSortPrograms(withAuthor, { ...DEFAULT_FILTERS, search: "лопот" })), ["Назва"]);
});

test("a price on the boundary is in exactly one bucket; a broken price never breaks sorting", () => {
  const edge = [P("a", "1000"), P("b", "2000"), P("c", "oops")];
  const f = (price: "low" | "medium" | "high") => titles(filterAndSortPrograms(edge, { ...DEFAULT_FILTERS, price }));
  assert.deepEqual(f("low"), ["a"]);
  assert.deepEqual(f("medium"), ["b"]);
  assert.deepEqual(f("high"), []);
  assert.deepEqual(titles(filterAndSortPrograms(edge, { ...DEFAULT_FILTERS, sort: "cheap" })), ["c", "a", "b"]);
});

test("categories from outside are normalized to filter categories", () => {
  assert.deepEqual(normalizeCategories(["healthyBalance", "innerPressure", "stress", "awareness", "nonsense"]), ["emotionalBalance", "stress"]);
  assert.deepEqual(normalizeCategories(["other", "anxiety"]), ["other", "anxiety"]);
});

test("«Нові» puts the newest first and undated programs last; the default keeps the source order", () => {
  const A = (title: string, addedAt?: string): CatalogProgram => ({ title, price: "0", tags: [], addedAt });
  const data = [A("old", "2026-01-01T00:00:00Z"), A("none"), A("fresh", "2026-10-01T00:00:00Z")];
  assert.deepEqual(filterAndSortPrograms(data, { ...DEFAULT_FILTERS, sort: "new" }).map((p) => p.title), ["fresh", "old", "none"]);
  assert.deepEqual(filterAndSortPrograms(data, DEFAULT_FILTERS).map((p) => p.title), ["old", "none", "fresh"]);
  assert.deepEqual(SORT_OPTIONS.map((o) => o.id), ["default", "popular", "rating", "new", "cheap", "expensive"]);
});
