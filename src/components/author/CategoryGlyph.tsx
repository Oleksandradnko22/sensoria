// Line icons for the program categories (data/categoryLabels.ts): 24×24, one stroke, currentColor.
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  // wavy, restless lines
  anxiety: <path d="M3 9c3-3.5 5 3.5 9 0s6 3.5 9 0M3 15c3-3.5 5 3.5 9 0s6 3.5 9 0" />,
  stress: <path d="M13.5 3 5.5 14H11l-1 7 8-11.5h-5.5z" />,
  burnout: <path d="M12 3c.6 3.2 5 5.2 5 10a5 5 0 0 1-10 0c0-2 1-3.4 2.2-4.4.1 1.7.9 2.6 1.8 2.9C10.4 8.6 10.8 5.8 12 3Z" />,
  selfEsteem: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z" />,
  relationships: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></>,
  motivation: <path d="M4 17l5.5-5.5 3.5 3.5L20 8M15 8h5v5" />,
  emotionalBalance: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14c.9 1.5 2.1 2.2 3.5 2.2s2.6-.7 3.5-2.2" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.4" /></>,
  // two arrows pressing on a point
  innerPressure: <path d="M12 3.5v6M9 7l3 3 3-3M12 20.5v-6M9 17l3-3 3 3M5 12h3m8 0h3" />,
  healthyBalance: <path d="M3 12h4l2.2-6 4.2 12 2.2-6H21" />,
  awareness: <><circle cx="12" cy="12" r="3.6" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></>,
  recovery: <path d="M20 11a8 8 0 0 0-14.2-4.4L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.2 4.4L20 15.5M20 20v-4.5h-4.5" />,
};

export default function CategoryGlyph({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[id] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
