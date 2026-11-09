import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MEDITATION_FILTERS as D, filterAndSortMeditations, matchesDuration } from "./meditationCatalogFilters.ts";

const M = (title: string, durationMinutes: number, tags: string[], description = "") => ({ title, durationMinutes, tags, description });
const items = [M("Дихання", 3, ["anxiety"]), M("Сон", 12, ["stress"]), M("Ранок", 7, ["anxiety", "stress"], "Легкий старт дня")];

test("duration ranges do not overlap", () => {
  assert.equal(matchesDuration(5, "До 5 хв"), true);
  assert.equal(matchesDuration(5, "5–10 хв"), false);
  assert.equal(matchesDuration(10, "5–10 хв"), true);
  assert.equal(matchesDuration(10, "Понад 10 хв"), false);
  assert.equal(matchesDuration(11, "Понад 10 хв"), true);
});

test("default keeps all items in catalog order", () => {
  assert.deepEqual(filterAndSortMeditations(items, D).map((m) => m.title), ["Дихання", "Сон", "Ранок"]);
});

test("filters by state, duration and search (title or description)", () => {
  assert.deepEqual(filterAndSortMeditations(items, { ...D, states: ["anxiety"] }).map((m) => m.title), ["Дихання", "Ранок"]);
  assert.deepEqual(filterAndSortMeditations(items, { ...D, duration: "5–10 хв" }).map((m) => m.title), ["Ранок"]);
  assert.deepEqual(filterAndSortMeditations(items, { ...D, search: " старт " }).map((m) => m.title), ["Ранок"]);
});

test("every catalog uses the same sort list", async () => {
  const { CATALOG_SORT_OPTIONS } = await import("./catalogSort.ts");
  const { SORT_OPTIONS } = await import("./catalogFilters.ts");
  const { GUIDE_SORT_OPTIONS } = await import("./guideCatalogFilters.ts");
  const { MEDITATION_SORT_OPTIONS } = await import("./meditationCatalogFilters.ts");
  assert.deepEqual(SORT_OPTIONS, CATALOG_SORT_OPTIONS);
  assert.deepEqual(GUIDE_SORT_OPTIONS, CATALOG_SORT_OPTIONS);
  assert.deepEqual(MEDITATION_SORT_OPTIONS, CATALOG_SORT_OPTIONS);
});

test("a meditation without a date or rating keeps the catalog order; dated ones sort newest first", () => {
  assert.deepEqual(filterAndSortMeditations(items, { ...D, sort: "new" }).map((m) => m.title), ["Дихання", "Сон", "Ранок"]);
  const dated = [{ ...items[0], publishedAt: "2026-01-01" }, { ...items[1], publishedAt: "2026-05-01" }];
  assert.deepEqual(filterAndSortMeditations(dated, { ...D, sort: "new" }).map((m) => m.title), ["Сон", "Дихання"]);
  assert.deepEqual(filterAndSortMeditations(items, { ...D, sort: "cheap" }).map((m) => m.title), ["Дихання", "Сон", "Ранок"]);
});
