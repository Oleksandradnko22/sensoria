// Author Cover System renderer (logic: utils/authorCover.ts).
// Art-directed SVG compositions — 3 drawn types (abstract / atmospheric /
// editorial) × 4 compositions, each in one of 5 colour families — plus the
// author's own photo ("personal"). Decorative; abstract & atmospheric move
// very slowly (off for reduced motion). No text, no stock photos.
import { useId, type ReactNode } from "react";
import {
  COVER_PALETTES,
  resolveCover,
  type CoverFamily,
  type CoverInput,
  type CoverPalette,
  type CoverSpec,
  type CoverType,
} from "../../../utils/authorCover";

const VB_W = 1200;
const VB_H = 160;

function washStyle(p: CoverPalette) {
  return {
    background: `radial-gradient(60% 130% at 10% 0%, rgba(255,255,255,0.55), transparent 62%), radial-gradient(50% 110% at 92% 100%, rgba(255,255,255,0.38), transparent 60%), linear-gradient(105deg, ${p.bg[0]}, ${p.bg[1]}, ${p.bg[2]})`,
  };
}

type Ctx = { p: CoverPalette; blur: (n: number) => string; uid: string };

function Blur({ id, n }: { id: string; n: number }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={n} />
    </filter>
  );
}

// ── Abstract: soft organic forms, lines, gradients ───────────────────
function abstract(comp: number, { p, blur }: Ctx): ReactNode {
  switch (comp) {
    case 1:
      return (
        <g>
          <circle className="cv-a author-glow-a" cx="150" cy="30" r="120" fill={p.a} filter={blur(26)} opacity="0.9" />
          <circle className="cv-a author-glow-b" cx="540" cy="130" r="95" fill={p.c} filter={blur(24)} opacity="0.85" />
          <circle className="cv-a author-glow-c" cx="920" cy="20" r="135" fill={p.b} filter={blur(28)} opacity="0.9" />
        </g>
      );
    case 2:
      return (
        <g>
          <circle className="cv-a author-glow-b" cx="300" cy="90" r="120" fill={p.b} filter={blur(28)} opacity="0.8" />
          <path className="cv-a author-glow-c" d="M-20,112 C200,30 420,160 640,92 S1020,34 1220,104" fill="none" stroke={p.ink} strokeOpacity="0.7" strokeWidth="2" />
          <path d="M-20,134 C230,70 430,170 660,118 S1040,64 1220,128" fill="none" stroke={p.ink} strokeOpacity="0.45" strokeWidth="1.5" />
          <path d="M-20,90 C180,10 440,130 620,70 S1000,10 1220,80" fill="none" stroke={p.a} strokeOpacity="0.9" strokeWidth="3" filter={blur(1)} />
        </g>
      );
    case 3:
      return (
        <g>
          <circle className="cv-a author-glow-a" cx="260" cy="90" r="130" fill={p.a} filter={blur(30)} opacity="0.7" />
          <circle cx="990" cy="80" r="92" fill="none" stroke={p.ink} strokeOpacity="0.6" strokeWidth="1.5" />
          <circle className="cv-a author-glow-c" cx="990" cy="80" r="56" fill={p.ink} fillOpacity="0.2" />
          <circle className="cv-a author-glow-b" cx="170" cy="60" r="26" fill={p.b} opacity="0.75" />
          <circle cx="250" cy="116" r="13" fill={p.c} opacity="0.85" />
          <circle cx="90" cy="124" r="9" fill={p.a} opacity="0.9" />
        </g>
      );
    default:
      return (
        <g>
          {[
            { x: 120, c: p.a, o: 0.75 },
            { x: 520, c: p.b, o: 0.7 },
            { x: 900, c: p.c, o: 0.8 },
          ].map((b, i) => (
            <rect
              key={i}
              className={["author-glow-a", "author-glow-b", "author-glow-c"][i]}
              x={b.x}
              y="-60"
              width="170"
              height="300"
              rx="85"
              fill={b.c}
              opacity={b.o}
              filter={blur(8)}
              transform={`rotate(-18 ${b.x + 85} 80)`}
            />
          ))}
          <circle cx="400" cy="40" r="5" fill={p.ink} opacity="0.7" />
          <circle cx="780" cy="120" r="4" fill={p.ink} opacity="0.6" />
          <circle cx="1100" cy="50" r="6" fill={p.ink} opacity="0.7" />
        </g>
      );
  }
}

