// Visual identity of one material (program / meditation / guide). A real
// cover is always preferred; otherwise a deterministic abstract fallback is
// drawn from the material's own id — never random, never the author's cover.
// All variants stay in Sensoria's blue / violet / lavender range.
import { useId } from "react";
import { coverImageStyle, type CoverFrameId, coverUrlForFrame } from "../../../utils/coverFocus";
import { hashSeed } from "../../../utils/authorCover";
import type { AuthorContentItem } from "../../../utils/authorProfileView";

// Three close palettes (bg a→b, soft accent, ink for strokes).
const PALETTES = [
  { a: "#4f6bff", b: "#7b5cff", soft: "#c7d2fe", ink: "#ffffff" },
  { a: "#5d7df5", b: "#9473f3", soft: "#d6dcff", ink: "#ffffff" },
  { a: "#6a86ff", b: "#a285f7", soft: "#e0e4ff", ink: "#ffffff" },
];
const LAVENDER = [
  { bg: "#eceefe", page: "#ffffff", accent: "#7b6cf0", line: "#c9ceff" },
  { bg: "#e8ebff", page: "#fdfdff", accent: "#6a7cf5", line: "#c3caff" },
  { bg: "#efeaff", page: "#ffffff", accent: "#8f72f2", line: "#d3c8ff" },
];

type Props = {
  item: AuthorContentItem;
  className?: string;
  /** which cover frame this is (the author may position each one separately) */
  frame?: CoverFrameId;
};

export default function MaterialVisual({ item, className = "", frame }: Props) {
  const uid = useId().replace(/:/g, "");
  const h = hashSeed(`${item.kind}:${item.id}`);
  const v = h % 3; // palette variant
  const w = (h >>> 3) % 3; // shape variant

  if (item.coverUrl) {
    return (
      <div className={`overflow-hidden rounded-xl bg-[#eef0fd] ${className}`}>
        <img
          src={frame ? coverUrlForFrame(item.coverUrl, item.coverFocus, frame) : item.coverUrl}
          alt={`Обкладинка: ${item.title}`}
          loading="lazy"
          style={coverImageStyle(item.coverFocus, frame)}
          className="w-full h-full object-cover transition-transform duration-500 motion-safe:group-hover:translate-x-0.5"
        />
      </div>
    );
  }

  if (item.kind === "program") {
    const p = PALETTES[v];
    const n = Math.min(5, Math.max(3, item.moduleCount ?? 4));
    // a gently winding path through n markers
    const pts = Array.from({ length: n }, (_, i) => {
      const x = 14 + (i * 72) / (n - 1);
      const y = 62 - (i * 30) / (n - 1) + (i % 2 === 0 ? -6 : 6) * (w === 1 ? -1 : 1) + w * 2;
      return [x, y] as const;
    });
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} aria-hidden="true">
        <svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={`pg${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={p.a} />
              <stop offset="1" stopColor={p.b} />
            </linearGradient>
          </defs>
          <rect width="100" height="75" fill={`url(#pg${uid})`} />
          <circle cx={80 - w * 6} cy="12" r="26" fill="#fff" opacity="0.07" />
          <path d={d} fill="none" stroke={p.ink} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2.2 2.6" strokeLinecap="round" />
          <g className="transition-transform duration-500 motion-safe:group-hover:translate-x-0.5">
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === n - 1 ? 4.2 : 2.6} fill={i === n - 1 ? p.ink : p.soft} opacity={i === n - 1 ? 0.95 : 0.8} />
            ))}
          </g>
        </svg>
      </div>
    );
  }

  if (item.kind === "meditation") {
    const p = PALETTES[v];
    const phase = w * 6;
    return (
      <div className={`relative overflow-hidden rounded-xl ${className}`} aria-hidden="true">
        <svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id={`mg${uid}`} x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor={p.b} />
              <stop offset="1" stopColor={p.a} />
            </linearGradient>
            <radialGradient id={`mr${uid}`} cx="0.3" cy="0.25" r="0.8">
              <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100" height="75" fill={`url(#mg${uid})`} />
          <rect width="100" height="75" fill={`url(#mr${uid})`} />
          <g className="transition-transform duration-700 motion-safe:group-hover:-translate-y-0.5">
            <path d={`M-5 ${48 + phase / 3} C 20 ${36 - phase / 2}, 40 ${60 + phase / 2}, 62 ${46} S 100 ${34 + phase / 3}, 108 ${44}`} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.1" />
            <path d={`M-5 ${58} C 22 ${48 + phase / 3}, 44 ${68 - phase / 2}, 66 ${56} S 100 ${46}, 108 ${54 - phase / 3}`} fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />
            <path d={`M-5 ${38 - phase / 3} C 18 ${28}, 38 ${46 - phase / 3}, 58 ${34} S 96 ${26 + phase / 2}, 108 ${32}`} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.9" />
          </g>
          <circle cx="84" cy="60" r="7.5" fill="#fff" opacity="0.92" />
          <path d="M82 56.5 L88 60 L82 63.5 Z" fill={p.a} />
        </svg>
      </div>
    );
  }

  // guide: editorial paper pages on a lavender field
  const l = LAVENDER[v];
  const lines = [0, 1, 2, 3, 4].map((i) => i);
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: l.bg }} aria-hidden="true">
      <svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <g transform={`rotate(${-6 + w * 2} 40 40)`} opacity="0.7">
          <rect x="24" y="12" width="36" height="50" rx="3" fill={l.page} stroke={l.line} strokeWidth="0.6" />
        </g>
        <g className="transition-transform duration-500 motion-safe:group-hover:translate-x-0.5" transform={`rotate(${4 - w * 2} 56 40)`}>
          <rect x="38" y="10" width="38" height="54" rx="3" fill={l.page} stroke={l.line} strokeWidth="0.7" />
          <rect x="43" y="16" width="14" height="2.6" rx="1.3" fill={l.accent} />
          {lines.map((i) => (
            <rect key={i} x="43" y={24 + i * 6.2} width={i === 4 ? 14 : i % 2 ? 24 : 28} height="1.8" rx="0.9" fill={l.line} />
          ))}
          <path d="M76 10 L76 20 L66 10 Z" fill={l.accent} opacity="0.18" />
        </g>
      </svg>
      {item.pageCount ? (
        <span className="absolute left-2.5 bottom-2 text-[12px] font-medium" style={{ color: l.accent }}>
          {item.pageCount} стор.
        </span>
      ) : null}
    </div>
  );
}
