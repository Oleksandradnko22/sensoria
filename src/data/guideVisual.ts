// Sensoria's abstract guide-visual vocabulary (2026-09-29 Гайди redesign,
// per Sasha's explicit brief; extracted into its own file 2026-10-06 so
// the card grid (ParticipantLearning) and the guide preview page's
// document cover (GuidePdfVisual) draw from ONE palette instead of two
// copies that could drift).
//
// Psychological guides are "practical emotional wellbeing tools", not
// generic articles — so a guide's visual is a small ABSTRACT composition
// chosen by its primary tag, giving a felt sense of "unsettled" vs "calm"
// vs "two people interacting" before a word is read. Deliberately never a
// literal illustration, stock photo, medical imagery or cartoon.

export type GuideVisualPattern = "scatter" | "settle" | "rings" | "pair" | "wave" | "spiral";

export type GuideVisualSpec = { pattern: GuideVisualPattern; c1: string; c2: string };

// Real tag keys from data/categoryLabels.ts — soft lavender/blue/cyan/warm
// pairings rather than one purple gradient on everything (the brief's
// explicit "reduce purple overuse" call).
export const guideVisualByTag: Record<string, GuideVisualSpec> = {
  anxiety: { pattern: "scatter", c1: "#7fb8f5", c2: "#b9a8f2" },
  stress: { pattern: "settle", c1: "#8fd0dd", c2: "#dfe6fb" },
  burnout: { pattern: "settle", c1: "#a9b9de", c2: "#e9e6f6" },
  selfEsteem: { pattern: "rings", c1: "#f3c98e", c2: "#f2a9bd" },
  relationships: { pattern: "pair", c1: "#93b8f2", c2: "#bb9df0" },
  emotionalBalance: { pattern: "rings", c1: "#8fd6c8", c2: "#a9cdf2" },
  healthyBalance: { pattern: "rings", c1: "#a3ddb1", c2: "#d8ecdf" },
  innerPressure: { pattern: "scatter", c1: "#8ba2e6", c2: "#6f7fcf" },
  awareness: { pattern: "wave", c1: "#93d2ec", c2: "#bfe4fa" },
  recovery: { pattern: "spiral", c1: "#a9d3bb", c2: "#e4f1e8" },
  motivation: { pattern: "wave", c1: "#f2be8a", c2: "#f7d9a3" },
};

// Deterministic fallback for any tag not in the map above (same idea as
// lib/meditationPalette.ts's hash-based approach) — a future guide tag
// never silently falls back to a generic tile.
export function fallbackGuideVisual(seed: string): GuideVisualSpec {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const patterns: GuideVisualPattern[] = ["scatter", "settle", "rings", "pair", "wave", "spiral"];
  const hueA = hash % 360;
  return {
    pattern: patterns[hash % patterns.length],
    c1: `hsl(${hueA} 62% 72%)`,
    c2: `hsl(${(hueA + 35) % 360} 62% 84%)`,
  };
}

export function getGuideVisualSpec(tag?: string): GuideVisualSpec {
  return (tag && guideVisualByTag[tag]) || fallbackGuideVisual(tag ?? "guide");
}
