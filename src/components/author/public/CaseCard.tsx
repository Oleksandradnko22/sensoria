// One «Кейси» card with the WHOLE case: category label, title, summary, then every
// section the author wrote (ЗАПИТ / ФОКУС РОБОТИ / ЩО ДОПОМОГЛО get icons), tags
// and the linked material. No «read more» — nothing is hidden. Text sizes stay on the
// profile scale (12/14/16/20).
import { useCallback, useRef, useState } from "react";
import { useModal } from "./useModal";
import { createPortal } from "react-dom";
import { iconPath, type StoryIconId } from "../../../utils/storyIcons";
import { caseLabels, caseSections } from "../../../utils/authorCases";
import type { AuthorCase } from "../../../utils/authorCredentials";

const ICON: Record<string, StoryIconId> = { "Запит": "message", "Фокус роботи": "target", "Що допомогло": "lightbulb", "Контекст": "compass", "Як відбувалася робота": "sprout", "Що змінилося": "sparkles", "Що може бути корисним іншим": "book" };
export const CASE_NOTICE_LINES = ["Кейси знеособлені та описують приклади роботи автора. Деталі змінено для захисту приватності.", "Описаний досвід не гарантує такого самого результату для інших."];

export const CaseIcon = ({ id, className = "w-5 h-5" }: { id: StoryIconId; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={iconPath(id, "check")} />
  </svg>
);


// Enlarged view of the review screenshots: Esc / backdrop / × close, ← → switch,
// focus stays inside and returns to the thumbnail, page scroll is locked.
function ReviewViewer({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const rootRef = useRef<HTMLDivElement>(null);
  const n = urls.length;
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);
  useModal(rootRef, onClose, (e) => {
    if (n < 2) return;
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  });
  const btn = "w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-[20px] transition-colors focus-visible:outline-2 focus-visible:outline-white";
  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Анонімний відгук" className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <button data-autofocus onClick={onClose} aria-label="Закрити" className={`${btn} absolute top-4 right-4`}>×</button>
      {n > 1 && <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Попередній" className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`}>‹</button>}
      <img src={urls[i]} alt={`Скриншот анонімного відгуку ${i + 1} з ${n}`} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-[88vh] object-contain rounded-lg bg-white" />
      {n > 1 && <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Наступний" className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`}>›</button>}
      {n > 1 && <div className="absolute bottom-4 text-[14px] text-white/80">{i + 1} / {n}</div>}
    </div>,
    document.body,
  );
}

export default function CaseCard({ c, linked, onOpenContent }: { c: AuthorCase; linked?: { kind: string; id: string; title: string }; onOpenContent: (kind: never, id: string) => void }) {
  const { category, tags } = caseLabels(c);
  const sections = caseSections(c);
  const [zoom, setZoom] = useState<number | null>(null);
  return (
    <article className="rounded-2xl border border-black/[0.08] bg-white p-5 sm:p-6 flex flex-col gap-5">
      {category && <div className="text-[12px] font-medium uppercase tracking-wider text-[#4338ca]">{category}</div>}
      <div>
        <h3 className="text-[20px] leading-snug font-semibold text-black/90 break-words">{c.title}</h3>
        {c.details.summary && <p className="mt-2 text-[14px] leading-relaxed text-black/60 break-words">{c.details.summary}</p>}
      </div>
      {sections.length > 0 && (
        <ul className="flex flex-col gap-4">
          {sections.map((p) => (
            <li key={p.label} className="flex gap-3">
              <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-[#4338ca]/[0.07] text-[#4338ca] flex items-center justify-center">
                <CaseIcon id={ICON[p.label] ?? "check"} className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] font-medium uppercase tracking-wider text-black/55">{p.label}</div>
                <p className="mt-0.5 text-[14px] leading-relaxed text-black/75 whitespace-pre-line break-words">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {c.details.reviewImages.length > 0 && (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-[12px] font-medium uppercase tracking-wider text-black/55">{c.details.reviewImages.length > 1 ? "Анонімні відгуки" : "Анонімний відгук"}</figcaption>
          <div className={`grid gap-3 ${c.details.reviewImages.length === 1 ? "grid-cols-1" : c.details.reviewImages.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
            {c.details.reviewImages.map((u, i) => (
              <button key={u} type="button" onClick={() => setZoom(i)} aria-label={`Збільшити скриншот відгуку ${i + 1}`} className="rounded-xl cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#4338ca]">
                <img src={u} alt={`Скриншот анонімного відгуку ${i + 1}`} loading="lazy" className="w-full aspect-[4/3] max-h-[420px] object-contain rounded-xl border border-black/[0.08] bg-[#f6f5fb]" />
              </button>
            ))}
          </div>
        </figure>
      )}
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Теги">
          {tags.map((t) => (
            <li key={t} className="px-3 py-1 rounded-full bg-black/[0.04] text-[12px] text-black/65">{t}</li>
          ))}
        </ul>
      )}
      {linked && (
        <button onClick={() => onOpenContent(linked.kind as never, linked.id)} className="self-start min-h-[44px] text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4 text-left">
          Матеріал: {linked.title} →
        </button>
      )}
      {zoom !== null && <ReviewViewer urls={c.details.reviewImages} start={zoom} onClose={() => setZoom(null)} />}
    </article>
  );
}
