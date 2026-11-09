// Sensoria's single interface-icon set — replaces emoji across the app.
//
// Same language as participant/GuideIcons.tsx: hand-drawn inline SVG, 24×24
// viewBox, one stroke width, round caps/joins, monochrome (currentColor) so
// an icon takes the colour of the text around it. No icon library
// (lucide-react is not installed and must not be added).
//
// Usage: <Icon name="home" /> or <Icon name="star" size={14} filled />.
import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "library"
  | "bookmark"
  | "note"
  | "mail"
  | "star"
  | "card"
  | "idcard"
  | "help"
  | "shield"
  | "graduation"
  | "chart"
  | "megaphone"
  | "settings"
  | "search"
  | "program"
  | "meditation"
  | "guide"
  | "brain"
  | "leaf"
  | "moon"
  | "heart"
  | "bulb"
  | "sparkle"
  | "bolt"
  | "compass"
  | "clip"
  | "refresh"
  | "play"
  | "pause"
  | "headphones"
  | "video"
  | "image"
  | "lock"
  | "clock"
  | "warning"
  | "toolbox"
  | "wind"
  | "sleep"
  | "lifebuoy"
  | "chevron"
  | "comment"
  | "check";

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  library: (
    <>
      <path d="M5 4h4v16H5z" />
      <path d="M11 4h4v16h-4z" />
      <path d="m17 6.5 3.5 1-3.7 12.5-3.3-1" />
    </>
  ),
  comment: <path d="M5 5.5h14a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-7l-4.5 3.5V17H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />,
  bookmark: <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />,
  note: (
    <>
      <path d="M4 20l1-4 11-11 3 3L8 19l-4 1Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7.5 7.5 6 7.5-6" />
    </>
  ),
  star: <path d="M12 3.5l2.47 5.18 5.53.62-4.1 3.88 1.1 5.57L12 15.9l-5 2.85 1.1-5.57-4.1-3.88 5.53-.62L12 3.5Z" />,
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </>
  ),
  idcard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4" />
      <path d="M15 10h3M15 13.5h3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5" />
      <path d="M12 16.6v.1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  graduation: (
    <>
      <path d="m2.5 9.5 9.5-4.5 9.5 4.5-9.5 4.5-9.5-4.5Z" />
      <path d="M6.5 11.5v4c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4" />
      <path d="M21.5 9.5v5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="m7.5 15 3.5-4 3 2.5 4.5-6" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2.5l8 4V5l-8 4H5a1 1 0 0 0-1 1Z" />
      <path d="M19 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  program: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" />
    </>
  ),
  meditation: (
    <>
      <path d="M4 12h2" />
      <path d="M8 8v8" />
      <path d="M12 5v14" />
      <path d="M16 8v8" />
      <path d="M20 12h-2" />
    </>
  ),
  guide: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A3 3 0 0 0 6.6 7 3 3 0 0 0 5 10a3 3 0 0 0 1.2 2.4A3 3 0 0 0 8 17.5a2.5 2.5 0 0 0 4 1V5.5a2.5 2.5 0 0 0-2.5-1Z" />
      <path d="M14.5 4.5A3 3 0 0 1 17.4 7 3 3 0 0 1 19 10a3 3 0 0 1-1.2 2.4A3 3 0 0 1 16 17.5a2.5 2.5 0 0 1-4 1" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" />
      <path d="M5 19c2-4 5-7 9-9" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
  heart: <path d="M12 20s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10Z" />,
  bulb: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.8.6 1.2 1.4 1.2 2.5h4c0-1.1.4-1.9 1.2-2.5A5.5 5.5 0 0 0 12 3.5Z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <path d="m7.5 7.5 1.8 1.8M14.7 14.7l1.8 1.8M16.5 7.5l-1.8 1.8M9.3 14.7l-1.8 1.8" />
    </>
  ),
  bolt: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  clip: <path d="m19 11-7.5 7.5a4.2 4.2 0 0 1-6-6L13 5a2.8 2.8 0 0 1 4 4l-7.5 7.5a1.4 1.4 0 0 1-2-2L14 8" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5" />
      <path d="M4.5 12a7.5 7.5 0 0 1 13-5" />
      <path d="M17.5 3.5V7H14M6.5 20.5V17H10" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  pause: (
    <>
      <path d="M8.5 5.5v13" />
      <path d="M15.5 5.5v13" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3.5" y="14" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 9.3v5.4l4.5-2.7-4.5-2.7Z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5 9.5 12l3 3 3-3.5 4.5 5.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 3 19.5h18L12 4Z" />
      <path d="M12 10v4.5M12 17v.1" />
    </>
  ),
  toolbox: (
    <>
      <rect x="3" y="8" width="18" height="11.5" rx="2" />
      <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M3 13h18" />
    </>
  ),
  wind: (
    <>
      <path d="M3.5 9h10a2.5 2.5 0 1 0-2.4-3" />
      <path d="M3.5 13h14a2.5 2.5 0 1 1-2.4 3" />
      <path d="M3.5 17h6" />
    </>
  ),
  chevron: <path d="m6 9.5 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" />
    </>
  ),
  sleep: (
    <>
      <path d="M17.5 14.5A6.5 6.5 0 0 1 9.5 6.5a6.5 6.5 0 1 0 8 8Z" />
      <path d="M15 4h3l-3 3h3" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  filled = false,
  className,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}

export default Icon;
