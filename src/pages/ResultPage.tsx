import { Icon, type IconName } from "../components/ui/Icon";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import funnelStore from "../store/funnelStore";
import type { Intensity, PrimaryStateId } from "../store/funnelStore";
import { getStateProfile } from "../utils/getStateProfile";
import { categoryLabels } from "../data/categoryLabels";
import { emotionalStates } from "../data/states";
import { stateAccentColors } from "../data/stateAccentColors";
import { LevelGauge, StateMap, ImpactScale, ResultTabs } from "../components/result/ResultVisuals";
import type { StateAccent } from "../data/stateAccentColors";

type Props = {
  onContinue: () => void;
  // no `insight` to render (an empty session): the caller decides where «start over» sends the person
  onMissingData: () => void;
  /** the person accepted the hint to take the test for another state */
  onRetake?: () => void;
};

// The result of the state questionnaire: a full, calm breakdown in ONE column, step by step (22.11.2026, owner's
// brief): the level → what is happening → why → how it touches daily life → what else showed up → the path → which
// formats fit → the next step (the interactive meter below). It leads towards the materials without pressure: no
// urgency, no fear, «вирішувати вам». Self-observation levels, never percentages or diagnostic grades; wording agreed
// with the lawyer (docs/legal/assessment-v2-review.md, safety-review-2026-11-21.md).

const LEVELS: { key: Intensity; label: string }[] = [
  { key: "low", label: "Легкий" },
  { key: "moderate", label: "Помірний" },
  { key: "high", label: "Відчутний" },
  { key: "critical", label: "Дуже високий" },
];
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.key, l.label])) as Record<Intensity, string>;
const LEVEL_HINT: Record<Intensity, string> = {
  low: "Стан помітний, але майже не заважає щоденному життю. Це добрий момент, щоб підтримати себе, поки сил вистачає.",
  moderate: "Стан з'являється регулярно й часом забирає сили чи увагу. Саме зараз невеликі регулярні кроки можуть дати найбільше.",
  high: "Стан відчувається більшу частину часу й помітно впливає на день. Важливо дати собі підтримку, а не чекати, що мине саме.",
  critical: "Стан виражений дуже сильно. Варто не залишатися з цим наодинці й почати з найм'якших кроків.",
};
const IMPACT_TEXT = [
  "Ви відзначили, що стан майже не заважає сну, роботі, навчанню чи стосункам. Ресурс поки є, і його можна берегти.",
  "Стан трохи позначається на сні, роботі чи стосунках. Так буває, коли напруга поступово накопичується.",
  "Стан помітно заважає сну, роботі чи стосункам. Це сигнал приділити собі увагу, у зручному для вас темпі.",
  "Стан дуже сильно впливає на щоденне життя. Ви не мусите справлятися з цим самостійно.",
];
// what the person marked as frequent for another state, in plain words
const PATTERN_NOTE: Record<PrimaryStateId, string> = {
  anxiety: "тривожні думки й неспокій",
  stress: "відчуття, що навантаження більше, ніж вдається витримати",
  burnout: "втому, яка не минає навіть після відпочинку",
  selfEsteem: "незадоволення собою",
  relationships: "напругу в стосунках з близькими",
  motivation: "брак бажання щось робити",
};
const stateLabel = (id: string) => categoryLabels[id as keyof typeof categoryLabels] ?? id;

// The four concentric "breathing" rings behind the progress component.
// Fixed px diameters per spec, opacity fading outward (the biggest ring
// is the faintest), each on its own slow scale cycle within the
// requested 18-24s range — using four different durations rather than
// one shared value so they drift in and out of phase with each other
// instead of breathing in lockstep, which reads as more organic for an
// effect this subtle.
const NEXT_STEP_RINGS = [
  { size: 600, opacity: 0.08, duration: 18 },
  { size: 850, opacity: 0.065, duration: 20 },
  { size: 1100, opacity: 0.05, duration: 22 },
  { size: 1400, opacity: 0.035, duration: 24 },
];

