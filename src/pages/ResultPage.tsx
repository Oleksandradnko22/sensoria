import { Icon, type IconName } from "../components/ui/Icon";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useState } from "react";

import funnelStore from "../store/funnelStore";
import type { Intensity } from "../store/funnelStore";
import { getStateProfile } from "../utils/getStateProfile";
import { categoryLabels } from "../data/categoryLabels";
import { stateAccentColors } from "../data/stateAccentColors";
import type { StateAccent } from "../data/stateAccentColors";

type Props = {
  onContinue: () => void;
  // Called when there's no `insight` to render — e.g. a direct refresh
  // that lands here with nothing (or not yet anything) in the store.
  // funnelStore now persists `insight` to sessionStorage, so this should
  // only fire on a genuinely empty session. The Result page has no route
  // of its own to redirect via (see engineering review), so the caller
  // decides where "start over" sends the user.
  onMissingData: () => void;
};

// Supporting Patterns no longer get their own section (Phase 1 review).
// Folded into the Validation content as a trailing clause, only visible
// when the user opens that accordion item — so it reads as the same
// voice continuing a thought ("one more thing we noticed") rather than a
// second, separately-labeled finding competing with the Primary State.
function describeSupportingPatterns(labels: string[]): string {
  if (labels.length === 0) return "";
  const lowered = labels.map(
    (label) => label.charAt(0).toLowerCase() + label.slice(1)
  );
  const joined =
    lowered.length === 1 ? lowered[0] : `${lowered[0]} та ${lowered[1]}`;
  return ` Поряд із цим ваші відповіді також трохи відображають ${joined}.`;
}

// The same labels already rendered under the progress bar, pulled out so
// they can also back the bar's aria-valuetext instead of existing only
// as visual text.
const INTENSITY_LABELS: Record<Intensity, string> = {
  low: "Легкий",
  moderate: "Помірний",
  high: "Високий",
  critical: "Критичний",
};

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

  const fillStyle = secondaryAccent
    ? { background: `linear-gradient(to right, ${accent.hex}, ${secondaryAccent.hex})` }
    : { backgroundColor: accent.hex };

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
      aria-label={`Продовжити реєстрацію. Ваш результат готовий на ${Math.round(displayPercent)} відсотків.`}
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
        style={{ ...fillStyle, width: `${displayPercent}%` }}
      />

      {/* Content — dot + label ride on the filled portion, the
          percentage sits in the remaining portion. A soft text-shadow
          keeps both legible regardless of which accent color is
          underneath. */}
      <span
        className="relative z-10 h-full flex items-center justify-between px-6"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
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
            className="w-2 h-2 rounded-full bg-white shrink-0"
            style={{
              animation: prefersReducedMotion
                ? "none"
                : hovered
                ? "dot-pulse-hover 1.6s ease-in-out infinite"
                : "dot-pulse-idle 2.4s ease-in-out infinite",
            }}
          />
          <span className="text-white font-medium text-base whitespace-nowrap">
            Ваш результат готовий
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span className="text-white font-semibold text-base tabular-nums">
            {Math.round(displayPercent)}%
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
              stroke="white"
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

