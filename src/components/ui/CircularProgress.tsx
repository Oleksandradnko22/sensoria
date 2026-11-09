// Small circular progress ring — used on "Моє навчання" content cards
// instead of the horizontal bars used elsewhere in the dashboard. Pure
// presentation: takes a 0–100 percent and draws a ring, nothing more.
// Needs a unique per-instance gradient id so multiple rings on one
// page don't all reference the same <linearGradient> definition.

import { useId } from "react";

type Props = {
  percent: number;
  size?: number;
  strokeWidth?: number;
  // Solid color for a completed ring (emerald) vs. the default blue-
  // purple gradient for anything still in progress — mirrors the same
  // green/blue-purple convention already used for status badges and
  // progress bars across the participant dashboard.
  tone?: "gradient" | "done";
};

export default function CircularProgress({
  percent,
  size = 44,
  strokeWidth = 4,
  tone = "gradient",
}: Props) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-black/10"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={tone === "done" ? "#10b981" : `url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}
