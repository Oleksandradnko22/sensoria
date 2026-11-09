import type { PrimaryStateId } from "../store/funnelStore.ts";

// The accent color per Primary State. Reuses the exact colors already
// established on the State Selection screen (the colored bar next to each
// state card) so the accent a user sees here is the same one they already
// associated with their choice, not a new palette invented for this
// screen. Single source of truth — StateSelectionPage.tsx should also
// read from here rather than keeping its own copy of this mapping.
//
// Every className below is a complete literal string (not built via
// template interpolation) so Tailwind's static class-name scan can see
// them — do not refactor this into `bg-${color}-400`-style interpolation.
export type StateAccent = {
  dot: string;
  border: string;
  tint: string;
  glow: string;
  // Same color as `dot`/`glow`, as a literal hex value. Tailwind classes
  // can't express a dynamically-computed two-color gradient (the Result
  // page's trust-indicator circle blends two states' accents together),
  // so that one spot reads this instead of a className. Everywhere else
  // should keep using `dot`.
  hex: string;
};

export const stateAccentColors: Record<PrimaryStateId, StateAccent> = {
  anxiety: {
    dot: "bg-cyan-400",
    border: "border-cyan-400/25",
    tint: "bg-cyan-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(34,211,238,0.45)]",
    hex: "#22d3ee",
  },
  stress: {
    dot: "bg-orange-400",
    border: "border-orange-400/25",
    tint: "bg-orange-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(251,146,60,0.45)]",
    hex: "#fb923c",
  },
  burnout: {
    dot: "bg-red-400",
    border: "border-red-400/25",
    tint: "bg-red-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(248,113,113,0.45)]",
    hex: "#f87171",
  },
  selfEsteem: {
    dot: "bg-purple-400",
    border: "border-purple-400/25",
    tint: "bg-purple-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(192,132,252,0.45)]",
    hex: "#c084fc",
  },
  relationships: {
    dot: "bg-pink-400",
    border: "border-pink-400/25",
    tint: "bg-pink-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(244,114,182,0.45)]",
    hex: "#f472b6",
  },
  motivation: {
    dot: "bg-yellow-400",
    border: "border-yellow-400/25",
    tint: "bg-yellow-400/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(250,204,21,0.45)]",
    hex: "#facc15",
  },
};
