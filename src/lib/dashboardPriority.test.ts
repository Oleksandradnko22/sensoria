import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOwnedByKind, pickFeaturedExcludingOwned } from "./dashboardPriority.ts";
import type { Enrollment } from "../data/participantDashboard.ts";
import { guides } from "../data/guides.ts";

// buildOwnedByKind's `programActivityIds` override (2026-09-21, MVP
// "owned" product decision — see lib/dashboardPriority.ts's own header
// comment on the function): real program activity excludes a program
// from recommendations, saved-only does not, and there is no
// entitlement system to model instead. Guides/meditations are
// deliberately untouched by this decision — they keep deriving
// ownership from whatever `source` array is passed, exactly as before
// this change.

function makeEnrollment(overrides: Partial<Enrollment>): Enrollment {
  return {
    contentId: "x",
    kind: "program",
    progressPercent: 0,
    status: "in-progress",
    purchasedAt: "2026-01-01",
    lastAccessedAt: "2026-01-02",
    ...overrides,
  };
}

test("PROGRAMS: no activity at all -> eligible (not owned)", () => {
  const owned = buildOwnedByKind([], []);
  assert.equal(owned.program.has("untouched-program"), false);
});

test("PROGRAMS: saved-only (never in the real activity id set) -> eligible (not owned)", () => {
  // Saved-only programs never enter programActivityIds by contract
  // (context/ProgramParticipationContext.tsx's `enrollments` value only
  // contains activity-derived rows) — modeled here by simply omitting
  // the saved-only id from the override, even though it may still sit
  // in the static demo `source` array.
  const source: Enrollment[] = [makeEnrollment({ contentId: "saved-only-program", kind: "program" })];
  const owned = buildOwnedByKind(source, []); // real activity: none
  assert.equal(owned.program.has("saved-only-program"), false);
});

test("PROGRAMS: in_progress + 0% -> excluded", () => {
  const owned = buildOwnedByKind([], ["zero-percent-program"]);
  assert.equal(owned.program.has("zero-percent-program"), true);
});

test("PROGRAMS: in_progress + partial progress -> excluded", () => {
  const owned = buildOwnedByKind([], ["partial-progress-program"]);
  assert.equal(owned.program.has("partial-progress-program"), true);
});

test("PROGRAMS: completed -> excluded", () => {
  const owned = buildOwnedByKind([], ["completed-program"]);
  assert.equal(owned.program.has("completed-program"), true);
});

test("PROGRAMS: the exclusion set comes from the supplied real source, not the static demo enrollment list", () => {
  // "static-only-program" sits in the static demo array but has no real
  // activity -> must NOT be excluded once a real override is supplied.
  // "real-only-program" has real activity but was never in the static
  // demo array -> must be excluded.
  const source: Enrollment[] = [makeEnrollment({ contentId: "static-only-program", kind: "program" })];
  const owned = buildOwnedByKind(source, ["real-only-program"]);
  assert.equal(owned.program.has("static-only-program"), false);
  assert.equal(owned.program.has("real-only-program"), true);
});

test("PROGRAMS: omitting the override entirely falls back to the static source, unchanged from before this change", () => {
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "demo-program-a", kind: "program" }),
    makeEnrollment({ contentId: "demo-program-b", kind: "program", status: "completed" }),
  ];
  const owned = buildOwnedByKind(source); // no 2nd arg at all
  assert.equal(owned.program.has("demo-program-a"), true);
  assert.equal(owned.program.has("demo-program-b"), true);
});

test("GUIDES: exclusion behavior unchanged — always derived from `source`, regardless of any program override", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "owned-guide", kind: "guide" })];
  const ownedNoOverride = buildOwnedByKind(source);
  const ownedWithOverride = buildOwnedByKind(source, ["some-real-program-id"]);
  assert.equal(ownedNoOverride.guide.has("owned-guide"), true);
  assert.equal(ownedWithOverride.guide.has("owned-guide"), true);
  // A program-only override must never leak into guide ownership.
  assert.equal(ownedWithOverride.guide.has("some-real-program-id"), false);
});

test("GUIDES: a guide absent from `source` is eligible", () => {
  const owned = buildOwnedByKind([], ["some-real-program-id"]);
  assert.equal(owned.guide.has("untouched-guide"), false);
});

test("MEDITATIONS: exclusion behavior unchanged — always derived from `source`, regardless of any program override", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "owned-meditation", kind: "meditation" })];
  const ownedNoOverride = buildOwnedByKind(source);
  const ownedWithOverride = buildOwnedByKind(source, ["some-real-program-id"]);
  assert.equal(ownedNoOverride.meditation.has("owned-meditation"), true);
  assert.equal(ownedWithOverride.meditation.has("owned-meditation"), true);
  assert.equal(ownedWithOverride.meditation.has("some-real-program-id"), false);
});

