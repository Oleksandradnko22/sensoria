// A guide's PREVIEW / PRODUCT page. It introduces the guide — what it is
// about, who it is for, what is inside (structure, never the text), who made
// it — and hands off to the reader with "Відкрити гайд →".
//
// Two kinds of guide (data/guides.ts getGuideSource):
//   sensoria_structured — opens GuideInteractiveReader; "PDF-версія" downloads
//                         the static copy of the same content directly.
//   uploaded_pdf        — opens GuidePdfReader; shown and downloaded as-is.
//
// Two actions that must never be confused:
//   Зберегти        = "I want to come back to this guide"
//                     (guide_saved_for_later, lib/guideSaves.ts)
//   Завантажити PDF = "I want the file on my device"
//                     (lib/protectedDownload.ts / lib/guidePdfExport.ts)
//
// Progress: the platform records which sections were reached
// (guide_section_views) and, on "Завершити" in the reader, marks the guide
// worked through. It cannot see inside an uploaded PDF.

import { useEffect, useRef, useState } from "react";
import { logContentView } from "../../lib/contentViews";
import { createPortal } from "react-dom";
import { getGuideSource, guides } from "../../data/guides";
import { categoryLabels } from "../../data/categoryLabels";
import {
  SECTIONS_PER_PAGE,
  getGuideSectionCount,
  getGuideSectionKeys,
  groupIntoSections,
  lastPageSectionKeys,
  locateBlock,
  type GuideBlockTarget,
} from "../../data/guideContent";
import { toStaticBlocks } from "../../data/guideStatic";
import { formatFileSize, getGuideOutline, pagesLabel, resolveGuidePdf, sectionsLabel, type GuidePdfPreviewPage } from "../../data/guidePdf";
import { useSession } from "../../context/SessionContext";
import Avatar from "../ui/Avatar";
import AskAuthorBox from "./AskAuthorBox";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import GuideFeedbackSection from "./GuideFeedbackSection";
import GuideInteractiveReader from "./GuideInteractiveReader";
import GuideRelatedTiles from "./GuideRelatedTiles";
import GuidePdfPreviewPages from "./GuidePdfPreviewPages";
import GuidePdfReader from "./GuidePdfReader";
import GuidePdfVisual from "./GuidePdfVisual";
import { ArrowLeftIcon, ArrowRightIcon, BookmarkIcon, CheckIcon, CloseIcon, DownloadIcon } from "./GuideIcons";
import { fetchGuideAuthorId } from "../../lib/contentAuthors";
import { fetchGuideAuthorCard, type GuideAuthorCard } from "../../lib/guideAuthor";
import { fetchAllSavedGuides, addSavedGuide, removeSavedGuide } from "../../lib/guideSaves";
import { fetchSectionViewsForGuide, markSectionViewed } from "../../lib/guideSectionViews";
import { downloadProtectedPdf } from "../../lib/protectedDownload";
import { guidePdfFileName, renderGuidePreviewPages } from "../../lib/guidePdfExport";
import { getGuidePdfRenderer } from "../../lib/guidePdfRenderer";
import { saveBlobAs } from "../../lib/pdfStamp";
import { issuePdfMark, JOURNAL_MISSING_NOTICE } from "../../lib/pdfMarkIssue";
import { getRelatedContent, type RelatedKind } from "../../utils/guideRelated";
import { getInitials } from "../../lib/auth";
import { errorMessage } from "../../lib/errorMessage";

