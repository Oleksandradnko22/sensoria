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
    dot: "bg-[#4fb6d8]",
    border: "border-[#4fb6d8]/25",
    tint: "bg-[#4fb6d8]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(79,182,216,0.45)]",
    hex: "#4fb6d8",
  },
  stress: {
    dot: "bg-[#e8a066]",
    border: "border-[#e8a066]/25",
    tint: "bg-[#e8a066]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(232,160,102,0.45)]",
    hex: "#e8a066",
  },
  burnout: {
    dot: "bg-[#de8585]",
    border: "border-[#de8585]/25",
    tint: "bg-[#de8585]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(222,133,133,0.45)]",
    hex: "#de8585",
  },
  selfEsteem: {
    dot: "bg-[#a98bf0]",
    border: "border-[#a98bf0]/25",
    tint: "bg-[#a98bf0]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(169,139,240,0.45)]",
    hex: "#a98bf0",
  },
  relationships: {
    dot: "bg-[#de8ab3]",
    border: "border-[#de8ab3]/25",
    tint: "bg-[#de8ab3]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(222,138,179,0.45)]",
    hex: "#de8ab3",
  },
  motivation: {
    dot: "bg-[#dfbb5c]",
    border: "border-[#dfbb5c]/25",
    tint: "bg-[#dfbb5c]/[0.06]",
    glow: "shadow-[0_0_28px_-6px_rgba(223,187,92,0.45)]",
    hex: "#dfbb5c",
  },
};
