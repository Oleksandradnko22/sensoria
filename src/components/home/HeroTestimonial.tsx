// Right column of the home hero: a calm atmospheric card with real reviews of
// published content (src/lib/landing.ts). When there are no suitable real
// reviews yet, the same card carries three plain statements about how Sensoria
// works instead — clearly labelled, never presented as a person's quote.
import { useEffect, useRef, useState } from "react";
import type { Testimonial } from "../../utils/landingData";

type Slide = { id: string; title?: string; text: string; name?: string };

const VALUE_SLIDES: Slide[] = [
  { id: "v1", title: "Програми для роботи зі станом", text: "Покрокові курси від авторів: модулі, практики й завдання, що допомагають змінити звичні реакції." },
  { id: "v2", title: "Медитації на кожен день", text: "Короткі аудіопрактики для заспокоєння, фокусу та сну: коли потрібна пауза, а не цілий курс." },
  { id: "v3", title: "Гайди, до яких хочеться повертатися", text: "Практичні матеріали з вправами та чек-листами: зберігайте корисне й відкривайте в будь-який момент." },
];

const AUTOPLAY_MS = 6000;

// Original illustration (no stock photo): a soft sunrise over a lake. The scene
// drifts slowly on its own and, when the slide changes, glides to a new
// arrangement (sun, ridges and colour mood) over ~2 seconds — calm, not flashy.
const MOODS = [
  { hue: 0, sun: [0, 0], far: -10, mid: 0, near: 10 },
  { hue: 28, sun: [-120, 36], far: 24, mid: 14, near: -6 },
  { hue: -22, sun: [110, -30], far: -34, mid: -20, near: 22 },
];

function Scene({ mood }: { mood: number }) {
  const m = MOODS[mood % MOODS.length];
  const glide = "transform 2.2s cubic-bezier(.45,.05,.25,1)";
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full opacity-80 saturate-[0.75] hero-scene"
      style={{ filter: `hue-rotate(${m.hue}deg)`, transition: "filter 2.2s ease" }}
      viewBox="0 0 600 440"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b5bd6" />
          <stop offset="0.45" stopColor="#a78bdc" />
          <stop offset="0.75" stopColor="#f3b6c4" />
          <stop offset="1" stopColor="#fcd3b0" />
        </linearGradient>
        <radialGradient id="hs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7e0" stopOpacity="1" />
          <stop offset="0.35" stopColor="#ffe3b8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd0a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9a6e0" />
          <stop offset="1" stopColor="#4b49b8" />
        </linearGradient>
      </defs>
      <rect width="600" height="440" fill="url(#hs-sky)" />
      <g style={{ transform: `translate(${m.sun[0]}px, ${m.sun[1]}px)`, transition: glide }}>
        <g className="hero-sun">
          <circle cx="300" cy="215" r="150" fill="url(#hs-sun)" />
          <circle cx="300" cy="215" r="22" fill="#fff6dc" />
        </g>
      </g>
      <g style={{ transform: `translateX(${m.far}px)`, transition: glide }}>
        <path className="hero-ridge-far" d="M-40 250 L70 205 L120 232 L190 175 L260 238 L320 215 L400 168 L470 225 L530 195 L640 240 L640 290 L-40 290 Z" fill="#7a6fc9" opacity="0.55" />
      </g>
      <g style={{ transform: `translateX(${m.mid}px)`, transition: glide }}>
        <path className="hero-ridge-mid" d="M-40 270 L60 240 L130 262 L210 220 L290 268 L370 236 L450 262 L520 232 L640 266 L640 300 L-40 300 Z" fill="#5a52b5" opacity="0.8" />
      </g>
      <g style={{ transform: `translateX(${m.near}px)`, transition: glide }}>
        <path d="M-40 292 L90 268 L170 288 L260 262 L340 290 L430 270 L520 288 L640 272 L640 310 L-40 310 Z" fill="#3d3a9c" />
      </g>
      <rect y="300" width="600" height="140" fill="url(#hs-lake)" />
      <g style={{ transform: `translateX(${m.sun[0] * 0.6}px)`, transition: glide }}>
        <ellipse className="hero-shimmer" cx="300" cy="322" rx="70" ry="4" fill="#fff0d2" opacity="0.7" />
        <ellipse className="hero-shimmer hero-shimmer-b" cx="300" cy="340" rx="46" ry="3" fill="#fff0d2" opacity="0.5" />
        <ellipse className="hero-shimmer" cx="300" cy="360" rx="26" ry="2.5" fill="#fff0d2" opacity="0.35" />
      </g>
    </svg>
  );
}

