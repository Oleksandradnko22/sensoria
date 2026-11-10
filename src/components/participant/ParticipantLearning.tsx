import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Icon, type IconName } from "../ui/Icon";
import {
  enrollments,
  savedContent,
  getContentInfo,
  type ContentKind,
  type EnrollmentStatus,
  type Enrollment,
} from "../../data/participantDashboard";
import { getProgramProgress } from "../../lib/programProgress";
import { withRealProgramStatus } from "../../lib/programStatus";
import { categoryLabels } from "../../data/categoryLabels";
import CircularProgress from "../ui/CircularProgress";
import GuideVisual from "./GuideVisual";
import { BookmarkIcon, CheckIcon } from "./GuideIcons";
import { formatClock } from "../../utils/formatClock";
import { useSession } from "../../context/SessionContext";
import { useProgramParticipation } from "../../context/ProgramParticipationContext";
import { useMeditationPlayer } from "../../context/MeditationPlayerContext";
import { fetchMeditationAudioPosition, isResumablePosition } from "../../lib/meditationAudioPositions";
import { fetchSavedPractice, addSavedPractice, removeSavedPractice } from "../../lib/savedPractices";
import { supabase } from "../../lib/supabaseClient";
import { fetchAllSavedGuides, addSavedGuide, removeSavedGuide } from "../../lib/guideSaves";
import { fetchAllSectionViews } from "../../lib/guideSectionViews";
import type { PublicProgram } from "../../lib/publicContent";
import { isMeditationDownloaded, downloadMeditationAudio, deleteMeditationDownload } from "../../lib/meditationDownloads";
import MeditationDownloadPicker, { type MeditationDownloadChoice } from "./MeditationDownloadPicker";
import { meditations } from "../../data/meditations";
import { guides, guideSizeLabel } from "../../data/guides";
import { getGuideSectionCount } from "../../data/guideContent";
import { withRealGuideStatus } from "../../lib/guideProgress";
import { ACQUIRED_EVENT, fetchAcquired, type AcquiredRow } from "../../lib/acquired";
import { pickContinueEnrollment } from "../../lib/dashboardPriority";
import { combineByType, type LearningItem } from "../../lib/learningItems";
import { meditationPalette } from "../../lib/meditationPalette";
import { fetchAssessmentResult, type SavedAssessment } from "../../lib/assessment";
import { errorMessage } from "../../lib/errorMessage";
import funnelStore from "../../store/funnelStore";
import type { PrimaryStateId } from "../../store/funnelStore";

const kindLabel: Record<ContentKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

// Plural forms for the sub-tab buttons — not a mechanical "+и" suffix
// on kindLabel (that mangles "Медитація" into "Медитаціяи").
const kindLabelPlural: Record<ContentKind, string> = {
  program: "Програми",
  guide: "Гайди",
  meditation: "Медитації",
};

const kindIcon: Record<ContentKind, IconName> = {
  program: "program",
  guide: "guide",
  meditation: "meditation",
};

// Distinct cover gradient per content type so the three sub-tabs read
// as visually related but not identical — program reuses the exact
// hero gradient from programDetail/ProgramDetailPage.tsx (same signature blue-to-
// purple used everywhere real programs are shown), meditation/guide
// get their own variant from the same family rather than unrelated
// colors, to stay in Sensoria's own palette instead of a generic
// stock-illustration look.
const kindGradient: Record<ContentKind, string> = {
  program: "from-[#0057ff] to-[#7b2cff]",
  meditation: "from-emerald-400 to-cyan-500",
  guide: "from-indigo-400 to-violet-500",
};

// Atmospheric per-meditation palette (2026-09-23, meditation catalog
// redesign; extracted to lib/meditationPalette.ts 2026-09-24 so
// MeditationExperience's own screens share this exact same visual
// identity — see that file's header comment for the full reasoning).

// One CTA per content type, not one generic "Переглянути" everywhere —
// Sasha's spec: a program is a path (continue it), a meditation is
// something you use again (start it, every time — "Повторити" once
// you've already finished it once), a guide is a reference you open
// (and "Відкрити знову" once already read, not just "Відкрити" as if
// for the first time).
// A completed program says "Повернутися", not "Переглянути"/"Пройти ще
// раз" — same reasoning as ProgramExperience's own ctaLabel: it
// re-opens the program from the start, and framing that as returning
// to something familiar (not re-taking an exam) fits wellbeing content
// better.
// `percent` (program-only, 2026-09-24 fix) — a program can read
// "in-progress" the moment ANY item is touched (see contentProgress.ts's
// deriveState: opening one item without finishing it is real activity,
// so the status must not fall back to "not started"), but a person who
// hasn't actually completed a single required item yet has nothing to
// "continue" into — the card's own "0 з N елементів" line would
// visibly contradict a "Продовжити" button right next to it. Only
// programs carry a real required-item percent at all (meditations/
// guides pass this as undefined and are unaffected), so this only ever
// downgrades "Продовжити" → "Почати" for that exact 0%-but-touched case.
function ctaLabel(kind: ContentKind, status?: EnrollmentStatus, percent?: number): string {
  if (kind === "meditation") return status === "completed" ? "Повторити" : "Почати";
  if (kind === "guide") return status === "completed" ? "Відкрити знову" : "Відкрити";
  // program
  if (status === "completed") return "Повернутися";
  if (status === "in-progress") return percent && percent > 0 ? "Продовжити" : "Почати";
  return "Почати";
}

// Sub-tabs are content types, not a merged "Усі" list — each type has
// its own natural shape (path / reusable session / reference), so
// browsing them separately makes more sense than one flat feed.
// "Збережені" is a status filter within a type, not a 4th top-level
// tab — a saved guide is still a guide first and foremost.
type Tab = ContentKind;
// "recommended" (2026-08-30, per Sasha's explicit call — "Мої
// рекомендації") is guide-only for now: the personalized-content
// vocabulary (assessment primary/secondary state vs. content tags)
// already exists for every kind via utils/relevantContent.ts, but this
// filter chip only shows up on the Гайди tab until there's a reason to
// extend it — see the filter-chip list below.
export type StatusFilter = "all" | EnrollmentStatus | "saved" | "recommended";

// LearningItem + combineByType now live in lib/learningItems.ts
// (2026-09-16 technical audit) — extracted so the real ownership/saved
// dedup logic is unit-testable with synthetic data, same reasoning as
// lib/contentDiversity.ts's earlier extraction. See that file's own
// header for the full behavior contract.

// A guide genuinely counts as "for you" (2026-08-30, per Sasha's
// explicit call — "Мої рекомендації" / "Для вас зараз") only when it
// actually shares a tag with the assessment result — a primary-state
// match ranks above a secondary-state one, everything else doesn't
// qualify at all. Deliberately stricter than utils/relevantContent.ts's
// getRelevantGuides, which always returns every guide (score 0
// included) so the Library home page's section is never empty — this
// filter/teaser would be dishonest showing an unrelated guide as "for
// you right now".
// Two independent, additive signals (2026-08-30, per Sasha's explicit
// follow-up — "реально підходящі гайди, які матчаться з результатами
// тесту, або схожі на вже придбані"), not an either/or fallback:
//   - a real assessment tag match (primary state outweighs secondary)
//   - sharing a tag with something the person has already acquired —
//     a real "схоже на те, що ви вже читали" signal, independent of
//     whether they ever took the assessment at all
// A guide hitting both signals genuinely ranks higher than one hitting
// only either — this is a sum, not a max.
function guideRelevanceScore(
  guide: { tags: string[] },
  insight: { primaryState: PrimaryStateId; secondaryState: PrimaryStateId | null } | null,
  ownedTags: Set<string>
): number {
  let score = 0;
  if (insight?.primaryState && guide.tags.includes(insight.primaryState)) score += 2;
  if (insight?.secondaryState && guide.tags.includes(insight.secondaryState)) score += 1;
  if (guide.tags.some((t) => ownedTags.has(t))) score += 1;
  return score;
}

type Props = {
  // Which content type is showing — now controlled from the sidebar
  // (ParticipantDashboardPage's "Моє навчання" sub-nav) instead of
  // pills living inside this page, per Sasha's request to move them
  // into the nav itself.
  tab: Tab;
  // Same navigation convention as ParticipantBilling.tsx/ParticipantReviews.tsx —
  // opens the actual program/guide/meditation page. Kept as a fallback
  // for programs (used only if onContinueProgram isn't provided) and
  // as the only path for guide/meditation until their own experiences
  // (Phase 6/7) exist.
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  // Opens the real prohождення player (ProgramExperience) instead of
  // the public catalog preview — this is "Моє навчання", the person
  // already owns/started this, so clicking it should go straight into
  // using it rather than back out to a marketing page. Handles both
  // an enrolled program (resumes) and a merely-saved one (starts fresh
  // at 0%) — ProgramExperience's own overview screen already covers
  // both states correctly.
  onContinueProgram?: (id: string) => void;
  // Same idea as onContinueProgram, but opens MeditationExperience
  // instead of navigating out to the catalog.
  onContinueMeditation?: (id: string) => void;
  // Same idea again, but opens GuideExperience (2026-09-08, per Sasha's
  // explicit call) instead of the public catalog's sales preview — a
  // guide reached from here is already owned, so it shouldn't lead back
  // to a "Купити зараз" screen. Falls back to onOpenGuide when not
  // provided, same convention as the two above.
  onContinueGuide?: (id: string) => void;
  // Bumped by the parent (ParticipantDashboardPage) every time a guide
  // overlay records a newly-viewed section (2026-09-09, per Sasha's "Ви
  // переглянули X із Y розділів" spec) — this component stays mounted
  // while that overlay is open, so it needs an explicit signal to know
  // its own cached counts below are stale.
  guideSectionViewsVersion?: number;
  // Bumped by the parent whenever a guide is saved/unsaved from the guide
  // preview page (2026-10-06) — this component stays mounted while that
  // overlay is open and only reads guide_saved_for_later on mount, so
  // without this signal a bookmark toggled there would show stale here
  // until a full reload. Same idea as guideSectionViewsVersion above.
  guideSavesVersion?: number;
  // Deep-link from the Dashboard's "Огляд" tab (2026-09-11, per Sasha's
  // full redesign spec — "Ще N незавершені матеріали → Переглянути →"
  // must land on "Моє навчання → У процесі", not just the tab in
  // general). `token` is a plain counter bumped by the parent on every
  // navigation request — even asking for the SAME filter twice in a row
  // (e.g. leaving and re-entering "Огляд" without changing anything else
  // first) needs its own token so the effect below fires again; a bare
  // filter value wouldn't change and the effect wouldn't re-run.
  focusFilter?: { filter: StatusFilter; token: number };
};

