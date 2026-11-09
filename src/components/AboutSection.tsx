import type { ReactNode } from "react";
import { Icon, type IconName } from "./ui/Icon";

type Props = {
  onOpenCatalog?: () => void;
  onOpenGuides?: () => void;
  onOpenMeditations?: () => void;
};

/* ---------- Lightweight SVG illustrations (decorative, no assets) ---------- */

function ProgramArt() {
  return (
    <svg viewBox="0 0 180 170" fill="none" aria-hidden="true" className="w-full h-full">
      <defs>
        <linearGradient id="pa-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ddd3ff" />
          <stop offset="1" stopColor="#c9bcff" />
        </linearGradient>
        <linearGradient id="pa-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1ecff" />
        </linearGradient>
        <linearGradient id="pa-play" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cf0" />
          <stop offset="1" stopColor="#6a4be0" />
        </linearGradient>
      </defs>
      <rect x="52" y="14" width="108" height="140" rx="16" fill="url(#pa-back)" opacity=".55" transform="rotate(7 106 84)" />
      <rect x="36" y="20" width="108" height="140" rx="16" fill="url(#pa-front)" stroke="#fff" strokeWidth="1.5" style={{ filter: "drop-shadow(0 10px 18px rgba(91,63,209,.22))" }} />
      <rect x="48" y="34" width="84" height="46" rx="10" fill="#e6defd" />
      <circle cx="90" cy="57" r="14" fill="url(#pa-play)" />
      <path d="M86 51l10 6-10 6z" fill="#fff" />
      {[96, 116, 136].map((y, i) => (
        <g key={y}>
          <circle cx="56" cy={y} r="6" fill={i < 2 ? "#7c5ce8" : "#d9cffb"} />
          {i < 2 && <path d={`M53 ${y}l2.2 2.2 4-4.2`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="68" y={y - 3} width={i === 0 ? 56 : i === 1 ? 46 : 36} height="6" rx="3" fill="#d9cffb" />
        </g>
      ))}
    </svg>
  );
}

function MeditationArt() {
  return (
    <svg viewBox="0 0 180 170" fill="none" aria-hidden="true" className="w-full h-full">
      <defs>
        <linearGradient id="ma-s1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9c8ff" />
          <stop offset="1" stopColor="#8fa5f5" />
        </linearGradient>
        <linearGradient id="ma-s2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9d3ff" />
          <stop offset="1" stopColor="#a1b3f8" />
        </linearGradient>
        <linearGradient id="ma-leaf" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#bcd0ff" />
          <stop offset="1" stopColor="#8aa6f7" />
        </linearGradient>
      </defs>
      <path d="M118 96C100 70 108 38 132 18c14 26 8 58-14 78z" fill="url(#ma-leaf)" opacity=".7" />
      <path d="M126 104c4-24 22-40 44-44-2 24-16 40-44 44z" fill="url(#ma-leaf)" opacity=".5" />
      <ellipse cx="86" cy="150" rx="62" ry="9" fill="#5b6fe0" opacity=".14" />
      <ellipse cx="82" cy="134" rx="56" ry="20" fill="url(#ma-s1)" />
      <ellipse cx="82" cy="108" rx="40" ry="15" fill="url(#ma-s2)" />
      <ellipse cx="82" cy="86" rx="25" ry="10" fill="url(#ma-s1)" />
      <ellipse cx="74" cy="80" rx="9" ry="3" fill="#fff" opacity=".45" />
    </svg>
  );
}

function GuideArt() {
  return (
    <svg viewBox="0 0 180 170" fill="none" aria-hidden="true" className="w-full h-full">
      <defs>
        <linearGradient id="ga-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c5ede2" />
          <stop offset="1" stopColor="#a9e0d1" />
        </linearGradient>
        <linearGradient id="ga-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf8f3" />
        </linearGradient>
      </defs>
      <rect x="56" y="14" width="100" height="136" rx="14" fill="url(#ga-back)" opacity=".6" transform="rotate(8 106 82)" />
      <rect x="34" y="20" width="102" height="140" rx="14" fill="url(#ga-front)" stroke="#fff" strokeWidth="1.5" style={{ filter: "drop-shadow(0 10px 18px rgba(15,118,110,.2))" }} />
      <path d="M104 20h18v34l-9-7-9 7z" fill="#2fa793" />
      {[44, 62, 80, 98, 116].map((y, i) => (
        <rect key={y} x="48" y={y} width={i === 4 ? 40 : 60 - (i % 2) * 8} height="6" rx="3" fill="#cdeee5" />
      ))}
      <path d="M150 156c-2-28 6-50 22-64 4 26-4 50-22 64z" fill="#3fb59f" opacity=".85" />
      <path d="M150 156c-14-10-20-26-18-42 14 8 20 24 18 42z" fill="#5cc9b3" opacity=".8" />
    </svg>
  );
}

/* ---------- Journey icons (quiet line icons) ---------- */

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function TestIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...line}>
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 4.5h6M9 10l1.2 1.2L12.5 9M9 16l1.2 1.2L12.5 15M14.5 11h2M14.5 17h2" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...line}>
      <path d="M12 3c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z" />
      <path d="M19 16v4M17 18h4" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...line}>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}

const STEPS: { title: string; tint: string; icon: ReactNode }[] = [
  { title: "Пройдіть тест", tint: "bg-[#ece8ff] text-[#5b3fd1]", icon: <TestIcon /> },
  { title: "Отримайте рекомендації", tint: "bg-[#e0eaff] text-[#2557d6]", icon: <SparkIcon /> },
  { title: "Оберіть свій формат", tint: "bg-[#d9f2ea] text-[#0f766e]", icon: <GridIcon /> },
  { title: "Рухайтеся у своєму темпі", tint: "bg-[#ece8ff] text-[#5b3fd1]", icon: <Icon name="heart" size={20} /> },
];

