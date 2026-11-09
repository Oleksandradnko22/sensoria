// Education / certificates showcase + accessible document lightbox (focus trap,
// Esc, ←/→, focus returns to the opener). Documents are shown uncropped.
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./useModal";
import { DEGREE_LABEL, isMeaningfulText, plainTitle, type AuthorCredential } from "../../../utils/authorCredentials";


export function Lightbox({ items, start, onClose }: { items: AuthorCredential[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const rootRef = useRef<HTMLDivElement>(null);
  const n = items.length;
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);
  useModal(rootRef, onClose, (e) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  });

  const c = items[i];
  const btn = "w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-[20px] transition-colors focus-visible:outline-2 focus-visible:outline-white";
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Документ: ${c.title}`}
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/70 text-[14px]" onClick={(e) => e.stopPropagation()}>
        <span>
          {i + 1} / {n}
        </span>
        <button data-autofocus onClick={onClose} aria-label="Закрити" className={btn}>
          ✕
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-6">
        {n > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Попередній документ"
            className={btn}
          >
            ‹
          </button>
        )}
        <img
          src={c.imageUrl ?? ""}
          alt={`${c.title}${c.issuer ? `, ${c.issuer}` : ""}`}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full min-w-0 object-contain rounded-lg bg-white"
        />
        {n > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Наступний документ"
            className={btn}
          >
            ›
          </button>
        )}
      </div>
      <div className="px-4 py-4 text-center text-white" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-semibold">{c.title}</div>
        <div className="text-[14px] text-white/70 mt-0.5">{[c.issuer, c.year].filter(Boolean).join(" · ")}</div>
      </div>
    </div>,
    document.body
  );
}

// Education / courses / certificates as an editorial timeline: the document the
// author uploaded on the left (opens the lightbox), the facts on the right.
// Entries without a document get a neutral placeholder tile (never an invented
// document). Never labels anything as verified.
function DocIcon() {
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />
    </svg>
  );
}

// timeline rail: a soft solid line that runs through the row padding into the
// next row, and a violet dot with a pale halo (aligned with the first text line)
export function TimelineRail({ first, last, always, pad = 20, dot = [5, 5] }: { first: boolean; last: boolean; always?: boolean; pad?: number; dot?: [number, number] }) {
  // dot = [mobile, ≥sm]: distance from the top of the row to the TOP of the dot, so the dot
  // sits level with the middle of the first text line (the title), not above it
  const vars = { "--dm": `${dot[0]}px`, "--ds": `${dot[1]}px` } as React.CSSProperties;
  return (
    <div aria-hidden style={vars} className={`${always ? "block" : "hidden sm:block"} relative self-stretch`}>
      <span
        className={`absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[#e3e0f6] ${
          first ? "top-[calc(var(--dm)+5px)] sm:top-[calc(var(--ds)+5px)]" : ""
        } ${last ? "h-[calc(var(--dm)+5px)] sm:h-[calc(var(--ds)+5px)]" : ""}`}
        style={{ ...(first ? {} : { top: -pad }), ...(last ? {} : { bottom: -2 * pad }) }}
      />
      <span className="absolute left-1/2 top-[var(--dm)] sm:top-[var(--ds)] h-[11px] w-[11px] -translate-x-1/2 rounded-full bg-[#4338ca] ring-[5px] ring-[#ebe9fb]" />
    </div>
  );
}

export default function CredentialTimeline({ items }: { items: AuthorCredential[] }) {
  const imaged = items.filter((c) => c.imageUrl);
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const last = items.length - 1;
  // the picture column exists only while someone in this group has a document; the
  // layout never shows an empty tile by itself
  const anyImage = imaged.length > 0;

  return (
    <>
      <ol>
        {items.map((c, i) => {
          const at = imaged.findIndex((x) => x.id === c.id);
          const thumb = c.imageUrl ? (
            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden border border-black/[0.08] bg-[#f6f5fb]">
              <img src={c.imageUrl} alt={`${plainTitle(c.title)}${c.issuer ? `, ${c.issuer}` : ""}`} loading="lazy" className="w-full h-full object-contain p-1.5" />
            </div>
          ) : (
            <div aria-hidden className="w-full aspect-[4/3] rounded-xl border border-black/[0.06] bg-[#f6f5fb] text-[#4338ca]/35 flex items-center justify-center">
              <DocIcon />
            </div>
          );
          return (
            <li key={c.id} className={`relative grid gap-x-5 gap-y-3 py-5 ${anyImage ? "sm:grid-cols-[clamp(180px,27%,240px)_16px_minmax(0,1fr)_auto]" : "sm:grid-cols-[16px_minmax(0,1fr)_auto]"} sm:items-start ${i > 0 ? "" : "pt-0"} ${i === last ? "pb-0" : ""}`}>
              {anyImage && <div className="w-full max-w-[220px] sm:max-w-none">{thumb}</div>}
              <TimelineRail first={i === 0} last={i === last} dot={[5, 5]} />
              <div className="min-w-0">
                <div className="text-[16px] font-semibold leading-snug text-black/90 break-words">{plainTitle(c.title)}</div>
                {c.issuer && <div className="text-[14px] text-black/60 mt-0.5 break-words">{c.issuer}</div>}
                {(c.degree || c.year) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {c.degree && <span className="rounded-full bg-[#f1f0fb] px-2.5 py-0.5 text-[12px] text-[#4338ca]">{DEGREE_LABEL[c.degree]}</span>}
                    {c.year && <span className="sm:hidden text-[12px] text-black/55 tabular-nums">{c.year}</span>}
                  </div>
                )}
                {c.imageUrl && (
                  <button type="button" onClick={() => setOpen(at)} aria-label={`Переглянути документ: ${plainTitle(c.title)}`} className="sm:hidden mt-0.5 py-3 inline-flex items-center gap-1.5 rounded-lg text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 ring-[#4338ca]">
                    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    Переглянути
                  </button>
                )}
                {isMeaningfulText(c.description) && <p className="text-[14px] leading-relaxed text-black/65 mt-2 max-w-[56ch] break-words">{c.description.trim()}</p>}
              </div>
              {/* right edge: the year (small, quiet) and the «view» action */}
              <div className="hidden sm:flex flex-col items-end gap-3">
                {c.year && <div aria-hidden className="text-[20px] font-semibold leading-none tracking-tight tabular-nums text-black/20">{c.year}</div>}
                {c.imageUrl && (
                  <button type="button" onClick={() => setOpen(at)} aria-label={`Переглянути документ: ${plainTitle(c.title)}`} className="inline-flex items-center gap-1.5 py-3 -my-3 rounded-lg text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 ring-[#4338ca]">
                    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                    Переглянути
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {open !== null && imaged.length > 0 && <Lightbox items={imaged} start={open} onClose={close} />}
    </>
  );
}
