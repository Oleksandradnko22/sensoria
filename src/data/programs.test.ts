import { test } from "node:test";
import assert from "node:assert/strict";
import { programs } from "./programs.ts";
import { categoryLabels } from "./categoryLabels.ts";

// Published program ids are IMMUTABLE: progress, saves, reviews, completions and
// purchases point at them. Removing one: move it to RETIRED, never reuse it.
const PUBLISHED = ["healthy-balance", "stress-course", "self-esteem-course", "relationships-course", "mindfulness-course"];
const RETIRED: string[] = [];

test("published demo program ids still exist unless retired on purpose", () => {
  const current = new Set(programs.map((p) => p.id));
  for (const id of PUBLISHED) {
    if (RETIRED.includes(id)) assert.equal(current.has(id), false, `retired id "${id}" must not come back`);
    else assert.ok(current.has(id), `published program "${id}" disappeared — retire it explicitly`);
  }
});

test("every demo program is registered, ids are unique, tags are known categories", () => {
  assert.equal(new Set(programs.map((p) => p.id)).size, programs.length);
  for (const p of programs) {
    assert.ok(PUBLISHED.includes(p.id), `new program "${p.id}" — add it to PUBLISHED`);
    for (const tag of p.tags) assert.ok(tag in categoryLabels, `unknown tag "${tag}" on ${p.id}`);
    assert.ok(Number.isFinite(Number(p.price)) && Number(p.price) >= 0, `bad price on ${p.id}`);
  }
});
