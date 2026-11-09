import { test } from "node:test";
import assert from "node:assert/strict";
import { meditations } from "./meditations.ts";

// Published meditation ids are IMMUTABLE: positions, sessions, check-ins,
// saved practice, feedback, reports and the author all point at them.
// Removing a meditation: move its id to RETIRED (never reuse it). A
// semantically different practice gets a NEW id. Add new ids to PUBLISHED.
const PUBLISHED = ["quick-grounding"];
const RETIRED: string[] = [];

test("published meditation ids still exist unless retired on purpose", () => {
  const current = new Set(meditations.map((m) => m.id));
  for (const id of PUBLISHED) {
    if (RETIRED.includes(id)) assert.equal(current.has(id), false, `retired id "${id}" must not come back`);
    else assert.ok(current.has(id), `published meditation "${id}" disappeared — retire it explicitly`);
  }
});

test("every current meditation is registered as published", () => {
  for (const m of meditations) assert.ok(PUBLISHED.includes(m.id), `new meditation "${m.id}" — add it to PUBLISHED`);
});

test("ids are unique and the duration label is derived from the minutes", () => {
  assert.equal(new Set(meditations.map((m) => m.id)).size, meditations.length);
  for (const m of meditations) assert.equal(m.duration, `${m.durationMinutes} хв`);
});
