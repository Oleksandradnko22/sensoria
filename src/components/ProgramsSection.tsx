import { useEffect, useRef, useState } from "react";
import HomeProgramCard from "./home/HomeProgramCard";
import type { Program } from "../data/programs";


// Cards must show exactly 4 complete ones on first paint, on whatever
// width the carousel actually renders at (this varies with viewport,
// zoom, etc. — a hardcoded guess like "280px" kept being right for one
// screen and wrong for another, showing 4.5 cards instead of 4). So card
// width is measured live from the carousel's own rendered width instead
// of guessed: CARD_WIDTH = (available width - 3 gaps) / 4, recomputed on
// resize. FALLBACK_CARD_WIDTH is only what's used for the very first
// render, before the measurement effect has run.
const FALLBACK_CARD_WIDTH = 280;
const GAP = 24;

export default function ProgramsSection({
  onOpen = () => {},
  onOpenCatalog = () => {},
  // The real catalog (published programs, plus the demo set only while the
  // demo switch is on) — App.tsx passes it, so nothing is hard-coded here.
  items = [],
}: {
  onOpen?: (program: Program) => void;
  onOpenCatalog?: () => void;
  items?: Program[];
}) {
  const programs: Program[] = items.slice(0, 10);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Continuous scroll progress (0..programs.length-1, fractional) — drives
  // the pagination pill 1:1 with real scrollLeft, iOS-home-screen style,
  // instead of a rounded integer "active index" that snaps between dots.
  const [progress, setProgress] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const [cardWidth, setCardWidth] = useState(FALLBACK_CARD_WIDTH);
  // How many cards are visible at once — depends on the real width: 1 (with a
  // peek of the next one) on phones, 2 on small tablets, 3, then 4.
  const [perView, setPerView] = useState(4);
  const [bleed, setBleed] = useState(0);
  const [arrowsBelow, setArrowsBelow] = useState(false);
  const CARDS_PER_VIEW = perView;

  // one card at a time: a wider gap keeps the next card (and its shadow) fully out of view
  const gap = perView === 1 ? 48 : GAP;
  const STEP = cardWidth + gap;

  // Measure the carousel's real rendered width and derive card width from
  // it, so exactly 4 complete cards fit regardless of the actual screen —
  // re-measures on resize instead of assuming one fixed viewport width.
  useEffect(() => {
    const wrapperEl = wrapperRef.current;
    if (!wrapperEl) return;

    const measure = () => {
      const available = wrapperEl.clientWidth;
      // Deliberately not rounded: 4 cards + 3 gaps must sum to exactly
      // `available` so the first and last card line up flush with the
      // section's own left/right edge (the same grid the heading above
      // sits on). Flooring here used to leave up to a few leftover
      // pixels unaccounted for, so the 4th card fell just short of the
      // right edge instead of sitting flush on it. Browsers lay out
      // fractional widths at sub-pixel precision without visible seams,
      // so there's no downside to keeping the exact value.
      if (available <= 0) return;
      if (available < 560) {
        // phone and in-between widths: one card per screen, between two round arrows
        setPerView(1);
        // arrows (36 px) on the grid edges, 10 px from the card; on narrow phones they move 20 px into the
        // page margin so the card stays readable
        // narrowest phones (360 px Androids, Fold cover): the card takes the full grid and the arrows move
        // under it, so nothing leaves the grid
        if (available < 320) {
          setBleed(0);
          setArrowsBelow(true);
          setCardWidth(available);
          return;
        }
        const bleed = available < 360 ? 20 : 0;
        setBleed(bleed);
        setArrowsBelow(false);
        setCardWidth(available + 2 * bleed - 2 * (36 + 10));
        return;
      }
      const n = available < 900 ? 2 : available < 1200 ? 3 : 4;
      setPerView(n);
      setCardWidth((available - (n - 1) * GAP) / n);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrapperEl);
    return () => observer.disconnect();
  }, []);

  // Drag-to-scroll (mouse only — touch already scrolls natively, and
  // hijacking pointer events for touch would fight the browser's own
  // momentum scrolling).
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const didDrag = useRef(false);
  const rafPending = useRef(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;

    // With CARDS_PER_VIEW visible at once, there are only
    // (programs.length - CARDS_PER_VIEW) "steps" between the very start
    // and the point where the last card is fully in view — not
    // (programs.length - 1). Clamping to the wrong, larger number meant
    // the scrubber's thumb could never reach the end of the track even
    // when the row was scrolled all the way to the last card.
    const maxProgress = Math.max(0, programs.length - CARDS_PER_VIEW);
    const n = programs.length;
    const raw = ((el.scrollLeft / STEP) % n + n) % n;
    setProgress(Math.min(maxProgress, Math.max(0, raw)));
  };

  const handleScroll = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      updateScrollState();
      rafPending.current = false;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollRef.current;
    if (!el) return;

    isDragging.current = true;
    didDrag.current = false;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = el.scrollLeft;
    el.style.scrollBehavior = "auto";
    setIsPressing(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const delta = e.clientX - dragStartX.current;
    if (Math.abs(delta) > 5) didDrag.current = true;
    el.scrollLeft = dragStartScrollLeft.current - delta;
  };

  const endDrag = () => {
    setIsPressing(false);
    if (!isDragging.current) return;
    isDragging.current = false;
    const el = scrollRef.current;
    if (el) el.style.scrollBehavior = "";
  };

  // Swallow the click that follows a drag so releasing the mouse after
  // dragging doesn't also open the program the cursor happens to land on.
  const onClickCapture = (e: React.MouseEvent) => {
    if (didDrag.current) {
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;
    }
  };

  // Prev / next: move by one card, smooth (see `page`). «Previous» is off on the first card.
  const atStart = progress < 0.05;
  // Slow eased scroll (native "smooth" is short and fights scroll-snap).
  // Snap is switched off while animating and restored at the end.
  const animRef = useRef<number | null>(null);
  // Endless forward: the first cards are repeated after the last one, so «next» on the last card glides on
  // to the first (then the row quietly jumps back to the real first card — the picture is identical).
  // No rewind across the whole row. «Previous» stops at the first card.
  const page = (dir: 1 | -1, duration = 1100) => {
    const el = scrollRef.current;
    if (!el || programs.length === 0) return;
    const n = programs.length;
    let idx = Math.round(el.scrollLeft / STEP);
    if (idx >= n) {
      idx -= n;
      el.scrollLeft = idx * STEP;
    }
    if (dir === -1 && idx === 0) return; // nothing before the first card
    const next = Math.max(0, idx + dir);
    scrollToX(next * STEP, duration, () => {
      if (next >= n) el.scrollLeft = (next - n) * STEP;
    });
  };
  const scrollToX = (to: number, ms = 1100, onDone?: () => void) => {
    const el = scrollRef.current;
    if (!el) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = el.scrollLeft;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : ms;
    const t0 = performance.now();
    el.style.scrollSnapType = "none";
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const e = -(Math.cos(Math.PI * t) - 1) / 2; // easeInOutSine: a calm start and a soft landing
      el.scrollLeft = from + (to - from) * e;
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else {
        animRef.current = null;
        onDone?.();
        el.style.scrollSnapType = "";
      }
    };
    animRef.current = requestAnimationFrame(tick);
  };
  // Autoplay: one card every 7 s (a slow 1.6 s glide) while the carousel is on screen and nobody is using it. Pauses on hover
  // or focus, for 8 s after any swipe / drag / arrow / scrubber use, in a hidden tab, and is off entirely
  // for people who asked the system for reduced motion. After the last card it simply carries on to the first.
  const lastUserRef = useRef(0);
  const markUser = () => {
    lastUserRef.current = Date.now();
  };
  const autoRef = useRef({ page });
  autoRef.current = { page };
  useEffect(() => {
    const el = scrollRef.current;
    const wrap = wrapperRef.current;
    if (!el || !wrap || programs.length <= perView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let hovered = false;
    const io = new IntersectionObserver(([e]) => (visible = e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    io.observe(wrap);
    const mark = () => (lastUserRef.current = Date.now());
    const enter = () => (hovered = true);
    const leave = () => {
      hovered = false;
      mark();
    };
    el.addEventListener("pointerdown", mark);
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("touchstart", mark, { passive: true });
    wrap.addEventListener("mouseenter", enter);
    wrap.addEventListener("mouseleave", leave);
    wrap.addEventListener("focusin", enter);
    wrap.addEventListener("focusout", leave);
    const id = window.setInterval(() => {
      if (!visible || hovered || document.hidden || Date.now() - lastUserRef.current < 8000) return;
      autoRef.current.page(1, 1600);
    }, 7000);
    return () => {
      window.clearInterval(id);
      io.disconnect();
      el.removeEventListener("pointerdown", mark);
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchstart", mark);
      wrap.removeEventListener("mouseenter", enter);
      wrap.removeEventListener("mouseleave", leave);
      wrap.removeEventListener("focusin", enter);
      wrap.removeEventListener("focusout", leave);
    };
  }, [programs.length, perView]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only when focus is on the carousel itself or a card — never hijack typing.
    if (e.key === "ArrowRight") { e.preventDefault(); page(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); page(-1); }
  };

  const arrowClass = (size: string) =>
    `${size} shrink-0 rounded-full border border-white/35 bg-white/15 text-white backdrop-blur-md flex items-center justify-center transition hover:bg-white/25 active:scale-95 disabled:opacity-30 disabled:hover:bg-white/15 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-white`;
  const arrowIcon = (dir: 1 | -1) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === -1 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
  const arrow = (dir: 1 | -1) => {
    const off = dir === -1 && atStart;
    return (
      <button
        type="button"
        onClick={() => {
          markUser();
          page(dir);
        }}
        disabled={off}
        aria-label={dir === -1 ? "Попередня програма" : "Наступна програма"}
        className={arrowClass("relative z-10 w-9 h-9")}
      >
        {arrowIcon(dir)}
      </button>
    );
  };

  if (programs.length === 0) return null;

  return (
    <section
      id="programs"
      className="page-container pt-6 pb-12 sm:pt-12 sm:pb-20 lg:pt-16 lg:pb-24 text-white relative overflow-visible">
      {/* HEADER: title and a short line on the left; on wider screens the arrows and «all programs» on the right */}
      <div className="mb-2 sm:mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="fluid-h2 font-bold">Популярні програми</h2>
          <p className="text-white/80 fluid-lead mt-2">Покрокові курси від авторів — оберіть ту, що відгукується вашому стану.</p>
        </div>
        {programs.length > CARDS_PER_VIEW && (
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => {
                  markUser();
                  page(dir);
                }}
                disabled={dir === -1 && atStart}
                aria-label={dir === -1 ? "Попередні програми" : "Наступні програми"}
                className={arrowClass("w-11 h-11")}
              >
                {arrowIcon(dir)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* КАРУСЕЛЬ */}
      <div ref={wrapperRef} onKeyDown={onKeyDown} role="region" aria-roledescription="карусель" aria-label="Популярні програми" className="group/carousel relative">
        {/* one card at a time (phones, in-between widths): the row is exactly one card wide, so no half of
            the next card shows; round arrows beside it page it instead */}
        <div
          className={perView === 1 ? "flex items-center justify-between" : undefined}
          style={perView === 1 && bleed ? { marginInline: -bleed } : undefined}
        >
        {perView === 1 && !arrowsBelow && arrow(-1)}
        <div className="relative" style={perView === 1 ? { width: cardWidth } : undefined}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={onClickCapture}
          // No horizontal margin/padding bleed here anymore. It was meant
          // to give the first card's hover shadow room without affecting
          // layout — the margin/padding were supposed to cancel out
          // exactly — but in practice the first card kept landing off
          // the section's grid instead of flush with the heading above
          // it. Pixel-perfect alignment with that grid is the priority,
          // so the bleed trick is gone entirely: card 1's left edge and
          // card 4's right edge now sit exactly at this element's own
          // edges, with nothing added or subtracted. A soft, low-opacity
          // hover shadow clipping by a pixel or two on the very first
          // card is an acceptable trade for that.
          className={`
            flex
            overflow-x-auto
            no-scrollbar
            pt-4 pb-10 -mb-6 sm:pt-8
            -mx-6 px-6 scroll-pl-6
            sm:[mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%_-_24px),transparent)] sm:[-webkit-mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%_-_24px),transparent)]

            snap-x snap-mandatory

            cursor-grab active:cursor-grabbing

            origin-center
            transition-transform duration-200 ease-out
            ${isPressing ? "scale-[0.995]" : "scale-100"}
          `}
          style={{ WebkitOverflowScrolling: "touch", gap }}
        >
          {(programs.length > CARDS_PER_VIEW ? [...programs, ...programs.slice(0, CARDS_PER_VIEW)] : programs).map((program, i) => {
            const copy = i >= programs.length; // loop copies: seen, never read twice by screen readers or Tab
            return (
              <div
                key={i}
                className="shrink-0 snap-start flex"
                style={{ width: cardWidth }}
                aria-hidden={copy || undefined}
                inert={copy || undefined}
              >
                <HomeProgramCard program={program} onOpen={() => onOpen(program)} wide={cardWidth >= 400} />
              </div>
            );
          })}
        </div>
        </div>
        {perView === 1 && !arrowsBelow && arrow(1)}
        </div>
        {perView === 1 && arrowsBelow && (
          <div className="mt-1 flex items-center justify-center gap-3">
            {arrow(-1)}
            {arrow(1)}
          </div>
        )}
      </div>

      {/* all programs — the same white button as «Пройти тест» in the first block */}
      <div className="flex justify-center mt-4 sm:mt-8">
        <button
          type="button"
          onClick={onOpenCatalog}
          className="cta-primary group inline-flex items-center gap-2.5 min-h-[56px] px-7 sm:px-9 rounded-2xl bg-white text-[#1e2a78] text-[16px] sm:text-[17px] font-bold shadow-[0_14px_40px_rgba(10,20,90,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563eb]"
        >
          Переглянути всі програми
          <span aria-hidden="true" className="cta-arrow">→</span>
        </button>
      </div>
    </section>
  );
}