type Props = {
  guideId: string;
  onClose: () => void;
  // Where the "may be useful together" tiles lead — following one closes
  // this screen and opens the target instead (Guide → Meditation →
  // Program). Optional so the page still renders (tiles inert) if a
  // caller doesn't wire navigation.
  onOpenMeditationLink?: (meditationId: string) => void;
  onOpenGuideLink?: (guideId: string) => void;
  onOpenProgramLink?: (programId: string) => void;
  // Tells whoever opened this overlay that this guide's progress (opened /
  // completed) just changed, so "Моє навчання" can refresh its counts.
  onSectionViewed?: () => void;
  // Same idea for the bookmark — tells the dashboard a save/unsave just
  // happened so an already-mounted "Моє навчання" re-reads it.
  onSavedChange?: () => void;
  // "Переглянути профіль →" on the author block. There is no public
  // author-profile page in the product yet (AuthorProfile.tsx is the
  // author's own cabinet screen), so nothing wires this today and the
  // button is simply not rendered — the boundary exists so the page is
  // ready the day that route does.
  onOpenAuthorProfile?: (authorId: string) => void;
  // A saved fragment / note to land on: opens the reader straight at that block.
  initialTarget?: GuideBlockTarget | null;
};

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 px-5 py-3 rounded-full border border-black/10 bg-white/70 text-[13.5px] font-medium text-black/70 hover:bg-white hover:border-black/20 transition disabled:opacity-50";

