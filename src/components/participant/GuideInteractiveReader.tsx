// The reading screen of a STRUCTURED guide (2026-10-06) — what "Відкрити
// гайд →" opens when the guide was built in Sensoria. (An uploaded PDF opens
// in GuidePdfReader instead; the two are never mixed.)
//
// Calm, single-column, editorial: the content is the focus, the chrome is a
// slim bar with "back" and the printable PDF version. The guide's feedback
// ("Чи був цей гайд корисним?") closes the document.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SECTIONS_PER_PAGE,
  blockIndexOf,
  groupIntoSections,
  locateBlock,
  paginateSections,
  resumePageIndex,
  type GuideBlockTarget,
  type GuideContent,
} from "../../data/guideContent";
import type { RelatedItem, RelatedKind } from "../../utils/guideRelated";
import ContentShield from "./ContentShield";
import GuideFeedbackSection from "./GuideFeedbackSection";
import GuideInteractiveRenderer from "./GuideInteractiveRenderer";
import { addSavedFragment, fetchSavedFragmentsForGuide, removeSavedFragment, rowsToBlockIds } from "../../lib/guideFragments";
import { useGuideAnswers } from "./useGuideAnswers";
import { buildGuideSummary } from "../../utils/guideInteraction";
import { ArrowLeftIcon, DownloadIcon } from "./GuideIcons";

type Props = {
  guideId: string;
  title: string;
  content: GuideContent;
  userId: string | null | undefined;
  related: RelatedItem[];
  // Section keys already reached — the reader reopens where they left off.
  viewedKeys: string[];
  onClose: () => void;
  onOpenRelated: (kind: RelatedKind, id: string) => void;
  onSectionSeen: (sectionKey: string) => void;
  // Downloads the flattened, marked PDF copy directly.
  onDownloadPdf?: () => void;
  downloading: boolean;
  downloadError: string | null;
  // "Завершити": the person says they are done — the caller records the
  // guide as worked through and closes the reader.
  onFinish: () => void;
  // A saved fragment / note: open on its page and scroll to that block.
  initialTarget?: GuideBlockTarget;
};

