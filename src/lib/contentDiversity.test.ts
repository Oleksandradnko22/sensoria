import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDiverseTop, excludeOwnedAndDiversify } from "./contentDiversity.ts";

test("prefers one item per author over the same author's top 3 when other authors have comparable matches", () => {
  const items = [
    { id: "a1", author: "A" },
    { id: "a2", author: "A" },
    { id: "a3", author: "A" },
    { id: "b1", author: "B" },
    { id: "c1", author: "C" },
  ];
  const result = pickDiverseTop(items, 3, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["a1", "b1", "c1"]);
});

test("falls back to the same author's remaining items when there aren't enough distinct authors", () => {
  const items = [
    { id: "a1", author: "A" },
    { id: "a2", author: "A" },
    { id: "a3", author: "A" },
    { id: "a4", author: "A" },
  ];
  const result = pickDiverseTop(items, 3, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["a1", "a2", "a3"]);
});

test("never withholds a real item just to enforce diversity — degrades gracefully", () => {
  const items = [{ id: "only", author: "A" }];
  const result = pickDiverseTop(items, 3, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["only"]);
});

test("a null key (no author concept for this content type) is plain relevance order", () => {
  const items = [{ id: "m1" }, { id: "m2" }, { id: "m3" }, { id: "m4" }];
  const result = pickDiverseTop(items, 3, () => null);
  assert.deepEqual(result.map((r) => r.id), ["m1", "m2", "m3"]);
});

test("keeps overall relevance order within each pass — doesn't resort by author", () => {
  const items = [
    { id: "a1", author: "A" },
    { id: "b1", author: "B" },
    { id: "a2", author: "A" },
    { id: "b2", author: "B" },
  ];
  // Both A and B are already distinct on their first appearance, so a
  // limit of 4 should just return everything in original order.
  const result = pickDiverseTop(items, 4, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["a1", "b1", "a2", "b2"]);
});

test("empty input returns empty output", () => {
  assert.deepEqual(pickDiverseTop([] as { id: string }[], 3, (i) => i.id), []);
});

// excludeOwnedAndDiversify — the exact "Що може допомогти зараз"
// pipeline (2026-09-16 audit, RECOMMENDATIONS test battery), exercised
// with synthetic data so it never touches the real catalog/enrollments.
type Item = { id: string; author: string };

test("excludeOwnedAndDiversify caps to the requested limit", () => {
  const items: Item[] = [
    { id: "a", author: "1" },
    { id: "b", author: "2" },
    { id: "c", author: "3" },
    { id: "d", author: "4" },
    { id: "e", author: "5" },
  ];
  const result = excludeOwnedAndDiversify(items, new Set(), 3, (i) => i.id, (i) => i.author);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((r) => r.id), ["a", "b", "c"]);
});

test("excludeOwnedAndDiversify filters out owned items before capping", () => {
  const items: Item[] = [
    { id: "a", author: "1" },
    { id: "b", author: "2" },
    { id: "c", author: "3" },
  ];
  const result = excludeOwnedAndDiversify(items, new Set(["a"]), 3, (i) => i.id, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["b", "c"]);
});

test("excludeOwnedAndDiversify still diversifies by author after excluding owned items", () => {
  const items: Item[] = [
    { id: "a1", author: "A" },
    { id: "a2", author: "A" },
    { id: "a3", author: "A" },
    { id: "b1", author: "B" },
  ];
  // "a1" is owned — should not free up a slot for "a2" to sneak in ahead
  // of the not-yet-seen author B.
  const result = excludeOwnedAndDiversify(items, new Set(["a1"]), 2, (i) => i.id, (i) => i.author);
  assert.deepEqual(result.map((r) => r.id), ["a2", "b1"]);
});

test("excludeOwnedAndDiversify returns empty when there is no relevant content at all", () => {
  const result = excludeOwnedAndDiversify([] as Item[], new Set(), 3, (i) => i.id, (i) => i.author);
  assert.deepEqual(result, []);
});

test("excludeOwnedAndDiversify returns empty when the person already owns everything relevant", () => {
  const items: Item[] = [
    { id: "a", author: "1" },
    { id: "b", author: "2" },
  ];
  const result = excludeOwnedAndDiversify(items, new Set(["a", "b"]), 3, (i) => i.id, (i) => i.author);
  assert.deepEqual(result, []);
});

test("excludeOwnedAndDiversify keeps each content type's ownership independent (different id spaces don't collide)", () => {
  const courses: Item[] = [{ id: "shared-id", author: "X" }];
  const meditations: Item[] = [{ id: "shared-id", author: "Y" }];
  // Owning a course with this id must not accidentally exclude a
  // meditation that happens to share the same id string — each content
  // type is filtered against its own owned-id Set by the caller.
  const ownedCourseIds = new Set(["shared-id"]);
  const ownedMeditationIds = new Set<string>();
  const resultCourses = excludeOwnedAndDiversify(courses, ownedCourseIds, 3, (i) => i.id, (i) => i.author);
  const resultMeditations = excludeOwnedAndDiversify(
    meditations,
    ownedMeditationIds,
    3,
    (i) => i.id,
    (i) => i.author
  );
  assert.deepEqual(resultCourses, []);
  assert.deepEqual(resultMeditations.map((r) => r.id), ["shared-id"]);
});
