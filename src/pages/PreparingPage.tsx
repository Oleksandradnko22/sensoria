import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type Props = {
  // Fires once, automatically, after the screen has run its course —
  // this page has no button of its own. The caller decides where that
  // leads (the Personal Recommendations screen).
  onComplete: () => void;
};

// Calm, sequential "we're working on this" copy — deliberately not
// technical (no "AI", "algorithm", or fake percentage anywhere), per
// spec. Each one gets its own beat before the next replaces it.
const STATUS_MESSAGES = [
  "Аналізуємо результати тесту",
  "Підбираємо найбільш релевантні матеріали",
  "Формуємо персональні рекомендації",
  "Майже готово",
];

// Purely a visual motif for the card-selection animation — not real
// content, and never shown as if it were the user's actual plan (that's
// the next screen's job). Four is enough to read as "many to choose
// from" without the cycle feeling repetitive across ~5s.
const SAMPLE_CARDS = [
  { tag: "Медитація", title: "Практика дихання" },
  { tag: "Курс", title: "Керування тривогою" },
  { tag: "Гайд", title: "Вечірній ритуал" },
  { tag: "Практика", title: "Баланс і фокус" },
];

// Fixed, hand-placed positions (not Math.random() at render, which
// would reshuffle on every re-render) — same convention as the Result
// page's NEXT_STEP_PARTICLES. Very low opacity and only 6 of them:
// spec asks for "almost invisible," not the denser field used there.
const PARTICLES = [
  { x: 15, y: 25, size: 2, dx: 4, dy: -3, duration: 28, delay: 0 },
  { x: 82, y: 20, size: 2, dx: -3, dy: 4, duration: 32, delay: 2 },
  { x: 25, y: 78, size: 2, dx: 3, dy: 3, duration: 26, delay: 4 },
  { x: 70, y: 70, size: 3, dx: -4, dy: -3, duration: 30, delay: 1 },
  { x: 50, y: 12, size: 2, dx: 3, dy: 4, duration: 34, delay: 3 },
  { x: 90, y: 55, size: 2, dx: -3, dy: -4, duration: 27, delay: 2.5 },
];

const MESSAGE_INTERVAL_MS = 1300;
const CARD_INTERVAL_MS = 1450;
const TOTAL_DURATION_MS = 4800;

export default function PreparingPage({ onComplete }: Props) {
  const prefersReducedMotion = useReducedMotion();

  const [messageIndex, setMessageIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);

  useEffect(() => {
    // Messages only advance forward and stop at the last one — no
    // looping back to "Аналізуємо..." once we've reached "Майже
    // готово," which would read as regressing rather than finishing.
    const messageTimer = setInterval(() => {
      setMessageIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, MESSAGE_INTERVAL_MS);

    const cardTimer = setInterval(() => {
      setCardIndex((i) => (i + 1) % SAMPLE_CARDS.length);
    }, CARD_INTERVAL_MS);

    const completeTimer = setTimeout(onComplete, TOTAL_DURATION_MS);

    return () => {
      clearInterval(messageTimer);
      clearInterval(cardTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-6">
      {/* BACKGROUND — soft radial glow + near-invisible drifting dust.
          No blobs, no illustration; just enough atmosphere that the
          screen doesn't feel flat or like a bare loading state. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.08) 0%, transparent 60%)",
          }}
        />
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                opacity: 0.06,
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

      <div className="relative z-10 max-w-lg w-full text-center text-white">
        <h1 className="text-3xl md:text-4xl font-bold leading-snug mb-5">
          Створюємо вашу персональну добірку
        </h1>

        <p className="text-white/70 leading-relaxed mb-16">
          На основі ваших відповідей ми підбираємо курси, медитації, гайди та
          практики, які найбільше відповідають вашому емоційному стану.
        </p>

        {/* CENTER ANIMATION — a single card at a time, calmly fading in,
            holding, then sliding out as the next one takes its place.
            This is the "we're selecting from a large library" motif in
            place of a spinner/progress bar (neither of which appear
            anywhere on this screen, per spec). */}
        <div className="relative h-24 mb-14 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={cardIndex}
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: 24, scale: 0.97 }
              }
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -24, scale: 0.97 }
              }
              transition={{
                duration: prefersReducedMotion ? 0.01 : 0.85,
                ease: "easeInOut",
              }}
              className="absolute rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xl px-8 py-5 w-64"
            >
              <div className="text-xs uppercase tracking-wide text-white/45 mb-1.5">
                {SAMPLE_CARDS[cardIndex].tag}
              </div>
              <div className="text-base font-medium text-white/90">
                {SAMPLE_CARDS[cardIndex].title}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* STATUS MESSAGE — one line at a time, soft crossfade, no
            aggressive checkmark pop. */}
        <div className="h-6 relative">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.5 }}
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/60"
            >
              <span className="text-white/35">✓</span>
              {STATUS_MESSAGES[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
