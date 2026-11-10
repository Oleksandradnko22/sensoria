import { coverImageStyle, coverUrlForFrame } from "../../utils/coverFocus";
import { checklistItems, splitChecklist } from "../../utils/lessonChecklist";
// The actual program "проходження" player — distinct from
// ProgramDetailPage (which is the public catalog/marketing preview
// before buying/starting). Opened from "Моє навчання" for a program
// the participant is already enrolled in. See Sasha's Core Content
// Experience spec: a program is a sequential personal path
// (module -> content item), with its own overview/item/completion
// states — not a generic "viewer" shared with meditations or guides.
//
// Rendered as a dedicated full-window screen (not a floating modal) —
// per Sasha's "для каждой нужно отдельное полное окно" request, with
// the two-screen shape (syllabus overview / lesson player) loosely
// inspired by a reference course platform she shared, reinterpreted in
// Sensoria's own blue-purple visual language. Deliberately NOT 1:1:
// no points/score stat (Sasha's original spec explicitly rules out
// badges/scores/competitive tracking — "progress нужен для навигации,
// а не для давления"), no fake "bookmark" affordance that would do
// nothing, no photoreal stock illustration.
//
// Two data sources feed this screen: the demo catalog
// (data/programModules.ts, synchronous, checked first) and real
// authored programs (content_modules + content_items in Supabase,
// fetched async via lib/publicContent.ts — see the realProgram/
// realModules state below). A real program only has anything to play
// here once its author has actually added lessons through
// AuthorCourseEditor's per-module "Уроки" section; until then this
// still shows the honest "ще немає покрокового проходження" empty
// state rather than fabricating a fake player.

import ContentReportButton from "../ContentReportButton";
import { Icon } from "../ui/Icon";
import { pluralUk } from "../../utils/plural";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { programs } from "../../data/programs";
import { categoryLabels } from "../../data/categoryLabels";
import { getContentAccent } from "../../data/contentAccents";
import type { Program } from "../../data/programs";
import { getProgramModules } from "../../lib/programProgress";
import {
  computeProgress,
  flattenModules,
  formatDuration,
  getNextItem,
  isItemLocked,
  isModuleDone,
  isModuleLocked,
  isResolved,
  type FlatItemRef,
} from "../../lib/contentProgress";
import { fetchWarningAck, ackWarning } from "../../lib/warningAcks";
import type { ContentItem, ContentModule } from "../../data/contentTypes";
import { fetchProgramById, fetchProgramItems, type PublicProgram } from "../../lib/publicContent";
import { getInitials, type Profile } from "../../lib/auth";
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl, getYouTubeVideoId } from "../../lib/youtube";
import { loadYouTubeIframeApi, type YouTubePlayer } from "../../lib/youtubePlayerApi";
import { fetchVideoPosition, saveVideoPosition, clearVideoPosition, type VideoPosition } from "../../lib/videoPositions";
import Avatar from "../ui/Avatar";
import CircularProgress from "../ui/CircularProgress";
import { CompletionBadgeIcon, StarIcon } from "./lessonIcons";
import { fetchItemFeedback, submitItemFeedback as persistItemFeedback, type FeedbackValue } from "../../lib/itemFeedback";
import {
  countPracticeResponsesForProgram,
} from "../../lib/practiceResponses";
import {
  fetchProgramCompletion,
  recordProgramCompletion,
  type ProgramCompletionSnapshot,
  type ProgramCompletionModuleSnapshot,
} from "../../lib/programCompletions";
import { downloadElementAsPdf } from "../../lib/pdfExport";
import ContentShield from "./ContentShield";
import { NotHelpfulDialog } from "./ProgramLessonDialogs";
import LessonComments from "./LessonComments";
import LessonPractice from "./LessonPractice";
import { useProgramProgress } from "./useProgramProgress";
import ProgramModulesPath from "./ProgramModulesPath";
import { typeLabel } from "./programItemTypes";
import ProtectedPdfActions from "./ProtectedPdfActions";
import {
  fetchReflectionsForItem,
  submitReflection as persistReflection,
  fetchAllReflections,
  type Reflection,
} from "../../lib/reflections";
import {
  fetchMoodAverageForProgram,
  type MoodProgramAverage,
} from "../../lib/moodCheckins";
import { countReflectionsForProgram } from "../../lib/reflections";
import {
  fetchBookmarksForProgram,
  addBookmark,
  removeBookmark,
  type Bookmark,
} from "../../lib/bookmarks";
import {
  fetchSavedPracticesForProgram,
  addSavedPractice,
  removeSavedPractice,
  type SavedPractice,
} from "../../lib/savedPractices";
import { moderateMessage } from "../../utils/contactFilter";
import { formatRelativeTime } from "../../utils/relativeTime";
import { fetchReviewsForContentIds } from "../../lib/reviews";
import AskAuthorBox from "./AskAuthorBox";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import { fetchAllSavedGuides } from "../../lib/guideSaves";
import { fetchAllSavedPrograms, addSavedProgram, removeSavedProgram } from "../../lib/programSaves";
import { recommendGuideAfterProgram } from "../../utils/behaviorRecommendations";
import type { Guide } from "../../data/guides";
import { errorMessage } from "../../lib/errorMessage";
import { logContentAccess } from "../../lib/accessLog";

type Props = {
  programId: string;
  onClose: () => void;
  session?: Profile | null;
  // "Що далі?" (overview panel + the completion report) — sends the
  // person back into the assessment funnel to check their state again,
  // same wiring as ParticipantOverview's own retake entry (App.tsx's
  // openTest).
  onRetakeAssessment?: () => void;
  // "Що далі?"'s other option — opens the public catalog pre-filtered
  // to this program's own category tags (program.tags), so "схожі
  // курси" actually means something instead of the whole catalog.
  onSearchSimilar?: (categories: string[]) => void;
  // Deep-link straight into one specific lesson instead of landing on
  // the overview — used by "Ваші спостереження" (ParticipantReflections.tsx)
  // so a saved note or mood check-in opens exactly where it was left,
  // not just the program in general. Ignored if the item isn't found
  // (e.g. content changed since the note was saved) — falls back to the
  // normal overview rather than erroring.
  initialItemId?: string;
  // Where inside that lesson to land: the "Спробуйте зараз" practice block
  // (a saved answer) or the private "Ваше спостереження" note field.
  // A "note:<id>" anchor lands on that exact saved entry in the lesson's
  // note log (falls back to the note block if the entry is not there).
  initialAnchor?: string;
  // Lets the completion report screen's "Ваші збережені практики" /
  // "Ваші спостереження" links switch the dashboard's own section
  // instead of just closing the player — same onNavigate pattern
  // ParticipantOverview/Bookmarks/MyPractice already use. Narrower than
  // the dashboard's full SectionKey union since this is the only thing
  // ProgramExperience ever needs to jump to.
  onNavigate?: (section: "saved" | "reflections") => void;
  // "Спробуйте цей гайд далі" (2026-09-09, per Sasha's explicit
  // context-recommendation spec) — opens a guide straight in-place, the
  // same in-dashboard overlay "Моє навчання" itself uses, not the
  // leave-the-dashboard onOpenGuide App.tsx passes elsewhere. Optional
  // so this screen still renders fine without it (the card just doesn't
  // show, same fallback shape as onNavigate).
  onOpenGuide?: (guideId: string) => void;
  // Gift lessons (an author's meditation included in the program) open the meditation page.
  onOpenMeditation?: (meditationId: string) => void;
};

// "12:34" / "1:02:03" for the video poster's "Продовжити з ..." label —
// hours only shown once there actually are any, matching how most
// video players format a scrubber's current-time readout.
function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// Hand-drawn vector icons (lessonIcons.tsx) instead of raw emoji —
// matches the rest of the app's custom icon language (contentAccents.tsx)
// and renders identically across platforms, unlike full-color emoji.

// Ukrainian 1/2-4/5+ plural pattern for the completion report's
// "N практик(и/у) виконано" / "N рефлексій(ї/ю) залишено" stat tiles
// (ProgramExperience.tsx's "completed" view).
function practiceCountLabel(n: number): string {
  return `${n} ${pluralUk(n, "практику", "практики", "практик")} виконано`;
}

function reflectionCountLabel(n: number): string {
  return `${n} ${pluralUk(n, "рефлексію", "рефлексії", "рефлексій")} залишено`;
}

type View = "overview" | "item" | "completed";

