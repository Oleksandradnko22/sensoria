// Sensoria's small interface-icon set for guides (2026-09-29 Гайди
// redesign; moved out of ParticipantLearning.tsx 2026-10-06 so the guide
// preview page shares the exact same icons).
//
// lucide-react is NOT installed in this project and must not be added —
// these are hand-drawn inline SVGs in one consistent language: 24×24
// viewBox, one shared stroke width, round caps/joins, monochrome
// (currentColor), no filled "cartoon" shapes. Plain interface glyphs
// only — a guide's psychological meaning comes from its abstract visual,
// typography and composition, never from an icon. The one fill is the
// bookmark's saved state, which is meaningful state, not decoration.
import type { ReactNode } from "react";

const ICON_STROKE = 1.75;

function Icon({ size, filled = false, children }: { size: number; filled?: boolean; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function BookmarkIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <Icon size={size} filled={filled}>
      <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4Z" />
    </Icon>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function DownloadIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function ArrowRightIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function ArrowLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function ExternalLinkIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

// Content-type glyphs for "related" tiles: sound wave = meditation,
// path with waypoints = program, page = guide.
export function MeditationGlyph({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4 12h2" />
      <path d="M8 8v8" />
      <path d="M12 5v14" />
      <path d="M16 8v8" />
      <path d="M20 12h-2" />
    </Icon>
  );
}

export function ProgramGlyph({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" />
    </Icon>
  );
}

export function GuideGlyph({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </Icon>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  );
}
