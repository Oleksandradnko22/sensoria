import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapFontSize } from "./profileType.ts";

// The profile-wide font rule: only 12 / 14 / 16 / 20 / 24 px may appear in
// the author profile files.
const FILES = [
  "src/pages/AuthorPublicProfilePage.tsx",
  "src/components/author/public/PostCard.tsx",
  "src/components/author/public/PostComments.tsx",
  "src/components/author/public/PostMedia.tsx",
  "src/components/author/public/AuthorMaterials.tsx",
  "src/components/author/public/AuthorAbout.tsx",
  "src/components/author/public/CredentialList.tsx",
  "src/components/author/public/AuthorMe.tsx",
  "src/components/author/public/MaterialCard.tsx",
  "src/components/author/public/AuthorReviews.tsx",
  "src/components/author/public/MaterialVisual.tsx",
];

test("author profile files use only the 5-size font scale", () => {
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    const sizes = Array.from(src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)).map((m) => Number(m[1]));
    // AuthorMe and AuthorReviews have one display size (32: viewpoint statement / average rating).
    const allowed = f.endsWith("AuthorMe.tsx") || f.endsWith("AuthorReviews.tsx") ? [12, 14, 16, 20, 24, 32] : [12, 14, 16, 20, 24];
    for (const px of sizes) assert.ok(allowed.includes(px), `${f}: text-[${px}px] is not on the scale`);
  }
});

test("snapFontSize maps legacy sizes onto the scale", () => {
  assert.deepEqual([11, 12.5, 13, 13.5, 14.5, 15, 16, 18, 22, 26].map(snapFontSize), [12, 12, 14, 14, 14, 16, 16, 20, 24, 24]);
});
