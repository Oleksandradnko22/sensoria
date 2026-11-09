// Decorative cover art for program cards that have no real cover image.
// Pure SVG, chosen only by the program's topic tags — it never shows data,
// so it can't contradict the card. Each scene stays in Sensoria's
// lavender / periwinkle range so the four read as one family.

import { coverVariant, sceneForTags, type Scene } from "../utils/coverScene";

const BG: Record<Scene, string> = {
  balance: "from-[#e3ebff] to-[#d2dcff]",
  calm: "from-[#e6e9ff] to-[#d9d3ff]",
  bloom: "from-[#e1e9ff] to-[#dcd6ff]",
  connection: "from-[#ebe6ff] to-[#f3dcf7]",
  path: "from-[#e4e8ff] to-[#d6d0ff]",
  sunrise: "from-[#e8e4ff] to-[#d4e0ff]",
  growth: "from-[#e1ecff] to-[#e0d8ff]",
};

// Small per-program palette shift so two covers of the same topic are not identical.
const HUE = ["0deg", "-24deg", "26deg"];

function Hills({ a, b }: { a: string; b: string }) {
  return (
    <>
      <path d="M0 120 C60 96 120 100 180 112 C240 124 290 104 340 96 L340 170 L0 170Z" fill={a} />
      <path d="M0 140 C70 122 130 130 200 138 C260 146 300 132 340 126 L340 170 L0 170Z" fill={b} />
    </>
  );
}

