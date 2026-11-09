import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type Item = {
  q: string;
  a: string;
};

type Group = {
  title: string;
  items: Item[];
};

// Split by content type instead of one flat list — the old set was
// written as if this were a course-completion platform ("Скільки часу
// займає проходження?", "Чи можна проходити у своєму темпі?"), but
// Sensoria isn't that: it's programs meant to gently support someone's
// psychological state, plus meditations and guides alongside them.
// Each type has different real questions, so each gets its own pair.
const faqGroups: Group[] = [
  {
    title: "Програми",
    items: [
      {
        // Previously "Чи це замінює психолога?" — the answer now
        // hints (rather than states outright, since a fuller
        // disclaimer belongs on other pages) that programs are made
        // by professionals but the platform doesn't insist they
        // replace seeing one: in a more serious state, a program,
        // course, or meditation alone may genuinely not be enough.
        q: "Чи можуть програми замінити роботу з психологом?",
        a: "Наші програми створюють практикуючі фахівці, і вони здатні м'яко підтримати вас у щоденному стані. Але це не привід відмовлятися від психолога — у більш глибокому чи складному стані краще звернутись до фахівця напряму.",
      },
      {
        q: "Як зрозуміти, яку програму обрати?",
        a: "Не обов'язково вирішувати це самостійно. Короткий тест допоможе зрозуміти, що найбільше відгукується вашому стану, і ми підберемо програму під вас.",
      },
    ],
  },
  {
    title: "Медитації",
    items: [
      {
        q: "Чи потрібен досвід, щоб почати медитувати?",
        a: "Ні, жодної підготовки не потрібно. Достатньо обрати практику, яка відгукується вашому стану, і почати в зручний момент.",
      },
      {
        // Was "Скільки триває одна медитація?" — durations actually
        // range widely (a few minutes to much longer), so a single
        // answer would either be vague or just wrong for half the
        // library. This question fits the format regardless of length.
        q: "Як обрати медитацію під свій стан?",
        a: "У кожної медитації є короткий опис і позначка стану, під який вона створена — орієнтуйтесь на те, що відгукується вам просто зараз.",
      },
    ],
  },
  {
    title: "Гайди",
    items: [
      {
        q: "У якому форматі гайди?",
        a: "Це короткі PDF-матеріали, чек-листи та воркбуки — практичні інструменти, які можна зберегти собі й повертатися до них у зручний час.",
      },
      {
        // Was "Чи всі гайди платні?" — free/paid applies across
        // programs, meditations and guides alike, so it's not a
        // guide-specific question. This one actually is.
        q: "Чим гайд відрізняється від програми?",
        a: "Гайд — це короткий практичний матеріал під конкретну ситуацію, а програма — послідовний шлях на кілька тижнів. Гайд зручно тримати під рукою і повертатися до нього, коли потрібно.",
      },
    ],
  },
];

type Props = {
  onOpenTest: () => void;
};

/* One family of 1.6px line icons, one per question. Purely decorative. */
const ico = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ICONS: ReactNode[][] = [
  [
    <svg key="a" {...ico}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" opacity=".7" /></svg>,
    <svg key="b" {...ico}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>,
  ],
  [
    <svg key="c" {...ico}><path d="M3 12h3l2-6 4 12 2.5-8 1.5 2H21" /></svg>,
    <svg key="d" {...ico}><path d="M12 20c-4 0-7-2-8-6 3 0 5 1 6.5 3C10 13 10.5 8 12 4c1.5 4 2 9 1.5 13C15 15 17 14 20 14c-1 4-4 6-8 6z" /></svg>,
  ],
  [
    <svg key="e" {...ico}><path d="M3 5.5C6 4.5 9 5 12 7c3-2 6-2.5 9-1.5V19c-3-1-6-.5-9 1.5-3-2-6-2.5-9-1.5z" /><path d="M12 7v13" /></svg>,
    <svg key="f" {...ico}><path d="M7 3h10v18l-5-4-5 4z" /></svg>,
  ],
];