export default function ResultPage({
  onContinue,
  onMissingData,
}: Props) {

  // Accordion state for the "Ваші відповіді показують" section — must be
  // declared before any early return (rules of hooks).
  const [openCard, setOpenCard] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const insight = funnelStore.insight;

  useEffect(() => {
    if (!insight) {
      onMissingData();
    }
  }, [insight, onMissingData]);

  if (!insight) return null;

  const profile = getStateProfile(insight.primaryState, insight.intensity);
  const accent = stateAccentColors[insight.primaryState];
  // Only set when the user picked two states on State Selection — drives
  // the trust-indicator circle's gradient below. One state = solid dot,
  // unchanged from before.
  const secondaryAccent = insight.secondaryState
    ? stateAccentColors[insight.secondaryState]
    : null;
  const supportingPatternClause = describeSupportingPatterns(
    insight.supportingPatterns.map((pattern) => categoryLabels[pattern.category])
  );

  // The Primary State's real normalized score (0-100) — the same number
  // that decided the Intensity bucket in the first place (see RFC-001's
  // getIntensity in calculateResults.ts). Drives both the percentage
  // shown in "Рівень навантаження" and the bar's fill width below, so
  // they can never disagree with each other (Task 3).
  const progress = insight.primaryScore;

  // Reduced-motion users get the same layout with animations collapsed
  // to instant (duration 0) rather than removed — content still lands in
  // the right place, nothing is skipped, it just doesn't move to get
  // there.
  const sectionTransition = (delay: number, duration: number) =>
    prefersReducedMotion ? { duration: 0 } : { delay, duration };

return (

    <div
      className="
        min-h-screen

        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]

        px-6
        pt-20
        pb-20
      "
    >

      <div
        className="
          w-full
          max-w-[920px]
          mx-auto
        "
      >

        {/* PRIMARY STATE */}
        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={sectionTransition(0, 0.6)}
  className="
    text-center
    mb-20
  "
>

  <p
    className="
      uppercase

      tracking-[0.35em]

      text-white/50

      text-sm

      mb-5
    "
  >
    Ваш персональний результат
  </p>

  <h1
    className="
      text-white

      text-[56px]

      leading-[1.1]

      font-bold

      mb-8
    "
  >
    {profile.title}
  </h1>

  {/* Accent tied to the selected Primary State — glow removed per
      review (read as artificial), border opacity reduced further so
      the color registers as a trace, not a highlight. */}
  <div
    className={`
      inline-flex

      items-center

      gap-3

      rounded-full

      bg-white/10

      backdrop-blur-xl

      border border-white/10

      px-6
      py-3
    `}
  >

    {/* Solid accent for one selected state, a smooth diagonal blend
        between both accents when two were selected — same colors as
        State Selection, no glow/border/extra animation on top. */}
    <div
      className="
        w-2.5
        h-2.5

        rounded-full
      "
      style={
        secondaryAccent
          ? {
              background: `linear-gradient(135deg, ${accent.hex}, ${secondaryAccent.hex})`,
            }
          : { backgroundColor: accent.hex }
      }
    />

    <span
      className="
        text-white/80

        text-sm
      "
    >
      Ваш результат сформовано на основі ваших відповідей
    </span>

  </div>

</motion.section>

        {/* INTENSITY */}
        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={sectionTransition(0.15, 0.6)}
  className="
    rounded-[36px]

    bg-white/10

    backdrop-blur-2xl

    border border-white/10

    p-8

    mb-16
  "
>

  <h2
    className="
      text-white

      text-3xl

      font-bold

      mb-8
    "
  >
    Аналіз результату
  </h2>

  <div className="flex justify-between mb-4">

    <span className="text-white/60">
      Поточний стан
    </span>

    <span className="text-white font-semibold">
      {profile.title}
    </span>

  </div>

  <div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={progress}
    aria-valuetext={`${INTENSITY_LABELS[insight.intensity]} рівень`}
    className="
      h-3

      rounded-full

      bg-white/10

      overflow-hidden
    "
  >

    {/* Fill color = which state(s) produced the result (same accents as
        the trust indicator above and State Selection). Fill length =
        calculated intensity, animated exactly as before — this is a
        color swap only, the width logic is untouched. */}
    <motion.div
      initial={{
        width: 0,
      }}
      animate={{
        width: `${progress}%`,
      }}
      transition={sectionTransition(0.4, 1)}
      className="
        h-full

        rounded-full
      "
      style={
        secondaryAccent
          ? {
              background: `linear-gradient(to right, ${accent.hex}, ${secondaryAccent.hex})`,
            }
          : { backgroundColor: accent.hex }
      }
    />

  </div>

  <div
    className="
      flex
      justify-between

      mt-3

      text-sm

      text-white/40
    "
  >

    <span>Легкий</span>
    <span>Помірний</span>
    <span>Високий</span>
    <span>Критичний</span>

  </div>

  <div
    className="
      h-px

      bg-white/10

      my-8
    "
  />

  <div
    className="
      flex

      items-center

      justify-between

      gap-6

      flex-wrap
    "
  >

    <div>

      <div className="text-white/45 text-sm mb-1">
        Рівень навантаження
      </div>

      {/* Real percentage — same number driving the bar above (Task 3),
          not the state name. */}
      <div className="text-white text-lg font-semibold">
        {progress}%
      </div>

    </div>

    <div>

      <div className="text-white/45 text-sm mb-1">
        Основний фокус
      </div>

      {/* Distilled from the same Recovery Focus shown in full further
          down the page — not a separate invented metric (Task 3). */}
      <div className="text-white font-semibold">
        {profile.recoveryFocusShort}
      </div>

    </div>

    <div>

      <div className="text-white/45 text-sm mb-1">
        Наступний крок
      </div>

      <div className="text-white font-semibold">
        Персональний план
      </div>

    </div>

  </div>

</motion.section>

        {/* INSIGHT */}
        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={sectionTransition(0.2, 0.6)}
  className="mb-16"
>

  <div
    className="
      rounded-[36px]

      bg-gradient-to-br
      from-cyan-400/10
      to-purple-400/10

      border border-white/10

      backdrop-blur-2xl

      p-10
    "
  >

    <div
      className="
        flex
        items-center
        gap-4

        mb-6
      "
    >

      <div
        aria-hidden="true"
        className="
          w-14
          h-14

          rounded-2xl

          bg-cyan-400/15

          flex
          items-center
          justify-center

          text-3xl

          shrink-0
        "
      >
        <Icon name="bulb" size={26} />
      </div>

      <div>

        <div
          className="
            text-white/50

            uppercase

            tracking-[0.25em]

            text-xs

            mb-1
          "
        >
          Ваш головний інсайт
        </div>

        <h2
          className="
            text-white

            text-3xl

            font-bold
          "
        >
          {profile.title}
        </h2>

      </div>

    </div>

    <p
      className="
        text-white/80

        text-lg

        leading-8
      "
    >
      {profile.insight}
    </p>

  </div>

</motion.section>

        {/* EXPLANATION + VALIDATION */}
        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={sectionTransition(0.28, 0.6)}
  className="mb-16"
>

  <h2
    className="
      text-white
      text-3xl
      font-bold
      mb-8
    "
  >
    Ваші відповіді показують
  </h2>

  {/* Accordion, one section open at a time — replaces the previously
      permanently-expanded cards (Phase 1 review). Content itself is
      unchanged: Explanation/Validation still come from the State
      Profile, the third item is still the pre-existing legacy text. */}
  <div className="space-y-4">

    {[
      {
        icon: "brain",
        iconBg: "bg-cyan-400/10",
        title: "Що відбувається",
        content: profile.explanation,
      },
      {
        icon: "heart",
        iconBg: "bg-blue-400/10",
        title: "Чому це нормально",
        content: profile.validation + supportingPatternClause,
      },
      {
        icon: "leaf",
        iconBg: "bg-emerald-400/10",
        title: "Ваш потенціал",
        content:
          "Попри поточні труднощі, у вас є хороший потенціал для поступового покращення стану. Найкращий час почати зміни — саме зараз.",
      },
    ].map((card, i) => {
      const isOpen = openCard === i;

      return (
        <div
          key={card.title}
          className="
            rounded-[30px]
            bg-white/8
            border border-white/20
            backdrop-blur-xl
            overflow-hidden
            transition-all
            duration-150
            ease-out

            hover:-translate-y-1
            hover:border-white/30
            hover:shadow-[0_20px_50px_-18px_rgba(0,0,0,0.4)]
          "
        >
          <button
            id={`result-accordion-trigger-${i}`}
            aria-expanded={isOpen}
            aria-controls={`result-accordion-panel-${i}`}
            onClick={() => setOpenCard(isOpen ? null : i)}
            className="
              w-full
              px-8
              py-7

              flex
              gap-6
              items-center

              text-left

              hover:bg-white/5

              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-white/60
              focus-visible:ring-offset-2
              focus-visible:ring-offset-[#1e3a8a]

              transition
            "
          >
            <div
              aria-hidden="true"
              className={`
                w-14
                h-14

                rounded-2xl

                ${card.iconBg}

                flex
                items-center
                justify-center

                text-2xl

                shrink-0
              `}
            >
              <Icon name={card.icon as IconName} size={26} />
            </div>

            <h3
              className="
                flex-1
                text-white
                text-xl
                font-semibold
              "
            >
              {card.title}
            </h3>

            <motion.span
              aria-hidden="true"
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
              className="text-white/40 text-xl shrink-0"
            >
              ⌄
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                id={`result-accordion-panel-${i}`}
                role="region"
                aria-labelledby={`result-accordion-trigger-${i}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                {/* pl-28 = the button's own px-8 + the icon's w-14 + the
                    gap-6 between them (32+56+24=112px) — the exact left
                    offset of the title text above, so the paragraph
                    starts under the title instead of under the icon.
                    pr matches pl at md+ so the column reads as evenly
                    margined rather than stretched to the card's edge;
                    kept narrower on small screens where 112px on each
                    side wouldn't leave room to read. pt-2 (vs. none
                    before) is the "slightly more space under the title"
                    ask — typography/colors/behavior untouched. */}
                <p
                  className="
                    pl-8
                    pr-8
                    pt-2
                    pb-7

                    md:pl-28
                    md:pr-28

                    text-white/70
                    leading-8
                  "
                >
                  {card.content}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    })}

  </div>

</motion.section>

      {/* NEXT STEP — the CTA button is gone entirely. This round's brief
          is explicit that this must stop looking like "press a button"
          and start looking like "the assessment is basically done" —
          see ProgressAction above. That component wants to be its own
          full-width-ish centerpiece (500-560px), which doesn't fit
          inside the previous round's 40%-of-920px right column, so the
          asymmetric two-column layout is dropped in favor of one
          centered block: headline, supporting line, the progress
          meter, then the small helper line — all the same visual
          language (no card, no background animation) as the last few
          rounds, just recomposed around the new centerpiece. */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={sectionTransition(0.36, 0.6)}
        className="relative overflow-hidden pt-32 md:pt-40 pb-16 text-center"
      >
        {/* Purely atmospheric background — added this round, everything
            else in this section (copy, spacing, the progress
            component's own position) is untouched. `relative
            overflow-hidden` above is the only structural addition to
            the section itself, needed so the largest ring (1400px)
            can't cause horizontal overflow/scrollbars. */}
        <NextStepAtmosphere prefersReducedMotion={!!prefersReducedMotion} />

        <div className="relative z-10 max-w-[600px] mx-auto">
          <h2 className="text-white text-3xl md:text-4xl font-bold mb-4">
            Готові зробити наступний крок?
          </h2>
          <p className="text-white/70 text-base md:text-lg mb-10">
            На наступному екрані почнеться ваш особистий шлях.
          </p>

          <div className="relative flex justify-center">
            <ProgressAction
              onActivate={onContinue}
              accent={accent}
              secondaryAccent={secondaryAccent}
              prefersReducedMotion={!!prefersReducedMotion}
              percent={92}
            />

            {/* Sasha's screenshot feedback: the meter alone didn't read
                as clickable, so a small caption to its right, same
                muted style as the helper line below, spells it out.
                Only shown once there's actual room beside the 560px
                button (lg+) — on narrower viewports the button is
                full-width with nothing beside it to put this in. */}
            <span
              className="
                hidden
                lg:block

                absolute
                left-full
                top-1/2
                -translate-y-1/2
                ml-4

                text-white/50
                text-sm
                whitespace-nowrap
              "
            >
              Натисніть тут
            </span>
          </div>

          <p className="text-white/50 text-sm mt-4">
            Залишився лише один крок
          </p>
        </div>
      </motion.section>

      </div>

    </div>

  );
}