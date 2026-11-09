// "Подивіться всередину" (2026-10-06, guide preview page) — 2–3 REAL page
// images of the guide's PDF, never the whole document. Clicking one opens a
// larger view (inline portal lightbox, no dependency; ←/→/Esc work).
//
// DATA SOURCE THAT DOES NOT EXIST YET: rendered page images. This
// project has no PDF page-rendering step (no uploader that rasterises
// pages, no generator that renders the branded PDF), so no guide carries
// `pdf.previewPages` today and this component renders nothing — it
// deliberately does NOT draw placeholder pages or screenshots of
// something that isn't the real file. The moment a guide's
// `pdf.previewPages` is filled with real images (from the uploaded PDF,
// or from the PDF Sensoria generates), the section appears with no other
// change. See data/guidePdf.ts.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GuidePdfPreviewPage } from "../../data/guidePdf";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "./GuideIcons";

const MAX_PAGES = 3;

export default function GuidePdfPreviewPages({ pages }: { pages: GuidePdfPreviewPage[] }) {
  const shown = pages.slice(0, MAX_PAGES);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
      else if (e.key === "ArrowRight") setActive((i) => (i === null ? i : Math.min(i + 1, shown.length - 1)));
      else if (e.key === "ArrowLeft") setActive((i) => (i === null ? i : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, shown.length]);

  if (shown.length === 0) return null;
  const labelOf = (page: GuidePdfPreviewPage, index: number) => page.label ?? `Сторінка ${index + 1}`;
  const current = active !== null ? shown[active] : null;

  return (
    <section>
      <h2 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-black/85">Подивіться всередину</h2>
      <p className="text-[14px] text-black/45 mt-1 mb-6 max-w-[520px]">
        Кілька сторінок із PDF — щоб побачити, як виглядає гайд, який ви отримаєте.
      </p>
      <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-[760px]">
        {shown.map((page, index) => (
          <button
            key={page.imageUrl + index}
            onClick={() => setActive(index)}
            className="group flex flex-col gap-2.5 text-left"
            aria-label={`Збільшити: ${labelOf(page, index)}`}
          >
            <div className="aspect-[1/1.414] rounded-[12px] sm:rounded-[16px] overflow-hidden bg-white border border-black/[0.06] shadow-[0_10px_26px_rgba(30,41,90,0.10)] group-hover:shadow-[0_14px_34px_rgba(30,41,90,0.18)] group-hover:-translate-y-0.5 transition">
              <img src={page.imageUrl} alt={labelOf(page, index)} className="w-full h-full object-cover" />
            </div>
            <span className="text-[12px] sm:text-[12.5px] text-black/45">{labelOf(page, index)}</span>
          </button>
        ))}
      </div>

      {current &&
        createPortal(
          <div
            className="fixed inset-0 z-[10200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActive(null)}
            role="dialog"
            aria-modal="true"
          >
            <div className="relative max-h-full flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img
                src={current.imageUrl}
                alt={labelOf(current, active!)}
                className="max-h-[82vh] max-w-[92vw] rounded-[14px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.4)]"
              />
              <div className="text-[13px] text-white/80">
                {labelOf(current, active!)} · {active! + 1}/{shown.length}
              </div>
            </div>
            <button
              onClick={() => setActive(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition"
              aria-label="Закрити"
            >
              <CloseIcon />
            </button>
            {active! > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(active! - 1);
                }}
                className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition"
                aria-label="Попередня"
              >
                <ArrowLeftIcon />
              </button>
            )}
            {active! < shown.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(active! + 1);
                }}
                className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition"
                aria-label="Наступна"
              >
                <ArrowRightIcon />
              </button>
            )}
          </div>,
          document.body
        )}
    </section>
  );
}