// ── Atmospheric: light, fog, water, space ────────────────────────────
function atmospheric(comp: number, { p, blur, uid }: Ctx): ReactNode {
  switch (comp) {
    case 1:
      return (
        <g>
          <defs>
            <radialGradient id={`${uid}-g`} cx="0.2" cy="0" r="0.6">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={VB_W} height={VB_H} fill={`url(#${uid}-g)`} />
          <ellipse className="cv-a author-glow-b" cx="720" cy="150" rx="430" ry="48" fill={p.a} filter={blur(26)} opacity="0.75" />
          <ellipse className="cv-a author-glow-a" cx="280" cy="168" rx="380" ry="42" fill={p.b} filter={blur(24)} opacity="0.65" />
          <ellipse className="cv-a author-glow-c" cx="1000" cy="40" rx="260" ry="40" fill={p.c} filter={blur(24)} opacity="0.6" />
        </g>
      );
    case 2:
      return (
        <g>
          {[
            { y: 40, c: p.c, o: 0.5, d: "author-glow-a" },
            { y: 70, c: p.a, o: 0.55, d: "author-glow-b" },
            { y: 102, c: p.b, o: 0.5, d: "author-glow-c" },
            { y: 130, c: p.a, o: 0.45, d: "author-glow-a" },
          ].map((w, i) => (
            <path
              key={i}
              className={`cv-a ${w.d}`}
              d={`M-40,${w.y} C200,${w.y - 36} 420,${w.y + 36} 640,${w.y} S1040,${w.y - 30} 1260,${w.y + 6} L1260,200 L-40,200 Z`}
              fill={w.c}
              opacity={w.o}
              filter={blur(7)}
            />
          ))}
          <path d="M-20,58 C220,22 420,92 650,56 S1020,24 1220,62" fill="none" stroke={p.ink} strokeOpacity="0.55" strokeWidth="1.5" filter={blur(1)} />
        </g>
      );
    case 3:
      return (
        <g>
          <circle className="cv-a author-glow-b" cx="860" cy="108" r="120" fill={p.ink} opacity="0.7" filter={blur(26)} />
          <ellipse className="cv-a author-glow-a" cx="600" cy="150" rx="720" ry="62" fill={p.c} filter={blur(26)} opacity="0.8" />
          <ellipse className="cv-a author-glow-c" cx="940" cy="120" rx="300" ry="56" fill={p.b} filter={blur(24)} opacity="0.65" />
          <line x1="0" y1="106" x2={VB_W} y2="106" stroke={p.ink} strokeOpacity="0.7" strokeWidth="2" filter={blur(2)} />
        </g>
      );
    default:
      return (
        <g>
          <circle className="cv-a author-glow-a" cx="260" cy="40" r="150" fill={p.a} filter={blur(32)} opacity="0.7" />
          <circle className="cv-a author-glow-b" cx="720" cy="130" r="170" fill={p.b} filter={blur(34)} opacity="0.65" />
          <circle className="cv-a author-glow-c" cx="1060" cy="30" r="140" fill={p.c} filter={blur(30)} opacity="0.7" />
          {[
            [90, 36], [180, 112], [330, 70], [470, 24], [560, 98], [650, 52], [790, 30], [880, 118], [990, 76], [1090, 120], [1150, 44], [410, 130],
          ].map(([x, y], i) => (
            <circle
              key={i}
              className="author-twinkle"
              style={{ animationDelay: `${(i % 6) * 0.9}s` }}
              cx={x}
              cy={y}
              r={i % 3 === 0 ? 2 : 1.4}
              fill={p.ink}
              opacity="0.8"
            />
          ))}
        </g>
      );
  }
}

