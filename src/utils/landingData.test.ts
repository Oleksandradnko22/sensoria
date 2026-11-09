import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStats, firstName, pickTestimonials, type ReviewInput } from "./landingData.ts";

const r = (o: Partial<ReviewInput>): ReviewInput => ({
  id: "1",
  rating: 5,
  text: "Програма допомогла мені краще розуміти свій стан і спокійніше реагувати.",
  participantId: "p1",
  name: "Олена Коваль",
  createdAt: "2026-10-01T10:00:00Z",
  ...o,
});

test("firstName keeps the first word only", () => {
  assert.equal(firstName("Олена Коваль"), "Олена");
  assert.equal(firstName("  "), "Учасник");
});

test("pickTestimonials filters rating, length and duplicates, newest first", () => {
  const rows = [
    r({ id: "a", createdAt: "2026-09-01T00:00:00Z" }),
    r({ id: "b", participantId: "p2", createdAt: "2026-10-05T00:00:00Z" }),
    r({ id: "c", participantId: "p3", rating: 3 }),
    r({ id: "d", participantId: "p4", text: "ok" }),
    r({ id: "e", participantId: "p5", text: "а".repeat(400) }),
    r({ id: "f", participantId: "p1", createdAt: "2026-10-09T00:00:00Z" }),
  ];
  const out = pickTestimonials(rows);
  assert.deepEqual(out.map((t) => t.id), ["f", "b"]);
  assert.equal(out[0].name, "Олена");
});

test("buildStats hides small numbers and the whole row unless two qualify", () => {
  assert.deepEqual(buildStats({ participants: 12, materials: 3, ratingAverage: 4.8, ratingCount: 4 }), []);
  assert.deepEqual(buildStats({ participants: 1200, materials: 3, ratingAverage: 4.8, ratingCount: 4 }), []);
  const s = buildStats({ participants: 1200, materials: 24, ratingAverage: 4.76, ratingCount: 30 });
  assert.deepEqual(s.map((x) => x.key), ["participants", "materials", "rating"]);
  assert.equal(s[2].value, "4,8");
});
