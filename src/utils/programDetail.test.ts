import test from "node:test";
import assert from "node:assert/strict";
import { programCta, averageRating, visibleSections } from "./programDetail.ts";
import { pageForPath, pathForPage } from "./routes.ts";

const base = { price: "0", viewerIsAuthor: false, progress: null, saved: false };

test("free and paid programs both go to the cart", () => {
  assert.equal(programCta(base).kind, "cart");
  const paid = programCta({ ...base, price: "1500" });
  assert.equal(paid.kind, "cart");
  assert.equal(paid.label, "Додати в кошик");
  assert.equal(programCta({ ...base, price: "" }).kind, "cart");
});

test("author sees no start button", () => {
  assert.equal(programCta({ ...base, viewerIsAuthor: true }).kind, "own");
});

test("real progress wins over price", () => {
  const p = (state: string, done = false) => ({ isCompleted: done, state, currentModuleIndex: 1 });
  assert.equal(programCta({ ...base, price: "900", progress: p("in_progress") }).label, "Продовжити з модуля 2");
  assert.equal(programCta({ ...base, price: "900", progress: p("not_started") }).kind, "start");
  assert.equal(programCta({ ...base, price: "900", progress: p("completed", true) }).kind, "review");
});

test("average rating only from real ratings", () => {
  assert.equal(averageRating([]), null);
  assert.equal(averageRating([5, 4]), "4.5");
});

test("sections list hides empty ones", () => {
  const s = visibleSections({ hasCurriculum: false, hasAuthor: true, hasReviews: true });
  assert.deepEqual(s.map((x) => x.id), ["author", "reviews"]);
});

test("program detail routes", () => {
  assert.equal(pathForPage("program-detail", "abc 1"), "/programs/abc%201");
  assert.equal(pathForPage("program-detail"), "/programs");
  assert.deepEqual(pageForPath("/programs/abc%201/"), { page: "program-detail", authorId: null, programId: "abc 1" });
  assert.equal(pageForPath("/programs").page, "catalog");
  assert.deepEqual(pageForPath("/authors/x"), { page: "author-profile", authorId: "x", programId: null });
  assert.equal(pageForPath("/programs/%E0%A4%A").page, "catalog");
});

test("cart route", () => {
  assert.equal(pathForPage("cart"), "/cart");
  assert.deepEqual(pageForPath("/cart/"), { page: "cart", authorId: null, programId: null });
});

test("a program taken while free stays the viewer's even after it became paid", () => {
  const cta = programCta({ price: "500", viewerIsAuthor: false, progress: null, saved: false, owned: true });
  assert.equal(cta.kind, "start");
  assert.equal(programCta({ price: "500", viewerIsAuthor: false, progress: null, saved: false }).kind, "cart");
});