function Art({ scene }: { scene: Scene }) {
  switch (scene) {
    case "balance":
      return (
        <>
          <Hills a="#c3cffb" b="#aebdf7" />
          <path d="M70 140C54 112 60 84 84 66c14 22 10 52-14 74z" fill="#9fb2f5" opacity=".75" />
          <path d="M84 146c-4-22 6-40 24-52 2 22-6 40-24 52z" fill="#b9c8fb" opacity=".8" />
          <ellipse cx="235" cy="146" rx="46" ry="8" fill="#4a5bd0" opacity=".14" />
          <ellipse cx="235" cy="132" rx="40" ry="15" fill="#9db1f7" />
          <ellipse cx="235" cy="108" rx="29" ry="12" fill="#b3c2fa" />
          <ellipse cx="235" cy="88" rx="18" ry="9" fill="#9db1f7" />
          <ellipse cx="228" cy="84" rx="6" ry="2.4" fill="#fff" opacity=".5" />
        </>
      );
    case "calm":
      return (
        <>
          <circle cx="255" cy="64" r="30" fill="#fff" opacity=".55" />
          <circle cx="255" cy="64" r="20" fill="#fff" opacity=".7" />
          <Hills a="#c4c8fb" b="#a9b0f4" />
          <path d="M0 150C50 138 90 150 140 144s100-14 200 2v24H0z" fill="#8e98ee" opacity=".55" />
          <path d="M40 120c26-8 44-4 70 4M180 124c22-6 40-4 60 2" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".6" />
        </>
      );
    case "bloom":
      return (
        <>
          <Hills a="#c5cdfb" b="#adb6f6" />
          <g transform="translate(170 118)">
            <path d="M0 0C-26-10-34-40-14-62 4-44 4-20 0 0z" fill="#8fa4f5" opacity=".9" />
            <path d="M0 0C26-10 34-40 14-62-4-44-4-20 0 0z" fill="#8fa4f5" opacity=".9" />
            <path d="M0 0C-44-4-62-26-60-46-34-44-8-28 0 0z" fill="#aab7fa" />
            <path d="M0 0C44-4 62-26 60-46-34-44 8-28 0 0z" fill="#aab7fa" transform="scale(-1 1)" />
            <path d="M0 0C-12-18-10-52 0-78 10-52 12-18 0 0z" fill="#d9e1ff" />
            <circle cx="0" cy="-38" r="26" fill="#fff" opacity=".35" />
          </g>
        </>
      );
    case "path":
      return (
        <>
          <Hills a="#c4c8fb" b="#aab2f4" />
          <path d="M70 146c-14-22-12-48 6-66 12 18 12 46-6 66z" fill="#9fb0f5" opacity=".7" />
          <path d="M282 150c10-20 8-42-8-58-10 16-10 40 8 58z" fill="#b6c3fb" opacity=".8" />
          <path d="M128 152V86a42 42 0 0 1 84 0v66z" fill="#c7d0ff" />
          <path d="M140 152V90a30 30 0 0 1 60 0v62z" fill="#fff" opacity=".78" />
          <path d="M150 152V92a20 20 0 0 1 40 0v60z" fill="#a8b5f8" />
          <circle cx="170" cy="82" r="12" fill="#fff" opacity=".6" />
          <rect x="146" y="148" width="48" height="6" rx="3" fill="#b3c0fa" />
          <rect x="138" y="154" width="64" height="7" rx="3.5" fill="#a3b1f6" />
          <rect x="130" y="161" width="80" height="8" rx="4" fill="#94a3f2" />
        </>
      );
    case "sunrise":
      return (
        <>
          <circle cx="170" cy="104" r="46" fill="#fff" opacity=".35" />
          <circle cx="170" cy="104" r="32" fill="#fff" opacity=".55" />
          <circle cx="170" cy="104" r="20" fill="#fff" opacity=".85" />
          <path d="M170 40v-10M118 56l-7-7M222 56l7-7M96 92H84M244 92h12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".65" />
          <Hills a="#c3cffb" b="#a9b8f6" />
          <path d="M0 150C60 142 110 152 170 146s110-10 170 2v22H0z" fill="#8fa0f0" opacity=".6" />
          <path d="M60 158c26-5 48-3 74 2M200 160c24-4 44-3 66 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".55" />
        </>
      );
    case "growth":
      return (
        <>
          <path d="M170 150L96 0h40zM170 150L204 0h40z" fill="#fff" opacity=".2" />
          <circle cx="62" cy="48" r="5" fill="#fff" opacity=".7" />
          <circle cx="288" cy="40" r="7" fill="#fff" opacity=".6" />
          <circle cx="250" cy="84" r="3.5" fill="#fff" opacity=".7" />
          <circle cx="96" cy="86" r="3" fill="#fff" opacity=".6" />
          <Hills a="#c3cdfb" b="#adb7f6" />
          <path d="M170 150c-2-30 0-58 6-84" stroke="#7f93f1" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M173 112c-26-2-40-16-42-34 24 0 40 14 42 34z" fill="#9fb2f6" />
          <path d="M175 88c22-2 36-14 40-30-22 0-38 12-40 30z" fill="#b9c6fb" />
          <path d="M177 68c-12-8-16-20-12-34 14 6 18 18 12 34z" fill="#d9e1ff" />
          <circle cx="178" cy="60" r="22" fill="#fff" opacity=".35" />
        </>
      );
    case "connection":
    default:
      return (
        <>
          <Hills a="#d2c7fb" b="#bfb3f7" />
          <path d="M60 138c-6-26 2-46 22-60 4 26-2 46-22 60z" fill="#a99af0" opacity=".7" />
          <path d="M290 136c4-24-4-44-24-56-4 24 4 44 24 56z" fill="#a99af0" opacity=".7" />
          <path d="M150 104c-14-14-36-6-34 12 2 18 34 34 34 34s32-16 34-34c2-18-20-26-34-12z" fill="#8f95f2" />
          <path d="M214 124c-9-9-23-4-22 8 1 12 22 22 22 22s21-10 22-22c1-12-13-17-22-8z" fill="#c9a8f2" />
          <ellipse cx="136" cy="108" rx="7" ry="4" fill="#fff" opacity=".45" transform="rotate(-30 136 108)" />
        </>
      );
  }
}

export default function ProgramCover({ tags, seed }: { tags?: string[]; seed?: string }) {
  const scene = sceneForTags(tags);
  const { shift, mirror, zoom } = coverVariant(seed);
  // A mirrored + zoomed picture must scale around the centre: around 30% the flip pushes the art left and
  // leaves a bare strip on the right (the hills visibly stop part-way across the card).
  return (
    <div aria-hidden="true" className={`absolute inset-0 bg-gradient-to-br ${BG[scene]}`} style={{ filter: `hue-rotate(${HUE[shift]})` }}>
      <svg
        viewBox="0 0 340 170"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 w-full h-full"
        style={{ transform: `${mirror ? "scaleX(-1) " : ""}${zoom ? "scale(1.18)" : ""}`.trim() || undefined, transformOrigin: zoom ? (mirror ? "50% 100%" : "30% 100%") : undefined }}
      >
        <Art scene={scene} />
      </svg>
    </div>
  );
}