// Quiet decorative question-mark bubbles (upper right, wide screens only).
function FaqArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 300" fill="none" className="pointer-events-none absolute right-0 -top-6 hidden lg:block w-[220px] xl:w-[250px] opacity-90">
      <defs>
        <linearGradient id="fq-big" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".38" />
          <stop offset="1" stopColor="#b7a6ff" stopOpacity=".22" />
        </linearGradient>
      </defs>
      <path d="M230 270c-10-60 10-120 70-150 20 50 8 110-70 150z" fill="#9bb0ff" opacity=".22" />
      <path d="M300 280c-30-40-30-90 0-130 30 40 30 90 0 130z" fill="#b7a6ff" opacity=".2" />
      <rect x="170" y="70" width="150" height="150" rx="38" fill="url(#fq-big)" stroke="#fff" strokeOpacity=".35" transform="rotate(8 245 145)" />
      <path d="M222 126c0-14 11-24 25-24s25 9 25 22c0 18-22 20-22 36" stroke="#fff" strokeOpacity=".7" strokeWidth="9" strokeLinecap="round" transform="rotate(8 245 145)" />
      <circle cx="250" cy="190" r="5.5" fill="#fff" fillOpacity=".7" />
      <rect x="86" y="26" width="64" height="58" rx="18" fill="#fff" fillOpacity=".2" stroke="#fff" strokeOpacity=".3" transform="rotate(-8 118 55)" />
      <path d="M104 52c0-7 6-12 13-12s13 5 13 11c0 9-11 10-11 18" stroke="#fff" strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" transform="rotate(-8 118 55)" />
    </svg>
  );
}

