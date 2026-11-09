// The database only lets a guide or a meditation into the cabinet if its id is in the free list of
// acquired-content-free-only-migration.sql. This keeps that list and the code's free materials in step.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { guides } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import { isFreePrice } from "./price.ts";

const sql = readFileSync(new URL("../../acquired-content-free-only-migration.sql", import.meta.url), "utf8");
const listed = new Set([...sql.matchAll(/^\s+\('(guide|meditation)', '([^']+)'\),?$/gm)].map((m) => `${m[1]}:${m[2]}`));

test("every free guide and meditation is in the SQL free list, and nothing else", () => {
  const free = new Set([
    ...guides.filter((g) => isFreePrice(g.price)).map((g) => `guide:${g.id}`),
    ...meditations.map((m) => `meditation:${m.id}`),
  ]);
  assert.deepEqual([...listed].sort(), [...free].sort());
});

// The same for the free demo programs (the temporary migration that lets them into the cabinet).
const demoSql = readFileSync(new URL("../../acquired-content-demo-programs-migration.sql", import.meta.url), "utf8");
const listedDemo = [...demoSql.matchAll(/^\s+\('(program)', '([^']+)'\),?$/gm)].map((m) => m[2]).sort();

test("every free demo program is in the demo-programs SQL list, and nothing else", async () => {
  const { programs } = await import("../data/programs.ts");
  assert.deepEqual(listedDemo, programs.filter((p) => isFreePrice(p.price)).map((p) => p.id).sort());
});

test("the demo-programs SQL keeps the guide and meditation ids of the free-only list", () => {
  const keep = [...demoSql.matchAll(/^\s+\('(guide|meditation)', '([^']+)'\),?$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(keep, [...listed].sort());
});

// The database-driven migration keeps the same static list, so the two cannot drift either.
const dbSql = readFileSync(new URL("../../acquired-content-db-driven-migration.sql", import.meta.url), "utf8");

test("the database-driven migration lists exactly the free materials that still live in the code", async () => {
  const { programs } = await import("../data/programs.ts");
  const listedAll = [...dbSql.matchAll(/^\s+\('(guide|meditation|program)', '([^']+)'\),?$/gm)].map((m) => `${m[1]}:${m[2]}`).sort();
  const expected = [
    ...guides.filter((g) => isFreePrice(g.price)).map((g) => `guide:${g.id}`),
    ...meditations.map((m) => `meditation:${m.id}`),
    ...programs.filter((p) => isFreePrice(p.price)).map((p) => `program:${p.id}`),
  ].sort();
  assert.deepEqual(listedAll, expected);
});
