import type { HeroArt as HeroArtId, HeroVisual } from "../../utils/heroVisual";

// Quiet emblem for the program hero, in the same language as the site's card
// accents (CardAccent): thin white outlines, translucent "glass" circles, one
// line glyph per category. It is a self-contained square (never cropped, never
// full-bleed) and deliberately low-contrast, so the title stays the focus.
// Pure SVG: no data, no random, instant render, no layout shift.

const CX = 200;
const RINGS = [186, 148, 112];

// 24×24 outline glyphs (same stroke style as data/contentAccents.tsx).
const GLYPHS: Record<HeroArtId, React.ReactNode> = {
  water: <path d="M3 12c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0M3 17c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0M3 7c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0" />,
  grounding: (
    <>
      <path d="M5 21c8 0 13-5 13-13V5h-3C7 5 5 12 5 20v1Z" />
      <path d="M5 21c3-6 6-9 12-12" />
    </>
  ),
  sunrise: (
    <>
      <path d="M12 2c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" />
      <path d="M3 21h18M8 17.5h8" />
    </>
  ),
  connection: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  openSpace: <path d="M12 3.5l2.47 5.18 5.53.62-4.1 3.88 1.1 5.57L12 15.9l-5 2.85 1.1-5.57-4.1-3.88 5.53-.62L12 3.5Z" />,
  momentum: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  balance: (
    <>
      <ellipse cx="12" cy="18" rx="7" ry="2.6" />
      <ellipse cx="12" cy="12.6" rx="5" ry="2.2" />
      <ellipse cx="12" cy="7.8" rx="3" ry="1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
};

// Small glass circles resting on the rings: [angle°, ring index, radius].
const ORBS: Record<HeroArtId, [number, number, number][]> = {
  water: [[-40, 0, 14], [200, 1, 9], [110, 2, 6]],
  grounding: [[-60, 1, 13], [160, 0, 8], [40, 2, 6]],
  sunrise: [[-110, 0, 14], [-30, 1, 9], [210, 2, 6]],
  connection: [[-20, 1, 13], [160, 1, 13], [90, 0, 7]],
  openSpace: [[-75, 0, 12], [30, 1, 8], [190, 2, 6]],
  momentum: [[-80, 0, 13], [-50, 1, 9], [-20, 2, 6]],
  balance: [[-90, 1, 12], [90, 1, 12], [0, 0, 7]],
  moon: [[-50, 0, 12], [150, 1, 8], [60, 2, 6]],
};

const STARS: [number, number][] = [[70, 90], [330, 120], [90, 320], [320, 300]];

function pt(angle: number, ring: number) {
  const a = (angle * Math.PI) / 180;
  return { x: CX + RINGS[ring] * Math.cos(a), y: CX + RINGS[ring] * Math.sin(a) };
}

export default function HeroArt({ visual }: { visual: HeroVisual }) {
  if (visual.imageUrl) {
    return <img src={visual.imageUrl} alt="" width={400} height={400} decoding="async" className="h-full w-full object-contain" />;
  }
  const art = visual.art;
  const id = `hero-${art}`;
  return (
    <svg viewBox="-12 -12 424 424" aria-hidden="true" focusable="false" className="h-full w-full">
      <defs>
        <radialGradient id={`${id}-glass`} cx="40%" cy="32%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".26" />
          <stop offset="1" stopColor="#fff" stopOpacity=".06" />
        </radialGradient>
      </defs>

      {RINGS.map((r, i) => (
        <circle key={r} cx={CX} cy={CX} r={r} fill="none" stroke="#fff" strokeOpacity={0.12 + i * 0.05} strokeWidth="1" />
      ))}

      {art === "moon" &&
        STARS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#fff" opacity=".6" />)}

      {ORBS[art].map(([angle, ring, r]) => {
        const { x, y } = pt(angle, ring);
        return <circle key={`${angle}-${ring}`} cx={x} cy={y} r={r} fill={`url(#${id}-glass)`} stroke="#fff" strokeOpacity=".4" strokeWidth="1" />;
      })}

      {art === "connection" ? (
        <>
          <circle cx={CX - 34} cy={CX} r="72" fill={`url(#${id}-glass)`} stroke="#fff" strokeOpacity=".45" strokeWidth="1.5" />
          <circle cx={CX + 34} cy={CX} r="72" fill={`url(#${id}-glass)`} stroke="#fff" strokeOpacity=".45" strokeWidth="1.5" />
        </>
      ) : (
        <circle cx={CX} cy={CX} r="84" fill={`url(#${id}-glass)`} stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" />
      )}

      <g
        transform={`translate(${CX} ${CX}) scale(${art === "connection" ? 2.4 : 3.2}) translate(-12 -12)`}
        fill="none"
        stroke="#fff"
        strokeOpacity=".92"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="[&_*]:[vector-effect:non-scaling-stroke]"
      >
        {GLYPHS[art]}
      </g>
    </svg>
  );
}
