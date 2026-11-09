// Media of one publication — ONE media system for the feed:
//   • one image   → fills the content column; ratio follows the picture but is
//                   clamped (landscape ≈16:9, square 1:1, portrait ≤4:5)
//   • 2+ images   → a swipeable series (Threads-style): separate rounded
//                   photos of the same size in one row, the next one peeking
//                   in; arrows on desktop
//   • one video   → the same container width and radius, a 2:1 window onto
//                   the 16:9 player anchored at the bottom (only the title strip
//                   at the top is cropped; controls stay), so no black bars
// No outer card: the picture is the object. Everything is `w-full` of the
// post's content column, so it lines up with the text above it.
import { useCallback, useEffect, useRef, useState } from "react";
import { useModal } from "./useModal";
import { createPortal } from "react-dom";
import { Icon } from "../../ui/Icon";
import type { PostVideo } from "../../../utils/authorPosts";
import { clampMediaRatio } from "../../../utils/authorPosts";

const RADIUS = "rounded-xl";

// Enlarged photos: focus trap, Esc, ← →, scroll lock, focus returns to the thumbnail.
function PhotoViewer({ images, alt = "", start, onClose }: { images: string[]; alt?: string; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const root = useRef<HTMLDivElement>(null);
  const n = images.length;
  useModal(root, onClose, (e) => {
    if (n < 2) return;
    if (e.key === "ArrowRight") setI((v) => (v + 1) % n);
    else if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
  });
  const btn = "w-11 h-11 rounded-full bg-white/15 text-white text-xl hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white";
  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-label="Перегляд фото" className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 sm:p-10" onClick={onClose}>
      <img src={images[i]} alt={alt ? (n > 1 ? `${alt} (${i + 1} з ${n})` : alt) : n > 1 ? `Фото ${i + 1} з ${n}` : "Фото публікації"} className="max-w-full max-h-[86vh] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <button data-autofocus onClick={onClose} aria-label="Закрити" className={`${btn} absolute top-4 right-4`}>×</button>
      {n > 1 && (
        <>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/15 text-white text-[14px]">{i + 1} / {n}</span>
          <button onClick={(e) => { e.stopPropagation(); setI((i - 1 + n) % n); }} aria-label="Попереднє фото" className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`}>‹</button>
          <button onClick={(e) => { e.stopPropagation(); setI((i + 1) % n); }} aria-label="Наступне фото" className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`}>›</button>
        </>
      )}
    </div>,
    document.body,
  );
}

export function PostImages({ images, alt = "" }: { images: string[]; alt?: string }) {
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [ratio, setRatio] = useState<number | null>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [open, setOpen] = useState<number | null>(null);
  const [pos, setPos] = useState(1);
  const track = useRef<HTMLDivElement>(null);

  const slides = images.map((src, i) => ({ src, i })).filter((x) => !failed.has(x.i));
  const n = slides.length;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    const first = el.firstElementChild as HTMLElement | null;
    const w = (first?.getBoundingClientRect().width ?? el.clientWidth) + 8;
    setPos(Math.min(el.children.length, Math.max(1, Math.round(el.scrollLeft / w) + 1)));
  }, []);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const w = (first?.getBoundingClientRect().width ?? el.clientWidth * 0.7) + 8;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  useEffect(() => {
    measure();
  }, [measure, n]);

  if (n === 0) return null;

  return (
    <>
      {n === 1 ? (
        <button
          onClick={() => setOpen(slides[0].i)}
          aria-label={alt ? `Відкрити фото: ${alt}` : "Відкрити фото"}
          className={`block w-full max-h-[400px] overflow-hidden ${RADIUS} bg-black/[0.04]`}
          style={{ aspectRatio: String(clampMediaRatio(ratio)) }}
        >
          <img
            src={slides[0].src}
            alt={alt}
            loading="eager"
            onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            onError={() => setFailed((f) => new Set(f).add(slides[0].i))}
            className="w-full h-full object-cover"
          />
        </button>
      ) : (
        <div className="relative">
          <div
            ref={track}
            onScroll={measure}
            className="flex gap-2 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {slides.map((x, idx) => (
              <button
                key={x.i}
                onClick={() => setOpen(x.i)}
                aria-label={`Фото ${idx + 1} з ${n}`}
                className={`snap-start shrink-0 w-[78%] sm:w-[calc((100%-1rem)/3)] aspect-square overflow-hidden ${RADIUS} bg-black/[0.04]`}
              >
                <img
                  src={x.src}
                  alt={alt ? `${alt} (${idx + 1} з ${n})` : ""}
                  loading={idx < 2 ? "eager" : "lazy"}
                  draggable={false}
                  onError={() => setFailed((f) => new Set(f).add(x.i))}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[12px] pointer-events-none">
            {pos}/{n}
          </span>
          {!edge.start && (
            <button
              onClick={() => step(-1)}
              aria-label="Попереднє фото"
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white"
            >
              <Icon name="chevron" size={14} className="rotate-90" />
            </button>
          )}
          {!edge.end && (
            <button
              onClick={() => step(1)}
              aria-label="Наступне фото"
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white"
            >
              <Icon name="chevron" size={14} className="-rotate-90" />
            </button>
          )}
        </div>
      )}

      {open !== null && <PhotoViewer images={images} alt={alt} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function PostVideoEmbed({ video }: { video: PostVideo }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`relative w-full aspect-video overflow-hidden ${RADIUS} bg-[#111]`}>
      {playing ? (
        <iframe
          src={`${video.embedUrl}${video.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title="Відео публікації"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : (
        <button onClick={() => setPlaying(true)} aria-label="Відтворити відео" className="absolute inset-0 w-full h-full group">
          <span className="absolute left-3 top-3 text-[12px] font-medium text-white/70">{video.provider === "youtube" ? "YouTube" : "Vimeo"}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-white/95 text-black flex items-center justify-center shadow-lg group-hover:scale-105 transition">
              <Icon name="play" size={26} filled />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