// 10 "dust" particles — fixed, hand-placed positions (not
// Math.random() at render time, which would reshuffle on every
// re-render) scattered across the section, each drifting a few px on
// its own long, independent cycle. No opacity animation anywhere here
// — constant opacity is what the brief means by "no twinkling, no
// sparkle."
const NEXT_STEP_PARTICLES = [
  { x: 8, y: 20, size: 3, dx: 5, dy: -4, duration: 26, delay: 0 },
  { x: 18, y: 55, size: 2, dx: -4, dy: 5, duration: 30, delay: 2 },
  { x: 30, y: 12, size: 3, dx: 6, dy: 3, duration: 24, delay: 4 },
  { x: 42, y: 75, size: 2, dx: -3, dy: -5, duration: 33, delay: 1 },
  { x: 55, y: 30, size: 4, dx: 4, dy: 4, duration: 22, delay: 3 },
  { x: 65, y: 60, size: 2, dx: -5, dy: 3, duration: 28, delay: 5 },
  { x: 75, y: 18, size: 3, dx: 3, dy: -6, duration: 20, delay: 2.5 },
  { x: 85, y: 48, size: 2, dx: -4, dy: -3, duration: 31, delay: 0.5 },
  { x: 92, y: 70, size: 3, dx: 5, dy: 5, duration: 25, delay: 4.5 },
  { x: 12, y: 85, size: 2, dx: -3, dy: 4, duration: 35, delay: 1.5 },
];

