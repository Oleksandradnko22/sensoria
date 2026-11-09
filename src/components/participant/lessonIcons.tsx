// Hand-drawn inline SVG icons for the Lesson Player / program screen —
// same convention as src/data/contentAccents.tsx (plain stroke SVGs,
// no icon-library dependency), used here to replace raw emoji
// (🎬🎧🖼️📄☑️🧩🔒🎉) that clashed with the rest of the app's custom
// vector icon language and render inconsistently (full-color glyphs)
// across operating systems.

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

export function TextItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M6 3.5h9l3 3V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 12h6M9 15.5h6M9 8.5h3" />
    </svg>
  );
}

export function VideoItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 9.3v5.4l4.5-2.7-4.5-2.7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AudioItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M4 12v0M8 9v6M12 6v12M16 9v6M20 12v0" />
    </svg>
  );
}

export function ImageItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5 9.5 12l3 3 3-3.5 4.5 5.5" />
    </svg>
  );
}

export function PdfItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 12.5h1.6a1.2 1.2 0 1 1 0 2.4H8.5V12.5Zm0 0v4.5" />
      <path d="M13 12.5h1.5a1.6 1.6 0 0 1 0 3.2H13.4a.4.4 0 0 1-.4-.4v-2.8Z" />
    </svg>
  );
}

export function ChecklistItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12.2 11 14.7l4.5-5.4" />
    </svg>
  );
}

export function MixedItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.8" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.8" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.8" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.8" />
    </svg>
  );
}

export function LockItemIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function CompletionBadgeIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3 10.8 15l5-6" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...outlineProps(props)}>
      <path d="M12 3.5l2.47 5.18 5.53.62-4.1 3.88 1.1 5.57L12 15.9l-5 2.85 1.1-5.57-4.1-3.88 5.53-.62L12 3.5Z" />
    </svg>
  );
}