test("MEDITATIONS: a meditation absent from `source` is eligible", () => {
  const owned = buildOwnedByKind([], ["some-real-program-id"]);
  assert.equal(owned.meditation.has("untouched-meditation"), false);
});

test("mixed kinds: program override never affects guide/meditation, and vice versa", () => {
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "g1", kind: "guide" }),
    makeEnrollment({ contentId: "m1", kind: "meditation" }),
    makeEnrollment({ contentId: "static-program", kind: "program" }),
  ];
  const owned = buildOwnedByKind(source, ["real-program"]);
  assert.deepEqual([...owned.program].sort(), ["real-program"]);
  assert.deepEqual([...owned.guide].sort(), ["g1"]);
  assert.deepEqual([...owned.meditation].sort(), ["m1"]);
});

// pickFeaturedExcludingOwned (2026-09-21 bug fix — post-migration
// recommendation audit's BUG #2: candidate exclusion used to run over a
// fixed relevance pool of 5, so an eligible candidate ranked 6th or
// lower could never be picked even though it existed. These tests pin
// down the fixed behavior directly against real catalog data (this
// function reads data/guides.ts, data/programs.ts and data/meditations.ts
// at module scope, so it can't be tested with fully synthetic content) —
// deliberately NOT re-testing buildOwnedByKind's own semantics, which
// dashboardPriority.test.ts already covers above.
//
// 2026-09-29 catalog pruning (per Sasha — "тут оставь тільки одну"):
// data/guides.ts now has exactly one real guide
// ("what-to-do-when-anxiety-hits", tagged "anxiety"), same as
// data/meditations.ts already has exactly one real meditation
// ("quick-grounding"). The two tests below that used to prove a 2nd- and
// 6th-ranked candidate were reachable (guarding BUG #2 above) needed 7
// real anxiety-tagged guides to exist and no longer have anything to
// rank against — that specific regression is still covered structurally
// by buildOwnedByKind's own tests above (which use fully synthetic ids,
// not the real catalog) and by "every candidate owned -> undefined"
// below, which still exercises the real "exclude down to nothing"
// path with whatever the real catalog currently contains.

test("pickFeaturedExcludingOwned: top candidate eligible -> selected", () => {
  const featured = pickFeaturedExcludingOwned("anxiety", null, [], []);
  assert.equal(featured.guide?.id, "what-to-do-when-anxiety-hits");
});

test("pickFeaturedExcludingOwned: only candidate owned -> undefined", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "what-to-do-when-anxiety-hits", kind: "guide" })];
  const featured = pickFeaturedExcludingOwned("anxiety", null, source, []);
  assert.equal(featured.guide, undefined);
});

test("pickFeaturedExcludingOwned: every candidate owned -> undefined", () => {
  const source: Enrollment[] = guides.map((g) => makeEnrollment({ contentId: g.id, kind: "guide" }));
  const featured = pickFeaturedExcludingOwned("anxiety", null, source, []);
  assert.equal(featured.guide, undefined);
});

test("pickFeaturedExcludingOwned: real program activity override excludes that program", () => {
  // "stress" ranks stress-course first (real tag match), then the rest
  // of the catalog in declaration order (all score 0).
  const featured = pickFeaturedExcludingOwned("stress", null, [], ["stress-course"]);
  assert.equal(featured.course?.id, "healthy-balance");
});

test("pickFeaturedExcludingOwned: static demo program enrollment does NOT exclude once a real override is supplied", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "stress-course", kind: "program" })];
  const featured = pickFeaturedExcludingOwned("stress", null, source, []); // real activity: none
  assert.equal(featured.course?.id, "stress-course");
});

test("pickFeaturedExcludingOwned: guide/meditation ownership from `source` is unaffected by an unrelated program override", () => {
  const source: Enrollment[] = [
    // Deliberately an id that doesn't exist in data/guides.ts — the
    // point of this fixture is "ownership of some unrelated guide id
    // doesn't affect an unrelated program override", not that this
    // specific id is real. what-to-do-when-anxiety-hits (asserted as
    // featured below) is the only real guide in the catalog.
    makeEnrollment({ contentId: "some-other-guide", kind: "guide" }),
    // Same idea — quick-grounding (asserted as featured below) is the
    // only real meditation in the catalog.
    makeEnrollment({ contentId: "some-other-meditation", kind: "meditation" }),
  ];
  const featured = pickFeaturedExcludingOwned("anxiety", null, source, ["stress-course"]);
  assert.equal(featured.guide?.id, "what-to-do-when-anxiety-hits");
  assert.equal(featured.meditation?.id, "quick-grounding");
});