export default function GuideExperience({
  guideId,
  onClose,
  onOpenMeditationLink,
  onOpenGuideLink,
  onOpenProgramLink,
  onSectionViewed,
  onSavedChange,
  onOpenAuthorProfile,
  initialTarget,
}: Props) {
  // «Аналітика» of the author: this guide was opened
  useEffect(() => logContentView(guideId), [guideId]);
  const guide = guides.find((g) => g.id === guideId);
  const session = useSession();
  const userId = session?.profile.id;
  const openAuthorProfileCtx = useOpenAuthorProfile();

  // ---- Save ("Зберегти") — guide_saved_for_later ------------------------
  const [saveRowId, setSaveRowId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !guide) return;
    let cancelled = false;
    fetchAllSavedGuides(userId).then((rows) => {
      if (cancelled) return;
      setSaveRowId(rows.find((row) => row.guideId === guide.id)?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [guide?.id, userId]);

  // ---- Author — guide_authors → profiles / author_details ---------------
  // `null` (not undefined) once loaded-but-absent, so AskAuthorBox never
  // renders a stale "loading" state as if it were just missing.
  const [guideAuthorId, setGuideAuthorId] = useState<string | null>(null);
  const [authorCard, setAuthorCard] = useState<GuideAuthorCard | null>(null);
  useEffect(() => {
    if (!guide) return;
    let cancelled = false;
    fetchGuideAuthorId(guide.id).then((id) => {
      if (cancelled) return;
      setGuideAuthorId(id);
      if (id) {
        fetchGuideAuthorCard(id).then((card) => {
          if (!cancelled) setAuthorCard(card);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [guide?.id]);

  // ---- Platform progress — opened / started / completed -----------------
  // Reuses guide_section_views so every other place that reads guide
  // status keeps working. Only guides with structured `content` have
  // sections to record against (an uploaded PDF with no structure has
  // nothing to count — its status stays whatever it was).
  const isStructured = guide ? getGuideSource(guide) === "sensoria_structured" && Boolean(guide.guideContent?.length) : false;
  const totalSections = guide ? getGuideSectionCount(guide) : 0;
  const sectionKeys = guide ? getGuideSectionKeys(guide) : [];
  const sectionKeysId = sectionKeys.join("|");
  const [viewedKeys, setViewedKeys] = useState<string[]>([]);
  useEffect(() => {
    if (!userId || !guide || totalSections === 0) return;
    let cancelled = false;
    fetchSectionViewsForGuide(guide.id, userId, sectionKeys).then((keys) => {
      if (!cancelled) setViewedKeys(keys);
    });
    return () => {
      cancelled = true;
    };
  }, [guide?.id, userId, totalSections, sectionKeysId]);

  const viewedInRange = viewedKeys.filter((k) => sectionKeys.includes(k)).length;
  const isCompleted = totalSections > 0 && viewedInRange >= totalSections;

  // "Подивіться всередину" for a structured guide: its first pages rendered
  // from the same layout as the PDF (an uploaded PDF brings its own).
  const [generatedPreview, setGeneratedPreview] = useState<GuidePdfPreviewPage[]>([]);
  useEffect(() => {
    if (!guide || !isStructured || !guide.guideContent) return;
    let cancelled = false;
    renderGuidePreviewPages({
      title: guide.title,
      subtitle: guide.description,
      blocks: toStaticBlocks(guide.guideContent),
      count: 2,
    })
      .then((pages) => {
        if (!cancelled) setGeneratedPreview(pages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.id, isStructured]);

  const [readerOpen, setReaderOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!guide) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[#f6f8ff] flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] rounded-[24px] bg-white p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.1)]">
          <div className="text-[16px] font-semibold mb-2">Гайд не знайдено</div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition"
          >
            Закрити
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const pdf = resolveGuidePdf(guide);
  const outline = getGuideOutline(guide);
  const related = getRelatedContent(guide);
  const category =
    guide.tags[0] && categoryLabels[guide.tags[0] as keyof typeof categoryLabels]
      ? categoryLabels[guide.tags[0] as keyof typeof categoryLabels]
      : "Гайд";
  const authorName = authorCard?.name ?? guide.author;
  const authorLine = [authorCard?.title, authorCard?.credentials].filter(Boolean).join(" · ");

  // A structured guide has no file with a real page count or size, so its
  // facts are the ones that ARE real: how it's built and how long it takes.
  // An uploaded PDF keeps the file facts.
  const metaParts = (
    isStructured
      ? [
          "Інтерактивний гайд",
          sectionsLabel(totalSections),
          "є PDF-версія",
        ]
      : [
          "PDF",
          pagesLabel(pdf.pageCount),
          pdf.fileSizeBytes ? formatFileSize(pdf.fileSizeBytes) : null,
        ]
  ).filter(Boolean);
  // Writes the missing section views (see the progress comment above) —
  // best-effort: a failed write never blocks reading the guide.
  const recordViews = async (keys: string[]) => {
    if (!userId || totalSections === 0) return;
    const missing = keys.filter((k) => sectionKeys.includes(k) && !viewedKeys.includes(k));
    if (missing.length === 0) return;
    try {
      await Promise.all(
        missing.map((sectionKey) =>
          markSectionViewed({ guideId: guide.id, sectionKey, sectionIndex: sectionKeys.indexOf(sectionKey), userId })
        )
      );
      setViewedKeys((prev) => Array.from(new Set([...prev, ...missing])));
      onSectionViewed?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти прогрес гайду:", err);
    }
  };

  // Opened from a saved fragment/note: go straight into the reader at that block
  // (once). Unstructured guides have no blocks, so they just open as usual.
  const consumedTarget = useRef(false);
  useEffect(() => {
    if (consumedTarget.current || !initialTarget || !isStructured || !guide?.guideContent) return;
    consumedTarget.current = true;
    if (locateBlock(guide.guideContent, initialTarget, SECTIONS_PER_PAGE)) setReaderOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget, isStructured]);

  const handleOpen = () => {
    setReaderOpen(true);
    // Opening = started. Only the first open records anything; a guide
    // already in progress or completed keeps its state. (A structured
    // guide records each section as it is actually reached, instead.)
    if (!isStructured && viewedInRange === 0) void recordViews(sectionKeys.slice(0, 1));
  };

  // "Завершити" in the structured reader confirms only the sections of the
  // last page: earlier ones count only if they were actually reached, so
  // skipping ahead no longer reads as "опрацьовано".
  const handleFinishStructured = () => {
    if (!guide?.guideContent) return;
    void recordViews(lastPageSectionKeys(groupIntoSections(guide.guideContent), SECTIONS_PER_PAGE));
  };
  // Uploaded PDF: the person says so themselves.
  const handleMarkCompleted = () => {
    void recordViews(sectionKeys);
  };

  // the author may switch downloading off: the guide is then read on the site only
  const canDownload = guide.allowDownload !== false;
  const handleDownload = async () => {
    if (!canDownload || downloading || !session?.profile?.id) return;
    setDownloading(true);
    setSaveError(null);
    try {
      let recorded: boolean;
      if (isStructured && guide.guideContent) {
        // A structured guide has no uploaded file: its PDF is rendered from
        // the same content (static version), flattened and marked per copy.
        // Register first, build second: no copy exists without its record.
        const issued = await issuePdfMark("guide_pdf", guide.id);
        const blob = await getGuidePdfRenderer().render({
          guideId: guide.id,
          mark: { token: issued.token, seed: issued.seed },
          title: guide.title,
          subtitle: guide.description,
          blocks: toStaticBlocks(guide.guideContent),
          viewer: { id: session.profile.id, name: session.profile.name, email: session.profile.email },
        });
        saveBlobAs(blob, guidePdfFileName(guide.title));
        recorded = issued.recorded;
      } else {
        ({ recorded } = await downloadProtectedPdf({
          kind: "uploaded_pdf",
          contentId: guide.id,
          title: guide.title,
          url: pdf.url,
          viewer: session.profile,
        }));
      }
      if (!recorded) setSaveError(JOURNAL_MISSING_NOTICE);
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const toggleSave = async () => {
    if (!userId || savePending) return;
    setSavePending(true);
    setSaveError(null);
    try {
      if (saveRowId) {
        await removeSavedGuide(saveRowId);
        setSaveRowId(null);
      } else {
        const row = await addSavedGuide({ guideId: guide.id, guideTitle: guide.title, userId });
        setSaveRowId(row.id);
      }
      onSavedChange?.();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSavePending(false);
    }
  };

  const openRelated = (kind: RelatedKind, id: string) => {
    if (kind === "meditation") onOpenMeditationLink?.(id);
    else if (kind === "program") onOpenProgramLink?.(id);
    else onOpenGuideLink?.(id);
  };

  const hasWho = (guide.relevantIf?.length ?? 0) > 0;
  const hasOutcomes = (guide.outcomes?.length ?? 0) > 0;
  // Guide-specific outcomes first; the universal "you keep the PDF" line
  // is always true of this product, so it's added here rather than
  // authored per guide.
  const outcomes = hasOutcomes
    ? [...(guide.outcomes ?? []), "PDF, до якого можна повернутися у потрібний момент"]
    : [];

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
      {/* Same document.body portal + true position:fixed pattern as
          MeditationExperience/ProgramExperience — see those files for
          why (an ancestor's page-transition animation otherwise hijacks
          fixed positioning). */}
      <div className="fixed top-0 inset-x-0 z-20 bg-white/80 backdrop-blur-md border-b border-black/5 px-5 md:px-10 py-3 flex items-center justify-between">
        <button
          onClick={onClose}
          className="text-[13px] font-medium text-black/60 hover:text-black transition inline-flex items-center gap-1.5"
        >
          <ArrowLeftIcon size={15} />
          Моє навчання
        </button>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-black/60 transition inline-flex items-center justify-center"
          aria-label="Закрити"
        >
          <CloseIcon size={15} />
        </button>
      </div>

      <div className="pt-[120px] md:pt-[136px] px-3 md:px-8 pb-14">
        <div className="max-w-[1280px] mx-auto bg-[#f8f9fe] rounded-[28px] md:rounded-[34px] shadow-[0_30px_80px_rgba(10,10,40,0.28)] overflow-hidden">
          {/* ---------------- HERO ---------------- */}
          <header className="bg-gradient-to-br from-[#e9eeff] via-[#f3f1ff] to-[#f8f9fe] px-6 md:px-14 py-8 md:py-12">
            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
              {/* Visual first on small screens, to the right on large */}
              <div className="order-first lg:order-last">
                <GuidePdfVisual
                  title={guide.title}
                  author={authorName}
                  category={category}
                  tag={guide.tags[0]}
                  pdf={pdf}
                  structuredLabel={isStructured ? "Інтерактивний гайд + PDF-версія" : undefined}
                />
              </div>

              <div>
                <div className="text-[12px] font-semibold text-indigo-500/80 uppercase tracking-[0.14em] mb-3">
                  {category}
                </div>
                <h1 className="text-[32px] md:text-[44px] leading-[1.08] font-bold tracking-tight text-black mb-4">
                  {guide.title}
                </h1>
                <p className="text-[15px] md:text-[16.5px] leading-relaxed text-black/55 max-w-[520px] mb-5">
                  {guide.description}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-black/45 mb-7">
                  <span>{metaParts.join(" · ")}</span>
                  {isCompleted && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                      <span className="text-black/25">·</span>
                      <CheckIcon size={13} />
                      Опрацьовано
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleOpen}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white text-[15px] font-semibold shadow-[0_10px_28px_rgba(79,70,229,0.35)] hover:opacity-90 transition"
                  >
                    Відкрити гайд
                    <ArrowRightIcon size={17} />
                  </button>
                  <button
                    onClick={toggleSave}
                    disabled={!userId || savePending}
                    className={SECONDARY_BUTTON}
                    aria-pressed={!!saveRowId}
                  >
                    <BookmarkIcon filled={!!saveRowId} />
                    {saveRowId ? "Збережено" : "Зберегти"}
                  </button>
                  {canDownload && (
                    <button onClick={handleDownload} disabled={downloading || !userId} className={SECONDARY_BUTTON}>
                      <DownloadIcon />
                      {downloading ? (isStructured ? "Готуємо PDF…" : "Завантажуємо…") : isStructured ? "PDF-версія" : "Завантажити PDF"}
                    </button>
                  )}
                </div>
                {saveError && <div className="text-[12px] text-red-500 mt-3">{saveError}</div>}
              </div>
            </div>
          </header>

          <div className="px-6 md:px-14 py-10 md:py-12 flex flex-col gap-12 md:gap-14">
            {/* ---------------- ЩО ВСЕРЕДИНІ ---------------- */}
            {outline.length > 0 && (
              <section>
                <h2 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-black/85 mb-5">
                  Що всередині
                </h2>
                <ol className="grid md:grid-cols-2 gap-x-14">
                  {outline.map((item, index) => (
                    <li key={index} className="flex items-baseline gap-4 border-t border-black/[0.08] py-4">
                      <span className="text-[20px] font-light tabular-nums text-indigo-300 w-8 shrink-0">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="text-[16px] font-semibold leading-snug text-black/85">{item.title}</div>
                        {item.summary && (
                          <p className="text-[13.5px] leading-relaxed text-black/50 mt-1">{item.summary}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* ---------------- ПОДИВІТЬСЯ ВСЕРЕДИНУ ---------------- */}
            <GuidePdfPreviewPages pages={pdf.previewPages.length > 0 ? pdf.previewPages : generatedPreview} />

            {/* ---------------- ДЛЯ КОГО + ПІСЛЯ ГАЙДУ ---------------- */}
            {(hasWho || hasOutcomes) && (
              <section
                className={`rounded-[24px] border border-[#e3e6f4] bg-white shadow-[0_10px_28px_-20px_rgba(40,30,110,0.35)] grid ${
                  hasWho && hasOutcomes ? "md:grid-cols-2 md:divide-x divide-[#e3e6f4]" : ""
                }`}
              >
                {hasWho && (
                  <div className="px-6 md:px-8 py-6 md:py-7">
                    <h2 className="text-[16px] md:text-[17px] font-semibold tracking-tight text-black/85 mb-3">
                      Цей гайд може бути корисним, якщо ви:
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {guide.relevantIf!.map((situation, i) => (
                        <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-black/65">
                          <span className="mt-[8px] w-1.5 h-1.5 rounded-full bg-gradient-to-br from-[#2f6bff] to-[#8b5cf6] shrink-0" />
                          <span>{situation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasOutcomes && (
                  <div className="px-6 md:px-8 py-6 md:py-7 border-t md:border-t-0 border-[#e3e6f4]">
                    <h2 className="text-[16px] md:text-[17px] font-semibold tracking-tight text-black/85 mb-3">
                      Після гайду у вас буде
                    </h2>
                    <ol className="flex flex-col gap-2.5">
                      {outcomes.map((outcome, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="text-[12px] font-semibold tracking-[0.12em] text-indigo-400 pt-[3px] shrink-0">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="text-[14px] leading-relaxed text-black/70">{outcome}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}

            {/* ---------------- АВТОР ---------------- */}
            <section className="rounded-[24px] border border-[#e3e6f4] bg-white shadow-[0_10px_28px_-20px_rgba(40,30,110,0.35)] px-6 md:px-8 py-6 md:py-7">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar
                  avatarUrl={authorCard?.avatarUrl ?? null}
                  initials={getInitials(authorName)}
                  className="w-14 h-14 text-[18px] text-white"
                />
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] font-semibold text-black/35 uppercase tracking-[0.14em] mb-0.5">
                    Автор
                  </div>
                  <div className="text-[19px] md:text-[20px] font-semibold tracking-tight text-black/90 flex items-center gap-2">
                    {authorName}
                    {authorCard?.verified && (
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white"
                        title="Перевірений автор"
                      >
                        <CheckIcon size={12} />
                      </span>
                    )}
                  </div>
                  {authorLine && <div className="text-[13px] text-black/50 mt-0.5 max-w-[560px]">{authorLine}</div>}
                  {authorCard?.bio && (
                    <p className="text-[13.5px] leading-relaxed text-black/60 mt-1.5 max-w-[620px] line-clamp-2">
                      {authorCard.bio}
                    </p>
                  )}
                </div>
                {guideAuthorId && (
                  <button
                    onClick={() => (onOpenAuthorProfile ?? openAuthorProfileCtx)(guideAuthorId)}
                    className="inline-flex items-center gap-2 text-[13.5px] font-medium text-indigo-600 hover:text-indigo-700 transition"
                  >
                    Переглянути профіль
                    <ArrowRightIcon size={15} />
                  </button>
                )}
              </div>
              {/* "Запитати автора" — renders nothing unless this guide has a
                  real author account behind it (own divider/spacing
                  included, see AskAuthorBox itself). */}
              <AskAuthorBox
                authorId={guideAuthorId}
                contentId={guide.id}
                userId={userId}
                promptLabel="Є питання щодо цього гайда?"
                placeholder="Напишіть автору гайда…"
                collapsible
              />
            </section>

            {/* ---------------- РАЗОМ ІЗ ЦИМ ГАЙДОМ ---------------- */}
            {related.length > 0 && (
              <section>
                <h2 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-black/85 mb-5">
                  Може бути корисно разом із цим гайдом
                </h2>
                <GuideRelatedTiles items={related} onOpen={openRelated} />
              </section>
            )}

            {/* ---------------- FEEDBACK ---------------- */}
            <div className="border-t border-black/[0.07] pt-8">
              <GuideFeedbackSection guideId={guide.id} guideTitle={guide.title} userId={userId} />
            </div>
          </div>
        </div>
      </div>

      {readerOpen && isStructured && guide.guideContent && (
        <GuideInteractiveReader
          guideId={guide.id}
          title={guide.title}
          content={guide.guideContent}
          userId={userId}
          related={related}
          onClose={() => setReaderOpen(false)}
          onOpenRelated={openRelated}
          onSectionSeen={(sectionKey) => void recordViews([sectionKey])}
          onDownloadPdf={canDownload ? handleDownload : undefined}
          downloading={downloading}
          downloadError={saveError}
          viewedKeys={viewedKeys}
          initialTarget={initialTarget ?? undefined}
          onFinish={() => {
            handleFinishStructured();
            setReaderOpen(false);
          }}
        />
      )}
      {readerOpen && !isStructured && (
        <GuidePdfReader
          guideId={guide.id}
          title={guide.title}
          pdf={pdf}
          onClose={() => setReaderOpen(false)}
          onMarkCompleted={userId && totalSections > 0 ? handleMarkCompleted : undefined}
          isCompleted={isCompleted}
        />
      )}
    </div>,
    document.body
  );
}
