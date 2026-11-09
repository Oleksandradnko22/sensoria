import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRatings, shortName, groupAuthorContent, formatMonthYear, formatPostDate, ratingRows, formatRating, filterReviews, sortReviews } from "./authorProfileView.ts";

test("summarizeRatings", () => {
  const s = summarizeRatings([5, 5, 4, 1, 9, NaN]);
  assert.equal(s.count, 4);
  assert.equal(s.average, 3.75);
  assert.deepEqual(s.distribution, [2, 1, 0, 0, 1]);
  assert.deepEqual(summarizeRatings([]), { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] });
});

test("shortName", () => {
  assert.equal(shortName("Олена Кравченко"), "Олена К.");
  assert.equal(shortName("Олена"), "Олена");
  assert.equal(shortName(""), "Учасник Sensoria");
  assert.equal(shortName(null), "Учасник Sensoria");
});

test("groupAuthorContent orders, dedupes and drops empty groups", () => {
  const g = groupAuthorContent([
    { id: "m1", kind: "meditation", title: "M", description: "" },
    { id: "p1", kind: "program", title: "P", description: "" },
    { id: "p1", kind: "program", title: "P", description: "" },
  ]);
  assert.deepEqual(g.map((x) => x.kind), ["program", "meditation"]);
  assert.equal(g[0].items.length, 1);
});

test("formatMonthYear", () => {
  assert.equal(formatMonthYear("2026-03-15T10:00:00"), "березень 2026");
  assert.equal(formatMonthYear(null), "");
});

import { resolveCover, familyFromTopics, parseVariant, variantId, coverFields } from "./authorCover.ts";
test("cover system: variants, family from topics, auto seed, personal fallback", () => {
  assert.deepEqual(parseVariant("calm-02"), { family: "calm", comp: 2 });
  assert.equal(parseVariant("calm-09"), null);
  assert.equal(parseVariant("#ff00ff"), null);
  assert.equal(variantId("warm", 3), "warm-03");
  assert.equal(familyFromTopics(["selfEsteem", "relationships", "stress"]), "warm");
  assert.equal(familyFromTopics(["anxiety", "stress"]), "focus"); // tie -> earliest
  assert.equal(familyFromTopics([]), "calm");
  const a = resolveCover({ topics: ["stress"], seed: "author-a" });
  assert.equal(a.type, "abstract");
  assert.ok(a.auto);
  assert.deepEqual(resolveCover({ topics: ["stress"], seed: "author-a" }), a); // stable
  const comps = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => resolveCover({ topics: ["stress"], seed: s }).comp));
  assert.ok(comps.size > 1);
  const chosen = resolveCover({ coverType: "editorial", coverVariant: "grounded-03", seed: "x" });
  assert.deepEqual([chosen.type, chosen.family, chosen.comp, chosen.auto], ["editorial", "grounded", 3, false]);
  assert.equal(resolveCover({ coverType: "personal", coverImageUrl: null, seed: "x" }).type, "abstract");
  assert.equal(resolveCover({ coverType: "personal", coverImageUrl: "https://x/y.jpg", seed: "x" }).imageUrl, "https://x/y.jpg");
  assert.deepEqual(coverFields({ type: null, family: null, comp: null, imageUrl: null }), { cover_type: null, cover_variant: null, cover_image_url: null });
});

import { formatSinceMonth } from "./authorProfileView.ts";
test("formatSinceMonth: genitive month", () => {
  assert.equal(formatSinceMonth("2026-08-15T10:00:00Z"), "серпня 2026");
  assert.equal(formatSinceMonth(null), "");
});

import { formatCount } from "./authorProfileView.ts";
test("formatCount: thousands with nbsp, zero-safe", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(326), "326");
  assert.equal(formatCount(1248), "1\u00A0248");
  assert.equal(formatCount(12450), "12\u00A0450");
  assert.equal(formatCount(-3), "0");
});

test("formatPostDate is relative for recent posts and full for old ones", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(formatPostDate("2026-10-10T08:00:00Z", now), "Сьогодні");
  assert.equal(formatPostDate("2026-10-09T08:00:00Z", now), "Вчора");
  assert.equal(formatPostDate("2026-10-07T08:00:00Z", now), "3 дні тому");
  assert.equal(formatPostDate("2026-10-04T08:00:00Z", now), "6 днів тому");
  assert.equal(formatPostDate("2026-09-26T08:00:00Z", now), "2 тижні тому");
  assert.equal(formatPostDate("2026-08-01T08:00:00Z", now), "1 серпня 2026");
});

test("ratingRows: 5★ first, shares of the real total, no bars when empty", () => {
  const rows = ratingRows(summarizeRatings([5, 4]));
  assert.deepEqual(rows.map((r) => [r.stars, r.count, r.percent]), [[5, 1, 50], [4, 1, 50], [3, 0, 0], [2, 0, 0], [1, 0, 0]]);
  assert.ok(ratingRows(summarizeRatings([])).every((r) => r.count === 0 && r.percent === 0));
  assert.equal(formatRating(4.5), "4,5");
  assert.equal(formatRating(summarizeRatings([5, 5, 4, 1]).average), "3,8");
});

test("filterReviews / sortReviews", () => {
  const l = [
    { id: "a", rating: 4, createdAt: "2026-01-01" },
    { id: "b", rating: 5, createdAt: "2026-03-01" },
    { id: "c", rating: 5, createdAt: "2026-02-01" },
    { id: "d", rating: 3, createdAt: "2026-04-01" },
  ];
  assert.deepEqual(filterReviews(l, 5).map((r) => r.id), ["b", "c"]);
  assert.equal(filterReviews(l, null).length, 4);
  assert.deepEqual(sortReviews(l, "new").map((r) => r.id), ["d", "b", "c", "a"]);
  assert.deepEqual(sortReviews(l, "high").map((r) => r.id), ["b", "c", "a", "d"]);
  assert.deepEqual(sortReviews(l, "low").map((r) => r.id), ["d", "a", "b", "c"]);
  assert.equal(l[0].id, "a"); // the input is not mutated
});
