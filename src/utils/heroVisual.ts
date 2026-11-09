// ONE place that decides which atmospheric visual a program's hero gets.
//
// Source of truth is the program's existing topic tags (the same ids the
// catalog cards use, see data/categoryLabels.ts). The result is a pure function
// of the tags — no randomness — so the same category always gives the same
// visual, on refresh and on a direct /programs/:id visit.
//
// Artwork is drawn as inline SVG (components/programDetail/HeroArt.tsx), keyed
// by `art`. To use real illustrations later, set `imageUrl` on a visual below
// (e.g. "/hero/water.webp", 1600×1000, webp/avif, subject on the right half,
// calm area on the left for text); HeroArt then renders the image instead.

export type HeroArt = "water" | "grounding" | "sunrise" | "connection" | "openSpace" | "momentum" | "balance" | "moon";

export type HeroVisual = {
  art: HeroArt;
  /** Human description of the intended mood (documentation for artists). */
  mood: string;
  /** CSS background of the whole hero (deep on the left so white text stays readable). */
  background: string;
  /** Optional raster artwork replacing the SVG one. Absent = SVG. */
  imageUrl?: string;
};

export const HERO_VISUALS: Record<HeroArt, HeroVisual> = {
  water: {
    art: "water",
    mood: "calm water, soft flowing forms, release",
    background: "linear-gradient(115deg,#0a2f7a 0%,#1458c2 45%,#37a8d6 100%)",
  },
  grounding: {
    art: "grounding",
    mood: "soft light, stable natural forms, safety and grounding",
    background: "linear-gradient(115deg,#1b2f78 0%,#3a55d4 50%,#8f86f2 100%)",
  },
  sunrise: {
    art: "sunrise",
    mood: "warm light, gentle sunrise, organic forms, restoration",
    background: "linear-gradient(115deg,#25237a 0%,#8a45a8 50%,#f0905f 100%)",
  },
  connection: {
    art: "connection",
    mood: "two harmonious organic forms, balanced, connected",
    background: "linear-gradient(115deg,#2e2490 0%,#8044c4 52%,#e87db8 100%)",
  },
  openSpace: {
    art: "openSpace",
    mood: "open space, light, confident growing forms",
    background: "linear-gradient(115deg,#173aa8 0%,#2f6fd6 50%,#8cc6f6 100%)",
  },
  momentum: {
    art: "momentum",
    mood: "sunrise, upward movement, expanding light",
    background: "linear-gradient(115deg,#1b2a86 0%,#5656d2 50%,#f2a65c 100%)",
  },
  balance: {
    art: "balance",
    mood: "balanced stones, calm landscape, harmony",
    background: "linear-gradient(115deg,#1e3a8a 0%,#2563eb 50%,#8b5cf6 100%)",
  },
  moon: {
    art: "moon",
    mood: "moonlight, soft blue atmosphere, quiet natural forms",
    background: "linear-gradient(115deg,#091443 0%,#1c2d78 50%,#4a5fc6 100%)",
  },
};

// tag id -> visual. Tags are checked in the program's own order; the first
// known one wins (same rule as the catalog card's category label).
export const HERO_ART_BY_TAG: Record<string, HeroArt> = {
  stress: "water",
  innerPressure: "water",
  anxiety: "grounding",
  burnout: "sunrise",
  recovery: "moon", // sleep & recovery
  relationships: "connection",
  selfEsteem: "openSpace",
  awareness: "openSpace",
  motivation: "momentum",
  emotionalBalance: "balance",
  healthyBalance: "balance",
};

export const FALLBACK_HERO_ART: HeroArt = "balance";

export function heroVisualForTags(tags?: readonly string[] | null): HeroVisual {
  for (const t of tags ?? []) {
    const art = HERO_ART_BY_TAG[t];
    if (art) return HERO_VISUALS[art];
  }
  return HERO_VISUALS[FALLBACK_HERO_ART];
}
