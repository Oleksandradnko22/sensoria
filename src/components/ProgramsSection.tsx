import { useEffect, useRef, useState } from "react";
import CourseCard from "./CourseCard";
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

// Pagination geometry — with 10 cards, a row of 10 individual dots reads
// as busy/cluttered rather than premium. Top-shelf products (Apple's own
// scrubbers, most polished media players) use a single slim progress
// track with a sliding thumb instead once there are more than a handful
// of items — same "continuous, physically connected to scroll" feel as
// before, just one shape instead of ten.
const TRACK_WIDTH = 168;
const THUMB_WIDTH = 40;

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
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingThumb = useRef(false);
  // Continuous scroll progress (0..programs.length-1, fractional) — drives
  // the pagination pill 1:1 with real scrollLeft, iOS-home-screen style,
  // instead of a rounded integer "active index" that snaps between dots.
  const [progress, setProgress] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const [cardWidth, setCardWidth] = useState(FALLBACK_CARD_WIDTH);
  // How many cards are visible at once — depends on the real width: 1 (with a
  // peek of the next one) on phones, 2 on small tablets, 3, then 4.
  const [perView, setPerView] = useState(4);
  const CARDS_PER_VIEW = perView;

  const STEP = cardWidth + GAP;

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
        // phone: exactly one full card per screen, swipe for the next
        setPerView(1);
        setCardWidth(available);
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
    const raw = el.scrollLeft / STEP;
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

  // Shared by both "click the track to jump" and "drag the thumb" — both
  // just need to turn a clientX into a scroll position.
  const seekToClientX = (clientX: number, smooth: boolean) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollTo({
      left: fraction * maxScroll,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const seekTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    seekToClientX(e.clientX, true);
  };

  // The thumb is draggable, not just clickable — this is the part that
  // makes it read as "a real slider" rather than a static bar. Uses
  // pointer capture so the drag keeps tracking even if the cursor leaves
  // the thumb/track while dragging fast.
  const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingThumb.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX, false);
  };

  const onThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingThumb.current) return;
    seekToClientX(e.clientX, false);
  };

  const onThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingThumb.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
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

  // Prev / next: move by one card, smooth, same scroll the
  // scrubber already uses. Disabled at the ends so they never look dead-but-live.
  const maxProgress = Math.max(0, programs.length - CARDS_PER_VIEW);
  const atStart = progress < 0.05;
  const atEnd = progress > maxProgress - 0.05;
  // Slow eased scroll (native "smooth" is short and fights scroll-snap).
  // Snap is switched off while animating and restored at the end.
  const animRef = useRef<number | null>(null);
  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    const to = Math.min(max, Math.max(0, Math.round((from + dir * STEP) / STEP) * STEP));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 800;
    const t0 = performance.now();
    el.style.scrollSnapType = "none";
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      el.scrollLeft = from + (to - from) * e;
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else {
        animRef.current = null;
        el.style.scrollSnapType = "";
      }
    };
    animRef.current = requestAnimationFrame(tick);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only when focus is on the carousel itself or a card — never hijack typing.
    if (e.key === "ArrowRight") { e.preventDefault(); page(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); page(-1); }
  };

  if (programs.length === 0) return null;

  return (
    <section
      id="programs"
      className="page-container pt-6 pb-12 sm:pt-12 sm:pb-20 lg:pt-16 lg:pb-24 text-white relative overflow-visible">
      {/* HEADER */}
      <div className="mb-3 sm:mb-7 flex items-end justify-between gap-4">
        <div>
          <h2 className="fluid-h2 font-bold mb-3">
            Популярні програми
          </h2>
          <p className="text-white/80 fluid-lead">
            Оберіть програму для свого стану
          </p>
        </div>
        {programs.length > CARDS_PER_VIEW && (
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            {([-1, 1] as const).map((dir) => {
              const disabled = dir === -1 ? atStart : atEnd;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => page(dir)}
                  disabled={disabled}
                  aria-label={dir === -1 ? "Попередні програми" : "Наступні програми"}
                  className="w-11 h-11 rounded-full border border-white/40 bg-white/10 text-white backdrop-blur-sm flex items-center justify-center transition hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span aria-hidden="true">{dir === -1 ? "←" : "→"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* КАРУСЕЛЬ */}
      <div ref={wrapperRef} onKeyDown={onKeyDown} role="region" aria-roledescription="карусель" aria-label="Популярні програми" className="group/carousel relative">
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
            flex gap-6
            overflow-x-auto
            no-scrollbar
            pb-4 sm:pb-5
            pt-2 sm:pt-8
            sm:-mx-6 sm:px-6 sm:scroll-pl-6
            sm:[mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%_-_24px),transparent)] sm:[-webkit-mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%_-_24px),transparent)]

            snap-x snap-mandatory

            cursor-grab active:cursor-grabbing

            origin-center
            transition-transform duration-200 ease-out
            ${isPressing ? "scale-[0.995]" : "scale-100"}
          `}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {programs.map((program, i) => (
            <div
              key={i}
              className="shrink-0 snap-start flex"
              style={{ width: cardWidth }}
            >
              <CourseCard
                program={program}
                onClick={() => onOpen(program)}
                premiumHover
              />
            </div>
          ))}
        </div>
      </div>

      {/* Progress scrubber — one slim track instead of 10 dots, with a
          thumb that slides continuously with real scroll position (no
          per-step snapping), plus a quiet hint label beside it.
          Clickable AND draggable, and visibly so: the whole track grows
          noticeably on hover (not just a color tint) and the thumb has a
          grip mark + real drag support, so it actually reads as a slider
          instead of a passive progress bar. */}
      <div className="flex items-center justify-center gap-3 mt-1 sm:mt-1">
        <span className="hidden sm:inline text-[12px] text-white/70 tracking-wide whitespace-nowrap">
          Прокрутіть, щоб побачити більше
        </span>

        <div
          ref={trackRef}
          onClick={seekTrack}
          className="group/track relative cursor-pointer py-3"
          style={{ width: TRACK_WIDTH }}
        >
          <div className="h-1.5 rounded-full bg-white/20 transition-colors duration-200 group-hover/track:bg-white/30" />

          {/* Position-only wrapper: no transition here on purpose. During
              a drag this moves on every single pointermove event, and a
              CSS transition on that same property makes it perpetually
              chase the cursor instead of tracking it — that lag was the
              actual bug. Any purely-visual hover effect (scale, glow)
              belongs on the inner pill below instead, where a transition
              is safe because it's not fighting a live drag. */}
          <div
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            className="absolute top-1/2 left-0 h-1.5 cursor-grab active:cursor-grabbing"
            style={{
              width: THUMB_WIDTH,
              transform: `translateY(-50%) translateX(${
                (progress / Math.max(1, programs.length - CARDS_PER_VIEW)) *
                (TRACK_WIDTH - THUMB_WIDTH)
              }px)`,
            }}
          >
            <div className="h-full w-full flex items-center justify-center gap-[2px] rounded-full bg-white transition-transform duration-150 group-hover/track:scale-y-[1.6]">
              <span className="w-[2px] h-[2px] rounded-full bg-black/25" />
              <span className="w-[2px] h-[2px] rounded-full bg-black/25" />
              <span className="w-[2px] h-[2px] rounded-full bg-black/25" />
            </div>
          </div>
        </div>
      </div>

      {/* КНОПКА */}
      <div className="flex justify-center mt-5 sm:mt-12">
        <button
          onClick={onOpenCatalog}
          className="
            group
            relative px-8 py-3.5 rounded-xl
            bg-white text-black font-semibold
            overflow-hidden
            transition
          "
        >
          <span className="relative z-10 inline-flex items-center gap-2">
            Переглянути всі програми
            <span className="transition-transform duration-200 ease-out group-hover:translate-x-1">
              →
            </span>
          </span>

          {/* Same sweeping shine as before, just re-tinted for a white
              button — the old white-on-translucent sweep would have been
              invisible on a solid white background, so this uses a
              faint dark sheen instead. */}
          <span
            className="
              absolute inset-0
              bg-gradient-to-r from-transparent via-black/10 to-transparent
              translate-x-[-100%]
              animate-[shine_3s_linear_infinite]
            "
          />
        </button>
      </div>

      {/* keyframes */}
      <style>
        {`
          @keyframes shine {
            100% {
              transform: translateX(100%);
            }
          }
        `}
      </style>
    </section>
  );
}