export default function AboutSection({ onOpenCatalog, onOpenGuides, onOpenMeditations }: Props) {
  const formats: {
    icon: IconName;
    title: string;
    text: string;
    link: string;
    card: string;
    chip: string;
    linkColor: string;
    art: ReactNode;
    run?: () => void;
  }[] = [
    {
      icon: "program",
      title: "Програми",
      text: "Покрокові курси для роботи зі своїм станом.",
      link: "Переглянути програми",
      card: "from-[#f6f2ff] to-[#e9e2ff]",
      chip: "bg-[#e1d9ff] text-[#5b3fd1]",
      linkColor: "text-[#3b27a8]",
      art: <ProgramArt />,
      run: onOpenCatalog,
    },
    {
      icon: "meditation",
      title: "Медитації",
      text: "Короткі практики для заспокоєння, фокусу та сну.",
      link: "Переглянути медитації",
      card: "from-[#f0f5ff] to-[#dfe9ff]",
      chip: "bg-[#d3e2ff] text-[#2557d6]",
      linkColor: "text-[#1f3fa8]",
      art: <MeditationArt />,
      run: onOpenMeditations,
    },
    {
      icon: "guide",
      title: "Гайди",
      text: "Практичні матеріали й поради, до яких можна повертатися.",
      link: "Переглянути гайди",
      card: "from-[#f0faf7] to-[#dcf3ec]",
      chip: "bg-[#cdeee5] text-[#0f766e]",
      linkColor: "text-[#0b5f58]",
      art: <GuideArt />,
      run: onOpenGuides,
    },
  ];

  return (
    <section aria-labelledby="about-title" className="page-container pt-2 sm:pt-10 pb-6 sm:pb-14 lg:pb-20">
      <div className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] bg-gradient-to-b from-white/95 via-[#f5f5ff]/92 to-[#ebecff]/90 border border-white/60 px-5 sm:px-10 lg:px-14 pt-9 sm:pt-12 pb-7 sm:pb-10 shadow-[0_30px_100px_rgba(15,23,100,0.25)]">
        {/* soft organic atmosphere, behind content */}
        <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -left-12 bottom-10 w-52 sm:w-64 text-[#d9d2ff] opacity-40">
          <path fill="currentColor" d="M40 20c60-20 130 20 140 80 6 40-30 80-80 80C30 180-10 90 40 20z" />
        </svg>

        <div className="relative">
          {/* HEADER */}
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-block px-3.5 py-1 rounded-full bg-[#e6e8ff] text-[#3d4bb8] text-[12px] font-semibold tracking-[0.12em] uppercase">
              Ваш шлях із Sensoria
            </span>
            <h2 id="about-title" className="fluid-h2 font-bold text-[#0f172a] mt-4">
              Як працює Sensoria
            </h2>
            <p className="mt-3 text-gray-700 fluid-lead">
              Почніть із короткого тесту, отримайте персональні рекомендації та оберіть те, що підходить вам саме зараз.
            </p>
          </div>

          {/* THREE FORMATS */}
          <ul className="grid lg:grid-cols-3 gap-4 lg:gap-6 mt-8 sm:mt-10">
            {formats.map((f) => (
              <li key={f.title} className="flex">
                <button
                  type="button"
                  onClick={f.run}
                  className={`group relative overflow-hidden w-full min-h-[190px] lg:min-h-[260px] text-left rounded-3xl bg-gradient-to-br ${f.card} border border-white/80 p-5 sm:p-6 lg:p-7 flex flex-col shadow-[0_2px_12px_rgba(30,40,140,0.06)] hover:shadow-[0_16px_40px_rgba(30,40,140,0.15)] hover:-translate-y-1 transition duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-4 w-[36%] sm:w-[26%] lg:right-1 lg:top-auto lg:bottom-1 lg:w-[46%] max-w-[190px] aspect-[180/170] opacity-95 transition-transform duration-700 ease-out group-hover:scale-[1.04] group-hover:-translate-y-1"
                  >
                    {f.art}
                  </span>

                  <span className={`relative w-11 h-11 rounded-xl flex items-center justify-center ${f.chip}`}>
                    <Icon name={f.icon} size={22} />
                  </span>
                  <span className="relative t-h3 text-[#0f172a] mt-4">{f.title}</span>
                  <span className="relative t-body text-gray-700 mt-1.5 max-w-[58%] lg:max-w-[62%]">{f.text}</span>
                  <span className={`relative mt-auto pt-4 t-small font-semibold ${f.linkColor}`}>
                    {f.link}{" "}
                    <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* JOURNEY: one connected line, separated by a divider */}
          <div className="mt-8 sm:mt-10 pt-6 border-t border-[#c7cdf5]/60">
            <h3 className="sr-only">Ваш шлях із Sensoria</h3>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center lg:justify-between gap-x-6 gap-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-center gap-3 lg:contents">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${s.tint}`}>{s.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-[#4f46e5] tabular-nums">0{i + 1}</span>
                      <span className="block t-body font-semibold text-[#0f172a] leading-snug">{s.title}</span>
                    </span>
                  </span>
                  {i < STEPS.length - 1 && (
                    <span aria-hidden="true" className="hidden lg:flex flex-1 items-center justify-center text-[#8b97ea]">
                      <svg viewBox="0 0 24 12" width="24" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6h19M16 1.5L21 6l-5 4.5" />
                      </svg>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