export default function ParticipantLearning({
  tab,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
  onContinueProgram,
  onContinueMeditation,
  onContinueGuide,
  guideSectionViewsVersion,
  guideSavesVersion,
  focusFilter,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const session = useSession();
  // Free guides and meditations added from the cart join the cabinet like any owned material
  // (not started yet). Programs added from the cart come through ProgramParticipationContext.
  const [acquiredRows, setAcquiredRows] = useState<AcquiredRow[]>([]);
  const acquiredUserId = session?.profile.id;
  useEffect(() => {
    if (!acquiredUserId) return;
    let cancelled = false;
    const load = () => fetchAcquired(acquiredUserId).then((rows) => !cancelled && setAcquiredRows(rows));
    load();
    window.addEventListener(ACQUIRED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ACQUIRED_EVENT, load);
    };
  }, [acquiredUserId]);
  const allEnrollments = useMemo<Enrollment[]>(() => {
    const have = new Set(enrollments.map((e) => `${e.kind}:${e.contentId}`));
    const extra: Enrollment[] = acquiredRows
      .filter((r) => r.kind !== "program" && !have.has(`${r.kind}:${r.contentId}`))
      .map((r) => ({ contentId: r.contentId, kind: r.kind, progressPercent: 0, status: "in-progress", purchasedAt: r.acquiredAt, lastAccessedAt: r.acquiredAt }));
    return extra.length ? [...enrollments, ...extra] : enrollments;
  }, [acquiredRows]);
  const player = useMeditationPlayer();

  // See focusFilter's own comment on Props — applies a Dashboard-
  // requested filter every time its token changes, including a repeat
  // request for the same filter value.
  useEffect(() => {
    if (focusFilter) setStatusFilter(focusFilter.filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFilter?.token]);

  // "Мої рекомендації" / "Для вас зараз" (2026-08-30, per Sasha's
  // explicit call) — same source of truth as the Library home page's
  // "Рекомендуємо почати з цього" (lib/assessment.ts + funnelStore),
  // read here too so the Гайди tab can surface it on its own. Falls
  // back to funnelStore.insight (sessionStorage) for the brief window
  // right after finishing the assessment, before the DB save lands —
  // same reasoning as ParticipantOverview.tsx's identical fallback.
  const [savedAssessment, setSavedAssessment] = useState<SavedAssessment | null>(null);
  useEffect(() => {
    if (!session) return;
    fetchAssessmentResult(session.profile.id).then(setSavedAssessment);
  }, [session?.profile.id]);
  const insight = savedAssessment ?? funnelStore.insight;

  // Sorted highest-relevance-first (primary-state match before
  // secondary), zero-score guides excluded entirely — feeds both the
  // "Мої рекомендації" filter's item order and the "Для вас зараз"
  // teaser's single pick below.
  // "Вже придбані" (2026-08-30) — real acquisitions (enrollments), not
  // merely bookmarked (savedContent) — a wishlist item isn't a signal
  // that the person actually liked/used that guide the way an
  // enrollment is.
  const ownedGuideIds = useMemo(
    () => new Set(allEnrollments.filter((e) => e.kind === "guide").map((e) => e.contentId)),
    [allEnrollments]
  );
  const ownedGuideTags = useMemo(() => {
    const tags = new Set<string>();
    for (const g of guides) {
      if (ownedGuideIds.has(g.id)) g.tags.forEach((t) => tags.add(t));
    }
    return tags;
  }, [ownedGuideIds]);

  // Already bookmarked ("Збережено на потім" / "обране") also doesn't
  // belong in "Мої рекомендації" (2026-08-30, per Sasha's explicit
  // follow-up) — the person already knows about it and put it in their
  // own list, suggesting it back as new reads as broken, same reasoning
  // as excluding already-owned guides just above.
  //
  // Real persistence (2026-09-09, per Sasha's explicit request — "дай
  // можливість самому в кабінеті додавати гайд в обране"): a guideId
  // key means saved (the guide_saved_for_later row id, for removal); a
  // missing key means not saved/not checked yet. No longer derived from
  // the hand-typed `savedContent` array at all — see combineByType's
  // own comment for why.
  const [guideSaveIds, setGuideSaveIds] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchAllSavedGuides(userId).then((rows) => {
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      rows.forEach((row) => {
        map[row.guideId] = row.id;
      });
      setGuideSaveIds(map);
    });
    return () => {
      cancelled = true;
    };
    // Also re-reads when a guide's preview page saves/unsaves it — see
    // guideSavesVersion's own comment on Props.
  }, [session?.profile.id, guideSavesVersion]);

  // "Ви переглянули X із Y розділів" (2026-09-09, per Sasha's explicit
  // spec — a guide's progress should read in real sections read, not an
  // artificial %). One bulk fetch, keyed by guideId → how many distinct
  // sections this person has viewed for that guide; the total each
  // guide has is static (countGuideSections on its own `content`),
  // computed per-card in ContentCard below rather than stored here.
  // Refetched whenever guideSectionViewsVersion changes — that's the
  // signal a guide overlay just recorded a new view.
  const [guideSectionCounts, setGuideSectionCounts] = useState<Record<string, number>>({});
  // Distinguishes "haven't checked yet" from "checked, genuinely zero
  // sections viewed" (2026-09-16 technical audit) — without this, the
  // very first render after mount/session-change has guideSectionCounts
  // still at its {} initial value, and withRealGuideStatus below would
  // read every guide's viewed count as 0 and (briefly, until the fetch
  // resolves) demote an already-COMPLETED guide to "in-progress" — a
  // real, if brief, incorrect-status flash. Same tri-state idiom this
  // file already uses for realStoppedSeconds below (a missing/not-yet-
  // confirmed value must never be treated as a confirmed one).
  const [guideSectionCountsLoaded, setGuideSectionCountsLoaded] = useState(false);
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchAllSectionViews(userId).then((counts) => {
      if (!cancelled) {
        setGuideSectionCounts(counts);
        setGuideSectionCountsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id, guideSectionViewsVersion]);

  const savedGuideIds = useMemo(
    () => new Set(Object.keys(guideSaveIds).filter((id) => guideSaveIds[id])),
    [guideSaveIds]
  );

  // Single source of truth for guide completion (lib/guideProgress.ts,
  // 2026-09-15 QA follow-up) — a NEW array (`enrollments` itself is
  // untouched) where every GUIDE entry's `status` reflects real
  // section-view completion instead of the static demo field. Programs
  // and meditations pass through unchanged. Replaces every direct read
  // of `enrollments` below that decides "in progress"/"completed"/
  // "available to continue" for a guide — fixes a guide being able to
  // show "✓ Опрацьовано" on its card while still counting as
  // in-progress for the filter/CTA/"Продовжити".
  // Guides corrected against real section-view data — this part stays
  // memoized on guideSectionCounts (an ASYNC Supabase fetch; see that
  // state's own comment for why it needs an explicit version-bump
  // dependency to know when to recompute).
  const guideCorrectedEnrollments = useMemo(
    () =>
      guideSectionCountsLoaded
        ? withRealGuideStatus(allEnrollments, guideSectionCounts, (guideId) => {
            const guide = guides.find((g) => g.id === guideId);
            return guide ? getGuideSectionCount(guide) : 0;
          })
        : allEnrollments,
    [allEnrollments, guideSectionCounts, guideSectionCountsLoaded]
  );
  // Programs corrected against real per-item progress
  // (lib/programProgress.ts, 2026-09-16 technical audit) — deliberately
  // NOT wrapped in its own useMemo. Unlike guide section views,
  // per-item program progress (utils/demoProgressStore.ts) is read
  // synchronously (localStorage, no fetch) with no version-bump signal
  // anywhere — it's the same cheap, synchronous read ContentCard's own
  // `programProgress` already does inline on every render. Memoizing
  // this against a dependency that never changes when a program is
  // actually finished (there's no such dependency to name) would mean a
  // program completed for real in the ProgramExperience overlay keeps
  // reading as "in-progress" here until something UNRELATED happens to
  // change guideSectionCounts — recomputing this trivial `.map` on every
  // render costs nothing and matches what ContentCard already does.
  const correctedEnrollments = withRealProgramStatus(guideCorrectedEnrollments, (contentId) =>
    getProgramProgress(session?.profile.id ?? null, contentId, false)
  );

  // Surfaced in the UI (not just console.error) — 2026-09-09, added
  // after Sasha reported the star "просто перекидывает, но не
  // сохраняется": that symptom is exactly what a swallowed error looks
  // like (Supabase not configured in this environment, a real RLS
  // rejection, a table that isn't actually there yet, etc.) — with
  // nothing but a console log, there's no way to tell which from the
  // running app. This makes the real reason visible without opening
  // devtools.
  const [guideSaveError, setGuideSaveError] = useState<string | null>(null);
  // Same visible-error idea, for the meditation ♡ "Моя практика" toggle
  // (2026-09-24, per Sasha's repeated "не работає" report) — this used
  // to return completely silently when `session` wasn't ready yet
  // (`if (!userId) return;`), which is exactly the same failure class
  // guideSaveError was added for above: a click that visibly does
  // nothing, with no way to tell why from the running app.
  const [practiceSaveError, setPracticeSaveError] = useState<string | null>(null);

  // Same optimistic-toggle-with-rollback shape as togglePracticeSaved
  // below — independent of enrollment status, so bookmarking an already
  // owned/completed guide is allowed too (a real bookmark can coexist
  // with actually having the thing).
  const toggleGuideSaved = async (guideId: string, guideTitle?: string) => {
    const userId = session?.profile.id;
    // This used to return silently — found via Sasha's report ("нічого
    // не пише"): a missing session is exactly the kind of failure that
    // produced zero visible feedback before, same class of bug the
    // error banner above was just added to catch. Now it says so
    // instead of doing nothing.
    if (!userId) {
      setGuideSaveError("Не вдалося визначити акаунт — спробуйте перезайти.");
      return;
    }
    setGuideSaveError(null);
    const existingId = guideSaveIds[guideId];
    if (existingId) {
      setGuideSaveIds((prev) => ({ ...prev, [guideId]: null }));
      try {
        await removeSavedGuide(existingId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося прибрати з обраного:", err);
        setGuideSaveError(errorMessage(err));
        setGuideSaveIds((prev) => ({ ...prev, [guideId]: existingId }));
      }
      return;
    }
    setGuideSaveIds((prev) => ({ ...prev, [guideId]: "saving" }));
    try {
      const saved = await addSavedGuide({ guideId, guideTitle, userId });
      setGuideSaveIds((prev) => ({ ...prev, [guideId]: saved.id }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося додати в обране:", err);
      setGuideSaveError(errorMessage(err));
      setGuideSaveIds((prev) => ({ ...prev, [guideId]: null }));
    }
  };

  // Real program participation — 2026-09-21, Overview/Learning
  // consistency follow-up. This whole block used to be local state
  // (bulk content_progress fetch, bulk program_saved_for_later fetch,
  // bulk real-catalog resolution, buildProgramLearningItems assembly)
  // — now it lives once in context/ProgramParticipationContext.tsx,
  // shared with ParticipantOverview.tsx (and ParticipantEmotionalProfile.tsx),
  // so switching between the dashboard's keep-alive tabs never
  // re-fetches or shows disagreeing program data. See that file's own
  // header for the full contract; this destructure is the only thing
  // that changed here — every downstream usage below (programLearningItems,
  // realProgramMetaById, programSaveIds, savedProgramIds,
  // toggleProgramSaved, programSaveError, programsLoading) keeps its
  // original name and behavior. (savedProgramIds itself isn't read
  // directly here anymore — buildProgramLearningItems already consumes
  // it inside the context to produce `.saved`/`status` on each item.)
  const programParticipation = useProgramParticipation();
  const programLearningItems = programParticipation.items;
  const realProgramMetaById = programParticipation.realProgramMetaById;
  const programSaveIds = programParticipation.programSaveIds;
  const toggleProgramSaved = programParticipation.toggleProgramSaved;
  const programSaveError = programParticipation.saveError;
  const clearProgramSaveError = programParticipation.clearSaveError;
  // Real activity/saves haven't come back yet — showing an empty grid
  // here would read exactly like "you have nothing," which is just as
  // misleading as the old flash of static demo enrollments this
  // replaces (2026-09-21, per the architecture task's explicit "avoid
  // a flash of fake enrollment data" requirement — the same principle
  // extends to a false-empty flash, not just a false-populated one).
  const programsLoading = tab === "program" && programParticipation.loading;

  const recommendedGuides = useMemo(() => {
    return guides
      .filter((g) => !ownedGuideIds.has(g.id) && !savedGuideIds.has(g.id))
      .map((g, index) => ({ g, index, score: guideRelevanceScore(g, insight, ownedGuideTags) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.g);
  }, [insight, ownedGuideIds, savedGuideIds, ownedGuideTags]);
  const topRecommendedGuide = recommendedGuides[0] ?? null;

  // Nothing new to suggest and nothing in progress — typically once every
  // guide the person has is already worked through. The block should not
  // vanish then: it points back at the most relevant guide they already
  // have ("open again"), so the top of the Гайди tab always has its
  // "Може бути корисно зараз" moment.
  const revisitGuide = useMemo(() => {
    const owned = guides.filter((g) => ownedGuideIds.has(g.id) || savedGuideIds.has(g.id));
    if (owned.length === 0) return null;
    return (
      owned
        .map((g, index) => ({ g, index, score: guideRelevanceScore(g, insight, ownedGuideTags) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.g ?? null
    );
  }, [insight, ownedGuideIds, savedGuideIds, ownedGuideTags]);

  // Real saved position (meditation_audio_positions) per in-progress
  // meditation — per Sasha's explicit call (2026-08-28): the "Зупинено
  // на M:SS" shown below must actually match where the person stopped,
  // AND must disappear once the meditation is actually finished. The
  // demo enrollment's `status`/`progressPercent` can't be trusted for
  // either — they're hand-typed and never move just because someone
  // for-real finished a session in the player (which clears this same
  // Supabase row instead). So a number here means "confirmed
  // resumable," null means "confirmed nothing to resume" (finished, or
  // never for-real started), and a missing key means "not checked
  // yet" — ContentCard only ever shows "Зупинено на" for the first
  // case, never guesses from the other two.
  //
  // Re-fetched whenever player.positionVersion changes (not just on
  // this component's own mount) — per Sasha's follow-up ("тут надо
  // тоже чтобы обновлялось"): this page can stay mounted for a long
  // time (the dashboard's keep-alive tabs), during which the person
  // might keep listening further in the mini player, pause, or finish
  // — each of those needs to show up here without requiring a full
  // remount.
  // Every meditation in the catalog, not just enrolled ones (2026-09-24,
  // per Sasha's explicit call — "сделай систему сохранения такой же як і
  // в програмах"). This used to be enrolled ids ∪ the hand-typed
  // `savedContent` demo array's meditation ids — but now that "saved"
  // for meditations is the real content_item_saved_practices rows (the
  // same ♡ toggle state), the "which ids might be saved" question can't
  // be answered from a static list anymore: any meditation in the
  // catalog could be real-saved, enrolled or not. The catalog is small
  // (a handful of demo entries), so checking all of them is cheap and,
  // unlike the old static list, can never miss a real save.
  const allMeditationIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...allEnrollments.filter((e) => e.kind === "meditation").map((e) => e.contentId),
          ...meditations.map((m) => m.id),
        ])
      ),
    [allEnrollments]
  );

  const [realStoppedSeconds, setRealStoppedSeconds] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId || allMeditationIds.length === 0) return;
    let cancelled = false;
    Promise.all(
      allMeditationIds.map((id) =>
        fetchMeditationAudioPosition(id, userId)
          .then((pos) => [id, pos] as const)
          .catch(() => [id, null] as const)
      )
    ).then((results) => {
      if (cancelled) return;
      setRealStoppedSeconds((prev) => {
        const next = { ...prev };
        for (const [id, pos] of results) {
          next[id] = isResumablePosition(pos) ? pos!.positionSeconds : null;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id, player.positionVersion, allMeditationIds]);

  // "♡ Зберегти" state per meditation card — same "Моя практика"
  // toggle as the meditation's own completed screen
  // (MeditationExperience.tsx), now reachable straight from the card
  // too, per Sasha's explicit follow-up (2026-08-28). A string means
  // saved (the saved_practices row id, for removal); null means
  // confirmed not saved; a missing key means not checked yet.
  const [practiceSavedIds, setPracticeSavedIds] = useState<Record<string, string | null>>({});
  // Guards a real race, found from Sasha's report "додає, але тільки
  // після оновлення сторінки": the bulk fetch below can still be in
  // flight when the person clicks a heart, and used to resolve *after*
  // the click, overwriting the just-confirmed state with its stale
  // pre-click snapshot — the write had actually gone through, it just
  // looked like it hadn't. Any toggle click stamps this ref with "now";
  // a fetch that started before that stamp is stale and must not apply
  // its results at all (the version-triggered refetch right after the
  // toggle succeeds will bring in the true state instead).
  // Per-contentId, not a single shared timestamp (2026-09-24 hardening —
  // Sasha's repeated "не работает" report on the heart toggle): a single
  // ref meant a bulk refetch triggered by toggling ONE meditation could,
  // in principle, still decide whether to apply its results for every
  // OTHER meditation's row too. Tracking recency per id means a fetch
  // that started before THIS item's last local edit is only skipped for
  // THIS item — every other id in the same bulk response still applies
  // normally.
  const lastLocalPracticeEditAtRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId || allMeditationIds.length === 0) return;
    let cancelled = false;
    const fetchStartedAt = Date.now();
    Promise.all(
      allMeditationIds.map((id) =>
        fetchSavedPractice(id, userId)
          .then((row) => [id, row] as const)
          .catch(() => [id, null] as const)
      )
    ).then((results) => {
      if (cancelled) return;
      setPracticeSavedIds((prev) => {
        const next = { ...prev };
        for (const [id, row] of results) {
          if ((lastLocalPracticeEditAtRef.current[id] ?? 0) > fetchStartedAt) continue;
          next[id] = row ? row.id : null;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Also re-fetches whenever savedPracticeVersion bumps — e.g. saved
    // from the meditation's own completed screen (MeditationExperience),
    // a different component instance this one has no other way to hear
    // about. Same shape as positionVersion above for "Зупинено на".
  }, [session?.profile.id, allMeditationIds, player.savedPracticeVersion]);

  // Same exact shape as ProgramParticipationContext.tsx's
  // toggleProgramSaved (2026-09-24, per Sasha's explicit call — "сделай
  // систему сохранения такой же как и в програмах"): optimistic set
  // BEFORE the await (so the click is instant either way), a visible
  // error banner instead of a silent no-op when the account/session
  // isn't ready, and a rollback to the pre-click value if the request
  // actually fails — programs don't leave a save "stuck" showing success
  // when it wasn't persisted, and meditations now match that exactly.
  // Still bumps savedPracticeVersion on confirmed success only — unlike
  // toggleProgramSaved, which has no equivalent signal to send, this
  // heart also needs to notify MeditationExperience's own completed-
  // screen toggle and ParticipantSaved's "Моя практика" list, separate
  // mounted components with their own copies of this state.
  // 2026-09-24 RLS diagnostic (per Sasha's live console trace — a "new
  // row violates row-level security policy" 42501 on
  // content_item_saved_practices, plus the IDENTICAL error on
  // user_sessions right after login, plus a 401 on the same save
  // request): the server-side Postgres policy is `auth.uid() = user_id`,
  // and it kept rejecting the write even after a full sign-out +
  // clear-site-data + fresh sign-in — which rules out a stale cached
  // token. The one thing that couldn't be verified from the browser
  // console alone is whether the *live* Supabase session, at the exact
  // moment of this specific click, actually resolves to the same id as
  // `session.profile.id` (the value this function has been sending as
  // `user_id`). This checks that directly, right before the write, and
  // reports a precise diagnosis instead of the raw Postgres error —
  // "not logged in at all" vs. "logged in as a different id than the
  // profile shown" are two different problems with two different fixes,
  // and there was no way to tell them apart from the RLS message alone.
  async function verifyLiveAuthMatches(expectedUserId: string): Promise<string | null> {
    if (!supabase) return "Supabase не налаштований у цьому середовищі.";
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return `Сесія Supabase недійсна (${error.message}). Потрібно вийти й увійти знову.`;
    }
    const liveUserId = data.user?.id ?? null;
    if (!liveUserId) {
      return "Supabase не бачить активної сесії входу (auth.uid() порожній), хоча профіль у додатку показаний. Потрібно вийти й увійти знову.";
    }
    if (liveUserId !== expectedUserId) {
      return `Акаунт у сесії Supabase (${liveUserId}) не збігається з акаунтом профілю (${expectedUserId}) — саме тому сервер відхиляє запис. Вийдіть і увійдіть під тим самим акаунтом ще раз.`;
    }
    return null;
  }

  const togglePracticeSaved = async (contentId: string) => {
    const userId = session?.profile.id;
    if (!userId) {
      setPracticeSaveError("Не вдалося визначити акаунт — спробуйте перезайти.");
      return;
    }
    const existingId = practiceSavedIds[contentId];
    // "saving" is a local-only placeholder written below while a save is
    // in flight — it is never a real row id. Without this guard, a second
    // click during that window falls into the removal branch below and
    // tries to delete a row with id="saving", which Postgres rejects
    // ("invalid input syntax for type uuid"), and the failure handler then
    // rolls the state back to that same placeholder — permanently stuck.
    // Simplest correct behavior: ignore clicks while a save is already
    // in flight for this item.
    if (existingId === "saving") return;
    setPracticeSaveError(null);
    lastLocalPracticeEditAtRef.current[contentId] = Date.now();
    if (existingId) {
      setPracticeSavedIds((prev) => ({ ...prev, [contentId]: null }));
      try {
        const authIssue = await verifyLiveAuthMatches(userId);
        if (authIssue) throw new Error(authIssue);
        await removeSavedPractice(existingId);
        player.bumpSavedPracticeVersion();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося прибрати з «Моя практика»:", err);
        setPracticeSaveError(errorMessage(err));
        setPracticeSavedIds((prev) => ({ ...prev, [contentId]: existingId }));
      }
      return;
    }
    const info = getContentInfo(contentId, "meditation");
    setPracticeSavedIds((prev) => ({ ...prev, [contentId]: "saving" }));
    try {
      const authIssue = await verifyLiveAuthMatches(userId);
      if (authIssue) throw new Error(authIssue);
      const saved = await addSavedPractice({
        itemId: contentId,
        userId,
        kind: "meditation",
        itemTitle: info?.title,
      });
      setPracticeSavedIds((prev) => ({ ...prev, [contentId]: saved.id }));
      player.bumpSavedPracticeVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти в «Моя практика»:", err);
      setPracticeSaveError(errorMessage(err));
      setPracticeSavedIds((prev) => ({ ...prev, [contentId]: null }));
    }
  };

  const openContent = (kind: ContentKind, id: string) => {
    if (kind === "program") {
      if (onContinueProgram) {
        onContinueProgram(id);
        return;
      }
      onOpenProgram?.(id);
      return;
    }
    if (kind === "guide") {
      if (onContinueGuide) {
        onContinueGuide(id);
        return;
      }
      onOpenGuide?.(id);
      return;
    }
    if (kind === "meditation") {
      if (onContinueMeditation) {
        onContinueMeditation(id);
        return;
      }
      onOpenMeditation?.(id);
    }
  };

  // Scoped to the currently open sub-tab (kind === tab) — a person
  // looking at "Медитації" wants a meditation suggested back to them,
  // not whatever program happens to be in progress elsewhere. Was
  // picking the first in-progress enrollment across ALL types
  // regardless of tab, which is why a program could show up under
  // "Медитації" (Sasha's screenshot, 2026-08-28). No fallback to
  // another type when there's nothing in-progress for this one — an
  // irrelevant suggestion is worse than none.
  // Reads `correctedEnrollments`, not raw `enrollments` — a guide that's
  // really completed by section views shouldn't still offer itself as
  // the "Зараз вам може бути корисно продовжити" target just because
  // the static demo field never moved (2026-09-15 QA fix).
  //
  // Uses the SAME picker as Overview's own "continue" card
  // (lib/dashboardPriority.ts's pickContinueEnrollment — most recently
  // accessed, progressPercent as tiebreak), just pre-filtered to this
  // tab's kind, instead of a plain `.find()` that returned whichever
  // in-progress item happened to come first in the static `enrollments`
  // array (2026-09-16 technical audit). With 2+ in-progress items of
  // the same kind, that used to let this page's own continue block
  // disagree with Overview's about which one to resume — same class of
  // cross-page disagreement the audit brief calls out, just for
  // "what's next" instead of a status label. Reusing the existing
  // function also means there's still exactly one "how do we pick a
  // continue target" algorithm in the app, not two.
  // Programs (2026-09-21) pick their continue target from the real,
  // activity-derived list above, not the static `enrollments` array —
  // the architecture audit's explicit Step 10 requirement: this widget
  // must not disagree with the real grid directly below it. Still the
  // exact same picker (lib/dashboardPriority.ts's pickContinueEnrollment
  // — most-recent-access, percent as tiebreak), just fed real input for
  // this one tab instead of a globally rewritten dashboardPriority.
  // Guides/meditations are completely unaffected.
  const programEnrollmentsForContinue = useMemo(
    () => programLearningItems.map((i) => i.enrollment).filter((e): e is Enrollment => Boolean(e)),
    [programLearningItems]
  );
  const continueTarget: Enrollment | null =
    tab === "program"
      ? pickContinueEnrollment(programEnrollmentsForContinue)
      : pickContinueEnrollment(correctedEnrollments.filter((e) => e.kind === tab));
  const continueInfo = continueTarget
    ? getContentInfo(continueTarget.contentId, continueTarget.kind, realProgramMetaById[continueTarget.contentId])
    : null;

  // "Мої рекомендації" is the one filter that surfaces content beyond
  // what the person has already started/saved (2026-08-30, per Sasha's
  // explicit call) — a recommendation the person hasn't touched yet is
  // the whole point, so it can't be built from combineByType() alone
  // (that only ever returns already-enrolled/saved rows). A
  // recommended guide the person DID already start/save keeps showing
  // its real status/progress instead of being flattened to a bare
  // "recommended" card — the suggestion already did its job.
  const guideItemsById = useMemo(() => {
    const map = new Map<string, LearningItem>();
    for (const item of combineByType("guide", savedGuideIds, correctedEnrollments, savedContent)) map.set(item.contentId, item);
    return map;
  }, [savedGuideIds, correctedEnrollments]);

  // Real "Моя практика" saves, as a Set — the same real
  // content_item_saved_practices rows the ♡ toggle reads/writes
  // (practiceSavedIds), reshaped into the id-Set combineByType expects
  // (2026-09-24, per Sasha's explicit call — "сделай систему сохранения
  // такой же как и в програмах"). Before this, the meditation "Збережені"
  // tab read from the hand-typed `savedContent` demo array instead —
  // completely disconnected from the real heart toggle, which is exactly
  // why a demo-seeded "saved" meditation (Самопідтримка) could never be
  // removed from "Збережені" no matter what the heart did.
  const savedMeditationIds = useMemo(
    () => new Set(Object.keys(practiceSavedIds).filter((id) => practiceSavedIds[id])),
    [practiceSavedIds]
  );

  // The real-saved Set that actually matches the open tab — guides read
  // savedGuideIds, meditations read savedMeditationIds. Programs no
  // longer go through combineByType at all (see programLearningItems
  // above) — they read savedProgramIds directly inside
  // buildProgramLearningItems instead.
  const realSavedIdsForTab =
    tab === "guide" ? savedGuideIds : tab === "meditation" ? savedMeditationIds : new Set<string>();

  // A saved item can now ALSO be in-progress/completed at the same time
  // (2026-09-21 for programs, extended 2026-09-24 to guides/meditations
  // too — see combineByType's own comment) — the "Збережені" filter checks
  // that flag in addition to the older status === "saved" convention (used
  // for a saved-but-not-enrolled item of any kind), so neither case needs
  // its own separate branch here.
  // Program-only exception (2026-09-24, per Sasha's explicit report —
  // "если не начато не должно появляться во вкладке в процесі"): a
  // program's item.status reads "in-progress" the instant ANY item is
  // touched (contentProgress.ts's deriveState — see ctaLabel's own
  // comment above for the full reasoning), which is correct for keeping
  // it out of the "not started at all" bucket in "Усі"/"Продовжити", but
  // wrong for the "В процесі" tab specifically: a person who opened one
  // item and finished nothing has 0 real required items done, and
  // filing that under "in progress" here would show a 0%-progress card
  // in a tab whose entire point is "things you're partway through".
  //
  // 2026-09-29 (per Sasha — "для гайдів якщо гайд не почато то він не
  // може бути доданий в 'В процесі'"): the exact same bug exists for
  // guides, for the exact same reason — guideStatusToEnrollmentStatus
  // (lib/guideProgress.ts) deliberately maps a genuinely untouched guide
  // ("not_started", 0 sections viewed) onto EnrollmentStatus
  // "in-progress" too ("the person owns it, they just haven't opened a
  // section yet" — same convention as a freshly-enrolled program). That
  // comment above claiming "Guides/meditations are untouched — they
  // don't have this touched-but-0%-done state" was simply wrong once
  // that guide-status correction shipped; this closes the same gap the
  // program branch already closes, using the same real, already-
  // corrected `progressPercent` withRealGuideStatus computes (0 for a
  // guide nobody has opened yet, >0 the moment even one section has been
  // viewed). Meditations still have no equivalent "touched but 0% done"
  // concept (no percent at all, only a real resumable position or none),
  // so they remain genuinely unaffected.
  const matchesStatusFilter = (i: LearningItem): boolean => {
    if (statusFilter === "all") return true;
    if (statusFilter === "saved") return i.status === "saved" || i.saved === true;
    if (statusFilter === "in-progress" && i.kind === "program" && i.status === "in-progress") {
      const percent = getProgramProgress(session?.profile.id ?? null, i.contentId, false)?.percent ?? 0;
      return percent > 0;
    }
    if (statusFilter === "in-progress" && i.kind === "guide" && i.status === "in-progress") {
      const percent = i.enrollment?.progressPercent ?? 0;
      return percent > 0;
    }
    return i.status === statusFilter;
  };

  // Drops any item that no longer resolves to real catalog content
  // (2026-09-29 fix, found via Sasha's live report: "Збережені" showed a
  // blank grid cell instead of the "Тут з'явиться контент..." empty
  // state). Cause: a real guide_saved_for_later/content_item_saved_
  // practices row can point at a guide/meditation id that used to exist
  // and has since been removed from the static catalog (e.g. one of the
  // guides pruned from data/guides.ts on 2026-09-29 that someone had
  // bookmarked before the prune) — combineByType has no opinion about
  // catalog membership, so that stale row still produces a LearningItem,
  // ContentCard's own `if (!info) return null` then renders nothing for
  // it, and the grid ends up with items.length > 0 but zero visible
  // cards — the empty-state check below never fires because it isn't
  // actually empty, just unrenderable. Filtering here, once, before that
  // check runs, means a stale save always reads as "nothing here" rather
  // than a silent blank patch of grid.
  const items = (
    statusFilter === "recommended"
      ? recommendedGuides.map(
          (g): LearningItem => guideItemsById.get(g.id) ?? { contentId: g.id, kind: "guide", status: "recommended" }
        )
      : tab === "program"
      ? programLearningItems.filter(matchesStatusFilter)
      : combineByType(tab, realSavedIdsForTab, correctedEnrollments, savedContent).filter(matchesStatusFilter)
  ).filter((item) => Boolean(getContentInfo(item.contentId, item.kind, realProgramMetaById[item.contentId])));

  // "Мої рекомендації" only ever shows up on Гайди, and only once
  // there's actually something to recommend — an empty personalization
  // chip would just be confusing rather than reading as "nothing for
  // you today" (2026-08-30, per Sasha's explicit call).
  // Meditation drops the "В процесі" chip entirely (2026-09-23, per
  // Sasha's explicit follow-up) — a meditation's real "in progress" state
  // is a resumable audio position, not the coarse demo enrollment status
  // this filter reads, so the chip never lined up with what the card
  // itself actually shows (see MeditationLearningCard's own isStoppedMeditation
  // logic). "Завершені" dropped too (2026-09-24, same reasoning, same
  // explicit call) — a meditation has no real "completed" concept the way
  // a program/guide does; it's just something you can replay any time.
  // Programs/guides are unaffected.
  const filterOptions: StatusFilter[] =
    tab === "guide" && recommendedGuides.length > 0
      ? ["all", "in-progress", "completed", "saved", "recommended"]
      : tab === "meditation"
      ? ["all", "saved"]
      : ["all", "in-progress", "completed", "saved"];

  const filterLabel: Record<StatusFilter, string> = {
    all: "Усі",
    "in-progress": "В процесі",
    completed: "Завершені",
    saved: "Збережені",
    recommended: "Мої рекомендації",
  };

  // Empty-grid copy, one per filter (2026-09-29, per Sasha's explicit
  // follow-up — "текст для этого должен быть разный для збережених
  // початих и завершених"): the old single "почнете, збережете або
  // завершите" line answered every possible filter at once, which read
  // oddly once you'd actually clicked into one specific filter and it
  // was empty — "Завершені" showing "нічого не почато/збережено/
  // завершено" when the real answer is just "nothing finished yet" is a
  // worse message than a plain, filter-specific one. Kind-agnostic
  // wording ("контент") since this same grid/empty-state serves
  // programs and meditations too, not just guides.
  const emptyStateCopy: Record<StatusFilter, string> = {
    all: "Тут з'явиться контент, який ви почнете, збережете або завершите.",
    "in-progress": "Тут з'явиться контент, який ви почали, але ще не завершили.",
    completed: "Тут з'явиться контент, який ви вже завершили.",
    saved: "Тут з'явиться контент, який ви зберегли на потім.",
    recommended: "Поки немає нових рекомендацій для вас.",
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Моє навчання</h1>
        <p className="text-black/60 mt-0.5">
          Усі ваші програми, гайди та медитації в одному місці.
        </p>
      </div>

      {/* ВАШ МАРШРУТ — for programs, real per-item progress
          (lib/programProgress.ts) instead of the old hand-typed
          moduleProgress numbers; guides/meditations still use the
          coarser progressPercent until their own experiences (Phase 6/7)
          exist. Compact utility framing (2026-09-16, viewport-first
          refinement) — same structure/copy/logic as before, just less
          vertical weight so it reads as "continue action", not a hero. */}
      {continueTarget && continueInfo && continueTarget.kind === "meditation" && (() => {
        // Meditation's own "continue" surface (2026-09-23 redesign) —
        // an atmospheric gradient wash instead of the white card the
        // other two kinds use, per Sasha's explicit "not a white card"
        // spec. No module/percent line (meditations don't carry real
        // progress fractions — see isMeditationNoProgress's own
        // comment below), just the title + real duration + CTA.
        const [c1, c2, c3] = meditationPalette(continueTarget.contentId);
        // Same real-position check as MeditationLearningCard's own
        // isStoppedMeditation (2026-09-24, per Sasha's explicit report:
        // this block always said "Продовжити" even for a meditation that
        // had never actually been played, e.g. right after being saved
        // via the ♡ toggle — resumable is a real saved-audio-position
        // fact, not something a demo enrollment status can tell us).
        const isResumable = typeof realStoppedSeconds[continueTarget.contentId] === "number";
        return (
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{ background: `linear-gradient(120deg, ${c1}26, ${c2}26 55%, ${c3}26)` }}
          >
            <div className="pointer-events-none absolute -top-10 -right-6 w-40 h-40 rounded-full opacity-50 blur-3xl" style={{ background: c3 }} />
            <div className="pointer-events-none absolute -bottom-12 -left-10 w-36 h-36 rounded-full opacity-40 blur-3xl" style={{ background: c1 }} />
            <div className="relative flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="text-[14px] font-medium text-black/60 mb-1">
                  {isResumable ? "Продовжити практику" : "Розпочати практику"}
                </div>
                <div className="font-semibold text-[16px]">{continueInfo.title}</div>
                <div className="text-[12px] text-black/60 mt-0.5">{continueInfo.duration}</div>
              </div>
              <button
                onClick={() => openContent("meditation", continueTarget.contentId)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-black/80 text-white text-[14px] font-medium hover:bg-black transition shrink-0"
              >
                {isResumable ? "Продовжити →" : "Почати →"}
              </button>
            </div>
          </div>
        );
      })()}

      {continueTarget && continueInfo && continueTarget.kind === "program" && (() => {
        const routeProgress = getProgramProgress(session?.profile.id ?? null, continueTarget.contentId, false);
        return (
        <div className="rounded-2xl bg-gradient-to-br from-[#eef2ff] to-white border border-black/5 p-4">
          <div className="text-[14px] font-medium text-black/60 mb-2">
            Зараз вам може бути корисно продовжити
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[16px] shrink-0 border border-black/5">
              <span className="text-black/45"><Icon name={kindIcon[continueTarget.kind]} size={18} /></span>
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="font-semibold text-[16px]">{continueInfo.title}</div>
              <div className="text-[12px] text-black/60 mt-0.5">
                {kindLabel[continueTarget.kind]} · {continueInfo.author}
                {routeProgress &&
                  ` · Модуль ${routeProgress.currentModuleIndex + 1} із ${routeProgress.totalModules}`}
              </div>
              {routeProgress && (
                <div className="flex items-center gap-2 mt-1.5 max-w-[280px]">
                  <div className="flex-1 h-1 rounded-full bg-black/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${routeProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => openContent(continueTarget.kind, continueTarget.contentId)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
            >
              {/* 0%-but-touched fix (2026-09-24) — a program can land
                  here (real activity, so it's a real "continue"
                  candidate) while genuinely having 0 required items
                  done yet, which must read "Почати", not "Продовжити". */}
              {routeProgress && routeProgress.percent === 0 ? "Почати →" : "Продовжити →"}
            </button>
          </div>
        </div>
        );
      })()}

      {/* "Може бути корисно зараз" (2026-09-29 Гайди redesign, replacing
          the old shared blue→purple "продовжити" card for guides — per
          Sasha's explicit brief: this must read as a PERSONAL RELEVANCE
          moment ("this might be useful for you now"), not another
          catalog card. Same real continueTarget/continueInfo data as
          the program block above — nothing about the recommendation
          logic changed, only the presentation. */}
      {continueTarget && continueInfo && continueTarget.kind === "guide" && (() => {
        const guideRec = guides.find((g) => g.id === continueTarget.contentId);
        const metaBits = [
          continueInfo.author,
          guideRec ? guideSizeLabel(guideRec) : null,
        ].filter(Boolean);
        return (
          <div className="rounded-2xl bg-gradient-to-br from-[#f3f6ff] to-white border border-black/5 p-4">
            <div className="text-[14px] font-medium text-indigo-500/70 mb-2">
              Може бути корисно зараз
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="font-semibold text-[16px]">{continueInfo.title}</div>
                <div className="text-[12px] text-black/60 mt-0.5">
                  Гайд{metaBits.length > 0 ? ` · ${metaBits.join(" · ")}` : ""}
                </div>
              </div>
              <button
                onClick={() => openContent("guide", continueTarget.contentId)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
              >
                Відкрити →
              </button>
            </div>
          </div>
        );
      })()}

      {/* "Для вас зараз" (2026-08-30, per Sasha's explicit call) — the
          single best personalized match, guide-only, same restrained
          "personal relevance" visual family as the block above (one is
          "pick up where you left off", this one is "here's something
          new, chosen for you"). Only appears once there's a real
          assessment result with a genuine tag match — no assessment, or
          nothing relevant in the catalog, means this just doesn't
          render, never a generic fallback guide. Suppressed whenever
          the continue block above is already showing (2026-09-09, per
          Sasha's explicit call — two teasers stacked read as noise). */}
      {tab === "guide" && !continueTarget && topRecommendedGuide && (
        <div className="rounded-2xl bg-gradient-to-br from-[#f3f6ff] to-white border border-black/5 p-4">
          <div className="text-[14px] font-medium text-indigo-500/70 mb-2">
            Може бути корисно зараз
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="font-semibold text-[16px]">{topRecommendedGuide.title}</div>
              <div className="text-[12px] text-black/60 mt-0.5">
                Гайд · {topRecommendedGuide.author}
                {` · ${guideSizeLabel(topRecommendedGuide)}`}
              </div>
            </div>
            <button
              onClick={() => openContent("guide", topRecommendedGuide.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
            >
              Відкрити →
            </button>
          </div>
        </div>
      )}

      {/* Same block once there is nothing new or in progress to point at:
          the most relevant guide the person already has, to open again. */}
      {tab === "guide" && !continueTarget && !topRecommendedGuide && revisitGuide && (
        <div className="rounded-2xl bg-gradient-to-br from-[#f3f6ff] to-white border border-black/5 p-4">
          <div className="text-[14px] font-medium text-indigo-500/70 mb-2">Може бути корисно зараз</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="font-semibold text-[16px]">{revisitGuide.title}</div>
              <div className="text-[12px] text-black/60 mt-0.5">
                Гайд · {revisitGuide.author}
              </div>
            </div>
            <button
              onClick={() => openContent("guide", revisitGuide.id)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
            >
              Відкрити знову →
            </button>
          </div>
        </div>
      )}

      {/* Тип контенту тепер обирається в сайдбарі (Моє навчання →
          Програми/Медитації/Гайди) — тут лишається тільки фільтр
          статусу для вже обраного типу. Гайди отримують власний,
          більш "людський" заголовок + підзаголовок (2026-08-30, per
          Sasha's explicit call) замість спільного {icon}+назва
          формулювання — програми/медитації лишаються без змін. */}
      <div className="flex flex-col gap-5">
        {guideSaveError && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <span>Не вдалося зберегти в обране: {guideSaveError}</span>
            <button
              onClick={() => setGuideSaveError(null)}
              className="text-red-700/60 hover:text-red-700 shrink-0"
              aria-label="Закрити"
            >
              ✕
            </button>
          </div>
        )}
        {programSaveError && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <span>Не вдалося зберегти програму: {programSaveError}</span>
            <button
              onClick={() => clearProgramSaveError()}
              className="text-red-700/60 hover:text-red-700 shrink-0"
              aria-label="Закрити"
            >
              ✕
            </button>
          </div>
        )}
        {practiceSaveError && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <span>Не вдалося зберегти в «Моя практика»: {practiceSaveError}</span>
            <button
              onClick={() => setPracticeSaveError(null)}
              className="text-red-700/60 hover:text-red-700 shrink-0"
              aria-label="Закрити"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {tab === "guide" ? (
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight">Гайди</h2>
              <p className="text-black/60 text-[14px] mt-1 leading-relaxed max-w-[520px]">
                Інструменти, до яких можна повертатися тоді, коли вони вам потрібні.
              </p>
            </div>
          ) : tab === "meditation" ? (
            // No repeated "🧘 Медитації" heading here (2026-09-23 redesign)
            // — the sidebar sub-nav already shows that exact icon+label as
            // the active pill, so an identical h2 right below it just
            // duplicated the same two words. A one-line tone-setting
            // subtitle instead, same treatment guides already get above.
            <p className="text-black/60 text-[14px]">
              Практики, до яких можна повертатися щоразу, коли потрібно заспокоїтись або перезавантажитись.
            </p>
          ) : (
            <h2 className="text-[20px] font-semibold flex items-center gap-2">
              <span className="text-black/45"><Icon name={kindIcon[tab]} size={18} /></span>
              {kindLabelPlural[tab]}
            </h2>
          )}

          {/* Lighter, quieter filter bar (2026-09-29 Гайди redesign, per
              Sasha's explicit brief — "avoid making every filter look
              like a heavy pill"; extended 2026-09-29 to every tab per
              her follow-up — "і тут по дизайну зроби як у медитацій і
              гайдів": this used to only apply to the Гайди tab, leaving
              Програми/Медитації on the old bordered-pill treatment,
              which just meant the exact same status filter looked like
              two different UI components depending which tab you were
              on. Now one shared style everywhere — the active chip keeps
              strong contrast, inactive ones drop the border/fill
              entirely and read as plain quiet text until hovered. */}
          <div className="flex flex-wrap gap-1">
            {filterOptions.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[14px] font-medium transition ${
                  statusFilter === s
                    ? "bg-black text-white"
                    : "text-black/60 hover:text-black/70 hover:bg-black/[0.04]"
                }`}
              >
                {filterLabel[s]}
              </button>
            ))}
          </div>
        </div>

        {/* GRID */}
        {programsLoading ? (
          <div className="rounded-2xl bg-white border border-black/5 p-10 text-center text-black/60 text-[14px]">
            Завантажуємо ваш прогрес…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white border border-black/5 p-10 text-center text-black/60 text-[14px]">
            {emptyStateCopy[statusFilter]}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((item) =>
              item.kind === "meditation" ? (
                // Dedicated meditation card (2026-09-23 redesign) — deliberately
                // NOT the shared ContentCard below: meditations get their own
                // atmospheric visual language instead of the generic
                // program/guide LMS-card treatment. See MeditationLearningCard's
                // own header comment for the full rationale.
                <MeditationLearningCard
                  key={item.contentId}
                  item={item}
                  onOpen={() => openContent(item.kind, item.contentId)}
                  realStoppedSeconds={realStoppedSeconds[item.contentId]}
                  practiceSavedId={practiceSavedIds[item.contentId]}
                  onTogglePractice={() => togglePracticeSaved(item.contentId)}
                />
              ) : (
                <ContentCard
                  key={item.contentId}
                  item={item}
                  onOpen={() => openContent(item.kind, item.contentId)}
                  realStoppedSeconds={realStoppedSeconds[item.contentId]}
                  practiceSavedId={practiceSavedIds[item.contentId]}
                  onTogglePractice={() => togglePracticeSaved(item.contentId)}
                  guideSavedId={guideSaveIds[item.contentId]}
                  guideSectionsViewed={guideSectionCounts[item.contentId]}
                  onToggleGuideSaved={() => {
                    // No filter switch (2026-09-09, per Sasha's explicit
                    // follow-up — "щоб не було переходу, просто додавало")
                    // — just persist the toggle, stay exactly where you
                    // are. A guide starred from "Мої рекомендації" still
                    // disappears from that list on the next render (it's
                    // now saved, so it no longer qualifies as a fresh
                    // recommendation — Sasha's own earlier rule), but
                    // that's the extent of the visible change here.
                    const info = getContentInfo(item.contentId, "guide");
                    toggleGuideSaved(item.contentId, info?.title);
                  }}
                  programSavedId={programSaveIds[item.contentId]}
                  realProgramMeta={realProgramMetaById[item.contentId]}
                  onToggleProgramSaved={() => {
                    const info = getContentInfo(item.contentId, "program", realProgramMetaById[item.contentId]);
                    toggleProgramSaved(item.contentId, info?.title);
                  }}
                  userId={session?.profile.id ?? null}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContentCard({
  item,
  onOpen,
  realStoppedSeconds,
  practiceSavedId,
  onTogglePractice,
  guideSavedId,
  onToggleGuideSaved,
  guideSectionsViewed,
  programSavedId,
  onToggleProgramSaved,
  realProgramMeta,
  userId,
}: {
  item: LearningItem;
  onOpen: () => void;
  // The real meditation_audio_positions value for this item, fetched
  // by the parent — a number means confirmed resumable, null means
  // confirmed nothing to resume (finished, or never for-real started),
  // undefined means not checked yet. Only the number case ever renders
  // "Зупинено на" — see the parent's own comment for why this can't
  // be inferred from the demo enrollment's status/percent.
  realStoppedSeconds?: number | null;
  // "Моя практика" state for this meditation (lib/savedPractices.ts) —
  // a string means saved, null means confirmed not saved, undefined
  // means not checked yet. Meditation-only, per Sasha's explicit call
  // (2026-08-28) — same ♡ Зберегти concept as the completed screen,
  // now reachable straight from this card too.
  practiceSavedId?: string | null;
  onTogglePractice?: () => void;
  // "Додати в обране" (lib/guideSaves.ts) — a string means saved (the
  // guide_saved_for_later row id), null means confirmed not saved,
  // undefined means not checked yet/not a guide. Guide-only (2026-09-09,
  // per Sasha's explicit request), independent of the item's own
  // enrollment status — the ★/☆ toggle below reflects this, not
  // isSavedOnly.
  guideSavedId?: string | null;
  onToggleGuideSaved?: () => void;
  // "Ви переглянули X із Y розділів" (2026-09-09) — how many distinct
  // sections this person has viewed for this guide, from the parent's
  // bulk fetch; undefined means not loaded yet (treated as 0 below).
  // Guide-only, and only meaningful for a guide with structured
  // `content` — see countGuideSections.
  guideSectionsViewed?: number;
  // "Зберегти програму" (lib/programSaves.ts, 2026-09-21) — exact mirror
  // of guideSavedId/onToggleGuideSaved above, for programs. A string
  // means saved (the program_saved_for_later row id), null means
  // confirmed not saved, undefined means not checked yet/not a program.
  // Program-only, independent of the item's own enrollment status.
  programSavedId?: string | null;
  onToggleProgramSaved?: () => void;
  // Metadata for a REAL authored program not in the static demo catalog
  // (2026-09-21) — lets getContentInfo below resolve title/author/price
  // for it too, instead of returning null and this card silently not
  // rendering. Undefined for demo programs and every other kind (they
  // resolve entirely from the static catalogs already).
  realProgramMeta?: PublicProgram;
  // The signed-in participant's own id (2026-09-21 bug fix) — threaded
  // through to getProgramProgress below so this card's program-progress
  // read only ever touches THIS account's own scoped localStorage
  // bucket (utils/demoProgressStore.ts). Null only for a logged-out
  // render, which shouldn't happen for this card in practice (it only
  // renders inside the signed-in dashboard) but is handled safely
  // either way.
  userId: string | null;
}) {
  // "Зберегти офлайн" (2026-08-30, per Sasha's explicit call) — purely
  // on-device (lib/meditationDownloads.ts, IndexedDB), so this card
  // checks it itself rather than the parent batching it through
  // Supabase like realStoppedSeconds/practiceSavedId above. Re-checked
  // on downloadsVersion too, so downloading/removing from the
  // meditation's own intro screen shows up here without a reload.
  // Hooks run before the `!info` early return below, per the rules of
  // hooks — harmless no-ops for non-meditation cards.
  const player = useMeditationPlayer();
  const [isDownloaded, setIsDownloaded] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Visible failure state (2026-09-26 — see MeditationLearningCard's
  // identical comment: a failed download here only ever hit
  // console.error, so from the outside the button looked broken with
  // zero feedback. Confirmed root cause in data/meditations.ts's
  // offlineDownloadEnabled comment.
  const [downloadError, setDownloadError] = useState(false);
  // Last background/volume choice confirmed in MeditationDownloadPicker
  // (2026-09-29 — shared with MeditationExperience's own intro screen,
  // per Sasha's explicit call: "то же самое для этой кнопки") — reused
  // as-is if the download is retried after a failure, same reasoning as
  // MeditationExperience's own pendingDownloadChoice.
  const [pendingDownloadChoice, setPendingDownloadChoice] = useState<MeditationDownloadChoice>({
    backgroundTrackIds: [],
    voiceVolume: 1,
    backgroundVolume: 0.4,
  });
  useEffect(() => {
    if (item.kind !== "meditation") return;
    let cancelled = false;
    isMeditationDownloaded(item.contentId).then((downloaded) => {
      if (!cancelled) setIsDownloaded(downloaded);
    });
    return () => {
      cancelled = true;
    };
  }, [item.kind, item.contentId, player.downloadsVersion]);

  const handleRemoveDownload = async (e: MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    try {
      await deleteMeditationDownload(item.contentId);
      setIsDownloaded(false);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося прибрати офлайн-копію:", err);
    }
  };

  // Runs the actual download with whatever choice the shared picker
  // popover (or a retry) hands it — the popover itself only collects the
  // choice + lets the person preview it, it never downloads anything.
  const runDownload = async (choice: MeditationDownloadChoice) => {
    const meditation = meditations.find((m) => m.id === item.contentId);
    if (!meditation) return;
    setPendingDownloadChoice(choice);
    setDownloadError(false);
    setDownloading(true);
    try {
      await downloadMeditationAudio(meditation, choice);
      setIsDownloaded(true);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти медитацію офлайн:", err);
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const handleRetryDownload = (e: MouseEvent) => {
    e.stopPropagation();
    if (!downloading) runDownload(pendingDownloadChoice);
  };

  const info = getContentInfo(item.contentId, item.kind, realProgramMeta);
  if (!info) return null;

  // Whether THIS meditation's author actually turned offline download
  // on — see data/meditations.ts's own comment. `undefined` for non-
  // meditation cards (meditations.find never matches), which is exactly
  // right: the button below is meditation-only anyway.
  const meditationRecord = item.kind === "meditation" ? meditations.find((m) => m.id === item.contentId) : undefined;
  const offlineDownloadEnabled = meditationRecord?.offlineDownloadEnabled ?? false;

  const isProgram = item.kind === "program";
  // A saved-only meditation with a confirmed real position has
  // actually been started for real — per Sasha's explicit call
  // (2026-08-28), it shouldn't still read as merely bookmarked once
  // that's true, even though it was never formally "enrolled" in the
  // demo data.
  const isSavedOnly = item.status === "saved" && typeof realStoppedSeconds !== "number";
  const isCompleted = item.status === "completed";
  // A personalized suggestion the person hasn't touched yet
  // (2026-08-30, per Sasha's explicit call — "Мої рекомендації") —
  // genuinely different from isSavedOnly (no real save exists) and
  // from a plain 0% enrollment (no real enrollment exists either), so
  // it needs its own label throughout rather than falling into either.
  const isRecommended = item.status === "recommended";
  const programProgress = isProgram ? getProgramProgress(userId, item.contentId, false) : null;

  const percent = programProgress
    ? programProgress.percent
    : item.enrollment?.progressPercent ?? 0;

  // Only a CONFIRMED real position counts as "stopped" — per Sasha's
  // explicit call (2026-08-28), this must disappear the moment the
  // meditation is actually finished, and the static demo status can't
  // tell us that (real completion clears this same Supabase row
  // without ever touching the hand-typed enrollment). A meditation
  // that isn't saved/completed but has no confirmed position (never
  // for-real started, just finished, or still loading) shows its
  // plain duration instead of guessing a percent.
  const isStoppedMeditation =
    item.kind === "meditation" && !isSavedOnly && !isCompleted && typeof realStoppedSeconds === "number";
  const isMeditationNoProgress = item.kind === "meditation" && !isSavedOnly && !isCompleted && !isStoppedMeditation;

  // "Ви переглянули X із Y розділів" (2026-09-09, per Sasha's explicit
  // spec — "для гайда це трохи штучно" about the % display, and
  // "Опрацьовано", not "Завершено", because "гайд — не курс"). Only
  // guides with structured `content` (an "Interactive experience") have
  // real sections to count; a plain-PDF guide has none, so this stays
  // false and that card falls through to its previous behavior
  // untouched.
  const guideData = item.kind === "guide" ? guides.find((g) => g.id === item.contentId) : undefined;
  const guideTotalSections = guideData ? getGuideSectionCount(guideData) : 0;
  const hasSectionProgress = item.kind === "guide" && guideTotalSections > 0;
  const guideViewedSections = Math.min(guideSectionsViewed ?? 0, guideTotalSections);
  // Single source of truth now: `isCompleted` (item.status, already
  // corrected for guides by combineByType/withRealGuideStatus using
  // real guide_section_views data) — no longer computed independently
  // from guideViewedSections here, which used to be able to disagree
  // with the enrollment's own status (2026-09-15, guide completion QA
  // fix: a card could say "✓ Опрацьовано" while still filed as
  // in-progress for the filter/CTA).
  const isGuideFullyProcessed = hasSectionProgress && isCompleted;

  const category =
    info.tags && info.tags[0]
      ? categoryLabels[info.tags[0] as keyof typeof categoryLabels] ?? kindLabel[item.kind]
      : kindLabel[item.kind];

  const metaLine = programProgress
    ? `${programProgress.totalModules} модулів · ${programProgress.totalItems} елементів`
    : item.kind === "meditation"
    ? info.duration
    : item.kind === "guide" && info.sizeLabel
    ? info.sizeLabel
    : undefined;

  // A completed meditation has no real "% пройдено" (meditations
  // don't carry a percent) — falls through to a plain "Завершено"
  // instead of the generic percent branch below (2026-08-30, minor
  // fix alongside the card simplification pass).
  const isCompletedMeditation = item.kind === "meditation" && isCompleted;

  const progressLabel = isRecommended
    ? "Рекомендовано для вас"
    : isSavedOnly
    ? "Збережено на потім"
    : isCompletedMeditation
    ? "Завершено"
    : hasSectionProgress
    ? isGuideFullyProcessed
      ? "✓ Опрацьовано"
      : `Ви переглянули ${guideViewedSections} із ${guideTotalSections} розділів`
    : programProgress
    ? `${programProgress.completedRequiredItems} з ${programProgress.requiredItems} елементів`
    : isStoppedMeditation
    ? `Зупинено на ${formatClock(realStoppedSeconds as number)}`
    : isMeditationNoProgress
    ? info.duration ?? ""
    : `${percent}% пройдено`;

  // Гайди get their own card (2026-09-29 full redesign, per Sasha's
  // explicit brief) — a psychological TOOL, not another LMS row: small
  // abstract visual → category → title → description → meta → action,
  // with status as a quiet, secondary signal instead of a stack of
  // competing badges. Returns early, after every hook above has already
  // run unconditionally (rules-of-hooks safe) — program/meditation cards
  // fall through to the original shared markup below, completely
  // untouched. Meditations never reach ContentCard at all (they use
  // MeditationLearningCard), so this only ever intercepts guides.
  if (item.kind === "guide") {
    const guidePercent = hasSectionProgress ? Math.round((guideViewedSections / guideTotalSections) * 100) : 0;
    const guideMeta = info.sizeLabel
      ? info.sizeLabel
      : undefined;
    return (
      <div className="group rounded-[28px] bg-white border border-black/[0.06] overflow-hidden hover:shadow-[0_16px_40px_rgba(15,23,42,0.09)] transition-all duration-200 flex flex-col">
        <div className="relative">
          <GuideVisual tag={info.tags?.[0]} />
          {onToggleGuideSaved && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleGuideSaved();
              }}
              title={guideSavedId ? "Прибрати з обраного" : "Додати в обране"}
              aria-label={guideSavedId ? "Прибрати з обраного" : "Додати в обране"}
              className="absolute top-3 right-3 w-8 h-8 before:absolute before:-inset-1.5 before:content-[''] rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-black/60 hover:text-black/70 hover:bg-white transition"
            >
              <BookmarkIcon filled={Boolean(guideSavedId)} />
            </button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-2 flex-1">
          <div className="text-[12px] font-semibold text-black/60 uppercase tracking-wider">{category}</div>
          <div className="font-semibold text-[16px] leading-snug line-clamp-2 text-black/85">{info.title}</div>
          {info.description && (
            <p className="text-[14px] text-black/60 leading-relaxed line-clamp-2">{info.description}</p>
          )}
          {guideMeta && <div className="text-[12px] text-black/60 mt-0.5">{guideMeta}</div>}

          <div className="mt-auto pt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {isGuideFullyProcessed ? (
                <span className="text-[12px] font-medium text-emerald-600 flex items-center gap-1.5">
                  <CheckIcon /> Опрацьовано
                </span>
              ) : hasSectionProgress && guidePercent > 0 ? (
                <div className="flex items-center gap-1.5 w-[86px]">
                  <div className="flex-1 h-[3px] rounded-full bg-black/10 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${guidePercent}%` }} />
                  </div>
                  <span className="text-[12px] text-black/60 shrink-0">{guidePercent}%</span>
                </div>
              ) : isRecommended ? (
                <span className="text-[12px] text-indigo-500/80">Може бути корисно</span>
              ) : isSavedOnly ? (
                <span className="text-[12px] text-black/60">Збережено</span>
              ) : (
                <span />
              )}
            </div>
            <button
              onClick={onOpen}
              className="min-h-[44px] px-4 py-2 rounded-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white text-[12px] font-medium hover:opacity-90 transition shrink-0"
            >
              {ctaLabel(item.kind, isSavedOnly ? undefined : item.enrollment?.status, percent)} →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white border border-black/5 overflow-hidden hover:shadow-lg transition flex flex-col">
      {/* COVER — compacted 2026-09-16 (viewport-first refinement):
          h-28 → h-20, icon scaled down to match. Same badges/toggles,
          just less vertical weight so 3 cards fit the first viewport. */}
      <div
        className={`relative h-20 flex items-center justify-center bg-gradient-to-br ${kindGradient[item.kind]}`}
      >
        <span className="text-black/45"><Icon name={kindIcon[item.kind]} size={30} /></span>
        {(hasSectionProgress ? isGuideFullyProcessed : isCompleted && item.kind !== "meditation") && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-emerald-700 text-[12px] font-bold tracking-wide">
            {hasSectionProgress ? "ОПРАЦЬОВАНО" : "ЗАВЕРШЕНО"}
          </div>
        )}
        {/* The guide bookmark toggle used to live here too — guides now
            return from their own dedicated card branch above and never
            reach this shared markup at all, so this program-only cover
            keeps just the program save toggle below. */}
        {/* "Зберегти програму" (2026-09-21, per Sasha's Issue 1 spec) —
            exact mirror of the guide toggle above, now for programs. This
            replaces what used to be a plain, non-interactive
            `isSavedOnly && item.kind === "program"` <div>★</div> badge —
            the literal bug being fixed: it could only ever SHOW a saved
            state (derived from the static demo savedContent array), with
            no real action behind it. This button now always renders for
            a program card (independent of isSavedOnly/enrollment status
            — saving an already-owned/in-progress/completed program is
            allowed, same reasoning as guides) and reflects/persists real
            state via lib/programSaves.ts. */}
        {item.kind === "program" && onToggleProgramSaved && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleProgramSaved();
            }}
            title={programSavedId ? "Прибрати зі збережених" : "Зберегти програму"}
            aria-label={programSavedId ? "Прибрати зі збережених" : "Зберегти програму"}
            className="absolute top-3 right-3 w-7 h-7 before:absolute before:-inset-2 before:content-[''] rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-white text-[14px] hover:bg-white/40 transition"
          >
            {programSavedId ? "★" : "☆"}
          </button>
        )}
        {/* "Для вас" ribbon — same top-left slot as "ЗАВЕРШЕНО", never
            shown together (a recommendation is by definition something
            not yet completed). */}
        {isRecommended && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-indigo-700 text-[12px] font-bold tracking-wide">
            ДЛЯ ВАС
          </div>
        )}
        {/* "Моя практика" ♡ — bottom-right so it never collides with
            the "ЗАВЕРШЕНО" ribbon (top-left) or the bookmark star
            (top-right, a different concept). Meditation-only. */}
        {item.kind === "meditation" && onTogglePractice && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePractice();
            }}
            title={practiceSavedId ? "Прибрати з «Моя практика»" : "Зберегти в «Моя практика»"}
            aria-label={practiceSavedId ? "Прибрати з «Моя практика»" : "Зберегти в «Моя практика»"}
            className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white text-[14px] hover:bg-white/35 transition"
          >
            {practiceSavedId ? "♥" : "♡"}
          </button>
        )}
        {/* "Зберегти офлайн" — bottom-left, mirroring the heart's
            bottom-right so the two don't collide. Meditation-only, and
            an author-optional feature (2026-09-26, per Sasha's explicit
            call) — hidden entirely rather than shown-but-non-functional
            when this meditation's author hasn't turned it on. A real
            failure now shows a visible "!" + retry instead of quietly
            doing nothing. */}
        {item.kind === "meditation" &&
          offlineDownloadEnabled &&
          isDownloaded !== null &&
          (isDownloaded || downloading || downloadError ? (
            <button
              onClick={isDownloaded ? handleRemoveDownload : handleRetryDownload}
              disabled={downloading}
              title={downloadError ? "Не вдалося завантажити — спробувати ще" : isDownloaded ? "Прибрати офлайн-копію" : "Зберегти офлайн"}
              aria-label={downloadError ? "Не вдалося завантажити — спробувати ще" : isDownloaded ? "Прибрати офлайн-копію" : "Зберегти офлайн"}
              className={`absolute bottom-3 left-3 w-6 h-6 rounded-full backdrop-blur-sm flex items-center justify-center text-white text-[12px] transition disabled:opacity-60 ${
                downloadError ? "bg-red-500/70 hover:bg-red-500/85" : "bg-white/15 hover:bg-white/35"
              }`}
            >
              {downloading ? (
                <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/40 border-t-white animate-spin" />
              ) : downloadError ? (
                "!"
              ) : (
                "✓"
              )}
            </button>
          ) : (
            // Opens the shared background/volume picker instead of
            // downloading immediately (2026-09-29, per Sasha's explicit
            // call — same picker as MeditationExperience's own intro
            // screen, see MeditationDownloadPicker.tsx). Renders as a
            // portal-based centered dialog now (not an anchored popover),
            // per Sasha's follow-up call: the card's own
            // `overflow-hidden` thumbnail was clipping the popover.
            <MeditationDownloadPicker
              meditation={meditations.find((m) => m.id === item.contentId)!}
              pc1={meditationPalette(item.contentId)[0]}
              pc3={meditationPalette(item.contentId)[2]}
              onConfirm={runDownload}
              trigger={(_open, toggle) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  title="Зберегти офлайн"
                  aria-label="Зберегти офлайн"
                  className="absolute bottom-3 left-3 w-6 h-6 rounded-full backdrop-blur-sm flex items-center justify-center text-white text-[12px] transition bg-white/15 hover:bg-white/35"
                >
                  ⬇
                </button>
              )}
            />
          ))}
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div className="flex items-center gap-2.5">
          {/* Circular progress ring — dropped for meditations
              (2026-08-30, per Sasha's explicit call: fewer
              simultaneous controls on a meditation card, and the ring
              never carried real information there anyway — meditations
              have no percent to show, the text label below already
              says everything). Unchanged for courses/programs; sized
              down slightly (2026-09-16 compaction) to match the smaller
              card overall. */}
          {item.kind !== "meditation" &&
            !isSavedOnly &&
            !isMeditationNoProgress &&
            !isRecommended &&
            !hasSectionProgress && <CircularProgress percent={percent} size={32} strokeWidth={3} tone={isCompleted ? "done" : "gradient"} />}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-black/60">
              {isRecommended
                ? "Для вас"
                : isSavedOnly
                ? "У збереженому"
                : isStoppedMeditation || isMeditationNoProgress || isCompletedMeditation
                ? "Медитація"
                : hasSectionProgress
                ? "Читання"
                : "Прогрес"}
            </div>
            <div className="text-[12px] font-medium text-black/70 truncate">{progressLabel}</div>
          </div>
          <button
            onClick={onOpen}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-black text-white text-[12px] font-medium hover:opacity-90 transition shrink-0"
          >
            {ctaLabel(item.kind, isSavedOnly ? undefined : item.enrollment?.status, percent)}
          </button>
        </div>

        {/* "...і progress bar" (2026-09-09, per Sasha's explicit spec)
            — a real linear bar for real sections read, sitting where a
            program's own progress line lives elsewhere in this file;
            skipped for "Збережено"/"Для вас" cards, same as the ring
            above, since there's no real reading progress to show yet. */}
        {hasSectionProgress && !isSavedOnly && !isRecommended && (
          <div className="h-1 rounded-full bg-black/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isGuideFullyProcessed ? "bg-emerald-500" : "bg-teal-500"
              }`}
              style={{ width: `${Math.round((guideViewedSections / guideTotalSections) * 100)}%` }}
            />
          </div>
        )}

        <div>
          <div className="text-[12px] font-medium text-black/60 uppercase tracking-wide">
            {category}
          </div>
          {/* line-clamp-2 (2026-09-16, viewport-first QA requirement —
              "long titles must not break layout") — a title this once
              could wrap unboundedly and stretch the whole card row
              taller than its siblings; capped the same way the
              description already was. */}
          <div className="font-semibold text-[16px] mt-0.5 leading-snug line-clamp-2">{info.title}</div>
        </div>

        {metaLine && <div className="text-[12px] text-black/60">{metaLine}</div>}

        {info.description && (
          <p className="text-[14px] text-black/60 leading-relaxed line-clamp-2">
            {info.description}
          </p>
        )}
      </div>
    </div>
  );
}

// Dedicated meditation card (2026-09-23 meditation catalog redesign, per
// Sasha's explicit spec) — NOT a variant of ContentCard above. The brief
// was explicit: meditation must not reuse the "bright turquoise"
// program/guide card style, and must read as a distinct, calmer category
// (an emotional-practice library, not another LMS row). So this is its
// own small component with its own visual language (an atmospheric
// gradient visual area instead of a flat icon tile) while reusing every
// bit of REAL state/logic the old shared card already had for
// meditations — real resumable position, real "Моя практика" save, real
// offline-download — none of that is duplicated or reinvented, only the
// markup around it changed.
//
// Info hierarchy is deliberately flat, per spec: category label → title
// → one real description line → one real duration line → CTA. Duration
// used to appear TWICE on the old shared card (once as `metaLine`, again
// inside `progressLabel` for the "not started" case) — this version
// shows it exactly once, appending the resume marker onto that same line
// instead of introducing a second one.
function MeditationLearningCard({
  item,
  onOpen,
  realStoppedSeconds,
  practiceSavedId,
  onTogglePractice,
}: {
  item: LearningItem;
  onOpen: () => void;
  // See ContentCard's own comment on this prop — identical contract.
  realStoppedSeconds?: number | null;
  practiceSavedId?: string | null;
  onTogglePractice?: () => void;
}) {
  const player = useMeditationPlayer();
  const [isDownloaded, setIsDownloaded] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Visible failure state (2026-09-26 — previously a failed download
  // here only ever hit console.error, so the button just silently
  // reverted with zero feedback; from the outside that reads as "the
  // button does nothing", which is exactly what Sasha reported. See
  // data/meditations.ts's offlineDownloadEnabled comment for the
  // confirmed root cause (the demo audio host has no CORS headers, so
  // the cross-origin fetch always throws "Failed to fetch").
  const [downloadError, setDownloadError] = useState(false);
  // See ContentCard's identical comment — reused as-is on retry.
  const [pendingDownloadChoice, setPendingDownloadChoice] = useState<MeditationDownloadChoice>({
    backgroundTrackIds: [],
    voiceVolume: 1,
    backgroundVolume: 0.4,
  });
  useEffect(() => {
    let cancelled = false;
    isMeditationDownloaded(item.contentId).then((downloaded) => {
      if (!cancelled) setIsDownloaded(downloaded);
    });
    return () => {
      cancelled = true;
    };
  }, [item.contentId, player.downloadsVersion]);

  const handleRemoveDownload = async (e: MouseEvent) => {
    e.stopPropagation();
    if (downloading) return;
    try {
      await deleteMeditationDownload(item.contentId);
      setIsDownloaded(false);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося прибрати офлайн-копію:", err);
    }
  };

  const runDownload = async (choice: MeditationDownloadChoice) => {
    const meditation = meditations.find((m) => m.id === item.contentId);
    if (!meditation) return;
    setPendingDownloadChoice(choice);
    setDownloadError(false);
    setDownloading(true);
    try {
      await downloadMeditationAudio(meditation, choice);
      setIsDownloaded(true);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти медитацію офлайн:", err);
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const handleRetryDownload = (e: MouseEvent) => {
    e.stopPropagation();
    if (!downloading) runDownload(pendingDownloadChoice);
  };

  const info = getContentInfo(item.contentId, "meditation");
  if (!info) return null;

  // Whether THIS meditation's author actually turned offline download
  // on — see data/meditations.ts's own comment. Looked up here (not
  // just inside the handler) so the button can be hidden entirely for
  // meditations that don't offer it, rather than shown-but-broken.
  const meditationRecord = meditations.find((m) => m.id === item.contentId);
  const offlineDownloadEnabled = meditationRecord?.offlineDownloadEnabled ?? false;

  // Same real-state derivation as ContentCard's meditation branch —
  // unchanged logic, just read here instead of there.
  const isSavedOnly = item.status === "saved" && typeof realStoppedSeconds !== "number";
  const isCompleted = item.status === "completed";
  const isStoppedMeditation = !isSavedOnly && !isCompleted && typeof realStoppedSeconds === "number";

  const category =
    info.tags && info.tags[0]
      ? categoryLabels[info.tags[0] as keyof typeof categoryLabels] ?? "Медитація"
      : "Медитація";

  // One real duration line, ever — the resume marker (when real) is
  // appended onto it instead of living in a second, separately-labeled
  // spot, which is exactly the duplication the redesign brief called out.
  const durationLine = isStoppedMeditation
    ? `${info.duration} · Зупинено на ${formatClock(realStoppedSeconds as number)}`
    : info.duration;

  const [c1, c2, c3] = meditationPalette(item.contentId);

  return (
    <div className="rounded-3xl bg-white border border-black/5 overflow-hidden hover:shadow-lg transition flex flex-col">
      {/* Atmospheric visual area — two soft blurred blobs over a diagonal
          wash instead of a flat icon tile; palette is deterministic per
          meditation (meditationPalette above), so the same practice
          always looks the same. Height matched to the guide/program
          cover (2026-09-29, per Sasha's explicit call — "у медитаціях
          верхня частина картки має бути такого ж розміру як у гайдів і
          програм"): this used to be h-40, visibly taller than every
          other card type's cover for no functional reason, which made
          three otherwise-matching card systems look inconsistent side
          by side. Blob sizes/offsets scaled down to match the shorter
          area without spilling oddly past it. */}
      <div
        className="relative h-24 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2} 55%, ${c3})` }}
      >
        <div
          className="pointer-events-none absolute -top-6 -left-6 w-20 h-20 rounded-full opacity-50 blur-2xl"
          style={{ background: c3 }}
        />
        <div
          className="pointer-events-none absolute -bottom-8 -right-4 w-24 h-24 rounded-full opacity-40 blur-2xl"
          style={{ background: c1 }}
        />

        {isCompleted && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-emerald-700 text-[12px] font-bold tracking-wide">
            ЗАВЕРШЕНО
          </div>
        )}
        {!isCompleted && isStoppedMeditation && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 text-indigo-700 text-[12px] font-bold tracking-wide">
            В ПРОЦЕСІ
          </div>
        )}

        {onTogglePractice && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePractice();
            }}
            title={practiceSavedId ? "Прибрати з «Моя практика»" : "Зберегти в «Моя практика»"}
            aria-label={practiceSavedId ? "Прибрати з «Моя практика»" : "Зберегти в «Моя практика»"}
            className="absolute top-3 right-3 w-7 h-7 before:absolute before:-inset-2 before:content-[''] rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-white text-[14px] hover:bg-white/40 transition"
          >
            {practiceSavedId ? "♥" : "♡"}
          </button>
        )}
        {/* "Зберегти офлайн" — an author-optional feature (2026-09-26,
            per Sasha's explicit call), hidden entirely rather than
            shown-but-non-functional when this meditation's author
            hasn't turned it on (see offlineDownloadEnabled above). On a
            real failure it now shows a visible "!" + a "Не вдалося
            завантажити" tooltip instead of quietly doing nothing (the
            actual bug Sasha reported — see downloadError's own comment
            above for the confirmed root cause). */}
        {offlineDownloadEnabled &&
          isDownloaded !== null &&
          (isDownloaded || downloading || downloadError ? (
            <button
              onClick={isDownloaded ? handleRemoveDownload : handleRetryDownload}
              disabled={downloading}
              title={downloadError ? "Не вдалося завантажити — спробувати ще" : isDownloaded ? "Прибрати офлайн-копію" : "Зберегти офлайн"}
              aria-label={downloadError ? "Не вдалося завантажити — спробувати ще" : isDownloaded ? "Прибрати офлайн-копію" : "Зберегти офлайн"}
              className={`absolute bottom-3 left-3 w-6 h-6 rounded-full backdrop-blur-sm flex items-center justify-center text-white text-[12px] transition disabled:opacity-60 ${
                downloadError ? "bg-red-500/70 hover:bg-red-500/85" : "bg-white/20 hover:bg-white/40"
              }`}
            >
              {downloading ? (
                <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/40 border-t-white animate-spin" />
              ) : downloadError ? (
                "!"
              ) : (
                "✓"
              )}
            </button>
          ) : (
            // Same shared picker as ContentCard — see its own comment.
            <MeditationDownloadPicker
              meditation={meditations.find((m) => m.id === item.contentId)!}
              pc1={c1}
              pc3={c3}
              onConfirm={runDownload}
              trigger={(_open, toggle) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  title="Зберегти офлайн"
                  aria-label="Зберегти офлайн"
                  className="absolute bottom-3 left-3 w-6 h-6 rounded-full backdrop-blur-sm flex items-center justify-center text-white text-[12px] transition bg-white/20 hover:bg-white/40"
                >
                  ⬇
                </button>
              )}
            />
          ))}
      </div>

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <div className="text-[12px] font-medium text-black/60 uppercase tracking-wide">{category}</div>
        <div className="font-semibold text-[16px] leading-snug line-clamp-2">{info.title}</div>
        {info.description && (
          <p className="text-[14px] text-black/60 leading-relaxed line-clamp-1">{info.description}</p>
        )}
        <div className="text-[12px] text-black/60 mt-0.5">{durationLine}</div>

        <button
          onClick={onOpen}
          className="min-h-[44px] mt-2.5 self-start px-3.5 py-1.5 rounded-xl bg-black text-white text-[12px] font-medium hover:opacity-90 transition"
        >
          {/* Real-state CTA (2026-09-23, per Sasha's explicit follow-up)
              — driven by isStoppedMeditation/isCompleted (the same real
              resumable-position signal the "В ПРОЦЕСІ" badge above uses),
              not the coarse demo enrollment status ctaLabel() reads for
              every other kind: "Продовжити" only when there's a real
              position to resume, "Почати" for anything starting from
              zero (never-started, or already finished and starting
              over), "Повторити" once genuinely completed. */}
          {isCompleted ? "Повторити" : isStoppedMeditation ? "Продовжити" : "Почати"}
        </button>
      </div>
    </div>
  );
}
