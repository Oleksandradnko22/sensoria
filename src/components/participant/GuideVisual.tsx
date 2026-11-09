// The abstract guide visual itself (see data/guideVisual.ts for the
// palette and the reasoning). Two surfaces use it: the guide card grid in
// "Моє навчання" (the default `h-24` strip) and the guide preview page's
// template document cover (via `className`, where it fills a page-shaped
// frame instead).
import { getGuideVisualSpec } from "../../data/guideVisual";

export function GuideVisualMarks({ tag }: { tag?: string }) {
  const { pattern, c1, c2 } = getGuideVisualSpec(tag);
  return (
    <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      {pattern === "scatter" && (
        <>
          <circle cx="72" cy="42" r="18" fill={c1} opacity="0.55" />
          <circle cx="106" cy="56" r="10" fill={c2} opacity="0.6" />
          <circle cx="130" cy="30" r="6" fill={c1} opacity="0.5" />
          <circle cx="150" cy="60" r="4" fill={c2} opacity="0.55" />
          <circle cx="46" cy="64" r="5" fill={c2} opacity="0.5" />
        </>
      )}
      {pattern === "settle" && (
        <>
          <circle cx="58" cy="50" r="24" fill={c1} opacity="0.5" />
          <circle cx="108" cy="50" r="14" fill={c2} opacity="0.45" />
          <circle cx="143" cy="50" r="7" fill={c1} opacity="0.4" />
          <circle cx="166" cy="50" r="3.5" fill={c2} opacity="0.4" />
        </>
      )}
      {pattern === "rings" && (
        <>
          <circle cx="100" cy="50" r="30" fill="none" stroke={c1} strokeWidth="10" opacity="0.35" />
          <circle cx="100" cy="50" r="17" fill={c2} opacity="0.55" />
        </>
      )}
      {pattern === "pair" && (
        <>
          <circle cx="85" cy="50" r="22" fill={c1} opacity="0.5" />
          <circle cx="120" cy="50" r="22" fill={c2} opacity="0.5" />
        </>
      )}
      {pattern === "wave" && (
        <path
          d="M18,66 Q60,28 100,54 T182,44"
          fill="none"
          stroke={c1}
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
      {pattern === "spiral" && (
        <path
          d="M100,50 m0,-22 a22,22 0 1 1 -15,6 a13,13 0 1 0 9,-4"
          fill="none"
          stroke={c2}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
    </svg>
  );
}

export default function GuideVisual({ tag, className = "h-24 w-full" }: { tag?: string; className?: string }) {
  const { c1, c2 } = getGuideVisualSpec(tag);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `linear-gradient(135deg, ${c1}2e, ${c2}2e)` }}>
      <GuideVisualMarks tag={tag} />
    </div>
  );
}