export default function HeroTestimonial({
  testimonials,
  onRealChange,
}: {
  testimonials: Testimonial[];
  // lets the parent hide the card on phones when it only carries fallback text
  onRealChange?: (isReal: boolean) => void;
}) {
  const real = testimonials.length > 0;
  const slides: Slide[] = real ? testimonials.map((t) => ({ id: t.id, text: t.text, name: t.name })) : VALUE_SLIDES;

  const [index, setIndex] = useState(0);
  // paused only while a keyboard user has focus inside; mouse clicks never stop it
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    onRealChange?.(real);
  }, [real, onRealChange]);

  useEffect(() => setIndex(0), [real, slides.length]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const autoplay = !paused && !reduced && slides.length > 1;
  // One timer per slide: any change of slide (auto or by arrows/dots) restarts it,
  // so the carousel keeps moving on its own after the visitor has used the controls.
  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [autoplay, index, slides.length]);

  const go = (i: number) => setIndex(((i % slides.length) + slides.length) % slides.length);
  const step = (d: number) => setIndex((i) => (i + d + slides.length) % slides.length);

  const s = slides[Math.min(index, slides.length - 1)];

  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label={real ? "Відгуки учасників" : "Що є на Sensoria"}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setPaused(true);
      }}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
      className="relative w-full overflow-hidden rounded-3xl border border-white/15 shadow-[0_18px_50px_rgba(15,25,110,0.3)] min-h-[340px] sm:min-h-[400px] lg:min-h-[420px] flex"
    >
      <Scene mood={index} />
      {/* readable text zone */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#1b2670]/20" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-[#172066] via-[#172066]/80 to-transparent" />

      <span className="absolute top-4 left-4 sm:top-5 sm:left-5 inline-flex items-center rounded-full bg-white/15 border border-white/20 text-white/90 px-3.5 min-h-[32px] t-caption font-medium">
        {real ? "Відгук учасника" : "Що всередині"}
      </span>

      {slides.length > 1 && (
        <div className="absolute z-20 top-3.5 right-3.5 sm:top-4 sm:right-4 flex gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Попередній слайд"
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 border border-white/20 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Наступний слайд"
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 border border-white/20 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      <div
        aria-live={autoplay ? "off" : "polite"}
        className="relative z-10 mt-auto w-full px-6 sm:px-10 pb-6 sm:pb-8 pt-24 text-white pointer-events-none"
      >
        <figure key={s.id} className="m-0">
          {s.title && <div className="hero-rise font-bold leading-snug text-[clamp(1.25rem,1.05rem+0.9vw,1.75rem)] mb-3">{s.title}</div>}
          <blockquote style={{ animationDelay: "0.25s" }} className={`hero-rise m-0 ${real ? "text-[clamp(1.0625rem,0.95rem+0.6vw,1.375rem)] font-semibold leading-snug" : "text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] leading-relaxed text-white"}`}>
            {real ? `«${s.text}»` : s.text}
          </blockquote>
          {s.name && (
            <figcaption style={{ animationDelay: "0.5s" }} className="hero-rise mt-3 flex items-center gap-3">
              <span aria-hidden="true" className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center t-small font-semibold">
                {s.name[0]}
              </span>
              <span className="t-small font-medium">{s.name}</span>
            </figcaption>
          )}
        </figure>

        {slides.length > 1 && (
          <div className="mt-3 flex justify-end -mb-2 pointer-events-auto" role="group" aria-label="Вибір слайда">
            {slides.map((sl, i) => (
              <button
                key={sl.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Слайд ${i + 1} з ${slides.length}`}
                aria-current={i === index ? "true" : undefined}
                className="w-11 h-11 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
              >
                <span className={`block h-2 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-2 bg-white/50"}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