export default function FAQSection({ onOpenTest }: Props) {
  // "groupIndex-itemIndex" — one accordion item open at a time overall.
  const [open, setOpen] = useState<string | null>("0-0");
  const reduce = useReducedMotion();

  const toggle = (key: string) => {
    setOpen(open === key ? null : key);
  };

  return (
    <section id="faq" className="relative z-10 w-full scroll-mt-6 pt-6 sm:pt-10 pb-4 sm:pb-24 text-white">
      <div className="page-container relative">
        <FaqArt />

        {/* HEADER */}
        <div className="relative mb-8 sm:mb-12">
          <h2 className="fluid-h2 font-bold mb-3">Часті запитання</h2>
          <p className="text-white/80 fluid-lead">Відповіді на ключові питання перед початком</p>
        </div>

        <div className="relative flex flex-col gap-8 sm:gap-10">
          {faqGroups.map((group, gi) => (
            <div key={group.title}>
              <div className="t-caption text-white/70 tracking-wide uppercase mb-3 px-1">{group.title}</div>

              <div className="flex flex-col gap-3">
                {group.items.map((item, ii) => {
                  const key = `${gi}-${ii}`;
                  const isOpen = open === key;
                  const panelId = `faq-panel-${key}`;
                  const btnId = `faq-btn-${key}`;

                  return (
                    <div
                      key={key}
                      className={`rounded-2xl border overflow-hidden backdrop-blur-sm transition-colors duration-300 ${
                        isOpen
                          ? "border-white/35 bg-white/[0.13] shadow-[0_8px_30px_-12px_rgba(10,20,90,0.5)]"
                          : "border-white/20 bg-white/[0.07] hover:bg-white/[0.11] hover:border-white/30"
                      }`}
                    >
                      <h3 className="m-0">
                        <button
                          id={btnId}
                          type="button"
                          onClick={() => toggle(key)}
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 min-h-[64px] text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
                        >
                          <span className="shrink-0 w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center">
                            {ICONS[gi]?.[ii]}
                          </span>
                          <span className="flex-1 min-w-0 t-h3 !font-medium">{item.q}</span>
                          <span
                            aria-hidden="true"
                            className={`shrink-0 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg leading-none transition-transform duration-300 ${
                              isOpen ? "rotate-45" : ""
                            }`}
                          >
                            +
                          </span>
                        </button>
                      </h3>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={panelId}
                            role="region"
                            aria-labelledby={btnId}
                            key="answer"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduce ? 0 : 0.28, ease: "easeOut" }}
                            style={{ overflow: "hidden" }}
                          >
                            {/* aligned under the question text (icon 40px + gap) */}
                            <div className="pl-[68px] sm:pl-[76px] pr-[68px] sm:pr-[76px] pb-5 text-white/85 t-body !leading-[1.7]">
                              {item.a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* CTA BLOCK — dropped `backdrop-blur-md`: this panel sits
            directly below the accordion, so every open/close shifts
            its position, and backdrop-filter is one of the most
            expensive things a browser can recompute — doing that every
            animation frame while this block is also moving compounds
            with the accordion's own reflow. It's sitting over a plain
            gradient with nothing textured behind it to blur, so this
            is a real cost with no visible difference. */}
        <div className="relative overflow-hidden isolate mt-12 sm:mt-20 rounded-[28px] sm:rounded-[32px] px-6 sm:px-10 pt-10 sm:pt-14 pb-12 sm:pb-16 text-center border border-white/25 bg-gradient-to-r from-[#3d6cf2]/70 via-[#5a6bf0]/70 to-[#8a6df2]/70">
          <style>{`
            @keyframes ctaFloatA{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
            @keyframes ctaFloatB{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}
            @keyframes ctaWave{from{transform:translateX(0)}to{transform:translateX(-50%)}}
            @keyframes ctaDraw{0%{stroke-dashoffset:130}55%,100%{stroke-dashoffset:0}}
            @keyframes ctaPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
            @keyframes ctaTwinkle{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:.95;transform:scale(1.15)}}
            @keyframes ctaSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}
            @keyframes ctaRise{0%{transform:translateY(0);opacity:0}20%{opacity:.8}100%{transform:translateY(-46px);opacity:0}}
            .cta-a{animation:ctaFloatA 7s ease-in-out infinite}
            .cta-b{animation:ctaFloatB 8s ease-in-out infinite}
            .cta-w1{animation:ctaWave 28s linear infinite}
            .cta-w2{animation:ctaWave 40s linear infinite reverse}
            .cta-draw{stroke-dasharray:130;animation:ctaDraw 5s ease-in-out infinite}
            .cta-pulse{transform-box:fill-box;transform-origin:center;animation:ctaPulse 3.2s ease-in-out infinite}
            .cta-tw{transform-box:fill-box;transform-origin:center;animation:ctaTwinkle 3.6s ease-in-out infinite}
            .cta-sway{transform-box:fill-box;transform-origin:50% 100%;animation:ctaSway 6s ease-in-out infinite}
            .cta-rise{animation:ctaRise 5s ease-in infinite}
            @media (prefers-reduced-motion:reduce){.cta-a,.cta-b,.cta-w1,.cta-w2,.cta-draw,.cta-pulse,.cta-tw,.cta-sway,.cta-rise{animation:none}.cta-draw{stroke-dasharray:none}}
          `}</style>

          {/* drifting waves along the lower edge (pattern repeats every 1200 units) */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[80px] sm:h-[120px] -z-10 overflow-hidden">
            <svg viewBox="0 0 2400 140" preserveAspectRatio="none" className="cta-w1 absolute bottom-0 left-0 w-[200%] h-full">
              <path d="M0 70C150 30 300 30 450 70S750 110 900 70 1050 30 1200 70C1350 30 1500 30 1650 70S1950 110 2100 70 2250 30 2400 70V140H0z" fill="#fff" fillOpacity=".09" />
            </svg>
            <svg viewBox="0 0 2400 140" preserveAspectRatio="none" className="cta-w2 absolute bottom-0 left-0 w-[200%] h-[75%]">
              <path d="M0 80C200 50 400 50 600 80S1000 110 1200 80C1400 50 1600 50 1800 80S2200 110 2400 80V140H0z" fill="#fff" fillOpacity=".11" />
            </svg>
          </div>

          {/* left: floating insight panels, live chart line, pulsing heart tile */}
          <div aria-hidden="true" className="pointer-events-none absolute left-4 lg:left-10 bottom-6 hidden md:block w-[160px] lg:w-[210px] -z-10">
            <svg viewBox="0 0 220 210" fill="none" className="w-full overflow-visible">
              <g className="cta-sway"><path d="M24 206c-8-26 2-48 20-60 4 24-2 44-20 60z" fill="#fff" fillOpacity=".18" /></g>
              <g className="cta-b">
                <rect x="22" y="16" width="100" height="132" rx="16" fill="#fff" fillOpacity=".14" stroke="#fff" strokeOpacity=".3" transform="rotate(-7 72 82)" />
              </g>
              <g className="cta-a">
                <rect x="50" y="34" width="112" height="138" rx="16" fill="#fff" fillOpacity=".22" stroke="#fff" strokeOpacity=".42" />
                <rect x="64" y="50" width="84" height="52" rx="10" fill="#fff" fillOpacity=".16" />
                <path className="cta-draw" d="M72 92c10-4 14-20 24-22s12 10 22 6 14-16 22-20" stroke="#fff" strokeOpacity=".85" strokeWidth="3" strokeLinecap="round" />
                <circle cx="140" cy="62" r="3.5" fill="#fff" className="cta-tw" />
                <rect x="64" y="118" width="62" height="5" rx="2.5" fill="#fff" fillOpacity=".42" />
                <rect x="64" y="132" width="42" height="5" rx="2.5" fill="#fff" fillOpacity=".3" />
              </g>
              <g className="cta-b">
                <rect x="136" y="126" width="52" height="52" rx="15" fill="#fff" fillOpacity=".3" stroke="#fff" strokeOpacity=".5" />
                <path className="cta-pulse" d="M162 162c-9-6-13-11-13-16 0-5 6-7 10-3l3 3 3-3c4-4 10-2 10 3 0 5-4 10-13 16z" stroke="#fff" strokeOpacity=".9" strokeWidth="2.2" strokeLinejoin="round" fill="#fff" fillOpacity=".25" />
              </g>
              <circle cx="188" cy="40" r="7" fill="#fff" fillOpacity=".3" className="cta-a" />
              <circle cx="14" cy="60" r="2.5" fill="#fff" className="cta-tw" style={{ animationDelay: "1.2s" }} />
              <circle cx="196" cy="100" r="2" fill="#fff" className="cta-tw" style={{ animationDelay: "2.2s" }} />
            </svg>
          </div>

          {/* right: floating question bubble, rising mini-bubbles, twinkles */}
          <div aria-hidden="true" className="pointer-events-none absolute right-4 lg:right-10 bottom-6 hidden md:block w-[140px] lg:w-[190px] -z-10">
            <svg viewBox="0 0 200 210" fill="none" className="w-full overflow-visible">
              <g className="cta-sway"><path d="M36 206c-6-30 6-54 28-64 4 28-6 52-28 64z" fill="#fff" fillOpacity=".16" /></g>
              <g className="cta-a">
                <circle cx="112" cy="84" r="64" fill="#fff" fillOpacity=".15" stroke="#fff" strokeOpacity=".42" />
                <path d="M92 72c0-12 9-20 21-20s21 8 21 18c0 15-19 17-19 30" stroke="#fff" strokeOpacity=".9" strokeWidth="8" strokeLinecap="round" />
                <circle cx="115" cy="110" r="5" fill="#fff" fillOpacity=".9" className="cta-pulse" />
              </g>
              <g className="cta-b"><circle cx="30" cy="150" r="9" fill="#fff" fillOpacity=".25" stroke="#fff" strokeOpacity=".4" /></g>
              <circle cx="176" cy="150" r="4" fill="#fff" fillOpacity=".5" className="cta-rise" />
              <circle cx="156" cy="168" r="3" fill="#fff" fillOpacity=".5" className="cta-rise" style={{ animationDelay: "1.8s" }} />
              <circle cx="186" cy="30" r="3" fill="#fff" className="cta-tw" />
              <circle cx="20" cy="96" r="2.5" fill="#fff" className="cta-tw" style={{ animationDelay: "1.6s" }} />
            </svg>
          </div>

          <h3 className="text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)] font-bold mb-3">Все ще є питання?</h3>

          <p className="text-white/90 fluid-lead mb-7 max-w-[780px] mx-auto text-center leading-relaxed">
            Пройдіть короткий тест — і ми підберемо програму саме під ваш стан та цілі
          </p>

          <button
            onClick={onOpenTest}
            className="px-9 min-h-[52px] rounded-xl bg-white text-[#0f172a] font-semibold shadow-[0_10px_30px_-12px_rgba(15,23,100,0.5)] hover:bg-gray-50 hover:scale-[1.03] active:scale-[0.97] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#4f6bf0]"
          >
            Пройти тест
          </button>
        </div>

      </div>
    </section>
  );
}