// The whole background atmosphere for the NEXT STEP section, in the
// exact back-to-front order the brief lists: the path (far
// background), the concentric rings (middle layer), the radial light
// (behind the progress component specifically), then the particles
// (front background) — all purely decorative (aria-hidden,
// pointer-events-none) and all rendered as one absolutely-positioned
// layer behind the actual content, which keeps its own `relative z-10`
// below. Nothing here measures the DOM — the ring/light anchor point
// is a hand-picked `top-[70%]` approximating where the progress
// component sits given the section's fixed padding and copy, which is
// more than precise enough for an effect this faint and blurred.
function NextStepAtmosphere({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    >
      {/* 1. Path — one continuous ultra-thin curve, starting outside
          the left edge, terminating roughly where the progress
          component sits. `preserveAspectRatio="none"` lets the same
          fixed 1000x500 coordinate space stretch to fill whatever the
          section's real box is, so the path's endpoint stays
          horizontally centered and low in the section regardless of
          viewport width; `vectorEffect="non-scaling-stroke"` keeps the
          stroke a true 1px despite that non-uniform stretch. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 500"
        preserveAspectRatio="none"
      >
        <path
          d="M -60 70 C 200 10, 380 170, 560 140 S 640 380, 500 460"
          fill="none"
          stroke="white"
          strokeOpacity={0.14}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* 2 + 3. Concentric rings and the radial light, both centered on
          the same point behind the progress component. Rings breathe
          via a plain CSS `animation` (see `ring-breathe` in index.css)
          instead of Framer Motion — this used to be 4 separate
          rAF-driven animations running on the main thread for as long
          as the page is open; a CSS animation gets the identical
          visual result mostly off the main thread, which is where the
          lag was coming from. */}
      <div className="absolute left-1/2 top-[70%] -translate-x-1/2 -translate-y-1/2">
        {NEXT_STEP_RINGS.map((ring, i) => (
          <div
            key={ring.size}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: ring.size,
              height: ring.size,
              marginLeft: -ring.size / 2,
              marginTop: -ring.size / 2,
              border: `1px solid rgba(255,255,255,${ring.opacity})`,
              animation: prefersReducedMotion
                ? "none"
                : `ring-breathe ${ring.duration}s ease-in-out ${i * 1.5}s infinite`,
            }}
          />
        ))}

        {/* Radial light — static, no animation of its own (the brief
            only asks the rings to breathe). Blur this heavy hides any
            hard edge, per "no visible glow edge." */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 800,
            height: 800,
            marginLeft: -400,
            marginTop: -400,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)",
            filter: "blur(300px)",
          }}
        />
      </div>

      {/* 4. Particles — front-most background layer, drifting a few px
          each on its own long cycle via the same CSS-animation
          approach (`particle-drift`, driven by `--particle-dx/dy`
          custom properties per dot). Constant opacity throughout. */}
      {NEXT_STEP_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              opacity: 0.08,
              "--particle-dx": `${p.dx}px`,
              "--particle-dy": `${p.dy}px`,
              animation: prefersReducedMotion
                ? "none"
                : `particle-drift ${p.duration}s ease-in-out ${p.delay}s infinite`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// Replaces the pill button entirely. The brief's framing is specific:
// this should not read as "press this button," it should read as "the
// assessment is basically done" — so instead of a CTA, it's a
// horizontal progress meter that happens to be clickable. Still a real
// <button> underneath (native focus/keyboard/click semantics, an
// explicit aria-label since the visible content alone — a label glued
// to a percentage — wouldn't read as an action to a screen reader),
// just laid out and styled as a track + fill + dot + percentage
// instead of a capsule with text centered in it.
function ProgressAction({
  onActivate,
  accent,
  secondaryAccent,
  prefersReducedMotion,
  percent,
}: {
  onActivate: () => void;
  accent: StateAccent;
  secondaryAccent: StateAccent | null;
  prefersReducedMotion: boolean;
  percent: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [completing, setCompleting] = useState(false);
  // The single number that drives both the fill's width and the
  // displayed percentage, so the two can never visually disagree
  // during the completion animation (a separate CSS transition on the
  // fill plus a separately-timed number flip would risk exactly that).
  const [displayPercent, setDisplayPercent] = useState(percent);

  // the state's colour flows into Sensoria's violet (one state) or into the second state's colour — soft tones,
  // never two loud colours side by side (owner, 22.11.2026)
  // a light, premium fill (white → Sensoria lavender) with dark-blue text, like the white buttons elsewhere; the
  // state's colour lives only in the small pulsing dot — two state colours mixed in one bar looked muddy
  const fillStyle = { background: "linear-gradient(to right, #ffffff, #e6e0ff)" };
  const dotColor = secondaryAccent ? `linear-gradient(135deg, ${accent.hex}, ${secondaryAccent.hex})` : accent.hex;

  const handleClick = () => {
    if (completing) return; // guard against double-activation mid-animation

    if (prefersReducedMotion) {
      setDisplayPercent(100);
      onActivate();
      return;
    }

    setCompleting(true);
    const from = displayPercent;
    // Sped up again — 500ms+180ms, then 220ms+60ms, now this: just
    // enough motion to register as "completing" without feeling like a
    // delay before the click "loads."
    const duration = 130;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayPercent(from + (100 - from) * eased);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        window.setTimeout(onActivate, 30);
      }
    };
    requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Продовжити: створити акаунт і отримати добірку матеріалів"
      className="
        relative
        w-full
        max-w-[560px]
        h-16
        rounded-full
        overflow-hidden
        cursor-pointer
        border border-white/10

        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-white
        focus-visible:ring-offset-2
        focus-visible:ring-offset-[#2563eb]
      "
      style={{
        transform: hovered && !prefersReducedMotion ? "translateY(-2px)" : "translateY(0)",
        transition: "transform 0.15s ease-out",
      }}
    >
      {/* Track — the "remaining" portion. Its own tone lifts a hair on
          hover ("the remaining 8% subtly illuminates"); since the fill
          sits on top of nearly all of it, that lift is only actually
          visible in the sliver the fill doesn't cover. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{
          backgroundColor:
            hovered && !prefersReducedMotion
              ? "rgba(255,255,255,0.14)"
              : "rgba(255,255,255,0.08)",
          transition: "background-color 0.15s ease-out",
        }}
      />

      {/* Fill — the completed portion, in the existing accent
          gradient. Width is driven by the same `displayPercent` state
          the number below reads from. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          ...fillStyle,
          // hovering fills the meter to the end: «one move and it's done»
          width: `${hovered && !prefersReducedMotion ? 100 : displayPercent}%`,
          transition: completing ? "none" : "width 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      />

      {/* Content — dot + label ride on the filled portion, the
          percentage sits in the remaining portion. A soft text-shadow
          keeps both legible regardless of which accent color is
          underneath. */}
      <span
        className="relative z-10 h-full flex items-center justify-between px-6"
        style={{ textShadow: "none" }}
      >
        <span className="flex items-center gap-3">
          {/* Pulses gently at rest too (not just on hover) — Sasha's
              feedback was that at rest it wasn't obviously clickable,
              so the dot now stays quietly "alive" the whole time, and
              picks up size/speed on hover as a clear response to the
              interaction rather than the only sign of life. */}
          {/* CSS animation, not Framer Motion — this pulses continuously
              for as long as the component is mounted, so it's one of
              the constant-background-cost animations moved off the
              main thread (see index.css for `dot-pulse-idle`/-hover). */}
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: dotColor,
              animation: prefersReducedMotion
                ? "none"
                : hovered
                ? "dot-pulse-hover 1.6s ease-in-out infinite"
                : "dot-pulse-idle 2.4s ease-in-out infinite",
            }}
          />
          <span className="text-[#1e3a8a] font-medium text-base whitespace-nowrap">
            Ваш результат готовий
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span className="text-[#1e3a8a] font-semibold text-base tabular-nums">
            Далі
          </span>
          {/* A plain arrow — the clearest, quietest way to say "this
              goes forward" without turning the meter back into a
              generic button. Nudges a couple px on hover, same as the
              rest of the component. */}
          <motion.svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            animate={{ x: hovered && !prefersReducedMotion ? 3 : 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <path
              d="M5 12h13m0 0-5-5m5 5-5 5"
              stroke={hovered && !prefersReducedMotion ? "#1e3a8a" : "white"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </span>
      </span>
    </button>
  );
}


function Step({ n, title, children, delay, reduce }: { n: number; title: string; children: React.ReactNode; delay: number; reduce: boolean }) {
  return (
    <motion.section
      // appears on load, never waits for scrolling: content must not stay invisible if the in-view signal never fires
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="rounded-[32px] border border-white/15 bg-white/[0.08] p-6 backdrop-blur-2xl sm:p-10"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#1e3a8a]">{n}</span>
        <h2 className="text-2xl font-bold sm:text-[28px]">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

export default function ResultPage({ onContinue, onMissingData, onRetake }: Props) {
  const reduce = !!useReducedMotion();
  const insight = funnelStore.insight;

  useEffect(() => {
    if (!insight) onMissingData();
  }, [insight, onMissingData]);

  if (!insight) return null;

  const profile = getStateProfile(insight.primaryState, insight.intensity);
  const accentObj = stateAccentColors[insight.primaryState];
  const secondaryAccentObj = insight.secondaryState ? stateAccentColors[insight.secondaryState] : null;
  const accent = accentObj.hex;
  const secondaryAccent = secondaryAccentObj?.hex ?? null;
  const highLevel = insight.intensity === "high" || insight.intensity === "critical";
  const suggested =
    insight.suggestedState && !insight.safety && !highLevel ? emotionalStates.find((x) => x.id === insight.suggestedState) ?? null : null;
  const retakeFor = (state: { id: string; title: string; description: string }) => {
    funnelStore.setSelectedState({ id: state.id, title: state.title, description: state.description });
    funnelStore.setSecondaryState(null);
    onRetake?.();
  };
  const sectionTransition = (delay: number, duration: number) => (reduce ? { duration: 0 } : { delay, duration });
  const patterns = insight.supportingPatterns.map((p) => p.category).filter((c): c is PrimaryStateId => c in PATTERN_NOTE);
  const chosenName = stateLabel(insight.primaryState).toLowerCase();

  // which format to start with: gentle first when the state is strong
  const formats: { icon: IconName; title: string; text: string; tag: string; start: boolean }[] = [
    { icon: "meditation", title: "Медитації", text: "Короткі практики, щоб заспокоїтися, відновити сили й повернути відчуття опори. Можна почати вже сьогодні.", tag: highLevel ? "Почати з цього" : "Кілька хвилин на день", start: highLevel },
    { icon: "guide", title: "Гайди", text: "Пояснюють, що відбувається, і дають конкретні кроки, які можна пробувати у своєму темпі.", tag: insight.intensity === "moderate" ? "Почати з цього" : "Щоб розібратися", start: insight.intensity === "moderate" },
    { icon: "library", title: "Програми", text: "Покроковий шлях від автора: модулі, практики й завдання для глибшої роботи й стійких змін.", tag: insight.intensity === "low" ? "Почати з цього" : highLevel ? "Коли буде ресурс" : "Для глибшої роботи", start: insight.intensity === "low" },
  ];

  let n = 0;
  const next = () => ++n;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#7c5cf0] px-4 pb-10 pt-16 text-white sm:px-6 sm:pt-20">
      <div className="mx-auto w-full max-w-[1040px]">
        {/* HERO */}
        <motion.header
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={sectionTransition(0, 0.6)}
          className="mb-12 text-center sm:mb-16"
        >
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-white/60">Ваш персональний розбір</p>
          <h1 className="text-[38px] font-bold leading-[1.1] sm:text-[56px]">{profile.title}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/80 sm:text-xl">{profile.insight}</p>
          <div className="mt-7 inline-flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
              {stateLabel(insight.primaryState)}
            </span>
            {insight.secondaryState && secondaryAccent && (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryAccent }} aria-hidden="true" />
                {stateLabel(insight.secondaryState)}
              </span>
            )}
            <span className="rounded-full border border-white/15 px-4 py-2 text-white/75">за останні 2 тижні</span>
          </div>
        </motion.header>

        <div className="flex flex-col gap-6 sm:gap-8">
          {/* 1. LEVEL */}
          <Step n={next()} title="Наскільки це виражено зараз" delay={0.05} reduce={reduce}>
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,360px)_1fr] md:gap-10">
              <LevelGauge intensity={insight.intensity} color={accent} reduce={reduce} />
              <div>
                <p className="text-lg leading-relaxed">
                  <span className="font-semibold">{LEVEL_LABEL[insight.intensity]} рівень.</span>{" "}
                  <span className="text-white/80">{LEVEL_HINT[insight.intensity]}</span>
                </p>
                {insight.secondaryState && insight.secondaryIntensity && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[14px] text-white/85">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryAccent ?? "#fff" }} aria-hidden="true" />
                    {stateLabel(insight.secondaryState)}: {LEVEL_LABEL[insight.secondaryIntensity].toLowerCase()} рівень
                  </p>
                )}
              </div>
            </div>
          </Step>

          {insight.safety && (
            <section aria-labelledby="result-support" className="rounded-[32px] bg-white p-6 text-slate-900 shadow-xl sm:p-10">
              <div className="flex flex-col gap-4 sm:flex-row">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef0fd] text-[#4338ca]">
                  <Icon name="lifebuoy" size={24} />
                </span>
                <div>
                  <h2 id="result-support" className="text-2xl font-bold">Вам не обов'язково проходити це самостійно</h2>
                  <p className="mt-3 text-[17px] leading-relaxed text-slate-700">
                    Ваші відповіді показують, що зараз стан виражений сильно і помітно впливає на щоденне життя. Матеріали Sensoria можуть підтримати, але в такій ситуації варто звернутися до психолога, психотерапевта або лікаря. Почніть із коротких безоплатних практик, а не з великої програми.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <a href="/crisis-help" className="inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0] focus-visible:ring-offset-2">
                      Де отримати допомогу
                    </a>
                    <a href="tel:112" className="inline-flex min-h-[44px] items-center rounded-full border border-slate-300 px-5 font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0] focus-visible:ring-offset-2">
                      Якщо є загроза життю: 112
                    </a>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 2. THE MAP OF STATES (from the person's own answers) */}
          {funnelStore.answers.length > 0 && (
            <Step n={next()} title="Карта ваших станів" delay={0.05} reduce={reduce}>
              <p className="mb-6 text-white/70">Як часто за останні 2 тижні з'являлися ознаки кожного стану, за вашими відповідями.</p>
              <StateMap answers={funnelStore.answers} reduce={reduce} />
              {patterns.length > 0 && (
                <p className="mt-6 rounded-2xl bg-white/10 px-5 py-4 leading-relaxed text-white/85">
                  Ви також часто відзначали {patterns.map((p) => PATTERN_NOTE[p]).join(" і ")}. Такі стани нерідко підсилюють одне одного, тому в добірці будуть і ці теми.
                </p>
              )}
            </Step>
          )}

          {/* 3. THE BREAKDOWN — tabs instead of a wall of text */}
          <Step n={next()} title="Що це означає" delay={0.05} reduce={reduce}>
            <ResultTabs
              tabs={[
                { id: "what", icon: "brain", label: "Що відбувається", content: <p className="text-[17px] leading-relaxed text-white/85 sm:text-lg">{profile.explanation}</p> },
                {
                  id: "why",
                  icon: "heart",
                  label: "Чому так буває",
                  content: (
                    <div>
                      <p className="text-[17px] leading-relaxed text-white/85 sm:text-lg">{profile.validation}</p>
                      <p className="mt-4 rounded-2xl bg-white/10 px-5 py-4 leading-relaxed text-white/85">Це не слабкість і не ваша провина. Те, що ви назвали свій стан, вже перший крок до змін.</p>
                    </div>
                  ),
                },
                ...(typeof insight.impact === "number"
                  ? [{
                      id: "life",
                      icon: "compass" as const,
                      label: "Вплив на життя",
                      content: (
                        <div className="flex flex-col gap-5">
                          <ImpactScale impact={insight.impact} color={accent} />
                          <p className="text-[17px] leading-relaxed text-white/85">{IMPACT_TEXT[Math.max(0, Math.min(3, insight.impact))]}</p>
                        </div>
                      ),
                    }]
                  : []),
              ]}
            />
          </Step>

          {suggested && (
            <section className="rounded-[32px] border border-white/25 bg-white/[0.12] p-6 sm:p-10">
              <h2 className="text-2xl font-bold">Можливо, зараз важливіше інше</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-white/80">
                Стан «{chosenName}» виражений не так сильно, а стан «{suggested.title}» ви відзначили як майже постійний. Можна пройти коротке опитування саме для нього. Вирішувати вам.
              </p>
              {onRetake && (
                <button type="button" onClick={() => retakeFor(suggested)} className="mt-5 inline-flex min-h-[44px] cursor-pointer items-center rounded-full bg-white px-5 font-semibold text-[#1e3a8a] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563eb]">
                  Пройти для стану «{suggested.title}»
                </button>
              )}
            </section>
          )}

          {/* 5. THE PATH */}
          <Step n={next()} title="Ваш шлях" delay={0.05} reduce={reduce}>
            <ol className="relative grid gap-4 md:grid-cols-3">
              {[
                { label: "Зараз", title: "Ви помітили свій стан", text: "Ви чесно відповіли на питання й побачили, що відбувається. Саме з цього починаються зміни." },
                { label: "Далі", title: profile.recoveryFocusShort, text: profile.focusSupportLine },
                { label: "Поступово", title: profile.stepMilestone, text: profile.hope },
              ].map((s, i) => (
                <li key={s.label} className="relative rounded-2xl border border-white/15 bg-[#2a4fd6]/40 p-5 backdrop-blur">
                  <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: i === 0 ? accent : "rgba(255,255,255,0.2)" }}>{i + 1}</span>
                    {s.label}
                  </div>
                  <h3 className="text-lg font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-white/75">{s.text}</p>
                </li>
              ))}
            </ol>
          </Step>

          {/* 6. WHAT FITS */}
          <Step n={next()} title="Що вам може підійти" delay={0.05} reduce={reduce}>
            <p className="mb-6 text-[17px] leading-relaxed text-white/85">
              Ми зберемо матеріали авторів на тему «{chosenName}» у вашу особисту добірку.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {formats.map((f) => (
                <div key={f.title} className="flex flex-col rounded-2xl border border-white/15 bg-white/[0.06] p-5">
                  <span className={`mb-3 self-start rounded-full px-2.5 py-1 text-[12px] font-semibold ${f.start ? "bg-white text-[#1e3a8a]" : "bg-white/15 text-white/85"}`}>{f.tag}</span>
                  <span className="mb-2 inline-flex items-center gap-2 text-lg font-semibold"><Icon name={f.icon} size={20} /> {f.title}</span>
                  <p className="leading-relaxed text-white/75">{f.text}</p>
                </div>
              ))}
            </div>
          </Step>

          {/* disclaimer agreed with the lawyer (Ю2–Ю3); the crisis line is shown for every result */}
          <div className="px-1 text-[13px] leading-relaxed text-white/55">
            <p>
              Це самоспостереження за вашими відповідями за останні 2 тижні, а не діагноз і не висновок фахівця. Результат розраховується автоматично й допомагає підібрати освітні матеріали, але не замінює консультацію психолога, психотерапевта чи лікаря.
            </p>
            <p className="mt-2">
              Якщо вам зараз дуже важко або небезпечно —{" "}
              <a href="/crisis-help" className="rounded underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Допомога в кризі</a>{" "}
              або <a href="tel:112" className="rounded underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white">112</a>.
            </p>
          </div>
        </div>

        {/* NEXT STEP — the interactive meter (kept as the owner liked it) */}
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={sectionTransition(0.36, 0.6)}
          className="relative overflow-hidden pb-16 pt-28 text-center md:pt-36"
        >
          <NextStepAtmosphere prefersReducedMotion={reduce} />
          <div className="relative z-10 mx-auto max-w-[600px]">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Отримайте добірку матеріалів</h2>
            <p className="mb-10 text-base text-white/70 md:text-lg">
              Створіть акаунт, це безкоштовно. Ми покажемо матеріали саме для вашого стану, а результат збережеться лише з вашої згоди.
            </p>
            <div className="relative flex justify-center">
              <ProgressAction onActivate={onContinue} accent={accentObj} secondaryAccent={secondaryAccentObj} prefersReducedMotion={reduce} percent={92} />
            </div>
            <p className="mt-4 text-sm text-white/50">Залишився лише один крок</p>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