// ── Editorial: minimal geometry, magazine feel (static) ──────────────
function editorial(comp: number, { p }: Ctx): ReactNode {
  switch (comp) {
    case 1:
      return (
        <g>
          <circle cx="1090" cy="80" r="150" fill={p.a} opacity="0.95" />
          <circle cx="1090" cy="80" r="92" fill={p.b} opacity="0.8" />
          <line x1="880" y1="0" x2="880" y2={VB_H} stroke={p.deep} strokeOpacity="0.5" strokeWidth="1.5" />
          <circle cx="120" cy="48" r="10" fill="none" stroke={p.deep} strokeOpacity="0.6" strokeWidth="1.5" />
        </g>
      );
    case 2:
      return (
        <g>
          <circle cx="0" cy="170" r="160" fill={p.b} opacity="0.85" />
          <circle cx="0" cy="170" r="98" fill={p.a} opacity="1" />
          <line x1="320" y1="0" x2="320" y2={VB_H} stroke={p.deep} strokeOpacity="0.55" strokeWidth="1.5" />
          <line x1="332" y1="0" x2="332" y2={VB_H} stroke={p.deep} strokeOpacity="0.3" strokeWidth="1" />
          <rect x="820" y="0" width="380" height={VB_H} fill={p.c} opacity="0.55" />
        </g>
      );
    case 3:
      return (
        <g>
          <rect x="700" y="0" width="210" height={VB_H} fill={p.a} opacity="0.85" />
          <rect x="910" y="0" width="290" height="100" fill={p.b} opacity="0.8" />
          <rect x="910" y="100" width="140" height="60" fill={p.c} opacity="1" />
          <rect x="1050" y="100" width="150" height="60" fill={p.a} opacity="0.7" />
          <line x1="60" y1="120" x2="520" y2="120" stroke={p.deep} strokeOpacity="0.55" strokeWidth="1.5" />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="1000" cy="80" r="120" fill="none" stroke={p.deep} strokeOpacity="0.3" strokeWidth="1.5" />
          <circle cx="1000" cy="80" r="80" fill="none" stroke={p.deep} strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx="1000" cy="80" r="16" fill={p.b} />
          <line x1="60" y1="130" x2="420" y2="130" stroke={p.deep} strokeOpacity="0.55" strokeWidth="1.5" />
          <rect x="60" y="30" width="44" height="44" fill={p.a} opacity="1" />
        </g>
      );
  }
}

const DRAW: Record<Exclude<CoverType, "personal">, (comp: number, ctx: Ctx) => ReactNode> = {
  abstract,
  atmospheric,
  editorial,
};

export function CoverArt({
  type,
  family,
  comp,
  className = "",
}: {
  type: Exclude<CoverType, "personal">;
  family: CoverFamily;
  comp: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const p = COVER_PALETTES[family];
  const blur = (n: number) => `url(#${uid}-b${n})`;
  const blurs = [1, 2, 7, 8, 24, 26, 28, 30, 32, 34];
  return (
    <div className={`relative overflow-hidden ${className}`} style={washStyle(p)} aria-hidden="true">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          {blurs.map((n) => (
            <Blur key={n} id={`${uid}-b${n}`} n={n} />
          ))}
        </defs>
        {DRAW[type](comp, { p, blur, uid })}
      </svg>
    </div>
  );
}

export default function AuthorCover({ cover }: { cover: CoverInput | CoverSpec }) {
  const spec: CoverSpec = "family" in cover ? cover : resolveCover(cover);
  if (spec.type === "personal" && spec.imageUrl) {
    return (
      <div className="relative h-20 sm:h-28 overflow-hidden bg-[#ebeafb]" aria-hidden="true">
        <img src={spec.imageUrl} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/25 via-transparent to-transparent" />
      </div>
    );
  }
  return <CoverArt type={spec.type === "personal" ? "abstract" : spec.type} family={spec.family} comp={spec.comp} className="h-20 sm:h-28" />;
}