export default function GuideInteractiveReader({
  guideId,
  title,
  content,
  userId,
  related,
  viewedKeys,
  onClose,
  onOpenRelated,
  onSectionSeen,
  onDownloadPdf,
  downloading,
  downloadError,
  onFinish,
  initialTarget,
}: Props) {
  const located = useMemo(() => locateBlock(content, initialTarget, SECTIONS_PER_PAGE), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [page, setPage] = useState(
    () => located?.page ?? resumePageIndex(groupIntoSections(content), SECTIONS_PER_PAGE, viewedKeys)
  );
  const scroller = useRef<HTMLDivElement>(null);
  const guide = useGuideAnswers({ guideId, guideTitle: title, content, userId });
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Saved fragments: block id → row id.
  const [savedFragments, setSavedFragments] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchSavedFragmentsForGuide(guideId, userId).then((rows) => {
      if (cancelled) return;
      setSavedFragments(Object.fromEntries(rowsToBlockIds(content, rows).map(({ blockId, id }) => [blockId, id])));
    });
    return () => {
      cancelled = true;
    };
  }, [guideId, userId]);
  const toggleFragment = async (blockId: string, text: string) => {
    if (!userId) return;
    try {
      const rowId = savedFragments[blockId];
      if (rowId) {
        await removeSavedFragment(rowId);
        setSavedFragments(({ [blockId]: _removed, ...rest }) => rest);
      } else {
        const row = await addSavedFragment({
          guideId,
          blockId,
          blockIndex: blockIndexOf(content, blockId),
          fragmentText: text,
          guideTitle: title,
          userId,
        });
        setSavedFragments((prev) => ({ ...prev, [blockId]: row.id }));
      }
    } catch {
      // best-effort: a failed bookmark never interrupts reading
    }
  };
  // Land on the saved block. Content above it can still be loading/shifting,
  // so the position is re-applied for ~4s, until the person scrolls/touches.
  useEffect(() => {
    if (!located) return;
    const OFFSET = 96;
    let ticks = 0;
    let userMoved = false;
    let highlighted = false;
    const stop = () => {
      userMoved = true;
    };
    const evs = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    evs.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
    const timer = window.setInterval(() => {
      ticks++;
      const el = scroller.current?.querySelector<HTMLElement>(`[data-block-id="${located.blockId}"]`);
      const box = scroller.current;
      if (el && box && !userMoved) {
        const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top - OFFSET;
        if (Math.abs(delta) > 8) box.scrollTop += delta;
        if (!highlighted) {
          highlighted = true;
          el.style.transition = "background-color 1.2s ease";
          el.style.backgroundColor = "rgba(99,102,241,0.12)";
          window.setTimeout(() => {
            el.style.backgroundColor = "";
          }, 2200);
        }
      }
      if (userMoved || ticks > 16) {
        window.clearInterval(timer);
        evs.forEach((e) => window.removeEventListener(e, stop));
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      evs.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [located]);
  const hasAnyAnswer = Object.values(guide.answers).some((group) => Object.keys(group).length > 0);
  const summary = buildGuideSummary(content, guide.answers);
  const hasSummary = summary.change !== null || summary.plan.length > 0;
  const pageCount = paginateSections(groupIntoSections(content), SECTIONS_PER_PAGE).length;
  const goToPage = (next: number) => {
    setPage(next);
    scroller.current?.scrollTo({ top: 0 });
  };
  return createPortal(
    <div ref={scroller} className="fixed inset-0 z-[10100] overflow-y-auto bg-[#f8f9fe]">
      <ContentShield />
      <div className="sticky top-0 z-10 bg-white/85 backdrop-blur-md border-b border-black/5 px-4 md:px-8 py-2.5 flex items-center gap-3">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-full text-[12.5px] font-medium text-black/60 hover:text-black hover:bg-black/[0.05] transition"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">До гайду</span>
        </button>
        <div className="flex-1 min-w-0 text-[13.5px] font-semibold text-black/75 truncate">{title}</div>
        {onDownloadPdf && (
          <button
            onClick={onDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-medium text-black/60 hover:text-black hover:bg-black/[0.05] transition disabled:opacity-50"
          >
            <DownloadIcon />
            <span className="hidden sm:inline">{downloading ? "Готуємо PDF…" : "PDF-версія"}</span>
          </button>
        )}
      </div>

      {downloadError && (
        <div role="alert" className="max-w-[1040px] mx-auto px-6 md:px-12 pt-4 text-[12.5px] text-red-500">
          {downloadError}
        </div>
      )}
      <div className="max-w-[1040px] mx-auto px-6 md:px-12 pt-12 md:pt-16 pb-24">
        <GuideInteractiveRenderer
          guideId={guideId}
          guide={guide}
          fragments={{ isSaved: (id) => id in savedFragments, toggle: toggleFragment }}
          content={content}
          userId={userId}
          related={related}
          onOpenRelated={onOpenRelated}
          onSectionSeen={onSectionSeen}
          page={page}
          onPageChange={goToPage}
        />
        {page >= pageCount - 1 && (
          <>
            <div className="flex justify-center mt-16">
              <button
                onClick={() => (hasSummary ? setSummaryOpen(true) : onFinish())}
                className={`px-10 py-3.5 rounded-full text-[15px] font-semibold transition ${
                  hasAnyAnswer
                    ? "bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white shadow-[0_10px_28px_rgba(79,70,229,0.3)] hover:opacity-90"
                    : "border border-black/10 bg-white/70 text-black/65 hover:bg-white hover:border-black/20"
                }`}
              >
                Завершити
              </button>
            </div>
            <div className="border-t border-black/[0.07] mt-10 pt-8">
              <GuideFeedbackSection guideId={guideId} guideTitle={title} userId={userId} />
            </div>
          </>
        )}
      </div>
      {summaryOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-label="Ваш підсумок" className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto rounded-[28px] bg-white p-7 md:p-9 shadow-[0_30px_80px_rgba(10,10,40,0.35)]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-indigo-400 mb-2">Підсумок</div>
            <h2 className="text-[26px] font-bold tracking-tight text-black mb-5">Ось що ви відзначили</h2>
            {summary.change && (
              <div className="rounded-[20px] bg-[#eceffd] px-5 py-4 mb-4">
                <p className="text-[15.5px] leading-relaxed text-black/80">{summary.change.text}</p>
                <p className="text-[12.5px] leading-relaxed text-black/45 mt-2">{summary.change.caveat}</p>
              </div>
            )}
            {summary.plan.length > 0 && (
              <div className="mb-6">
                <div className="text-[15px] font-semibold text-black/85 mb-2">Ваш невеликий план</div>
                <ul className="flex flex-col gap-2">
                  {summary.plan.map((step) => (
                    <li key={step} className="flex items-start gap-3 text-[15px] leading-relaxed text-black/70">
                      <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onFinish}
                className="px-7 py-3 rounded-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white text-[14px] font-semibold hover:opacity-90 transition"
              >
                Закрити гайд
              </button>
              <button
                onClick={() => setSummaryOpen(false)}
                className="px-6 py-3 rounded-full border border-black/10 text-[14px] font-medium text-black/65 hover:bg-black/[0.04] transition"
              >
                Повернутися
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
