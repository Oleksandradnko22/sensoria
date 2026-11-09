// Shared "emotional topic" accent used across every content card
// (courses, meditations, guides): a small floating glass circle with a
// thin outline icon in the upper-right of the preview area, colored by
// the content's primary tag. One definition, reused everywhere, so a
// "stress" course, a "stress" meditation, and a "stress" guide all
// read as the same visual language.
//
// Icons are hand-drawn inline SVG (not an icon library) to match every
// other icon already in this codebase (Header's dropdown arrow, the
// password show/hide eyes, ScrollHintArrow) — all plain stroke-based
// SVGs, no dependency needed for eight simple glyphs.
//
// Every className below is a complete literal string (same rule as
// stateAccentColors.ts) so Tailwind's static scanner can see them —
// don't refactor into `bg-${color}-100`-style interpolation.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function outlineProps(props: IconProps): IconProps {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
}

// Calm wave — Mindfulness / emotional balance.
function MindfulnessIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M3 12c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0" />
    </svg>
  );
}

// Star — Self-esteem / self-worth.
function SelfEsteemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M12 3.5l2.47 5.18 5.53.62-4.1 3.88 1.1 5.57L12 15.9l-5 2.85 1.1-5.57-4.1-3.88 5.53-.62L12 3.5Z" />
    </svg>
  );
}

// Leaf — Stress relief.
function StressReliefIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M5 21c8 0 13-5 13-13V5h-3C7 5 5 12 5 20v1Z" />
      <path d="M5 21c3-6 6-9 12-12" />
    </svg>
  );
}

// Crescent moon — Sleep / recovery.
function SleepIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

// Sparkle — Personal growth / awareness.
function GrowthIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" />
    </svg>
  );
}

// Even, symmetric heart — Relationships.
function RelationshipsIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// Sun — Energy / motivation.
function EnergyIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

export type ContentAccent = {
  Icon: (props: IconProps) => React.JSX.Element;
  bg: string;
  iconColor: string;
  glow: string;
  hoverGlow: string;
};

// One soft, low-saturation accent per topic — no neon, no bright fills.
const ACCENTS: Record<string, ContentAccent> = {
  // Mindfulness — soft blue.
  anxiety: {
    Icon: MindfulnessIcon,
    bg: "bg-sky-100/70",
    iconColor: "text-sky-600",
    glow: "shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(56,189,248,0.6)]",
  },
  emotionalBalance: {
    Icon: MindfulnessIcon,
    bg: "bg-sky-100/70",
    iconColor: "text-sky-600",
    glow: "shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(56,189,248,0.6)]",
  },
  healthyBalance: {
    Icon: MindfulnessIcon,
    bg: "bg-sky-100/70",
    iconColor: "text-sky-600",
    glow: "shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(56,189,248,0.6)]",
  },

  // Self-esteem — golden yellow.
  selfEsteem: {
    Icon: SelfEsteemIcon,
    bg: "bg-yellow-100/70",
    iconColor: "text-yellow-600",
    glow: "shadow-[0_0_18px_-6px_rgba(250,204,21,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(250,204,21,0.6)]",
  },

  // Stress relief — mint green.
  stress: {
    Icon: StressReliefIcon,
    bg: "bg-emerald-100/70",
    iconColor: "text-emerald-600",
    glow: "shadow-[0_0_18px_-6px_rgba(52,211,153,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(52,211,153,0.6)]",
  },
  innerPressure: {
    Icon: StressReliefIcon,
    bg: "bg-emerald-100/70",
    iconColor: "text-emerald-600",
    glow: "shadow-[0_0_18px_-6px_rgba(52,211,153,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(52,211,153,0.6)]",
  },

  // Sleep / recovery — deep indigo.
  recovery: {
    Icon: SleepIcon,
    bg: "bg-indigo-100/70",
    iconColor: "text-indigo-700",
    glow: "shadow-[0_0_18px_-6px_rgba(99,102,241,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(99,102,241,0.6)]",
  },

  // Personal growth — soft lavender.
  awareness: {
    Icon: GrowthIcon,
    bg: "bg-violet-100/70",
    iconColor: "text-violet-600",
    glow: "shadow-[0_0_18px_-6px_rgba(167,139,250,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(167,139,250,0.6)]",
  },

  // Relationships — warm pink.
  relationships: {
    Icon: RelationshipsIcon,
    bg: "bg-pink-100/70",
    iconColor: "text-pink-600",
    glow: "shadow-[0_0_18px_-6px_rgba(244,114,182,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(244,114,182,0.6)]",
  },

  // Burnout — deep indigo (recovery/rest, not energy — see below).
  burnout: {
    Icon: SleepIcon,
    bg: "bg-indigo-100/70",
    iconColor: "text-indigo-700",
    glow: "shadow-[0_0_18px_-6px_rgba(99,102,241,0.45)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(99,102,241,0.6)]",
  },

  // Energy / motivation — golden yellow. Kept separate from `burnout`
  // (2026-08-30): burnout content is about recovering FROM low energy,
  // so the "Energy/Sun" amber accent read as motivating/energizing —
  // the wrong emotional register for it. Reusing `recovery`'s existing
  // indigo/moon accent for `burnout` instead; `motivation` keeps the
  // original amber/sun treatment, since that tag genuinely is about
  // energy.
  motivation: {
    Icon: EnergyIcon,
    bg: "bg-amber-100/70",
    iconColor: "text-amber-600",
    glow: "shadow-[0_0_18px_-6px_rgba(245,158,11,0.4)]",
    hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(245,158,11,0.55)]",
  },
};

// Fallback for content with no tags, or a tag we don't have a mapping
// for yet (e.g. ProgramsSection's local demo array has no tags at
// all) — Personal growth reads as a safe, universal default rather
// than guessing at a topic that isn't there.
const DEFAULT_ACCENT: ContentAccent = {
  Icon: GrowthIcon,
  bg: "bg-violet-100/70",
  iconColor: "text-violet-600",
  glow: "shadow-[0_0_18px_-6px_rgba(167,139,250,0.45)]",
  hoverGlow: "group-hover:shadow-[0_0_26px_-4px_rgba(167,139,250,0.6)]",
};

export function getContentAccent(tags?: string[]): ContentAccent {
  if (!tags) return DEFAULT_ACCENT;
  for (const tag of tags) {
    const accent = ACCENTS[tag];
    if (accent) return accent;
  }
  return DEFAULT_ACCENT;
}