export default function ProgramExperience({
  programId,
  onClose,
  session,
  onRetakeAssessment,
  onSearchSimilar,
  initialItemId,
  initialAnchor,
  onNavigate,
  onOpenGuide,
  onOpenMeditation,
}: Props) {
  const openAuthorProfile = useOpenAuthorProfile();
  // Chargeback evidence: time, user and IP of opening paid content (server-side).
  useEffect(() => {
    logContentAccess(programId, "open");
  }, [programId]);
  // Tell every screen that shows progress (program page, "Моє навчання") to re-read it when the player closes.
  useEffect(() => () => void window.dispatchEvent(new Event("sensoria:progress-changed")), []);
  // Demo catalog is checked first (synchronous, instant) — most ids
  // opened from "Моє навчання" today are still demo ones. Real programs
  // (realProgram/realModules below) are fetched async and only used
  // once the demo lookup comes back empty.
  const demoProgram = programs.find((p) => p.id === programId);
  const demoModules = getProgramModules(programId);
  const [realProgram, setRealProgram] = useState<PublicProgram | null>(null);
  const [realModules, setRealModules] = useState<ContentModule[] | null>(null);
  // Only meaningful while there's no demo match — distinguishes "still
  // fetching a real program" from "genuinely nothing to show", so the
  // empty-state card below doesn't flash before the real fetch resolves.
  const [loadingReal, setLoadingReal] = useState(!demoProgram);

  const program: Program | undefined = demoProgram ?? realProgram ?? undefined;
  const modules = demoModules ?? realModules;

  // Fetches the real program + its authored lessons in parallel once,
  // only when this id isn't in the demo catalog. Guarded with a
  // cancelled flag (same pattern as the ratingInfo/comments effects
  // further down) so a fast programId change doesn't let a slow
  // response overwrite newer state.
  useEffect(() => {
    if (demoProgram) {
      setLoadingReal(false);
      return;
    }
    let cancelled = false;
    setLoadingReal(true);
    Promise.all([fetchProgramById(programId), fetchProgramItems(programId)])
      .then(([programRow, items]) => {
        if (cancelled) return;
        setRealProgram(programRow);
        setRealModules(items);
      })
      .catch(() => {
        if (!cancelled) {
          setRealProgram(null);
          setRealModules(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingReal(false);
      });
    return () => {
      cancelled = true;
    };
    // demoProgram is derived fresh from programId every render (not
    // itself reactive state), so keying this only on programId is
    // correct and avoids re-running when unrelated state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  const { progress, markOpened, markCompleted, markSkipped } = useProgramProgress(programId, session?.id);
  const [view, setView] = useState<View>("overview");
  const [openItem, setOpenItem] = useState<FlatItemRef | null>(null);
  const [justCompletedItem, setJustCompletedItem] = useState(false);

  // Lesson Player screen (view === "item") local UI state — declared up
  // here with the other hooks (not inside the conditional JSX below) per
  // rules-of-hooks, even though only that view reads them. Reset per
  // item via the useEffect further down.
  const [videoStarted, setVideoStarted] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // "Повернутися пізніше" — the position (seconds) this item's video
  // was last left at, fetched once per item open. null means either
  // "no video watched yet" or "not loaded yet"; both render the same
  // "Почати" poster, so no separate loading state is needed here.
  const [savedVideoPosition, setSavedVideoPosition] = useState<VideoPosition | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const positionIntervalRef = useRef<number | null>(null);
  const [itemFeedback, setItemFeedback] = useState<FeedbackValue | null>(null);
  // "Не зовсім" opens a small follow-up window asking what specifically
  // didn't work instead of persisting immediately — see the modal near
  // the bottom of this component's JSX.
  const [showNotHelpfulModal, setShowNotHelpfulModal] = useState(false);
  // A visible notice when a write the person just made did not reach the
  // server (feedback, practice answer, reflection, bookmark, comment…).
  // These used to fail silently: the screen looked saved and the data was gone.
  const [writeNotice, setWriteNotice] = useState<string | null>(null);
  const writeNoticeTimer = useRef<number | null>(null);
  const notifyWriteFailed = (what: string) => {
    setWriteNotice(`Не вдалося зберегти ${what}. Перевірте з'єднання й спробуйте ще раз.`);
    if (writeNoticeTimer.current) window.clearTimeout(writeNoticeTimer.current);
    writeNoticeTimer.current = window.setTimeout(() => setWriteNotice(null), 7000);
  };
  const [notHelpfulReason, setNotHelpfulReason] = useState("");
  const [notHelpfulWarning, setNotHelpfulWarning] = useState<string | null>(null);
  // "Що я помітив? Що змінилося?" — a free-text observation journal,
  // separate from (and independent of) the structured practice (LessonPractice).
  // Append-only: itemReflections is this lesson's own saved history,
  // newest first, shown right under the form so a save feels like
  // adding to something real. See lib/reflections.ts for why every
  // "Зберегти нотатку" tap is a new row instead of overwriting one.
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [itemReflections, setItemReflections] = useState<Reflection[]>([]);
  const [reflectionSaving, setReflectionSaving] = useState(false);
  // "Перед початком" content warning gate — starts false (unacknowledged)
  // on every item open; the fetch effect below flips it true immediately
  // for items with no contentWarning at all (nothing to gate), or once
  // a stored ack is found for items that do have one.
  const [warningAcked, setWarningAcked] = useState(false);
  // "Закладки" — one Map<itemId, Bookmark> per program, reused both for
  // the item view's star toggle and the small indicator on bookmarked
  // rows in "Ваш шлях" below, rather than fetching per-item every time
  // an item opens (see lib/bookmarks.ts's fetchBookmarksForProgram).
  const [bookmarksById, setBookmarksById] = useState<Map<string, Bookmark>>(new Map());
  // "Моя практика" — which of this program's audio/video items the
  // person has chosen to keep using past course completion (see the
  // "Що хочете залишити собі?" checklist on the completed screen
  // below). Same one-Map-per-program pattern as bookmarksById.
  const [savedPracticesById, setSavedPracticesById] = useState<Map<string, SavedPractice>>(new Map());

  const flat = useMemo(() => (modules ? flattenModules(modules) : []), [modules]);
  const summary = useMemo(
    () => (modules ? computeProgress(modules, progress) : null),
    [modules, progress]
  );

  // Which syllabus modules are expanded — defaults to just the current
  // (in-progress) one, matching the reference's "everything collapsed
  // except where you are" pattern instead of dumping all modules open
  // at once.
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>(() =>
    summary ? { [summary.currentModuleIndex]: true } : {}
  );
  const toggleModule = (mi: number) =>
    setExpandedModules((prev) => ({ ...prev, [mi]: !prev[mi] }));

  // itemId -> item, so the lesson sidebar / remaining-time stat can
  // look up duration without re-flattening modules each time.
  const itemById = useMemo(() => {
    const m = new Map<string, ContentItem>();
    modules?.forEach((mod) => mod.items.forEach((it) => m.set(it.id, it)));
    return m;
  }, [modules]);

  // Real average rating from the actual reviews table instead of a
  // hardcoded "⭐ 4.9" that never changed for any program. Demo catalog
  // programs (stress-course, mindfulness-course, etc.) have no matching
  // row in the real `content` table, so this naturally comes back empty
  // for them — the meta line below simply omits the rating rather than
  // showing a fabricated number, exactly the same "honest, not invented"
  // rule already applied everywhere else in this file.
  const [ratingInfo, setRatingInfo] = useState<{ average: number; count: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchReviewsForContentIds([programId])
      .then((rows) => {
        if (cancelled) return;
        if (rows.length === 0) {
          setRatingInfo(null);
          return;
        }
        const average = rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
        setRatingInfo({ average, count: rows.length });
      })
      .catch(() => {
        if (!cancelled) setRatingInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // Personal-progress facts beyond the bare % — what someone actually
  // did here, not a score. Same cancelled-guard pattern as ratingInfo
  // above, but scoped to this person (session.id), not public.
  // Re-fetches on every return to "overview" AND on reaching "completed"
  // (not just once on mount) — otherwise writing a note or a mood
  // check-in mid-lesson and coming straight back, or finishing the very
  // last item, would show a stale count from before that save. The
  // completion report screen (view === "completed") is what actually
  // needs practiceResponsesCount — overview doesn't show it today, but
  // fetching it alongside the other two here avoids a second near-
  // identical effect.
  const [reflectionsCount, setReflectionsCount] = useState(0);
  const [practiceResponsesCount, setPracticeResponsesCount] = useState(0);
  const [moodAverage, setMoodAverage] = useState<MoodProgramAverage | null>(null);
  useEffect(() => {
    if (!session?.id || (view !== "overview" && view !== "completed")) return;
    let cancelled = false;
    countReflectionsForProgram(programId, session.id).then((n) => {
      if (!cancelled) setReflectionsCount(n);
    });
    countPracticeResponsesForProgram(programId, session.id).then((n) => {
      if (!cancelled) setPracticeResponsesCount(n);
    });
    fetchMoodAverageForProgram(programId, session.id).then((avg) => {
      if (!cancelled) setMoodAverage(avg);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, session?.id, view]);

  // The frozen "Підсумок програми" report (see lib/programCompletions.ts)
  // — fetched unconditionally, not view-gated like the live facts above,
  // since the overview screen's own "Підсумок програми" button needs to
  // know right away whether a report already exists, and the completed
  // view needs it the instant it opens rather than waiting on a view
  // change. completionSnapshotChecked distinguishes "still loading" from
  // "confirmed there's no snapshot yet" — the recording effect further
  // below relies on that to avoid firing twice.
  const [completionSnapshot, setCompletionSnapshot] = useState<ProgramCompletionSnapshot | null>(null);
  const [completionSnapshotChecked, setCompletionSnapshotChecked] = useState(false);
  // "Завантажити PDF" button state — true only while the CDN libraries
  // are loading/rendering (lib/pdfExport.ts), so the button can say
  // "Завантаження…" instead of looking like nothing happened on click.
  const [pdfExporting, setPdfExporting] = useState(false);
  useEffect(() => {
    if (!session?.id) {
      setCompletionSnapshotChecked(true);
      return;
    }
    let cancelled = false;
    setCompletionSnapshotChecked(false);
    fetchProgramCompletion(programId, session.id).then((snap) => {
      if (cancelled) return;
      setCompletionSnapshot(snap);
      setCompletionSnapshotChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, session?.id]);

  // "Закладки" — loaded once per program (not gated to "overview" like
  // the facts above, since the item view's own star toggle needs it
  // too), then kept fresh locally by toggleBookmark's optimistic
  // updates rather than refetched on every render.
  useEffect(() => {
    if (!session?.id) return;
    let cancelled = false;
    fetchBookmarksForProgram(programId, session.id).then((rows) => {
      if (cancelled) return;
      setBookmarksById(new Map(rows.map((b) => [b.contentItemId, b])));
    });
    fetchSavedPracticesForProgram(programId, session.id).then((rows) => {
      if (cancelled) return;
      setSavedPracticesById(new Map(rows.map((p) => [p.contentItemId, p])));
    });
    return () => {
      cancelled = true;
    };
  }, [programId, session?.id]);

  // "Зберегти програму" (lib/programSaves.ts, 2026-09-21, per Sasha's
  // Issue 1 spec) — a real save/unsave action directly on this screen,
  // not just the card in "Моє навчання". Completely independent of
  // bookmarksById/savedPracticesById above (those are per-ITEM, inside
  // a lesson) and of progress/enrollment (see programSaveId's own use
  // in the identity row below — it never reads summary/progress at
  // all). programSaveId: a string means saved (the
  // program_saved_for_later row id, for removal), null means confirmed
  // not saved, "saving" is the optimistic in-flight sentinel — same
  // shape ParticipantLearning.tsx's programSaveIds uses per-card, just
  // a single value here since this screen only ever shows one program.
  // No dedicated "fetch one" exists in lib/programSaves.ts (mirroring
  // lib/guideSaves.ts, which doesn't have one either) — the same bulk
  // fetch every list view already uses, filtered to this programId.
  const [programSaveId, setProgramSaveId] = useState<string | null>(null);
  const [programSaveError, setProgramSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.id) return;
    let cancelled = false;
    fetchAllSavedPrograms(session.id).then((rows) => {
      if (cancelled) return;
      const match = rows.find((r) => r.programId === programId);
      setProgramSaveId(match ? match.id : null);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, session?.id]);

  const toggleProgramSaved = () => {
    const userId = session?.id;
    if (!userId) {
      setProgramSaveError("Не вдалося визначити акаунт — спробуйте перезайти.");
      return;
    }
    setProgramSaveError(null);
    if (programSaveId) {
      const existingId = programSaveId;
      setProgramSaveId(null);
      removeSavedProgram(existingId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Не вдалося прибрати зі збережених:", err);
        setProgramSaveError(errorMessage(err));
        setProgramSaveId(existingId);
      });
      return;
    }
    setProgramSaveId("saving");
    addSavedProgram({ programId, programTitle: program?.title, userId })
      .then((saved) => setProgramSaveId(saved.id))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Не вдалося зберегти програму:", err);
        setProgramSaveError(errorMessage(err));
        setProgramSaveId(null);
      });
  };

  // "Спробуйте цей гайд далі" (2026-09-09, per Sasha's explicit context-
  // recommendation spec — "рекомендації формуються не тільки з
  // каталогу, а й з поведінки користувача"; her own worked example:
  // finishing «Усвідомленість у житті» surfaces a related guide).
  // Computed once the program is actually done — either the dedicated
  // "completed" report screen, or the overview's own inline completed
  // banner on a return visit (2026-09-16 design pass, per Sasha's brief
  // §11/§12: "Що далі?" should personalize using the existing engine
  // wherever it's shown, not just the one-time report). Same function,
  // same exclusion logic, just a wider trigger — no new recommendation
  // algorithm. Guides already saved (guide_saved_for_later) are excluded
  // so this never recommends something the person already keeps around.
  const [recommendedGuide, setRecommendedGuide] = useState<Guide | undefined>(undefined);
  useEffect(() => {
    const showsCompletion = view === "completed" || (view === "overview" && summary?.isCompleted === true);
    if (!showsCompletion || !program) return;
    let cancelled = false;
    const compute = (excludeIds: Set<string>) => {
      if (cancelled) return;
      setRecommendedGuide(recommendGuideAfterProgram(program.tags ?? [], excludeIds));
    };
    if (session?.id) {
      fetchAllSavedGuides(session.id)
        .then((rows) => compute(new Set(rows.map((r) => r.guideId))))
        .catch(() => compute(new Set()));
    } else {
      compute(new Set());
    }
    return () => {
      cancelled = true;
    };
  }, [view, summary?.isCompleted, program, session?.id]);

  // Re-sync all the per-item Lesson Player UI state whenever the open
  // item changes (including the very first time it's opened) — video
  // player resets to its poster, feedback/comments reload for the new
  // item's id, any open menu/modal from the previous item closes.
  // Both comments (lib/lessonComments.ts) and feedback (lib/itemFeedback.ts)
  // now come from real Supabase tables instead of localStorage, so both
  // loads are async — guarded with a cancelled flag the same way the
  // ratingInfo fetch above is, and failures (e.g. Supabase not
  // configured in this environment, or no session yet) just leave
  // things empty rather than crashing.
  useEffect(() => {
    let cancelled = false;
    setVideoStarted(false);
    setTranscriptOpen(false);
    setSavedVideoPosition(null);
    setWarningAcked(false);
    setItemFeedback(null);
    setShowNotHelpfulModal(false);
    setNotHelpfulReason("");
    setReflectionDraft("");
    setItemReflections([]);
    if (openItem) {
      if (session?.id) {
        fetchItemFeedback(openItem.itemId, session.id)
          .then((fb) => {
            if (!cancelled) setItemFeedback(fb?.value ?? null);
          })
          .catch(() => {
            if (!cancelled) setItemFeedback(null);
          });
        fetchReflectionsForItem(openItem.itemId, session.id)
          .then((rows) => {
            if (!cancelled) setItemReflections(rows);
          })
          .catch(() => {
            if (!cancelled) setItemReflections([]);
          });
        fetchVideoPosition(openItem.itemId, session.id)
          .then((pos) => {
            if (!cancelled) setSavedVideoPosition(pos);
          })
          .catch(() => {
            if (!cancelled) setSavedVideoPosition(null);
          });
        const openItemData = itemById.get(openItem.itemId);
        if (!openItemData?.contentWarning) {
          setWarningAcked(true);
        } else {
          fetchWarningAck(openItem.itemId, session.id)
            .then((acked) => {
              if (!cancelled) setWarningAcked(acked);
            })
            .catch(() => {
              if (!cancelled) setWarningAcked(false);
            });
        }
      } else {
        // No session — can't check/store an ack, so a warning simply
        // can't be gated (same "logged out" edge case every other
        // session-gated fetch above silently accepts). Doesn't block
        // the item from opening.
        setWarningAcked(!itemById.get(openItem.itemId)?.contentWarning);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [openItem?.itemId, session?.id]);

  // While a real program is still being fetched, show nothing rather
  // than flashing the "немає проходження" empty state below only to
  // replace it a moment later once the real data arrives.
  if (loadingReal) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[#f6f8ff]" />,
      document.body
    );
  }

  if (!program || !modules || !summary) {
    // Portaled straight to document.body — see the note on the main
    // return below for why (an ancestor's page-transition animation can
    // otherwise hijack position:fixed).
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[#f6f8ff] flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] rounded-[24px] bg-white p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.1)]">
          <div className="text-[16px] font-semibold mb-2">Проходження ще недоступне</div>
          <p className="text-[14px] text-black/50 mb-5">
            У цієї програми поки немає покрокового проходження — автор ще додає матеріали.
          </p>
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

  const openAt = (ref: FlatItemRef) => {
    setOpenItem(ref);
    setJustCompletedItem(false);
    setView("item");
    // Opening an untouched item makes it "У процесі" — a real signal,
    // not decorative. Never downgrades an already-completed item, and
    // never marks something done just because it was viewed (that
    // still requires the explicit "Завершити" action below).
    markOpened(ref.itemId);
  };

  // Deep-link from "Ваші спостереження" (initialItemId prop) — once the
  // flattened item list actually has entries (demo is instant, real
  // programs arrive async), jump straight to the matching item exactly
  // once. The ref guards against re-firing every time `flat` is
  // recomputed (e.g. after completing something updates progress) —
  // without it this would yank the person back to that item on every
  // subsequent re-render instead of just on arrival.
  const consumedInitialItem = useRef(false);
  useEffect(() => {
    if (consumedInitialItem.current || !initialItemId || flat.length === 0) return;
    const ref = flat.find((f) => f.itemId === initialItemId);
    if (ref) {
      consumedInitialItem.current = true;
      openAt(ref);
      // The lesson body (and its practice/notes blocks) renders and loads
      // asynchronously, so look for the target for up to ~3s, scroll once.
      if (initialAnchor) {
        // Media/blocks above the target keep loading and shifting the layout
        // after the first scroll, so the position is re-applied (instantly)
        // for ~5s — until the person scrolls or touches the page themselves.
        const OFFSET = 96;
        const find = () =>
          document.querySelector<HTMLElement>(`[data-lesson-anchor="${initialAnchor}"]`) ??
          (initialAnchor.startsWith("note:")
            ? document.querySelector<HTMLElement>('[data-lesson-anchor="notes"]')
            : null);
        // Scrolls the nearest scrollable ancestor (the lesson overlay) — or
        // the window — so the element's top sits OFFSET px below the top.
        const scrollTo = (el: HTMLElement) => {
          let box: HTMLElement | null = el.parentElement;
          while (box && !(box.scrollHeight > box.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
            box = box.parentElement;
          }
          const delta = el.getBoundingClientRect().top - (box ? box.getBoundingClientRect().top : 0) - OFFSET;
          if (box) box.scrollTop += delta;
          else window.scrollBy(0, delta);
        };
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
          const el = find();
          if (el && !userMoved) {
            const box = el.getBoundingClientRect();
            if (Math.abs(box.top - OFFSET) > 8) scrollTo(el);
            if (!highlighted && el.dataset.lessonAnchor?.startsWith("note:")) {
              highlighted = true;
              el.style.transition = "background-color 1.2s ease";
              el.style.backgroundColor = "rgba(124,58,237,0.12)";
              window.setTimeout(() => {
                el.style.backgroundColor = "";
              }, 2200);
            }
          }
          if (userMoved || ticks > 20) {
            window.clearInterval(timer);
            evs.forEach((e) => window.removeEventListener(e, stop));
          }
        }, 250);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemId, flat]);

  // The one shared "what's next" algorithm (lib/contentProgress.ts) —
  // reused here for both the hero CTA and the highlighted "Наступний"
  // row inside the current module below, instead of two separately
  // hand-rolled versions of the same logic. First non-completed item in
  // flattened module/item order; null once every required item is done.
  const nextRef = summary.isCompleted ? null : getNextItem(modules, progress);

  const openCurrent = () => {
    if (summary.isCompleted) {
      openAt(flat[0]);
      return;
    }
    if (nextRef) openAt(nextRef);
  };

  const isLocked = (ref: FlatItemRef) =>
    isItemLocked(modules, progress, ref.moduleIndex, ref.itemIndex);

  const moduleRequired = (mi: number) => modules[mi].items.filter((i) => i.isRequired);
  const moduleDone = (mi: number) => isModuleDone(modules, progress, mi);
  const moduleLocked = (mi: number) => isModuleLocked(modules, progress, mi);
  // REQUIRED items only — matches moduleDone's own definition exactly
  // (2026-09-16 technical audit, finding #2). Used together with
  // moduleRequired(mi).length as modPercent's denominator below, so the
  // module's ✓ status and its own progress bar can never disagree
  // (a module with an untouched OPTIONAL item used to read as "done"
  // via moduleDone while its bar sat short of full, since this used to
  // count ALL items — required and optional — against all-items total).
  // Still counts "skipped" alongside "completed" (isResolved) — a
  // person who declined a content warning can still finish the module,
  // same reasoning as computeProgress's own completedRequiredItems.
  const moduleCompletedCount = (mi: number) =>
    moduleRequired(mi).filter((i) => isResolved(progress[i.id] ?? "not_started")).length;

  const doneModulesCount = modules.reduce((acc, _mod, mi) => acc + (moduleDone(mi) ? 1 : 0), 0);
  // Every item across the whole program (required AND optional) — the
  // completion report's "N/N елементів" stat is deliberately broader
  // than summary.requiredItems/completedRequiredItems (which the % bar
  // is based on), since a real "what did you actually do here" tally
  // shouldn't quietly drop the optional bonus items someone also did.
  const totalItemsCount = modules.reduce((acc, mod) => acc + mod.items.length, 0);
  const doneItemsCount = modules.reduce(
    (acc, mod) => acc + mod.items.filter((it) => isResolved(progress[it.id] ?? "not_started")).length,
    0
  );
  // A skipped item isn't "still to do" either — same isResolved
  // treatment as everywhere else, so "X хв залишилось" doesn't keep
  // counting a lesson the person explicitly chose to move past.
  const remainingMinutes = flat.reduce((acc, f) => {
    if (isResolved(progress[f.itemId] ?? "not_started")) return acc;
    return acc + (itemById.get(f.itemId)?.durationMinutes ?? 0);
  }, 0);
  // Mirror of remainingMinutes above — time already spent, not time
  // left. Feeds the richer progress panel's "Ви приділили цьому X"
  // line, the first of the non-% facts (see PROGRESS below).
  const investedMinutes = flat.reduce((acc, f) => {
    if (progress[f.itemId] !== "completed") return acc;
    return acc + (itemById.get(f.itemId)?.durationMinutes ?? 0);
  }, 0);

  // Freezes the completion report's stats the FIRST moment the program
  // reaches 100% (see lib/programCompletions.ts) — waits for
  // completionSnapshotChecked so it never races the fetch effect above
  // into recording a duplicate, and bails once completionSnapshot is
  // already set (either fetched, or written by this same effect a
  // moment ago). Fetches reflections/practice counts/mood average
  // itself rather than trusting the reflectionsCount/practiceResponsesCount/
  // moodAverage state above, since those are only kept fresh while view
  // is "overview"/"completed" — and completion typically happens while
  // still in "item" view, a render or two before view actually becomes
  // "completed". investedMinutes, doneModulesCount etc. ARE already
  // fresh at this exact render (no fetch needed), since they're derived
  // straight from the progress map that just flipped isCompleted true.
  useEffect(() => {
    if (!session?.id || !summary.isCompleted || !completionSnapshotChecked || completionSnapshot) return;
    const userId = session.id;
    let cancelled = false;
    Promise.all([
      countReflectionsForProgram(programId, userId),
      countPracticeResponsesForProgram(programId, userId),
      fetchMoodAverageForProgram(programId, userId),
      fetchAllReflections(userId),
    ]).then(([reflections, practices, moodAvg, allReflections]) => {
      if (cancelled) return;
      // Two most recent notes FOR THIS PROGRAM, trimmed so the report
      // stays a short excerpt, not a full copy of "Ваші спостереження".
      const reflectionExcerpts = allReflections
        .filter((r) => r.programId === programId)
        .slice(0, 2)
        .map((r) => (r.note.length > 240 ? `${r.note.slice(0, 240)}…` : r.note));
      const modulesSnapshot: ProgramCompletionModuleSnapshot[] = modules.map((mod) => ({
        title: mod.title,
        items: mod.items.map((it) => ({
          title: it.title,
          status: progress[it.id] ?? "not_started",
          isRequired: it.isRequired,
        })),
      }));
      recordProgramCompletion({
        programId,
        programTitle: program.title,
        userId,
        modulesDone: doneModulesCount,
        modulesTotal: summary.totalModules,
        itemsDone: doneItemsCount,
        itemsTotal: totalItemsCount,
        practicesCount: practices,
        reflectionsCount: reflections,
        investedMinutes,
        moodBeforeAvg: moodAvg?.before ?? null,
        moodAfterAvg: moodAvg?.after ?? null,
        reflectionExcerpts,
        modulesSnapshot,
      }).then((snap) => {
        if (!cancelled) setCompletionSnapshot(snap);
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, summary.isCompleted, completionSnapshotChecked, completionSnapshot, programId]);

  const completeCurrentItem = () => {
    if (!openItem) return;
    const programCompleted = markCompleted(openItem.itemId, modules);
    setJustCompletedItem(true);
    if (programCompleted) {
      setView("completed");
    }
  };

  const goNext = () => {
    if (!openItem) return;
    const pos = flat.indexOf(flat.find((f) => f.itemId === openItem.itemId)!);
    const next = flat[pos + 1];
    if (next) openAt(next);
    else setView("overview");
  };

  const goPrev = () => {
    if (!openItem) return;
    const pos = flat.indexOf(flat.find((f) => f.itemId === openItem.itemId)!);
    const prev = flat[pos - 1];
    if (prev) openAt(prev);
  };

  const currentModule = modules[openItem?.moduleIndex ?? -1];
  const currentItem = currentModule?.items[openItem?.itemIndex ?? -1];

  // "Повернутися пізніше" — creates a real YouTube IFrame Player (not a
  // bare <iframe src>) once the person actually taps play, so the
  // actual playback position can be read/saved (a static src has no
  // way to know where you are). Resumes at savedVideoPosition if one
  // exists; polls every 8s while playing and also saves on pause, so a
  // closed tab loses at most a few seconds of progress. Tears itself
  // down (stops polling, destroys the player, saves one last time) the
  // moment videoStarted goes false or the item changes — nothing keeps
  // running for a lesson that isn't the one currently open.
  useEffect(() => {
    if (!videoStarted || !currentItem?.videoUrl) return;
    const videoId = getYouTubeVideoId(currentItem.videoUrl);
    if (!videoId) return;

    let cancelled = false;
    const itemId = currentItem.id;
    const userId = session?.id;

    const persistIfNotFinished = (player: YouTubePlayer) => {
      if (!userId) return;
      const position = player.getCurrentTime();
      const duration = player.getDuration();
      if (duration > 0 && position / duration > 0.97) {
        clearVideoPosition(itemId, userId).catch(() => {});
        return;
      }
      saveVideoPosition({ itemId, userId, positionSeconds: position, durationSeconds: duration || null }).catch(() => {});
    };

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled) return;
      const startAt =
        savedVideoPosition && savedVideoPosition.positionSeconds > 5
          ? Math.floor(savedVideoPosition.positionSeconds)
          : 0;
      const player = new YT.Player("yt-lesson-player", {
        videoId,
        playerVars: { autoplay: 1, start: startAt },
        events: {
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PAUSED) persistIfNotFinished(player);
            else if (event.data === YT.PlayerState.ENDED && userId) clearVideoPosition(itemId, userId).catch(() => {});
          },
        },
      });
      youtubePlayerRef.current = player;
      positionIntervalRef.current = window.setInterval(() => persistIfNotFinished(player), 8000);
    });

    return () => {
      cancelled = true;
      if (positionIntervalRef.current != null) {
        window.clearInterval(positionIntervalRef.current);
        positionIntervalRef.current = null;
      }
      if (youtubePlayerRef.current) {
        persistIfNotFinished(youtubePlayerRef.current);
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
    };
    // savedVideoPosition intentionally excluded — it's only meant to
    // seed the initial `start=`, not restart the player if it changes
    // later (e.g. from this same effect's own saves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStarted, currentItem?.id]);

  // Where the current item sits in the flattened whole-program order —
  // drives the bottom Prev/Next nav row and the "Далі"/"Завершити
  // модуль"/"Завершити програму" CTA label (section 7/8 of Sasha's
  // Lesson Player spec): the exact same flattened sequence used
  // everywhere else (getNextItem, goNext), never a separately hand-
  // rolled position. No generic noun for "lesson/item" anywhere in this
  // screen's copy — Sasha's explicit call (neither "елемент" nor
  // "урок"): a plain verb or a bare position number carries the same
  // information without needing one.
  const flatPos = openItem ? flat.findIndex((f) => f.itemId === openItem.itemId) : -1;
  const prevFlatItem = flatPos > 0 ? flat[flatPos - 1] : null;
  const nextFlatItem = flatPos >= 0 && flatPos < flat.length - 1 ? flat[flatPos + 1] : null;
  const crossesIntoNewModule = !!nextFlatItem && !!openItem && nextFlatItem.moduleIndex !== openItem.moduleIndex;
  const continueLabel = !nextFlatItem
    ? "Завершити програму"
    : crossesIntoNewModule
    ? "Завершити модуль →"
    : "Далі →";

  // "Чи був цей матеріал корисним?" — "Так" persists immediately (no
  // extra step needed for a positive signal); "Не зовсім" opens a
  // follow-up window asking what specifically didn't work (see
  // showNotHelpfulModal below) instead of persisting right away, since
  // that's the whole point Sasha asked for — the reason text is what
  // actually reaches the author, not just a bare thumbs-down.
  const submitHelpfulFeedback = () => {
    if (!currentItem || !session?.id) return;
    setItemFeedback("helpful");
    persistItemFeedback({ itemId: currentItem.id, userId: session.id, value: "helpful" }).catch(() => {
      notifyWriteFailed("відгук");
    });
  };

  const openNotHelpfulModal = () => {
    setNotHelpfulReason("");
    setNotHelpfulWarning(null);
    setShowNotHelpfulModal(true);
  };

  // Same client-side contact-info moderation as comments/messages — a
  // "what didn't work" note is still free text reaching another person
  // (eventually the author), so it goes through the same check.
  const submitNotHelpfulFeedback = () => {
    if (!currentItem || !session?.id) return;
    const reason = notHelpfulReason.trim();
    if (reason) {
      const mod = moderateMessage(reason);
      if (mod.action === "BLOCK") {
        setNotHelpfulWarning(mod.categories.includes("PROFANITY") ? "Повідомлення містить лексику, неприйнятну на Sensoria. Перефразуйте, будь ласка." : "Повідомлення не може містити контакти для спілкування поза платформою (телефон, email, соцмережі, месенджери чи посилання).");
        return;
      }
    }
    setItemFeedback("not_helpful");
    setShowNotHelpfulModal(false);
    persistItemFeedback({ itemId: currentItem.id, userId: session.id, value: "not_helpful", reason }).catch(() => {
      notifyWriteFailed("відгук");
    });
  };

  // "Що я помітив? Що змінилося?" — a private note, never read by
  // anyone but the person who wrote it (RLS is self-only, no author
  // read path exists), so unlike comments/feedback reasons this
  // deliberately skips the contact-info moderation pass — there's no
  // one on the other end for a phone number or link to reach. Appends
  // to itemReflections optimistically (server row's real id/timestamp
  // swapped in once the insert resolves) rather than waiting on the
  // round trip, then clears the draft so the form reads as "saved and
  // ready for the next one."
  const submitReflectionNote = () => {
    if (!currentItem || !session?.id) return;
    const note = reflectionDraft.trim();
    if (!note) return;
    setReflectionSaving(true);
    persistReflection({
      itemId: currentItem.id,
      userId: session.id,
      programId: program?.id,
      programTitle: program?.title,
      itemTitle: currentItem.title,
      note,
    })
      .then((saved) => {
        setItemReflections((prev) => [saved, ...prev]);
        setReflectionDraft("");
      })
      .catch(() => {
        // The draft stays in the textarea so nothing typed is lost.
        notifyWriteFailed("спостереження");
      })
      .finally(() => setReflectionSaving(false));
  };


  // "Закладки" — a plain toggle (row exists or it doesn't), applied
  // optimistically against bookmarksById so the star flips instantly;
  // a failed write just quietly reverts on the next real fetch rather
  // than blocking the tap.
  const toggleBookmark = () => {
    if (!currentItem || !session?.id) return;
    const existing = bookmarksById.get(currentItem.id);
    if (existing) {
      setBookmarksById((prev) => {
        const next = new Map(prev);
        next.delete(currentItem.id);
        return next;
      });
      removeBookmark(existing.id).catch(() => notifyWriteFailed("закладку"));
    } else {
      addBookmark({
        itemId: currentItem.id,
        userId: session.id,
        programId: program?.id,
        programTitle: program?.title,
        itemTitle: currentItem.title,
      })
        .then((saved) => {
          setBookmarksById((prev) => new Map(prev).set(currentItem.id, saved));
        })
        .catch(() => notifyWriteFailed("закладку"));
    }
  };

  // "Моя практика" — same optimistic plain-toggle shape as
  // toggleBookmark above, but takes an explicit item rather than always
  // acting on currentItem: this is offered on the completed screen's
  // checklist, over any audio/video item from the whole program, not
  // just whichever one happens to be open.
  // "Що хочете залишити собі?" now works as check-then-confirm, not an
  // instant per-checkbox toggle — Sasha's explicit call, so someone can
  // freely change their mind across several checkboxes before it
  // actually writes anything. keepSelection is null until the person
  // interacts at all (falls back to whatever's already saved, via
  // effectiveKeepSelection below); once set, it's the local draft the
  // checkboxes reflect, independent of savedPracticesById until
  // "Додати в кабінет" is pressed.
  const [keepSelection, setKeepSelection] = useState<Set<string> | null>(null);
  const [keepCommitting, setKeepCommitting] = useState(false);
  const [keepJustSaved, setKeepJustSaved] = useState(false);
  const effectiveKeepSelection = keepSelection ?? new Set(savedPracticesById.keys());

  const toggleKeepSelection = (itemId: string) => {
    setKeepJustSaved(false);
    setKeepSelection((prev) => {
      const base = prev ?? new Set(savedPracticesById.keys());
      const next = new Set(base);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // Diffs the draft selection against what's actually saved and only
  // touches the rows that changed — items newly checked get added,
  // items unchecked that were previously saved get removed, everything
  // else is left alone.
  const commitKeepSelection = async (items: ContentItem[]) => {
    if (!session?.id) return;
    const userId = session.id;
    const selected = effectiveKeepSelection;
    setKeepCommitting(true);
    try {
      for (const it of items) {
        const existing = savedPracticesById.get(it.id);
        const nowSelected = selected.has(it.id);
        if (nowSelected && !existing) {
          const saved = await addSavedPractice({
            itemId: it.id,
            userId,
            programId: program?.id,
            programTitle: program?.title,
            itemTitle: it.title,
          });
          setSavedPracticesById((prev) => new Map(prev).set(it.id, saved));
        } else if (!nowSelected && existing) {
          await removeSavedPractice(existing.id);
          setSavedPracticesById((prev) => {
            const next = new Map(prev);
            next.delete(it.id);
            return next;
          });
        }
      }
      setKeepJustSaved(true);
    } catch {
      // Leave keepJustSaved false — the button's own label already
      // reverts to enabled/"Додати в кабінет" so the person can just
      // try again, no separate error banner needed for this small a
      // save.
    } finally {
      setKeepCommitting(false);
    }
  };

  // "Повернутися до практики", not "Пройти ще раз" / "Переглянути" —
  // openCurrent (below) reopens the program from item 0, so this reads
  // as returning to something you already know and might want again,
  // not a re-take of something you already passed. Sasha's explicit
  // call: emotional wellbeing content shouldn't carry an "exam retake"
  // feeling.
  // state, not percent (2026-09-21 state-semantics fix) — percent only
  // moves once a required item is actually resolved, so it stayed 0
  // right after "Почати" even though the participant genuinely started.
  // summary.state is the one place that already knows the difference
  // (see lib/contentProgress.ts's deriveState) — never re-derived here.
  const ctaLabel = summary.isCompleted
    ? "Повернутися до практики →"
    : summary.state === "not_started"
    ? "Почати програму →"
    : "Продовжити →";

  // Rendered via a portal straight onto document.body instead of in
  // place inside ParticipantDashboardPage's tree. Without this, this
  // component sits inside App.tsx's `.page-transition` wrapper (a plain
  // div whose entrance animation touches `transform`) — while that
  // ancestor has any non-"none" transform, EVERY descendant
  // position:fixed element (including this whole screen and its top
  // bar) resolves against that ancestor's box instead of the real
  // viewport, so things that are supposed to stay pinned can drift as
  // the page scrolls. Escaping to document.body sidesteps that
  // entirely — this is always a true, viewport-fixed full window.
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] overflow-y-auto">
      <ContentShield />
      {writeNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10060] max-w-[92vw] rounded-full bg-black/85 text-white text-[13px] px-5 py-2.5 shadow-lg flex items-center gap-3"
        >
          <span>{writeNotice}</span>
          <button onClick={() => setWriteNotice(null)} className="text-white/60 hover:text-white transition" aria-label="Закрити">
            ✕
          </button>
        </div>
      )}
      {view !== "completed" && (
        <div className="fixed top-0 inset-x-0 z-20 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 md:px-10 py-3 flex items-center justify-between">
          {view === "overview" ? (
            <button
              onClick={onClose}
              className="text-[13px] font-medium text-black/60 hover:text-black transition flex items-center gap-1.5"
            >
              ← Моє навчання
            </button>
          ) : (
            <button
              onClick={() => setView("overview")}
              className="text-[13px] font-medium text-black/60 hover:text-black transition flex items-center gap-1.5"
            >
              ← {program.title}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-black/60 text-[15px] transition"
            aria-label="Закрити"
          >
            ✕
          </button>
        </div>
      )}

      {view === "overview" && (
        <div className="pt-[140px] px-6 md:px-10 pb-10">
          {/* CONTENT BLOCK — everything (cover, info, progress, module
              path) sits inside one white card floating on the brand
              gradient page background, instead of blending into it.
              Same inner content as before, just re-homed here — the per-
              section px-6/md:px-10 + max-w-[1180px] wrappers that used
              to sit directly on the page background are gone since this
              card now owns that width/padding itself. */}
          <div className="max-w-[1220px] mx-auto bg-white rounded-[28px] shadow-[0_30px_80px_rgba(10,10,40,0.25)] p-8 md:p-16">
          {/* COVER — a real horizontal cover image when the program has
              one (program.coverUrl, from content.cover_url — already
              populated by AuthorCourseEditor's upload flow for real
              authored programs). Demo programs (data/programs.ts) have
              no cover asset, so they keep the same soft gradient +
              emotional-topic icon treatment already used app-wide as the
              "no real image" fallback for content previews (see
              CourseCard.tsx's preview panel + CardAccent.tsx), just at
              cover scale instead of card scale. Deliberately no text
              overlay — title/description/etc. live below. Slightly
              shorter than before (220/300 → 180/240) — per the 2026-09-16
              design pass, the hero's job is now shared with the progress
              ring right underneath, not carried by the cover alone.
              A thin state-tinted ring around the whole cover (emerald once
              completed, blue while in progress, neutral before starting)
              is the only state signal on the visual itself — deliberately
              not a second status label duplicating the badge in the
              identity row below. The two faint concentric rings behind
              the fallback icon get an optional slow, subtle pulse while
              genuinely in progress (motion-safe only, respects
              prefers-reduced-motion, off for not-started/completed) —
              "the hero is part of the state, not just a picture" per
              Sasha's design brief, without literally reskinning the
              existing tag-based accent system (getContentAccent), which
              stays untouched. */}
          <div>
            <div
              className={`relative w-full h-[180px] md:h-[240px] rounded-[22px] overflow-hidden bg-gradient-to-br from-[#dbeafe] to-[#ede9fe] ring-1 ${
                summary.isCompleted
                  ? "ring-emerald-200"
                  : summary.state !== "not_started"
                  ? "ring-blue-200"
                  : "ring-black/5"
              }`}
            >
              {program.coverUrl ? (
                <img
                  src={coverUrlForFrame(program.coverUrl, program.coverFocus, "wide")}
                  alt=""
                  style={coverImageStyle(program.coverFocus, "wide")}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                (() => {
                  const accent = getContentAccent(program.tags);
                  const AccentIcon = accent.Icon;
                  // state, not percent (2026-09-21) — see ctaLabel's own comment.
                  const pulse = !summary.isCompleted && summary.state !== "not_started" ? "motion-safe:animate-pulse" : "";
                  return (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className={`absolute w-[260px] h-[260px] md:w-[320px] md:h-[320px] rounded-full border border-white/40 ${pulse}`} />
                      <div className={`absolute w-[160px] h-[160px] md:w-[210px] md:h-[210px] rounded-full border border-white/50 ${pulse}`} />
                      <div
                        className={`relative w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md border border-white/60 ${accent.bg} ${accent.glow}`}
                      >
                        <AccentIcon className={`w-10 h-10 ${accent.iconColor}`} />
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* IDENTITY — "Що це і де я?": category → title + status badge
              → author/rating/duration as one quiet supporting line.
              Description moved here too but capped to 2 lines — it's
              context, not the focal point anymore (per Sasha's design
              brief §13: program → experience → progress → author, never
              the reverse). */}
          <div className="pt-5 pb-1">
            <div>
              {program.tags && program.tags.length > 0 && (
                <div className="inline-flex px-3 py-1 rounded-full bg-black/[0.04] text-black/45 text-[11px] font-medium mb-3">
                  {program.tags
                    .map((tag) => categoryLabels[tag as keyof typeof categoryLabels] ?? tag)
                    .join(" • ")}
                </div>
              )}
              <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
                <h1 className="text-[28px] md:text-[30px] leading-[1.15] font-bold text-black">{program.title}</h1>
                {/* STATUS badge — the one honest word for where things
                    stand, always derived from summary.state (2026-09-21
                    state-semantics fix — percent alone can't tell "never
                    opened" from "opened but not yet completed anything",
                    since percent only moves on required-item completion;
                    summary.isCompleted still gates the "Завершено" case,
                    same as before), never a separate hand-maintained
                    flag. */}
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    summary.isCompleted
                      ? "bg-emerald-50 text-emerald-700"
                      : summary.state !== "not_started"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-black/5 text-black/50"
                  }`}
                >
                  {summary.isCompleted ? "Завершено" : summary.state !== "not_started" ? "У процесі" : "Не розпочато"}
                </span>
                {/* "Зберегти програму" (lib/programSaves.ts, 2026-09-21,
                    per Sasha's Issue 1 spec) — a real, independent
                    save/unsave action directly on this screen, not just
                    "Моє навчання"'s card. Deliberately reads only
                    programSaveId, never summary/progress/enrollment —
                    saved/started/completed stay fully independent axes,
                    exactly like the card's own toggle. */}
                <button
                  onClick={toggleProgramSaved}
                  title={programSaveId ? "Прибрати зі збережених" : "Зберегти програму"}
                  aria-label={programSaveId ? "Прибрати зі збережених" : "Зберегти програму"}
                  className="shrink-0 w-7 h-7 rounded-full border border-black/10 hover:bg-black/5 flex items-center justify-center text-[14px] transition"
                >
                  {programSaveId ? "★" : "☆"}
                </button>
              </div>
              {programSaveError && (
                <div className="mb-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12px] px-3 py-2 flex items-center justify-between gap-3">
                  <span>Не вдалося зберегти програму: {programSaveError}</span>
                  <button
                    onClick={() => setProgramSaveError(null)}
                    className="text-red-700/60 hover:text-red-700 shrink-0"
                    aria-label="Закрити"
                  >
                    ✕
                  </button>
                </div>
              )}
              {"description" in program && program.description && (
                <p className="text-black/55 text-[14px] leading-relaxed max-w-[820px] mb-3 line-clamp-2">
                  {program.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-black/40 mb-5">
                {program.authorId ? (
                  <button
                    onClick={() => openAuthorProfile(program.authorId!)}
                    title="Переглянути профіль автора"
                    className="font-medium text-black/55 hover:text-[#4338ca] hover:underline transition"
                  >
                    {program.author}
                  </button>
                ) : (
                  <span className="font-medium text-black/55">{program.author}</span>
                )}
                {ratingInfo && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <StarIcon className="w-3 h-3 text-amber-500" fill="currentColor" stroke="none" />
                      {ratingInfo.average.toFixed(1)} ({ratingInfo.count})
                    </span>
                  </>
                )}
                <span>·</span>
                <span>{program.duration}</span>
              </div>
            </div>
          </div>

          {/* PROGRESS + PRIMARY ACTION — the page's real focal point
              (Sasha's design brief §3/§15): a completion ring instead of
              a bare bar, the one number that matters read at a glance,
              and the primary CTA right next to it so "де я" and "що
              робити далі" sit in the same breath, first viewport,
              no scrolling required. Same summary.percent/isCompleted this
              screen always used — no second progress source. */}
          <div className="mb-5">
            <div className="rounded-2xl bg-[#f8f9fe] border border-[#e3e6f4] px-6 py-6 flex items-center gap-6 flex-wrap">
              <div className="relative shrink-0 w-[92px] h-[92px]">
                <CircularProgress
                  percent={summary.percent}
                  size={92}
                  strokeWidth={7}
                  tone={summary.isCompleted ? "done" : "gradient"}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[20px] font-bold text-black leading-none">{summary.percent}%</div>
                  <div className="text-[10px] text-black/40 font-medium mt-1 text-center leading-tight">
                    {summary.isCompleted ? "Завершено" : `${summary.totalModules} модулів`}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-[220px]">
                {!summary.isCompleted && nextRef ? (
                  <>
                    {/* state, not percent (2026-09-21) — see ctaLabel's own comment. */}
                    <div className="text-[11px] font-medium text-[#4338ca] uppercase tracking-wide mb-1.5">
                      {summary.state === "not_started" ? "Почати програму" : "Продовжити навчання"}
                    </div>
                    <div className="text-[11px] text-black/40 mb-0.5">Модуль {nextRef.moduleIndex + 1}</div>
                    <div className="text-[16px] font-semibold text-black/85 truncate">
                      {modules[nextRef.moduleIndex].items[nextRef.itemIndex].title}
                    </div>
                    <div className="text-[12px] text-black/40 mt-0.5">
                      {itemById.get(nextRef.itemId)?.durationMinutes
                        ? `${formatDuration(itemById.get(nextRef.itemId)!.durationMinutes!)} · `
                        : ""}
                      {summary.state === "not_started" ? "Починаємо" : "Продовжуємо"}
                      {remainingMinutes > 0 ? ` · ${formatDuration(remainingMinutes)} залишилось` : ""}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-medium text-black/55 mb-1">Ваш прогрес</div>
                    <div className="text-[13px] text-black/45">Ви завершили все обов'язкове в цій програмі</div>
                  </>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                {!summary.isCompleted && nextRef ? (
                  <button
                    onClick={openCurrent}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[13px] font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2"
                  >
                    {ctaLabel}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={openCurrent}
                      className="px-5 py-2.5 rounded-xl border border-black/10 text-[13px] font-medium text-black/70 hover:bg-black/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
                    >
                      Переглянути програму
                    </button>
                    {/* Always reachable here once the program is done, not
                        just right after finishing the last item — a report
                        someone reaches for weeks later should be exactly
                        as reachable as the moment it was made, per Sasha's
                        explicit call. Opens the same "completed" view,
                        reading its stats from the frozen snapshot. Framed
                        as the actual next step (per design brief §8), not
                        a second "come back here" link — the quiet button
                        above already covers that. */}
                    <button
                      onClick={() => setView("completed")}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[13px] font-semibold hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2"
                    >
                      Перейти до наступного кроку →
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* YOUR PATH — module-by-module route through the program.
              Each module is a full stage (not a small accordion card):
              status, title, description, item count/duration and its
              own progress bar are always visible; only its content-item
              list toggles. Completed/future modules collapsed by
              default, the current one opens automatically. Nothing here
              assumes a fixed module or item count — it maps whatever
              `modules` actually contains, 1 through however many. */}
          <div className="pb-0">
            <h2 className="text-[17px] font-semibold mb-4">Ваш шлях</h2>
            <ProgramModulesPath
              modules={modules}
              summary={summary}
              progress={progress}
              nextRef={nextRef}
              expandedModules={expandedModules}
              onToggleModule={toggleModule}
              moduleDone={moduleDone}
              moduleLocked={moduleLocked}
              moduleRequired={moduleRequired}
              moduleCompletedCount={moduleCompletedCount}
              isLocked={isLocked}
              onOpenItem={openAt}
              isBookmarked={(id) => bookmarksById.has(id)}
            />

            {/* PROGRAM COMPLETED — shown once nothing required is left,
                including on return visits (not just the one-time
                celebration after finishing the last item — see the
                separate `view === "completed"` screen for that moment).
                "Що далі?" offers the two things that actually make
                sense right after finishing emotional-wellbeing content:
                check whether your state changed (the assessment funnel,
                same one ParticipantOverview links to), or continue the
                journey. The second option personalizes itself
                (2026-09-16 design pass, per Sasha's explicit brief §11/
                §12) using the SAME existing recommendation engine the
                "completed" report screen already calls — recommendedGuide
                is computed once per completion via recommendGuideAfterProgram
                (utils/behaviorRecommendations.ts), reused as-is, not
                duplicated. Falls back to the plain catalog search only
                when that engine genuinely has nothing to suggest, per the
                brief's own explicit fallback rule. */}
            {summary.isCompleted && (
              <div className="mt-6 rounded-2xl bg-white border border-emerald-100 p-6">
                <div className="text-[13px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                  Програму завершено ✓
                </div>
                <p className="text-[14px] text-black/60 leading-relaxed mb-5 max-w-[560px]">
                  Ви пройшли всі обов'язкові матеріали. Можете повернутися до практик у будь-який момент або продовжити свій шлях.
                </p>
                <div className="text-[13px] font-medium text-black/45 mb-3">Що далі?</div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => onRetakeAssessment?.()}
                    className="shine-btn group flex items-center gap-3 text-left rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white px-4 py-3 shadow-[0_8px_20px_rgba(99,102,241,0.35)] hover:shadow-[0_10px_26px_rgba(99,102,241,0.45)] hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <span className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-[16px] shrink-0">
                      <Icon name="refresh" size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] text-white/70">Ваш стан</span>
                      <span className="block text-[13px] font-semibold">Пройти тест ще раз</span>
                    </span>
                  </button>
                  {recommendedGuide && onOpenGuide ? (
                    <button
                      onClick={() => onOpenGuide(recommendedGuide.id)}
                      className="group flex items-center gap-3 text-left rounded-2xl border border-teal-900/10 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-3 hover:border-teal-900/20 hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[16px] shrink-0 shadow-sm">
                        <Icon name="guide" size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] text-teal-700/70">Підібрано для вас</span>
                        <span className="block text-[13px] font-semibold text-black/80 truncate">{recommendedGuide.title}</span>
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onSearchSimilar?.(program.tags ?? [])}
                      className="group flex items-center gap-3 text-left rounded-2xl border-2 border-blue-500/70 bg-white px-4 py-3 shadow-[0_4px_14px_rgba(59,130,246,0.1)] hover:border-blue-500 hover:shadow-[0_8px_20px_rgba(59,130,246,0.18)] hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[16px] shrink-0">
                        <Icon name="search" size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] text-blue-500/70">Каталог</span>
                        <span className="block text-[13px] font-semibold text-blue-700">Знайти наступний крок</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* "Запитати автора" (2026-09-09, per Sasha's explicit spec
                — "контент → автор → комунікація, без ухода наружу") —
                renders nothing unless this is a real, published program
                with a real author account (program.authorId — see
                lib/publicContent.ts; demo programs have none). */}
            <AskAuthorBox
              authorId={program.authorId}
              contentId={program.id}
              userId={session?.id}
              promptLabel="Є питання щодо цього курсу?"
              placeholder="Напишіть автору курсу…"
            />
          </div>
          </div>
        </div>
      )}

      {view === "item" && currentModule && currentItem && (() => {
        const embedUrl = getYouTubeEmbedUrl(currentItem.videoUrl);
        const thumbnailUrl = getYouTubeThumbnailUrl(currentItem.videoUrl);
        const isDone = progress[currentItem.id] === "completed";
        // "Продовжити з 12:34" instead of "Почати" — only once there's a
        // real position worth resuming into (a few seconds in isn't
        // worth mentioning) and it isn't basically the end already
        // (that's what "Переглянути відео" above already covers via
        // isDone).
        const resumeLabel =
          savedVideoPosition &&
          savedVideoPosition.positionSeconds > 5 &&
          (!savedVideoPosition.durationSeconds || savedVideoPosition.positionSeconds / savedVideoPosition.durationSeconds < 0.97)
            ? formatTimestamp(savedVideoPosition.positionSeconds)
            : null;

        // "Перед початком" content warning gate — an active consent
        // step, not a passive line of text: while unacknowledged, this
        // replaces the ENTIRE item view (video, text, practice,
        // comments — everything below) rather than sitting as just one
        // more block above them, since the whole point is that the
        // real content shouldn't render at all until the person has
        // chosen to continue. See ContentItem["contentWarning"] and
        // lib/warningAcks.ts.
        if (currentItem.contentWarning && !warningAcked) {
          return (
            <div className="min-h-screen flex items-center justify-center p-8">
              <div className="max-w-[480px] w-full bg-white rounded-[28px] shadow-[0_20px_80px_rgba(10,10,40,0.15)] p-10">
                <div className="text-[13px] font-medium text-amber-700 mb-2">Перед початком</div>
                <h2 className="text-[20px] font-bold mb-3">{currentItem.title}</h2>
                <p className="text-[14px] leading-relaxed text-black/70 mb-8">{currentItem.contentWarning}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      setWarningAcked(true);
                      if (session?.id) ackWarning(currentItem.id, session.id).catch(() => notifyWriteFailed("підтвердження"));
                    }}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-semibold hover:opacity-90 transition"
                  >
                    Готовий продовжити
                  </button>
                  <button
                    onClick={() => {
                      // Marks this item "skipped" rather than leaving it
                      // "not_started" — satisfies the sequential lock
                      // (lib/contentProgress.ts's isResolved) so
                      // declining a warning never traps the person
                      // behind a required item they explicitly chose
                      // not to open. Doesn't count toward the %/
                      // isCompleted, and the item stays revisitable
                      // (its own view still offers the real "Завершити"
                      // action) if they want to come back to it later.
                      markSkipped(currentItem.id);
                      goNext();
                    }}
                    className="px-5 py-3 rounded-xl border border-black/10 text-[14px] font-medium text-black/60 hover:bg-black/5 transition"
                  >
                    Не зараз
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          // 2026-09-22 lesson-experience redesign (Sasha's full 22-
          // section spec), refined 2026-09-25 (a follow-up "too sterile/
          // clinical" visual correction pass — see the ATMOSPHERE block
          // just below): this is a reading/watching surface, not a
          // dashboard — content sits directly on the page canvas instead
          // of inside a separate floating white card (section 1 —
          // "remove the giant white card feel"; the overview/completed
          // screens intentionally KEEP their own report-style card,
          // since those two are genuinely dashboard-like). The canvas
          // itself is now a soft, low-contrast atmosphere (diffuse
          // lavender/blue radial light) rather than flat near-white, so
          // "no card" doesn't collapse into "no visual identity" — see
          // ATMOSPHERE below for the actual glows. Text always renders
          // on the same low-contrast base tone, so color never has to
          // adapt to a loud background.
          <div
            className="relative min-h-screen pt-[132px] px-5 md:px-8 pb-20 overflow-hidden"
            style={{ backgroundColor: "#f7f7fc" }}
          >
            {/* ATMOSPHERE — 2026-09-25 visual correction pass: the flat
                near-white canvas from the previous pass read as sterile/
                clinical ("hospital portal"), not premium/emotional. This
                replaces it with soft, low-contrast, diffuse radial light
                — a blue wash right at the top (same brand color the
                overview screen opens with, so the two screens still tie
                together), then a few large, heavily blurred lavender/
                blue blobs positioned at different points DOWN the page
                (not fixed to the viewport) so there's gentle tonal
                variation as the person actually scrolls through the
                lesson, rather than one static wash. Deliberately
                low-opacity and huge/blurred — meant to be almost
                subliminal, felt more than seen, never competing with
                real content for attention. Purely decorative (aria-
                hidden, pointer-events-none) — no layout/logic impact. */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div
                className="absolute -top-16 left-1/2 -translate-x-1/2 w-[900px] h-[440px] rounded-full blur-3xl"
                style={{ background: "radial-gradient(ellipse at center, rgba(37,99,235,0.16), transparent 70%)" }}
              />
              <div
                className="absolute top-[560px] -right-44 w-[560px] h-[560px] rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(167,139,250,0.14), transparent 70%)" }}
              />
              <div
                className="absolute top-[1180px] -left-44 w-[520px] h-[520px] rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(99,102,241,0.12), transparent 70%)" }}
              />
              <div
                className="absolute top-[1780px] left-1/4 w-[480px] h-[480px] rounded-full blur-3xl"
                style={{ background: "radial-gradient(circle, rgba(129,140,248,0.13), transparent 70%)" }}
              />
            </div>
            {/* 2026-09-28 GRID CORRECTION: the previous pass's two nested
                containers (wide hero + narrower content column) created
                a funnel shape — video/header wide, everything below it
                noticeably narrower, so the lower half read as a
                detached form rather than a continuation of the same
                page. Back to ONE master container for the entire lesson
                experience — nav, progress, title, video, completion,
                reflection, feedback, discussion and comments all share
                these exact same left/right edges. Single max-width+
                mx-auto box inside the outer horizontal padding, so
                mobile collapses to one fluid column automatically. */}
            <div className="relative max-w-[1150px] mx-auto">
              {/* TOP NAV + LESSON POSITION — 2026-09-25 visual
                  correction pass (sections 3/4 of the "too sterile"
                  follow-up spec): the plain "Модуль X · Урок Y із Z"
                  caption + flat 2px bar read as generic/clinical. Same
                  real data as before (openItem's own indices,
                  flatPos/flat.length) — reads more like a premium
                  edition label and a delicate glowing track now, not a
                  loading bar. Prev/Next are still exactly the same
                  whole-sequence goPrev/goNext/prevFlatItem/nextFlatItem
                  from the previous pass (one implementation, not the
                  module-scoped + program-scoped pair from before that) —
                  now icon-only circular buttons flanking the label
                  instead of a text row, so they read as quiet chrome
                  around the identity rather than competing copy. */}
              <div className="flex items-center justify-center gap-4 mb-5">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!prevFlatItem}
                  title="Попередній урок"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-black/35 hover:text-black/60 hover:bg-black/[0.04] disabled:opacity-0 disabled:pointer-events-none transition"
                >
                  ‹
                </button>
                <div className="text-center">
                  <div className="text-[11px] font-bold tracking-[0.16em] text-blue-600/80 uppercase">
                    Модуль {String(openItem!.moduleIndex + 1).padStart(2, "0")}
                  </div>
                  <div className="text-[11px] font-medium tracking-[0.16em] text-black/35 uppercase">
                    Урок {String(openItem!.itemIndex + 1).padStart(2, "0")} / {String(currentModule.items.length).padStart(2, "0")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!nextFlatItem || isLocked(nextFlatItem)) return;
                    goNext();
                  }}
                  disabled={!nextFlatItem || isLocked(nextFlatItem)}
                  title="Наступний урок"
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-black/35 hover:text-black/60 hover:bg-black/[0.04] disabled:opacity-0 disabled:pointer-events-none transition"
                >
                  ›
                </button>
              </div>

              {/* Delicate gradient progress track — real whole-sequence
                  position (flatPos/flat.length), deliberately not the
                  required-only % the overview screen's own ring already
                  shows, so this doesn't duplicate that UI; a soft glow +
                  small endpoint dot instead of a flat loading-bar fill,
                  so it reads as a journey marker rather than a spinner. */}
              <div className="relative h-[3px] w-full max-w-[280px] mx-auto bg-black/[0.06] rounded-full mb-10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.round(((flatPos + 1) / flat.length) * 100)}%`,
                    background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
                    boxShadow: "0 0 10px rgba(129,140,248,0.55)",
                  }}
                />
                <div
                  className="absolute top-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-violet-400"
                  style={{
                    left: `calc(${Math.round(((flatPos + 1) / flat.length) * 100)}% - 4px)`,
                    transform: "translateY(-50%)",
                    boxShadow: "0 0 6px rgba(167,139,250,0.7)",
                  }}
                />
              </div>

              {/* HEADER — the title is the dominant text element; every
                  other fact here (module/lesson position above, author/
                  duration/type below) is compact caption text around it,
                  never competing boxes. Slightly larger/heavier than the
                  previous pass and a hair softer than pure black
                  (text-black/90), per the "don't make everything black/
                  gray" note in the visual-correction spec. */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className="text-[30px] md:text-[36px] leading-[1.15] font-bold tracking-tight text-black/90">{currentItem.title}</h1>
                {/* "Закладки" — save this specific lesson to come back
                    to, independent of progress/completion. A filled
                    star means bookmarked, same visual language as the
                    rating stars elsewhere on this screen. */}
                <button
                  onClick={toggleBookmark}
                  title={bookmarksById.has(currentItem.id) ? "Прибрати із закладок" : "Зберегти урок"}
                  className="shrink-0 w-10 h-10 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition mt-1"
                >
                  <StarIcon
                    className={`w-[18px] h-[18px] ${bookmarksById.has(currentItem.id) ? "text-amber-500" : "text-black/25"}`}
                    fill={bookmarksById.has(currentItem.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                  />
                </button>
              </div>

              {/* AUTHOR + DURATION + TYPE — honest: only the program's
                  author as a plain name (no per-lesson instructor bio in
                  the demo data), so the caption says exactly that. */}
              <div className="flex items-center gap-2.5 text-[14px] text-black/55 mb-7">
                <Avatar avatarUrl={null} initials={getInitials(program.author)} className="w-7 h-7 text-[11px]" />
                <span className="font-medium text-black/65">{program.author}</span>
                {currentItem.durationMinutes ? (
                  <>
                    <span>·</span>
                    <span>{formatDuration(currentItem.durationMinutes)}</span>
                  </>
                ) : null}
                <span>·</span>
                <span>{currentItem.material ? "Подарунок" : typeLabel[currentItem.type]}</span>
              </div>

              {/* GIFT LESSON — the author's own meditation / guide, paid on its own, included in this program. */}
              {currentItem.material && (
                <div className="mb-6 rounded-[22px] border-2 border-[#a78bfa] bg-[#f5f3ff] p-5 sm:p-6">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6d28d9]">Подарунок від автора</div>
                  <h3 className="mt-1 text-[20px] font-semibold leading-snug text-black">{currentItem.material.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-black/65">
                    {currentItem.material.kind === "meditation" ? "Медитація" : "Гайд"}, яка окремо була платною, а для вас безкоштовна: вона входить у вартість програми.
                  </p>
                  {currentItem.material.description && <p className="mt-2 text-[14px] leading-relaxed text-black/60">{currentItem.material.description}</p>}
                  {(currentItem.material.kind === "guide" ? onOpenGuide : onOpenMeditation) && (
                    <button
                      type="button"
                      onClick={() => (currentItem.material!.kind === "guide" ? onOpenGuide : onOpenMeditation)!(currentItem.material!.appId)}
                      className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[#6d28d9] px-5 text-[14px] font-medium text-white transition hover:bg-[#5b21b6]"
                    >
                      {currentItem.material.kind === "guide" ? "Відкрити гайд" : "Відкрити медитацію"}
                    </button>
                  )}
                </div>
              )}

              {/* VIDEO — 16:9, real embed once the person taps to start.
                  Every REQUIRED lesson reserves this space regardless of
                  type — a text/checklist required lesson with no video
                  attached still shows the honest "автор ще не додав
                  відео" placeholder, same as a video-type one without a
                  video, since that's the core path and the gap is worth
                  surfacing. For OPTIONAL items (isRequired === false —
                  bonus practices etc.) video is itself optional, per
                  Sasha's explicit call: no video attached there just
                  means no block at all, not an empty placeholder, since
                  forcing that on ancillary content reads as clutter
                  rather than an honest gap. Poster shows the video's
                  real YouTube thumbnail (under a dark gradient for
                  legibility) once a real video exists behind it.
                  2026-09-25 visual correction pass (section 5): wrapped
                  in a soft blurred ambient glow so the player feels like
                  the lesson's central object rather than an isolated
                  media embed floating on white — purely a decorative
                  backdrop div, no change to the player itself.
                  2026-09-28 GRID CORRECTION: the video simply fills the
                  one master container's width (~1150px) — no separate
                  breakout math on top of it. Kept intentionally at this
                  width, not pushed any wider, per Sasha's explicit call
                  that the current video size is already sufficient. */}
              {(currentItem.isRequired || currentItem.videoUrl) && (
              <div className="relative mb-6">
                <div
                  className="pointer-events-none absolute -inset-5 rounded-[32px] blur-2xl -z-10"
                  style={{ background: "radial-gradient(ellipse at center, rgba(99,102,241,0.22), transparent 72%)" }}
                  aria-hidden="true"
                />
                <div className="relative w-full aspect-video rounded-[22px] overflow-hidden bg-black shadow-[0_25px_60px_rgba(20,20,70,0.25)]">
                  {embedUrl ? (
                      videoStarted ? (
                        // YT.Player (see the effect above) replaces this
                        // div with its own real iframe once the API
                        // script loads — not a bare <iframe src>, since
                        // "Повернутися пізніше" needs the JS API to
                        // read/seek the actual playback position.
                        <div id="yt-lesson-player" className="w-full h-full" />
                      ) : (
                        <button
                          onClick={() => setVideoStarted(true)}
                          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 text-white group bg-gradient-to-br from-[#0f1b3d] to-[#1c2f6b] bg-cover bg-center"
                          style={
                            thumbnailUrl
                              ? {
                                  backgroundImage: `linear-gradient(180deg, rgba(10,15,35,0.25), rgba(10,15,35,0.75)), url(${thumbnailUrl})`,
                                }
                              : undefined
                          }
                        >
                          {isDone && (
                            <span className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-[11px]">
                              Переглянуто
                            </span>
                          )}
                          <span className="w-16 h-16 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-[26px] group-hover:bg-white/25 transition">
                            ▶
                          </span>
                          <span className="text-[14px] font-medium">
                            {isDone
                              ? "Переглянути відео"
                              : resumeLabel
                              ? `Продовжити з ${resumeLabel}`
                              : "Почати"}
                          </span>
                        </button>
                      )
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0f1b3d] to-[#1c2f6b] text-white/60">
                        <span className="text-[26px]">▶</span>
                        <span className="text-[13px]">Автор ще не додав відео</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TRANSCRIPT — author-pasted text of the video/audio (see
                  ContentItem["transcript"]). Collapsed by default so it
                  doesn't compete with actually watching/listening;
                  mainly for accessibility. Attached under whichever
                  media block is actually present — video takes
                  priority since it's the primary case, audio-only items
                  get their own copy further down (see AUDIO block). */}
              {currentItem.transcript && currentItem.videoUrl && (
                <div className="mb-7">
                  <button
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="text-[13px] font-medium text-black/50 hover:text-black/70 transition flex items-center gap-1.5"
                  >
                    <span className={`transition-transform ${transcriptOpen ? "rotate-90" : ""}`}>›</span>
                    {transcriptOpen ? "Сховати транскрипт" : "Показати транскрипт"}
                  </button>
                  {transcriptOpen && (
                    <div className="mt-3 rounded-2xl bg-white border border-black/5 p-5">
                      <p className="text-[13px] leading-relaxed text-black/65 whitespace-pre-line">
                        {currentItem.transcript}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* "ПРО ЦЕЙ УРОК" — the lesson's own body text, presented as
                  plain editorial prose directly on the page canvas rather
                  than boxed (2026-09-22 redesign, section 5) — there's no
                  separate "description" field in the content model
                  (ContentItem in data/contentTypes.ts has only `body`),
                  so this uses that same real field; nothing invented.
                  Checklist-type items show their real checklist here
                  too, same "only render when there's something real"
                  gate as before — just without the filled background
                  block. Section 6 of the spec ("Після цього уроку ви
                  зможете" / learning outcomes) is intentionally NOT
                  implemented: ContentItem has no outcomes/objectives
                  field, and the spec is explicit not to hardcode fake
                  ones — see the final report for this gap.
                  2026-09-25 visual correction pass (section 8): a plain
                  bare paragraph read as too empty next to everything
                  else getting richer treatment, but the spec is equally
                  explicit not to wrap it back into "a generic white
                  card" — so it gets a quiet left accent rule + a touch
                  more breathing room instead of a boxed background. */}
              {(currentItem.body || checklistItems(currentItem.checklist).length > 0) && (
                <div className="mb-6">
                  <h2 className="text-[15px] font-semibold text-black/80 mb-4">Про цей урок</h2>
                  <div className="pl-5 border-l-2 border-blue-200/70 flex flex-col gap-4">
                    {currentItem.body && <p className="text-[15px] leading-[1.75] text-black/70">{currentItem.body}</p>}
                    {checklistItems(currentItem.checklist).length > 0 && (
                      <div>
                        {splitChecklist(currentItem.checklist).title && (
                          <h3 className="mb-2 text-[15px] font-semibold text-black/80">{splitChecklist(currentItem.checklist).title}</h3>
                        )}
                        <ul className="flex flex-col gap-2.5">
                          {checklistItems(currentItem.checklist).map((c, ci) => (
                            <li key={`${ci}-${c}`} className="flex items-start gap-2.5 text-[14px] text-black/70 leading-relaxed">
                              <span className="text-emerald-500 mt-0.5">☐</span>
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ДОДАТКОВІ МАТЕРІАЛИ — 2026-09-28 content-structure pass:
                  renamed from "Матеріали уроку" to match the "additional,
                  supplementary to the lesson itself" framing. Moved to
                  sit directly under "Про цей урок" (2026-09-28 flow
                  pass) — the participant gets the lesson's own
                  description AND whatever real material comes with it
                  before anything else (practice, image), matching
                  Sasha's explicit ordering: LEARN (video + description +
                  materials) → EXPLORE (practice) → REFLECT → FEEDBACK →
                  DISCUSS. Still consolidates whatever real materials this
                  lesson actually has (an attached PDF via fileUrl, and/or
                  a bonus audio track when audio isn't already this
                  item's own primary content) — real existing data only
                  (fileUrl/fileName/fileSizeLabel, audioUrl,
                  durationMinutes), no invented materials array/field, no
                  placeholder shown when absent (the whole block simply
                  doesn't render). Softened from a solid white bordered
                  box to a barely-there tinted surface — a resource list,
                  not another white card — and the PDF actions read as
                  quiet inline links with an arrow instead of button
                  pills, matching the editorial/"no excessive borders"
                  direction used everywhere else on this page. Reuses the
                  exact same fileUrl/download infrastructure as before —
                  no second open/download system. Primary audio content
                  (type === "audio") keeps its own dedicated section
                  further down, since that's the lesson itself, not a
                  supplementary material. */}
              {(currentItem.fileUrl || (currentItem.audioUrl && currentItem.type !== "audio")) && (
                <div className="mb-6">
                  <h2 className="text-[15px] font-semibold text-black/80 mb-3">Додаткові матеріали</h2>
                  <div className="rounded-2xl bg-black/[0.02] divide-y divide-black/[0.06]">
                    {currentItem.fileUrl && (
                      <div className="flex items-center gap-4 p-4 flex-wrap">
                        <div className="w-10 h-10 rounded-xl bg-[#fee2e2] text-[#dc2626] flex items-center justify-center text-[11px] font-bold shrink-0">
                          PDF
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium truncate">{currentItem.fileName ?? "Матеріали"}</div>
                          <div className="text-[12px] text-black/40">
                            PDF{currentItem.fileSizeLabel ? ` · ${currentItem.fileSizeLabel}` : ""}
                          </div>
                        </div>
                        <ProtectedPdfActions
                          variant="inline"
                          title={currentItem.fileName ?? "Матеріали"}
                          url={currentItem.fileUrl}
                          contentId={programId}
                        />
                      </div>
                    )}
                    {currentItem.audioUrl && currentItem.type !== "audio" && (
                      <div className="p-4">
                        <div className="text-[13px] font-medium text-black/70 mb-2">
                          Додаткова практика{currentItem.durationMinutes ? ` · ${formatDuration(currentItem.durationMinutes)}` : ""}
                        </div>
                        <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="w-full" src={currentItem.audioUrl} aria-label={currentItem.title} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div data-lesson-anchor="practice" className="scroll-mt-24">
                <LessonPractice
                  item={currentItem}
                  session={session}
                  program={program}
                  onNext={goNext}
                  notifyWriteFailed={notifyWriteFailed}
                />
              </div>

              {/* IMAGE — a standalone image attached to the lesson (a
                  diagram, a photo for a grounding exercise), uploaded
                  via Supabase Storage same as the file/PDF card below.
                  Optional, independent of the item's own type, same
                  spirit as audioUrl/fileUrl above. */}
              {currentItem.imageUrl && (
                <div className="mb-6">
                  <img
                    src={currentItem.imageUrl}
                    alt={currentItem.title}
                    className="w-full rounded-2xl border border-black/5"
                  />
                </div>
              )}

              {/* АУДІО — this item's own primary content when its type
                  IS audio (a meditation/practice track, no video) — kept
                  separate from ДОДАТКОВІ МАТЕРІАЛИ (moved up, right under
                  "Про цей урок" — see above) since it isn't a bonus
                  attachment, it's the main thing here. Native
                  <audio controls> gives a real play/pause/seek/volume/
                  duration player for free. */}
              {currentItem.audioUrl && currentItem.type === "audio" && (
                <div className="mb-6">
                  <h2 className="text-[15px] font-semibold text-black/80 mb-3">Аудіо</h2>
                  <div className="rounded-2xl border border-black/5 bg-white p-5">
                    <div className="text-[14px] font-medium mb-3">{currentItem.title}</div>
                    <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="w-full" src={currentItem.audioUrl} aria-label={currentItem.title} />
                  </div>
                </div>
              )}

              {/* TRANSCRIPT for audio-only items — same block as under
                  VIDEO above, shown here instead when there's no video
                  (avoids rendering it twice for items that somehow have
                  both). */}
              {currentItem.transcript && !currentItem.videoUrl && (
                <div className="mb-6">
                  <button
                    onClick={() => setTranscriptOpen((v) => !v)}
                    className="text-[13px] font-medium text-black/50 hover:text-black/70 transition flex items-center gap-1.5"
                  >
                    <span className={`transition-transform ${transcriptOpen ? "rotate-90" : ""}`}>›</span>
                    {transcriptOpen ? "Сховати транскрипт" : "Показати транскрипт"}
                  </button>
                  {transcriptOpen && (
                    <div className="mt-3 rounded-2xl bg-white border border-black/5 p-5">
                      <p className="text-[13px] leading-relaxed text-black/65 whitespace-pre-line">
                        {currentItem.transcript}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* COMPLETE ACTION + NEXT LESSON — 2026-09-28 GRID
                  CORRECTION: the previous gradient rounded panel read as
                  "a floating button in empty space", disconnected from
                  the lesson above/below it. Replaced with a compact
                  horizontal transition — a quiet top hairline (the same
                  restrained divider language, not a card) plus normal
                  vertical padding, sitting directly in the master grid
                  like every other section. Still exactly the same real
                  engine as before: "Завершити урок" → completeCurrentItem;
                  once done, the exact same nextFlatItem/goNext/
                  continueLabel the footer nav already uses builds the
                  "Наступний урок" step — never a separately hand-rolled
                  recommendation. Bottom hairline added (2026-09-28) to
                  match the top one — closes the block off symmetrically
                  instead of just trailing into empty space above
                  REFLECTION below. */}
              <div className="border-t border-b border-black/[0.06] py-5 mb-9">
                {!justCompletedItem && !isDone ? (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="text-[14px] text-black/50">Готові рухатись далі?</div>
                    <button
                      onClick={completeCurrentItem}
                      className="shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-semibold hover:opacity-90 shadow-[0_10px_24px_rgba(99,102,241,0.25)] transition"
                    >
                      Завершити урок →
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[14px] text-emerald-600 font-semibold">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px]">✓</span>
                      Урок завершено
                    </div>
                    {nextFlatItem ? (
                      (() => {
                        const nextItemData = modules[nextFlatItem.moduleIndex]?.items[nextFlatItem.itemIndex];
                        return (
                          <div className="flex flex-col gap-2">
                            {crossesIntoNewModule && (
                              <div className="text-[12px] text-black/40">Модуль «{currentModule.title}» завершено</div>
                            )}
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold tracking-[0.14em] text-blue-600/70 uppercase mb-1">Наступний урок</div>
                                <div className="text-[18px] font-semibold text-black/85 truncate">{nextItemData?.title ?? ""}</div>
                                {nextItemData && (
                                  <div className="text-[12px] text-black/40 mt-0.5">
                                    {typeLabel[nextItemData.type]}
                                    {nextItemData.durationMinutes ? ` · ${formatDuration(nextItemData.durationMinutes)}` : ""}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={goNext}
                                className="shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[13px] font-semibold hover:opacity-90 shadow-[0_10px_24px_rgba(99,102,241,0.28)] transition"
                              >
                                Наступний урок →
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <button
                        onClick={() => setView(summary.isCompleted ? "completed" : "overview")}
                        className="self-start px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[13px] font-semibold hover:opacity-90 transition"
                      >
                        {continueLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* REFLECTION — "Ваше спостереження". A free-text
                  observation journal, present on every lesson (unlike
                  PRACTICE above, not something an author has to turn
                  on) — separate and independent of it, since this isn't
                  a structured answer to a specific question, just an
                  open space to note whatever stood out. Heading/prompt
                  copy per the 2026-09-22 redesign (section 8) — same
                  privacy reassurance as before, now under the prompt
                  instead of above it. Deliberately placed right before
                  FEEDBACK below — noticing what changed in yourself
                  should happen right before judging whether the
                  material itself was useful, not earlier in the flow.
                  Every save is a new entry (lib/reflections.ts is
                  append-only), shown underneath so writing one feels
                  like adding to a running log rather than overwriting
                  the last thought. The full cross-program history lives
                  in "Ваші спостереження" (ParticipantReflections.tsx),
                  reachable from the participant dashboard sidebar.
                  2026-09-25 visual correction pass (section 10): the
                  white-bordered box read as "a generic hospital form" —
                  this is meant to be the most emotionally distinctive
                  part of the page, a private journal, not a database
                  entry. Soft lavender gradient + a quiet decorative glow
                  in the corner, no hard border, generous internal
                  padding, warmer (violet-tinted) typography accents. The
                  privacy line is visually the smallest/quietest text in
                  the block, same "secondary, not gone" treatment the
                  spec asks for. */}
              {/* 2026-09-28: pl-0 instead of a symmetric p-7 — the panel's
                  background/glow are separate absolute-positioned divs
                  (full-bleed already), but the text/textarea/button were
                  inheriting the same 28px LEFT inset as the right/top/
                  bottom padding, so this block's content started ~28px
                  further right than every sibling section (title, video,
                  "Про цей урок", feedback, discussion) — they have no
                  padding wrapper and sit flush on the master grid's left
                  edge. Dropping only the left padding puts this block's
                  text back on that same shared left edge while keeping
                  right/top/bottom breathing room against the rounded
                  corners. */}
              <div data-lesson-anchor="notes" className="relative mb-7 rounded-[28px] pt-7 pr-7 pb-7 overflow-hidden scroll-mt-24">
                <div
                  className="absolute inset-0 -z-10"
                  style={{ background: "linear-gradient(160deg, #f5f1ff 0%, #faf8ff 55%, #f6f4ff 100%)" }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl -z-10"
                  style={{ background: "radial-gradient(circle, rgba(196,181,253,0.45), transparent 72%)" }}
                  aria-hidden="true"
                />
                <h2 className="text-[17px] font-semibold text-violet-950/80 mb-1.5">Ваше спостереження</h2>
                <p className="text-[13px] text-black/55 mb-1">Що ви помітили в собі після цього уроку?</p>
                <p className="text-[11px] text-black/35 mb-5">Приватна нотатка — її бачите тільки ви, вона не публікується.</p>
                <textarea
                  value={reflectionDraft}
                  onChange={(e) => setReflectionDraft(e.target.value)}
                  placeholder="Коротко занотуйте, що ви помітили в собі зараз…"
                  rows={4}
                  className="w-full rounded-xl border border-violet-200/50 bg-white/70 px-4 py-3.5 text-[15px] text-black/80 placeholder:text-black/30 focus:outline-none focus:border-violet-300 focus:bg-white resize-none transition"
                />
                <button
                  onClick={submitReflectionNote}
                  disabled={!reflectionDraft.trim() || reflectionSaving}
                  className="mt-3 px-6 py-3 rounded-xl bg-violet-600 text-white text-[14px] font-semibold hover:bg-violet-700 disabled:opacity-40 shadow-[0_8px_20px_rgba(139,92,246,0.25)] transition"
                >
                  {reflectionSaving ? "Зберігаємо…" : "Зберегти нотатку"}
                </button>

                {itemReflections.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-violet-200/40 flex flex-col gap-3">
                    {itemReflections.map((r) => (
                      <div key={r.id} data-lesson-anchor={`note:${r.id}`} className="text-[13px] scroll-mt-24 rounded-lg -mx-2 px-2 py-1">
                        <div className="text-black/40 text-[11px] mb-0.5">{formatRelativeTime(r.createdAt)}</div>
                        <p className="text-black/70 leading-relaxed">{r.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* FEEDBACK — one calm yes/no, not a social-media reaction
                  bar. Deliberately lighter visual weight than the lesson
                  content/reflection above (2026-09-22 redesign, section
                  9 — it's feedback, not the primary learning action):
                  smaller caption-style question, no bold/dark heading.
                  "Не зовсім" opens a small follow-up window instead of
                  persisting instantly, so the person can say what
                  specifically didn't work — see the modal near the
                  bottom of this screen. 2026-09-25 visual correction
                  pass (section 14): dropped the thin gray divider —
                  spacing alone separates this from Reflection above,
                  per the spec's "no thin horizontal gray lines between
                  every section" note. */}
              <div className="mb-6">
                <div className="text-[13px] text-black/45 mb-3">Цей матеріал був для вас корисним?</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={submitHelpfulFeedback}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium border transition ${
                      itemFeedback === "helpful"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "border-black/10 text-black/50 hover:bg-black/5"
                    }`}
                  >
                    ♡ Так
                  </button>
                  <button
                    onClick={openNotHelpfulModal}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium border transition ${
                      itemFeedback === "not_helpful"
                        ? "bg-black/5 border-black/20 text-black/70"
                        : "border-black/10 text-black/50 hover:bg-black/5"
                    }`}
                  >
                    Не зовсім
                  </button>
                  {itemFeedback && <span className="text-[12px] text-black/35">Дякуємо за відгук</span>}
                  <ContentReportButton kind="program" contentId={programId} title={program?.title ?? "Програма"} viewerId={session?.id} />
                </div>
              </div>

              <LessonComments
                key={`${openItem?.itemId}:${session?.id ?? ""}`}
                itemId={currentItem.id}
                session={session}
                notifyWriteFailed={notifyWriteFailed}
              />

            </div>

            {showNotHelpfulModal && (
              <NotHelpfulDialog
                reason={notHelpfulReason}
                warning={notHelpfulWarning}
                onReasonChange={(value) => {
                  setNotHelpfulReason(value);
                  if (notHelpfulWarning) setNotHelpfulWarning(null);
                }}
                onCancel={() => setShowNotHelpfulModal(false)}
                onSubmit={submitNotHelpfulFeedback}
              />
            )}

          </div>
        );
      })()}

      {view === "completed" && (
        // A real closing PAGE, not a centered popup card — same top-down
        // "white card floating on the brand gradient" layout as the
        // overview/item screens, per Sasha's explicit call that this
        // moment deserves an actual report, not a small dialog you
        // dismiss. This is also the moment the program formally folds
        // into the person's broader Personal Plan — everything below
        // the stats points outward (next recommendation, saved
        // practices, observations) rather than just offering to close
        // the window. Smaller top offset than the overview/item screens'
        // pt-[140px] — this view has no fixed top bar to clear (see
        // `view !== "completed"` gating it below), so the extra space
        // was just unused whitespace, per Sasha's call (2026-08-27).
        <div className="pt-16 px-6 md:px-10 pb-14">
          {/* Same max-width/padding/shadow as the overview screen's own
              white card (max-w-[1220px], p-8 md:p-16) — this used to be
              a narrower, differently-padded card, which made the report
              read as a smaller, lesser screen than the rest of the
              program experience instead of a real page in the same
              family. */}
          <div
            id="sensoria-program-report"
            className="max-w-[1220px] mx-auto bg-white rounded-[28px] shadow-[0_30px_80px_rgba(10,10,40,0.25)] p-8 md:p-16"
          >
            {/* PDF export — plain browser print-to-PDF rather than a new
                client-side PDF library: no added dependency/bundle cost
                (this app already tries to stay free-tier-friendly —
                see docs/roadmap-to-production.md), works fully offline,
                and "print this one element" is a well-established CSS
                pattern (#sensoria-program-report-print below). The
                buttons themselves carry .report-print-hide so they
                don't show up inside the saved PDF. */}
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #sensoria-program-report,
                #sensoria-program-report * { visibility: visible !important; }
                #sensoria-program-report {
                  position: absolute !important;
                  inset: 0 !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  max-width: none !important;
                  box-shadow: none !important;
                  border-radius: 0 !important;
                }
                .report-print-hide { display: none !important; }
              }
            `}</style>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <CompletionBadgeIcon className="w-8 h-8" />
              </div>
              <h2 className="text-[26px] font-bold mb-1">Ви завершили програму</h2>
              <div className="text-[15px] text-black/60 mb-1">{program.title}</div>
              <div className="text-[13px] text-black/40">{program.author}</div>
              {/* Stamped from the frozen snapshot once it's loaded — a
                  plain date, not a celebratory "N днів тому", since this
                  is a report someone might reopen months later. */}
              {completionSnapshot && (
                <div className="text-[12px] text-black/35 mt-2">
                  Завершено {new Date(completionSnapshot.completedAt).toLocaleDateString("uk-UA")}
                </div>
              )}
            </div>

            {/* STATS — a concrete, honest tally of what actually
                happened here (not a score/grade): modules and elements
                are fractions against the program's real size, practices
                and reflections are plain counts of what the person
                chose to do beyond just watching/reading. Read from the
                FROZEN snapshot (lib/programCompletions.ts), recorded the
                first moment the program reached 100% — per Sasha's
                explicit call, these numbers must stay exactly the same
                even if the person later reopens the program and redoes
                a lesson, answers another practice, or leaves another
                reflection. Live doneModulesCount/doneItemsCount/
                practiceResponsesCount/reflectionsCount are only a
                fallback for the brief moment right after finishing the
                very last item, before recordProgramCompletion's write
                has resolved — at that exact instant they're identical
                to what's about to be frozen anyway. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
              <div className="rounded-2xl bg-[#f6f8ff] p-4 text-center">
                <div className="text-[20px] font-bold text-black">
                  {completionSnapshot ? completionSnapshot.modulesDone : doneModulesCount}/
                  {completionSnapshot ? completionSnapshot.modulesTotal : summary.totalModules}
                </div>
                <div className="text-[11px] text-black/45 mt-0.5">модулів</div>
              </div>
              <div className="rounded-2xl bg-[#f6f8ff] p-4 text-center">
                <div className="text-[20px] font-bold text-black">
                  {completionSnapshot ? completionSnapshot.itemsDone : doneItemsCount}/
                  {completionSnapshot ? completionSnapshot.itemsTotal : totalItemsCount}
                </div>
                <div className="text-[11px] text-black/45 mt-0.5">елементів</div>
              </div>
              <div className="rounded-2xl border border-[#dbe3ff] bg-[#f8faff] p-4 text-center">
                {(() => {
                  const n = completionSnapshot ? completionSnapshot.practicesCount : practiceResponsesCount;
                  return (
                    <>
                      <div className="text-[20px] font-bold text-black">{n}</div>
                      <div className="text-[11px] text-black/45 mt-0.5">
                        {n === 0 ? "практик виконано" : practiceCountLabel(n)}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="rounded-2xl border border-[#ece3fb] bg-[#faf7ff] p-4 text-center">
                {(() => {
                  const n = completionSnapshot ? completionSnapshot.reflectionsCount : reflectionsCount;
                  return (
                    <>
                      <div className="text-[20px] font-bold text-black">{n}</div>
                      <div className="text-[11px] text-black/45 mt-0.5">
                        {n === 0 ? "рефлексій залишено" : reflectionCountLabel(n)}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* ЧАС І СТАН — two more honest facts beyond the 4 tiles
                above, each shown only when it actually exists (no
                meaningless "0 хв" or "0.0 → 0.0"). Same frozen-snapshot
                reasoning as the stats grid. */}
            {(() => {
              const minutes = completionSnapshot ? completionSnapshot.investedMinutes : investedMinutes;
              const moodBefore = completionSnapshot ? completionSnapshot.moodBeforeAvg : moodAverage?.before ?? null;
              const moodAfter = completionSnapshot ? completionSnapshot.moodAfterAvg : moodAverage?.after ?? null;
              if (minutes <= 0 && moodBefore == null) return null;
              return (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-black/55 mb-10 pb-6 border-b border-black/5">
                  {minutes > 0 && <div>Ви приділили цьому {formatDuration(minutes)}</div>}
                  {moodBefore != null && moodAfter != null && (
                    <div>
                      Стан у середньому: {moodBefore.toFixed(1)} → {moodAfter.toFixed(1)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ЗМІСТ ПРОГРАМИ — a real checklist of every module/lesson,
                not just the bare "N/N" tiles above. Reads from the
                frozen modulesSnapshot once it exists so the list (and
                each item's ✓/—/○) can't later disagree with itself if
                the author edits/reorders lessons afterward; falls back
                to the live structure for the brief window before the
                snapshot write resolves. */}
            <div className="text-left mb-10">
              <div className="text-[13px] font-medium text-black/45 mb-3">Зміст програми</div>
              <div className="flex flex-col gap-4">
                {(completionSnapshot && completionSnapshot.modulesSnapshot.length > 0
                  ? completionSnapshot.modulesSnapshot
                  : modules.map((mod) => ({
                      title: mod.title,
                      items: mod.items.map((it) => ({
                        title: it.title,
                        status: progress[it.id] ?? "not_started",
                        isRequired: it.isRequired,
                      })),
                    }))
                ).map((mod, mi) => (
                  <div key={mi}>
                    <div className="text-[13px] font-semibold text-black/70 mb-1.5">{mod.title}</div>
                    <ul className="flex flex-col gap-1">
                      {mod.items.map((it, ii) => {
                        const done = it.status === "completed" || it.status === "skipped";
                        return (
                          <li key={ii} className="flex items-center gap-2 text-[13px]">
                            <span className={done ? "text-emerald-500" : "text-black/25"}>
                              {it.status === "completed" ? "✓" : it.status === "skipped" ? "—" : "○"}
                            </span>
                            <span className={it.status === "skipped" ? "text-black/40" : "text-black/65"}>
                              {it.title}
                            </span>
                            {!it.isRequired && <span className="text-[11px] text-black/30">(додатково)</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* ВАШІ НОТАТКИ — a couple of actual reflection excerpts
                (not just the count above), frozen into the snapshot —
                what makes this a real keepsake rather than a table of
                numbers. Absent entirely until the snapshot exists
                (never shown from live data, since "which 2 notes" would
                otherwise keep changing as someone writes more). */}
            {completionSnapshot && completionSnapshot.reflectionExcerpts.length > 0 && (
              <div className="text-left mb-10">
                <div className="text-[13px] font-medium text-black/45 mb-3">Ваші нотатки</div>
                <div className="flex flex-col gap-3">
                  {completionSnapshot.reflectionExcerpts.map((note, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-[#ece3fb] bg-[#faf7ff] p-4 text-[13px] text-black/70 leading-relaxed"
                    >
                      «{note}»
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* "Моя практика" — курс закінчився, але деякі його аудіо/
                відео-інструменти (дихальна вправа, медитація тощо)
                можуть знадобитися й далі як самостійна практика, не
                прив'язана до проходження курсу. Обмежено типами audio/
                video, а не всім підряд — текстовий/checklist-урок це
                прочитане один раз пояснення, а не інструмент, який
                повертаються використовувати знову. Check-then-confirm —
                checkboxes only edit the local draft (effectiveKeepSelection),
                "Додати в кабінет" is what actually writes to «Моя
                практика», so someone can freely change their mind
                across several boxes before anything is saved. */}
            {(() => {
              const practiceOptions = Array.from(itemById.values()).filter(
                (it) => it.type === "audio" || it.type === "video"
              );
              if (practiceOptions.length === 0) return null;
              const isDirty = practiceOptions.some(
                (it) => effectiveKeepSelection.has(it.id) !== savedPracticesById.has(it.id)
              );
              return (
                // report-print-hide — an interactive checklist for
                // deciding what to keep going forward has no meaning in
                // a saved/printed report of what already happened, so
                // it's excluded from both the PDF export and
                // window.print() while staying fully visible on screen.
                <div className="report-print-hide text-left mb-10">
                  <div className="text-[13px] font-medium text-black/45 mb-1">Що хочете залишити собі?</div>
                  <p className="text-[12px] text-black/40 mb-3">
                    Ці інструменти можуть знадобитися й далі — обране з'явиться у «Моя практика».
                  </p>
                  <div className="flex flex-col gap-2 mb-3">
                    {practiceOptions.map((it) => (
                      <label
                        key={it.id}
                        className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-[14px] cursor-pointer transition ${
                          effectiveKeepSelection.has(it.id)
                            ? "border-blue-300 bg-blue-50 text-black/80"
                            : "border-black/10 bg-white text-black/70 hover:bg-black/[0.02]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={effectiveKeepSelection.has(it.id)}
                          onChange={() => toggleKeepSelection(it.id)}
                          className="accent-blue-500"
                        />
                        {it.title}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => commitKeepSelection(practiceOptions)}
                      disabled={!isDirty || keepCommitting}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition"
                    >
                      {keepCommitting ? "Додаємо…" : "Додати в кабінет"}
                    </button>
                    {!isDirty && keepJustSaved && (
                      <span className="text-[13px] text-emerald-700">✓ Додано до кабінету</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* МАТЕРІАЛИ — every PDF attached anywhere in the program,
                offered as its own separate download, distinct from
                "Завантажити PDF" above (that one exports THIS report;
                these are the author's actual worksheets/handouts). Live,
                not frozen — an author could still update a material
                file later, and the latest version is what's actually
                useful to hand back, unlike the report's own stats. */}
            {(() => {
              const materials = Array.from(itemById.values()).filter((it) => it.fileUrl);
              if (materials.length === 0) return null;
              return (
                // report-print-hide — these are download links, not
                // report content; a saved PDF with dead "Завантажити"
                // buttons in it would be confusing, so this stays
                // screen-only, same as the checklist above.
                <div className="report-print-hide text-left mb-10">
                  <div className="text-[13px] font-medium text-black/45 mb-1">Матеріали</div>
                  <p className="text-[12px] text-black/40 mb-3">
                    PDF-матеріали цієї програми — можна завантажити окремо від звіту.
                  </p>
                  <div className="flex flex-col gap-2">
                    {materials.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3.5 flex-wrap"
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#fee2e2] text-[#dc2626] flex items-center justify-center text-[11px] font-bold shrink-0">
                          PDF
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{it.fileName ?? it.title}</div>
                          {it.fileSizeLabel && <div className="text-[11px] text-black/40">{it.fileSizeLabel}</div>}
                        </div>
                        <ProtectedPdfActions
                          variant="button"
                          title={it.fileName ?? it.title}
                          url={it.fileUrl!}
                          contentId={programId}
                          showOpen={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* "Спробуйте цей гайд далі" (2026-09-09, per Sasha's
                explicit context-recommendation spec) — a real,
                personalized suggestion from what this person actually
                just did, not another generic navigation tile, so it
                gets its own highlighted card above "Що далі?" instead
                of folding into that grid. Teal to read as "guide",
                matching the guide catalog's own established identity
                (see GuideExperience.tsx). */}
            {recommendedGuide && onOpenGuide && (
              <button
                onClick={() => onOpenGuide(recommendedGuide.id)}
                className="w-full flex items-center gap-4 text-left rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-900/10 p-5 mb-6 hover:border-teal-900/20 hover:-translate-y-0.5 transition-all duration-200"
              >
                <span className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[18px] shrink-0 shadow-sm">
                  <Icon name="guide" size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-teal-700/70 mb-0.5">
                    Спробуйте цей гайд далі
                  </span>
                  <span className="block text-[15px] font-semibold text-black/80 truncate">
                    {recommendedGuide.title}
                  </span>
                </span>
                <span className="text-teal-700/50 text-[18px] shrink-0">→</span>
              </button>
            )}

            {/* ЩО ДАЛІ? — the program's own life doesn't just end here:
                check your state again or find similar content (same
                two options as the overview screen's own "Що далі?" —
                replaced the old content-relevance recommendation cards
                per Sasha's explicit call, 2026-08-27) sit alongside two
                links into the person's broader Personal Plan — the
                practices they just chose to keep, and the observations
                they left along the way. */}
            <div className="text-left mb-10">
              <div className="text-[13px] font-medium text-black/45 mb-3">Що далі?</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => onRetakeAssessment?.()}
                  className="shine-btn group flex items-center gap-3 text-left rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white p-4 shadow-[0_8px_20px_rgba(99,102,241,0.35)] hover:shadow-[0_10px_26px_rgba(99,102,241,0.45)] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-[15px] shrink-0">
                    <Icon name="refresh" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-white/70">Ваш стан</span>
                    <span className="block text-[13px] font-semibold leading-tight">Пройти тест ще раз</span>
                  </span>
                </button>
                <button
                  onClick={() => onSearchSimilar?.(program.tags ?? [])}
                  className="group flex items-center gap-3 text-left rounded-2xl border-2 border-blue-500/70 bg-white p-4 shadow-[0_4px_14px_rgba(59,130,246,0.1)] hover:border-blue-500 hover:shadow-[0_8px_20px_rgba(59,130,246,0.18)] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[15px] shrink-0">
                    <Icon name="search" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-blue-500/70">Каталог</span>
                    <span className="block text-[13px] font-semibold leading-tight text-blue-700">Пошукати схожі курси</span>
                  </span>
                </button>
                <button
                  onClick={() => onNavigate?.("saved")}
                  className="group flex items-center gap-3 text-left rounded-2xl border border-black/5 bg-[#fafbff] p-4 hover:bg-[#f2f5ff] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-[15px] shrink-0">
                    <Icon name="toolbox" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-black/40">Практика</span>
                    <span className="block text-[13px] font-medium leading-tight">Ваші збережені практики</span>
                  </span>
                </button>
                <button
                  onClick={() => onNavigate?.("reflections")}
                  className="group flex items-center gap-3 text-left rounded-2xl border border-black/5 bg-[#fafbff] p-4 hover:bg-[#f2f5ff] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center text-[15px] shrink-0">
                    <Icon name="note" size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-black/40">Спостереження</span>
                    <span className="block text-[13px] font-medium leading-tight">Ваші спостереження</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="report-print-hide text-center flex items-center justify-center gap-3 flex-wrap">
              <button
                disabled={pdfExporting}
                onClick={async () => {
                  const el = document.getElementById("sensoria-program-report");
                  if (!el) return;
                  setPdfExporting(true);
                  try {
                    const slug = program.title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
                    await downloadElementAsPdf(el, `${slug || "zvit"}.pdf`);
                  } catch {
                    // CDN libraries failed to load (offline, blocked,
                    // etc.) — the browser's own print-to-PDF is a worse
                    // one-click experience (it opens a dialog instead of
                    // just saving a file) but still gets the person a
                    // PDF rather than leaving the button looking broken.
                    window.print();
                  } finally {
                    setPdfExporting(false);
                  }
                }}
                className="px-6 py-3 rounded-xl border border-black/10 text-[14px] font-medium text-black/70 hover:bg-black/5 transition disabled:opacity-50"
              >
                {pdfExporting ? "Завантаження…" : "Завантажити PDF"}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl bg-black text-white text-[14px] font-medium hover:opacity-90 transition"
              >
                Повернутися до мого навчання
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
