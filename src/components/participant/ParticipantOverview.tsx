import { useEffect, useMemo, useState } from "react";
import { pluralUk } from "../../utils/plural";
import {
  enrollments as demoEnrollments,
  getContentInfo,
  participantMessages as demoParticipantMessages,
  type Enrollment,
} from "../../data/participantDashboard";
import { SHOW_DEMO } from "../../utils/demoMode";

// Static demo content is hidden when VITE_SHOW_DEMO_PROGRAMS=false, so a real
// user's overview never mixes in invented enrollments or messages.
const enrollments: Enrollment[] = SHOW_DEMO ? demoEnrollments : [];
const demoMessagePreviews: MessagePreview[] = (SHOW_DEMO ? demoParticipantMessages : []).map((m) => ({
  id: m.id,
  authorName: m.authorName,
  contentTitle: m.contentTitle,
  preview: m.preview,
  date: m.date,
  unread: m.unread,
}));
import { useSession } from "../../context/SessionContext";
import { useProgramParticipation } from "../../context/ProgramParticipationContext";
import funnelStore from "../../store/funnelStore";
import { getStateProfile } from "../../utils/getStateProfile";
import { fetchAssessmentResult, type SavedAssessment } from "../../lib/assessment";
import { getProgramProgress } from "../../lib/programProgress";
import { withRealProgramStatus } from "../../lib/programStatus";
import { countOtherUnfinishedPrograms } from "../../lib/programParticipation";
import type { ProgramProgressSummary } from "../../data/contentTypes";
import { getDuePracticeReminders, clearPracticeReminder } from "../../utils/practiceReminders";
import {
  recommendGuideFromMeditationBehavior,
  type BehaviorGuideRecommendation,
} from "../../utils/behaviorRecommendations";
import { fetchAllSavedGuides } from "../../lib/guideSaves";
import { categoryLabels } from "../../data/categoryLabels";
import { fetchAllSectionViews } from "../../lib/guideSectionViews";
import { guides } from "../../data/guides";
import { getGuideSectionCount } from "../../data/guideContent";
import { formatRelativeTime } from "../../utils/relativeTime";
import {
  pickContinueEnrollment,
  countOtherUnfinished,
  pickLearningPreview,
  pickEmptyStateMeditation,
  pickFeaturedExcludingOwned,
} from "../../lib/dashboardPriority";
import { getGuideStatus, withRealGuideStatus } from "../../lib/guideProgress";
import {
  getJourneySteps,
  hasStartedFirstPractice,
  hasViewedEmotionalProfile,
} from "../../lib/emotionalProfile";
import type { ContentKind } from "../../data/participantDashboard";
import type { StatusFilter } from "./ParticipantLearning";
import { useObservationsSummary } from "./useObservationsSummary";
import { MeditationGlyph, ProgramGlyph, GuideGlyph } from "./GuideIcons";
import { useRecentMessages } from "./useRecentMessages";
import { usePrimaryMeditationPosition } from "./usePrimaryMeditationPosition";
import { buildPrimaryMeta, primaryActionVerb } from "../../utils/primaryCardMeta";
import type { MessagePreview } from "../../utils/messagePreviews";

type SectionKey =
  | "learning"
  | "reflections"
  | "emotionalProfile"
  | "messages"
  | "reviews"
  | "billing"
  | "profile"
  | "help";

type Props = {
  onNavigate: (key: SectionKey) => void;
  // Deep-links straight into "Моє навчання" pre-filtered to a status
  // (2026-09-11, per Sasha's full redesign spec — "Ще N незавершені
  // матеріали → Переглянути →" must land on "У процесі", not just the
  // tab in general). See ParticipantDashboardPage's goToLearning.
  onGoToLearning?: (kind: ContentKind, filter: StatusFilter) => void;
  // Sends the participant back into the assessment funnel (App.tsx's
  // `openTest`). Optional purely so this component doesn't hard-fail if
  // ever rendered without that wiring — but ParticipantDashboardPage
  // always passes it in practice.
  onRetakeAssessment?: () => void;
  // Only used for the "Переглянути всі рекомендації" link — the
  // dashboard has no in-app route to the public catalog today, so
  // leaving to the main site is the most honest destination available.
  onBackToSite?: () => void;
  // Opens the public catalog/sales preview — used only for content the
  // person does NOT already own (recommendation tiles, the empty-state
  // suggestion). Owned/in-progress content uses the onContinue* props
  // below instead, so clicking it resumes in place rather than leaving
  // to a "Купити зараз" screen.
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  // Deep-link straight into a specific lesson (ParticipantDashboardPage's
  // openProgramAtItem) — used both by the primary "Продовжити" action
  // for an in-progress program and by a due practice reminder, so its
  // CTA opens exactly the right item, not just the program in general.
  // Also doubles as "resume this program from wherever it left off"
  // when called without an itemId.
  onOpenProgramAtItem?: (programId: string, itemId?: string) => void;
  // Same in-dashboard "resume in place" idea, for an already-owned
  // meditation/guide (2026-09-11) — mirrors ParticipantLearning's own
  // onContinueMeditation/onContinueGuide props.
  onContinueMeditation?: (id: string) => void;
  onContinueGuide?: (id: string) => void;
  // Same lifted read-state ParticipantDashboardPage passes into
  // ParticipantMessages — without it, reading a demo conversation in
  // the "Повідомлення" tab wouldn't be reflected here (real
  // conversations self-correct on the next fetch since markThreadRead
  // persists to the database, but demo ones have no database row to
  // persist to).
  readIds?: Record<string, boolean>;
  // Bumped by ParticipantDashboardPage every time a guide overlay
  // records a newly-viewed section (same signal ParticipantLearning's
  // own guideSectionCounts fetch already depends on) — without this,
  // finishing a guide's last section and returning to "Огляд" (which
  // stays mounted, per the keep-alive tab pattern) wouldn't pick up the
  // real completed status until the whole dashboard remounted
  // (2026-09-15, guide completion QA edge case).
  guideSectionViewsVersion?: number;
};

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

// Restrained line glyphs (shared with the guide preview's "related" tiles)
// — monochrome, inherit the surrounding text colour.
function KindIcon({ kind, size = 18 }: { kind: ContentKind; size?: number }) {
  if (kind === "program") return <ProgramGlyph size={size} />;
  if (kind === "meditation") return <MeditationGlyph size={size} />;
  return <GuideGlyph size={size} />;
}

// Ukrainian pluralization for "крок" — used only for the plain-language
// progress sentence, deliberately not a gamification score.
const pluralSteps = (n: number) => pluralUk(n, "крок", "кроки", "кроків");

// Same idea, for "N незавершених матеріалів" under the primary action.
const pluralMaterials = (n: number) =>
  pluralUk(n, "незавершений матеріал", "незавершені матеріали", "незавершених матеріалів");

// One "РЕКОМЕНДОВАНО" tile — course, meditation and guide used to repeat
// this markup three times.
function RecommendationTile({
  kind,
  title,
  subtitle,
  onClick,
}: {
  kind: ContentKind;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left rounded-xl border border-black/5 p-4 transition hover:border-black/15 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] disabled:cursor-default disabled:hover:border-black/5 disabled:hover:shadow-none"
    >
      <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[12px] font-bold tracking-wide mb-2">
        РЕКОМЕНДОВАНО
      </span>
      <div className="mb-2 text-black/60">
        <KindIcon kind={kind} />
      </div>
      <div className="text-[14px] font-medium leading-snug">{title}</div>
      <div className="text-[12px] text-black/60 mt-1">{subtitle}</div>
    </button>
  );
}

// A single access/purchase-state label per Sasha's explicit rule
// (2026-09-11): purchased-not-started, in-progress and completed must
// read differently from each other, and from a mere recommendation —
// derived from the real enrollment fields, never a second hand-typed
// status.
//
// Fixed 2026-09-15 (Dashboard technical audit): this used to always
// read the static demo `progressPercent` field, even for content kinds
// that have a REAL, live progress source elsewhere on the same
// dashboard — so a program could show "67% пройдено" here while the
// "Продовжити" card and "Моє навчання" tab (both reading
// lib/programProgress.ts) showed a different, actually-current number.
// Meditations never have a real percent at all (see ContentCard's own
// comment on this) — the old code fabricated one anyway. Now:
//   - program: the real computed percent when module data exists (same
//     source as everywhere else), static field only as a last resort;
//   - guide: real section-view count when the guide has structured
//     content (same source ContentCard uses), static field otherwise;
//   - meditation: never a percent — just the real in-progress/completed/
//     not-started state, since there is no real percent to report.
//
// Fixed again 2026-09-15 (guide completion QA follow-up): the guide
// branch's own "viewed >= total" completion check is gone — it now
// asks lib/guideProgress.ts's getGuideStatus, the same single function
// every other guide-completion decision on this page routes through
// (see correctedEnrollments below), instead of re-deciding the boundary
// here a second time.
//
// Fixed again 2026-09-16 (technical audit): the program branch checked
// `progress.percent === 0` for "not started" but never `.isCompleted`
// for "done" — a program genuinely finished through the real per-item
// engine (lib/programProgress.ts) read "100% пройдено" here forever
// instead of "Завершено", the one case this whole function exists to
// get right (see the fix note above). `isCompleted` is a real,
// independent field on the same object, not re-derived from `percent`.
//
// Fixed again 2026-09-21 (Overview/Learning consistency follow-up): the
// program branch used to call lib/programProgress.ts's getProgramProgress
// directly — a synchronous, LOCAL STORAGE read that only ever resolves
// for a demo program AND only reflects activity that happened on THIS
// device (see ProgramExperience.tsx's own local-first read). A program
// genuinely started on another device would read as untouched here even
// though the real per-item engine already agrees it's in progress
// server-side. `e` itself is now already sourced from real
// content_progress (see the caller — `e` only ever comes from
// ProgramParticipationContext's real `enrollments` for a program), and
// `programSummary` (also real, server-derived — see that context's
// summaryByProgramId) supplies the finer module-aware label when it's
// resolved. `progress.state`, not `percent === 0`, still decides
// "Не розпочато" vs a real percent — same reasoning as before, just fed
// by the real source now.
function accessLabel(
  e: Enrollment,
  guideSectionCounts: Record<string, number>,
  guideSectionCountsLoaded: boolean,
  programSummary?: ProgramProgressSummary | null
): string {
  if (e.kind === "program") {
    if (programSummary) {
      if (programSummary.isCompleted) return "Завершено";
      return programSummary.state === "not_started" ? "Не розпочато" : `${programSummary.percent}% пройдено`;
    }
    // No real per-item structure resolved yet for this program (a real
    // authored program whose bulk catalog fetch hasn't landed, or has
    // no authored items) — `e` is still real (never the static demo
    // array, see this function's own header), so its own status/percent
    // are trustworthy: `status` never percent-gates (a real IN_PROGRESS
    // program at 0% still reads "in-progress"), so this never
    // misreports a genuinely-started program as untouched the way a
    // plain `progressPercent === 0` check would.
    if (e.status === "completed") return "Завершено";
    if (e.status === "in-progress") return `${e.progressPercent}% пройдено`;
    return "Не розпочато";
  }
  if (e.kind === "guide") {
    const guide = guides.find((g) => g.id === e.contentId);
    const total = guide ? getGuideSectionCount(guide) : 0;
    const viewed = guideSectionCounts[e.contentId] ?? 0;
    // Only trust the real section-view count once it's actually loaded
    // (2026-09-16 technical audit) — before that, `guideSectionCounts`
    // is still its {} initial value, and reading every guide as "0
    // viewed" would briefly show an already-completed guide as "0 із N
    // розділів" instead of "Завершено".
    const realStatus = guideSectionCountsLoaded ? getGuideStatus(total, viewed) : null;
    if (realStatus) {
      return realStatus === "completed" ? "✓ Опрацьовано" : `${Math.min(viewed, total)} із ${total} розділів`;
    }
    if (e.status === "completed") return "Завершено";
    return e.progressPercent === 0 ? "Не розпочато" : `${e.progressPercent}% пройдено`;
  }
  // meditation — no real percent metric exists for it anywhere in the
  // app, so this never invents one.
  if (e.status === "completed") return "Завершено";
  return e.progressPercent === 0 ? "Не розпочато" : "У процесі";
}

export default function ParticipantOverview({
  onNavigate,
  onGoToLearning,
  onRetakeAssessment,
  onBackToSite,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
  onOpenProgramAtItem,
  onContinueMeditation,
  onContinueGuide,
  readIds,
  guideSectionViewsVersion,
}: Props) {
  const session = useSession();
  // Real PROGRAM activity/saves/catalog — shared with ParticipantLearning
  // via context/ProgramParticipationContext.tsx (2026-09-21, Overview/
  // Learning consistency follow-up), fetched exactly once per dashboard
  // visit regardless of how many tabs read it. See that file's own
  // header for the full contract.
  const programParticipation = useProgramParticipation();

  // Real, persisted assessment result (assessment_results table) is the
  // source of truth — it survives logout/login and a different device.
  // funnelStore.insight (sessionStorage-only) is kept as a same-session
  // fallback only, covering the brief window right after finishing the
  // assessment before the fire-and-forget save in App.tsx has landed.
  const [savedAssessment, setSavedAssessment] = useState<SavedAssessment | null>(null);
  // Fixed 2026-09-15 (Dashboard technical audit, loading-state check):
  // without this flag, a returning participant whose result lives only
  // in the database (not this session's sessionStorage) would briefly
  // see the "Ви ще не проходили оцінку стану" empty state and a "Пройти
  // оцінку" button flash on screen while the real fetch was still in
  // flight — a wrong state shown as if it were final, not a loading
  // state. Same fix EmotionalProfile.tsx already has for the identical
  // fetch.
  const [assessmentChecked, setAssessmentChecked] = useState(false);
  useEffect(() => {
    if (!session) {
      setAssessmentChecked(true);
      return;
    }
    fetchAssessmentResult(session.profile.id)
      .then(setSavedAssessment)
      .finally(() => setAssessmentChecked(true));
  }, [session?.profile.id]);

  const insight = savedAssessment ?? funnelStore.insight;
  const stateProfile = insight ? getStateProfile(insight.primaryState, insight.intensity) : null;
  // True only while we genuinely don't know yet whether a real result
  // exists — funnelStore's same-session fallback means most of the time
  // this is false immediately (insight is already known one way or the
  // other without waiting on the network).
  const assessmentLoading = !assessmentChecked && !insight;

  // Real section-view counts (guide_section_views) for every guide —
  // fetched once, up front, because it now feeds not just the "Моє
  // навчання" preview's own label (accessLabel) but also which
  // enrollment counts as "Продовжити"/"незавершений" below
  // (correctedEnrollments), so it has to be ready before those are
  // computed (2026-09-15, guide completion QA follow-up).
  const [learningGuideSectionCounts, setLearningGuideSectionCounts] = useState<Record<string, number>>({});
  // See ParticipantLearning.tsx's identical guideSectionCountsLoaded for
  // why this exists (2026-09-16 technical audit) — without it, the
  // first render after mount/session-change reads every guide as 0
  // sections viewed and can briefly demote an already-completed guide
  // to "in-progress" in correctedEnrollments below, before the real
  // fetch resolves.
  const [learningGuideSectionCountsLoaded, setLearningGuideSectionCountsLoaded] = useState(false);
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchAllSectionViews(userId).then((counts) => {
      if (!cancelled) {
        setLearningGuideSectionCounts(counts);
        setLearningGuideSectionCountsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // Also re-fetches on guideSectionViewsVersion — the signal a guide
    // overlay just recorded a new view, so finishing a guide's last
    // section shows up here (Продовжити/незавершені/Моє навчання
    // preview) without needing to leave and re-enter "Огляд" (2026-09-15,
    // guide completion QA edge case).
  }, [session?.profile.id, guideSectionViewsVersion]);

  // Single source of truth for guide completion (lib/guideProgress.ts) —
  // a NEW array, `enrollments` itself is untouched, where every GUIDE
  // entry's `status` reflects real section-view completion instead of
  // the static demo field. Programs and meditations pass through
  // unchanged. Everywhere below that used to read `enrollments` directly
  // to decide "in progress"/"completed"/"unfinished"/"available to
  // continue" now reads this instead (2026-09-15, fixing the QA finding
  // that a guide could show "✓ Опрацьовано" on its card while still
  // counting as in-progress for the filter/Продовжити/counters).
  const guideCorrectedEnrollments = useMemo(
    () =>
      learningGuideSectionCountsLoaded
        ? withRealGuideStatus(enrollments, learningGuideSectionCounts, (guideId) => {
            const guide = guides.find((g) => g.id === guideId);
            return guide ? getGuideSectionCount(guide) : 0;
          })
        : enrollments,
    [learningGuideSectionCounts, learningGuideSectionCountsLoaded]
  );
  // Programs corrected against real per-item progress
  // (lib/programProgress.ts, 2026-09-16 technical audit) — same fix,
  // same reasoning as ParticipantLearning.tsx's own correctedEnrollments:
  // deliberately not memoized. Program progress is a synchronous
  // localStorage read (utils/demoProgressStore.ts) with no version-bump
  // signal anywhere (unlike guideSectionCounts, which is genuinely
  // async), so there's nothing meaningful to memoize against — a
  // program finished for real in the ProgramExperience overlay needs
  // this to be fresh the moment this page next renders, not stale until
  // something unrelated happens to change learningGuideSectionCounts.
  const correctedEnrollments = withRealProgramStatus(guideCorrectedEnrollments, (contentId) =>
    getProgramProgress(session?.profile.id ?? null, contentId, false)
  );
  // NOTE: not memoized on purpose (see above). With demo off the static list
  // is empty, so this is a cheap no-op for real users.

  // "Підібрано для вас" — one of each content type, already-owned
  // content excluded so a recommendation tile never overlaps with
  // something the person purchased (2026-09-11, per Sasha's explicit
  // "не змішувати придбаний і рекомендований контент" rule).
  //
  // programActivityIds (2026-09-21, MVP "owned" product decision — real
  // activity excludes, saved-only doesn't, no entitlement system yet):
  // real program ids from the shared participation context, not the
  // static demo `enrollments` array — programParticipation.enrollments
  // already only ever contains activity-derived programs (never
  // saved-only, per that context's own contract), so this is exactly
  // "programs with real activity," nothing more. Guides/meditations are
  // untouched — `source` below is still the plain static `enrollments`
  // array, the same value the old default resolved to, so they keep
  // deriving ownership from it exactly as today.
  const featured = insight
    ? pickFeaturedExcludingOwned(
        insight.primaryState,
        insight.secondaryState,
        enrollments,
        programParticipation.enrollments.map((e) => e.contentId)
      )
    : null;

  // Same "Ваш шлях" 4-step model the Emotional Profile page renders in
  // full (lib/emotionalProfile.ts) — computed once, shared, so this
  // one-line summary can never disagree with that page (2026-09-11, per
  // Sasha's explicit "не дублювати логіку профілю в двох місцях" rule).
  // Replaces the previous reuse of completed PROGRAM count here, which
  // was really a different, unrelated number wearing this sentence's
  // clothes.
  const journeyDoneCount = insight
    ? getJourneySteps({
        hasAssessment: true,
        hasViewedProfile: hasViewedEmotionalProfile(),
        // Real program activity (content_progress, via the shared
        // participation layer) ORs into this — see
        // lib/emotionalProfile.ts's own header for why this can no
        // longer just read the static `enrollments` array for programs
        // (2026-09-21, Overview/Learning consistency follow-up).
        hasStartedPractice: hasStartedFirstPractice(programParticipation.enrollments.length > 0),
      }).filter((s) => s.done).length
    : 0;

  // Real PROGRAM candidates for "Продовжити"/"Ще N незавершені"/preview
  // (2026-09-21) — programParticipation.enrollments already only ever
  // contains activity-derived programs (never saved-only, never
  // catalog-only; see ProgramParticipationContext's own contract), so
  // this union is exactly "real programs + statically-corrected
  // guides/meditations," never the static program array. Guides and
  // meditations are completely unaffected — still `correctedEnrollments`,
  // untouched.
  const combinedEnrollmentsForPriority = useMemo(
    () => [...programParticipation.enrollments, ...correctedEnrollments.filter((e) => e.kind !== "program")],
    [programParticipation.enrollments, correctedEnrollments]
  );
  const nonProgramCorrectedEnrollments = useMemo(
    () => correctedEnrollments.filter((e) => e.kind !== "program"),
    [correctedEnrollments]
  );

  // ---- PRIMARY ACTION ("Продовжити" / empty-state next step) ----
  //
  // A due "Нагадати ввечері" request (utils/practiceReminders.ts) wins
  // outright when one exists — the person explicitly asked to be
  // reminded of this exact item, which outranks the generic recency/
  // progress picker below. Otherwise, dashboardPriority's data-driven
  // function picks the single most relevant in-progress item. Either
  // way there is exactly ONE primary action, never several competing
  // banners (2026-09-11, per Sasha's explicit "не 3 картки одночасно").
  // Reads `combinedEnrollmentsForPriority`, not `correctedEnrollments`
  // (2026-09-21) — pickContinueEnrollment itself is untouched (still
  // lib/dashboardPriority.ts's same recency/percent picker), only its
  // input now sources programs from real activity, per the audit's
  // explicit "a program can only be a Continue candidate if it has real
  // activity" requirement.
  const dueReminder = getDuePracticeReminders()[0] ?? null;
  const primaryEnrollment: Enrollment | null = dueReminder
    ? combinedEnrollmentsForPriority.find((e) => e.contentId === dueReminder.programId && e.kind === "program") ?? null
    : pickContinueEnrollment(combinedEnrollmentsForPriority);
  const primaryInfo = primaryEnrollment
    ? getContentInfo(
        primaryEnrollment.contentId,
        primaryEnrollment.kind,
        primaryEnrollment.kind === "program" ? programParticipation.realProgramMetaById[primaryEnrollment.contentId] : undefined
      )
    : null;
  // Split in two (2026-09-21) rather than one countOtherUnfinished call
  // over the combined array — see lib/programParticipation.ts's
  // countOtherUnfinishedPrograms own comment for exactly why: its
  // `progressPercent > 0` gate is correct for guides but would
  // incorrectly exclude a real IN_PROGRESS + 0% program, so programs
  // and non-programs are counted by two different, correctly-scoped
  // rules and summed — dashboardPriority.ts itself stays untouched.
  const otherUnfinishedCount = primaryEnrollment
    ? countOtherUnfinishedPrograms(
        programParticipation.items,
        primaryEnrollment.kind === "program" ? primaryEnrollment.contentId : null
      ) + countOtherUnfinished(primaryEnrollment.contentId, nonProgramCorrectedEnrollments)
    : 0;

  // Real, server-derived module/progress state (2026-09-21) — replaces
  // the old lib/programProgress.ts's getProgramModules/getProgramProgress
  // pair, which only ever read localStorage (see
  // ProgramParticipationContext's own header on why that's a real
  // multi-device gap: a program started on another device would read as
  // untouched here). summaryByProgramId is populated from the exact same
  // bulk content_progress fetch/computeProgress call Learning's own grid
  // uses — one engine, one real source, both tabs agree.
  const primaryProgramSummary: ProgramProgressSummary | null =
    primaryEnrollment?.kind === "program"
      ? programParticipation.summaryByProgramId[primaryEnrollment.contentId] ?? null
      : null;
  const primaryProgramModules =
    primaryEnrollment?.kind === "program" ? programParticipation.resolveProgramModules(primaryEnrollment.contentId) : null;
  const primaryItemTitle = dueReminder
    ? dueReminder.itemTitle
    : primaryProgramModules && primaryProgramSummary && primaryProgramSummary.currentModuleIndex >= 0
    ? primaryProgramModules[primaryProgramSummary.currentModuleIndex]?.items[primaryProgramSummary.currentItemIndex]
        ?.title
    : undefined;

  // Real saved audio position (meditation_audio_positions) — only
  // fetched for the one item actually shown as primary, not the whole
  // catalog. See ParticipantLearning's identical reasoning for why only
  // a CONFIRMED resumable position counts as "Зупинено на".
  const primaryMeditationPosition = usePrimaryMeditationPosition(
    session?.profile.id,
    primaryEnrollment?.kind,
    primaryEnrollment?.contentId
  );

  // Real section-view count (guide_section_views) for the primary card
  // only, same "just the one item" scoping as the meditation position
  // above.
  // Read from the counts already fetched once above (no second request).
  const primaryGuideViewed =
    session?.profile.id && primaryEnrollment?.kind === "guide"
      ? learningGuideSectionCounts[primaryEnrollment.contentId] ?? 0
      : 0;
  const primaryGuideData =
    primaryEnrollment?.kind === "guide" ? guides.find((g) => g.id === primaryEnrollment.contentId) : undefined;
  const primaryGuideTotal = primaryGuideData ? getGuideSectionCount(primaryGuideData) : 0;

  // Per-kind meta line + optional percent, computed from the SAME real
  // progress sources every other screen already reads from (program's
  // module engine, meditation's saved position, guide's section views)
  // — never a second, parallel progress number.
  const { metaLine: primaryMetaLine, percent: primaryPercent } = primaryEnrollment
    ? buildPrimaryMeta(
        primaryEnrollment.kind === "program"
          ? { kind: "program", summary: primaryProgramSummary }
          : primaryEnrollment.kind === "meditation"
          ? { kind: "meditation", positionSeconds: primaryMeditationPosition, duration: primaryInfo?.duration }
          : { kind: "guide", viewed: primaryGuideViewed, total: primaryGuideTotal, sizeLabel: primaryInfo?.sizeLabel }
      )
    : { metaLine: undefined, percent: null };

  const continuePrimary = () => {
    if (!primaryEnrollment) return;
    if (dueReminder) {
      clearPracticeReminder(dueReminder.itemId);
      onOpenProgramAtItem?.(primaryEnrollment.contentId, dueReminder.itemId);
      return;
    }
    if (primaryEnrollment.kind === "program") onOpenProgramAtItem?.(primaryEnrollment.contentId);
    else if (primaryEnrollment.kind === "meditation") onContinueMeditation?.(primaryEnrollment.contentId);
    else if (primaryEnrollment.kind === "guide") onContinueGuide?.(primaryEnrollment.contentId);
  };

  const openLearningItem = (e: Enrollment) => {
    if (e.kind === "program") onOpenProgramAtItem?.(e.contentId);
    else if (e.kind === "meditation") onContinueMeditation?.(e.contentId);
    else if (e.kind === "guide") onContinueGuide?.(e.contentId);
  };

  // Empty-state next action — Dashboard must always have SOMETHING to
  // do next (Sasha's explicit rule), even for a brand-new or fully
  // caught-up participant.
  const emptyStateMeditation = !primaryEnrollment
    ? pickEmptyStateMeditation(insight ? { primaryState: insight.primaryState, secondaryState: insight.secondaryState } : null)
    : null;

  // "Моє навчання" compact preview — max 3, never the full library
  // (2026-09-11, per Sasha's explicit call). Excludes whatever is
  // already shown as the primary "Продовжити" card so nothing appears
  // twice in a row.
  const learningPreview = useMemo(
    () => pickLearningPreview(3, primaryEnrollment?.contentId ?? null, combinedEnrollmentsForPriority),
    [primaryEnrollment?.contentId, combinedEnrollmentsForPriority]
  );

  // "Може бути корисно" (2026-09-09, per Sasha's explicit context-
  // recommendation spec — her own worked example: someone who often
  // opens anxiety meditations gets pointed at a related guide). Unlike
  // "Підібрано для вас" above, this comes from real behavior
  // (utils/meditationSessionStore.ts's session counts), not the one-
  // time assessment result — null until there's an actual repeated
  // pattern, no forced card.
  const [behaviorRecommendation, setBehaviorRecommendation] =
    useState<BehaviorGuideRecommendation | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Fixed 2026-09-15 (Dashboard technical audit): this only ever
    // excluded bookmarked guides — not guides the person already OWNS
    // (enrollments), and not whatever guide "Підібрано для вас" is
    // showing this same render. Either could let the exact same
    // resource appear twice on the page, or "Може бути корисно"
    // recommend something already purchased.
    const ownedGuideIds = new Set(enrollments.filter((e) => e.kind === "guide").map((e) => e.contentId));
    const compute = (savedIds: Set<string>) => {
      if (cancelled) return;
      const exclude = new Set([...ownedGuideIds, ...savedIds]);
      if (featured?.guide) exclude.add(featured.guide.id);
      setBehaviorRecommendation(recommendGuideFromMeditationBehavior(exclude));
    };
    if (session?.profile.id) {
      fetchAllSavedGuides(session.profile.id)
        .then((rows) => compute(new Set(rows.map((r) => r.guideId))))
        .catch(() => compute(new Set()));
    } else {
      compute(new Set());
    }
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id, featured?.guide?.id]);

  // Demo previews are module-level constant (empty when demo is off).
  const messages = useRecentMessages(session?.profile.id, demoMessagePreviews, readIds);

  // "Ваші спостереження" compact preview (2026-09-11, new per Sasha's
  // spec) — a real count of personal records (notes + before/after
  // check-ins) from the last 7 days, never a fabricated pattern claim.
  // Genuinely nothing yet (not just nothing recent) gets its own honest
  // "недостатньо даних" copy instead of a fake insight.
  const observations = useObservationsSummary(session?.profile.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Кабінет учасника</h1>
        <p className="text-black/60 mt-1">
          {session?.profile.name} — ваш особистий простір у Sensoria.
        </p>
      </div>

      {/* PRIMARY — exactly one action, always present. Everything else
          on this page is secondary/tertiary context, per Sasha's
          explicit hierarchy (2026-09-11 redesign spec).

          Gated on programParticipation.loading (2026-09-21, async-flash
          fix) — combinedEnrollmentsForPriority/primaryEnrollment above
          are computed from programParticipation.enrollments, which is
          genuinely `[]` (not yet "confirmed empty") until that bulk
          fetch resolves. Rendering the empty-state fallback off that
          transient `[]` would tell a participant with real, started
          program activity "нічого немає" for one flash, then swap to
          their actual Continue card — indistinguishable from a fake
          empty state to the person looking at it. Same minimal
          "Завантаження…" pattern the Emotional Profile card already
          uses for its own assessmentLoading fetch, not a new skeleton;
          nothing about primaryEnrollment/otherUnfinishedCount/
          primaryProgramModules/primaryProgramSummary's own computation
          changed — this only delays which branch of the existing
          ternary below renders. */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        {programParticipation.loading ? (
          <p className="text-[14px] text-black/60">Завантаження…</p>
        ) : primaryEnrollment && primaryInfo ? (
          <div className="flex flex-col gap-4">
            {dueReminder && (
              <div className="text-[12px] font-medium text-violet-600">
                Ви просили нагадати про практику ввечері.
              </div>
            )}
            <div>
              {/* The action verb ("Почати" for a program at a real 0%,
                  otherwise "Продовжити") lives only on the button below —
                  see primaryActionVerb. */}
              <div className="flex items-center gap-2">
                <span className="text-black/60 shrink-0">
                  <KindIcon kind={primaryEnrollment.kind} size={20} />
                </span>
                <span className="text-[20px] font-semibold min-w-0">{primaryInfo.title}</span>
              </div>
              {(primaryMetaLine || primaryItemTitle) && (
                <div className="text-[14px] text-black/60 mt-1.5">
                  {[primaryMetaLine, primaryItemTitle].filter(Boolean).join(" · ")}
                </div>
              )}
              {primaryPercent !== null && (
                <div className="h-1.5 rounded-full bg-black/10 overflow-hidden mt-3 max-w-[280px]">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${primaryPercent}%` }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={continuePrimary}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition"
              >
                {primaryActionVerb(primaryEnrollment.kind, primaryPercent)} →
              </button>
              {otherUnfinishedCount > 0 && onGoToLearning && (
                <button
                  onClick={() => onGoToLearning(primaryEnrollment.kind, "in-progress")}
                  className="inline-flex items-center min-h-[44px] text-[14px] text-blue-600 hover:underline"
                >
                  Ще {otherUnfinishedCount} {pluralMaterials(otherUnfinishedCount)} · Переглянути →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[14px] text-black/60 mb-1">Ваш наступний крок</div>
              <p className="text-[14px] text-black/60 mt-1">Сьогодні можна почати з малого.</p>
            </div>
            {emptyStateMeditation ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-xl bg-[#eef2ff] flex items-center justify-center text-black/60 shrink-0">
                  <KindIcon kind="meditation" size={22} />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold text-[16px]">{emptyStateMeditation.title}</div>
                  <div className="text-[12px] text-black/60 mt-0.5">
                    Медитація · {emptyStateMeditation.duration}
                  </div>
                </div>
                <button
                  onClick={() => onOpenMeditation?.(emptyStateMeditation.id)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
                >
                  Почати →
                </button>
              </div>
            ) : (
              <p className="text-[14px] text-black/60">Тут з'явиться рекомендований для вас матеріал.</p>
            )}
          </div>
        )}
      </div>

      {/* SECONDARY — emotional context + a compact glance at everything
          else already in motion. minmax(0, ...) on both tracks, not
          plain "1fr" — a bare fr track has no real upper bound, see the
          identical fix on the sidebar/messages grids below. */}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-4">
        {/* EMOTIONAL PROFILE */}
        <div className="rounded-2xl bg-gradient-to-br from-[#eef2ff] to-white border border-black/5 p-6 flex flex-col justify-between">
          {assessmentLoading ? (
            <p className="text-[14px] text-black/60">Завантаження…</p>
          ) : stateProfile ? (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-[16px] font-semibold mb-1">Ваш емоційний профіль</h2>
                <div className="text-[16px] font-semibold">{stateProfile.title}</div>
                <p className="text-[14px] text-black/60 mt-2 leading-relaxed">
                  {stateProfile.focusSupportLine}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => onNavigate("emotionalProfile")}
                  className="inline-flex items-center min-h-[44px] text-[14px] font-medium text-blue-600 hover:underline self-start"
                >
                  Переглянути свій профіль →
                </button>
                {journeyDoneCount > 0 && (
                  <p className="text-[12px] text-black/60">
                    Ви вже зробили {journeyDoneCount} {pluralSteps(journeyDoneCount)} до свого емоційного балансу.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-[16px] font-semibold mb-1">Ваш емоційний профіль</h2>
                <div className="text-[16px] font-semibold">Ви ще не проходили оцінку стану</div>
                <p className="text-[14px] text-black/60 mt-2 leading-relaxed">
                  Коротка оцінка допоможе підібрати матеріали, які відповідають саме вашому
                  стану.
                </p>
              </div>
              {onRetakeAssessment && (
                <button
                  onClick={onRetakeAssessment}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition self-start"
                >
                  Пройти оцінку →
                </button>
              )}
            </div>
          )}
        </div>

        {/* MY LEARNING — compact preview, never the full library
            (2026-09-11, per Sasha's explicit call). */}
        <div className="rounded-2xl bg-white border border-black/5 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-semibold">Моє навчання</h2>
            <button
              onClick={() => onNavigate("learning")}
              className="inline-flex items-center min-h-[44px] text-[14px] text-blue-600 hover:underline"
            >
              Усі →
            </button>
          </div>
          {learningPreview.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[14px] text-black/60">Тут з'явиться те, що ви почнете або збережете.</p>
              {onBackToSite && (
                <button
                  onClick={onBackToSite}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg border border-black/10 text-[14px] text-black/65 hover:bg-black/[0.03] transition"
                >
                  Відкрити каталог
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {learningPreview.map((e) => {
                const info = getContentInfo(
                  e.contentId,
                  e.kind,
                  e.kind === "program" ? programParticipation.realProgramMetaById[e.contentId] : undefined
                );
                if (!info) return null;
                const programSummary = e.kind === "program" ? programParticipation.summaryByProgramId[e.contentId] ?? null : null;
                return (
                  <button
                    key={e.contentId}
                    onClick={() => openLearningItem(e)}
                    className="min-h-[44px] flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg text-left border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#eef2ff] flex items-center justify-center text-black/60 shrink-0">
                      <KindIcon kind={e.kind} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium truncate">{info.title}</div>
                      <div className="text-[12px] text-black/60 mt-0.5">
                        {accessLabel(e, learningGuideSectionCounts, learningGuideSectionCountsLoaded, programSummary)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RECOMMENDATIONS — max 3, visually marked "РЕКОМЕНДОВАНО" so
          they never read as already-owned content (2026-09-11, per
          Sasha's explicit access/purchase distinction). */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-[16px] font-semibold">Підібрано для вас</h2>
          {!programParticipation.loading && featured && onBackToSite && (
            <button
              onClick={onBackToSite}
              className="inline-flex items-center min-h-[44px] text-[14px] text-blue-600 hover:underline shrink-0 whitespace-nowrap"
            >
              Усі рекомендації →
            </button>
          )}
        </div>
        {!programParticipation.loading && featured && <p className="text-[12px] text-black/60 mb-4">На основі вашого емоційного профілю та останньої активності</p>}

        {/* Loading guard (2026-09-21, post-migration recommendation
            audit's Section 10/BUG #1 finding): `featured` is computed
            from `programParticipation.enrollments` (see its definition
            above) — while that bulk fetch is still in flight, real
            active/completed programs haven't entered the exclusion set
            yet and could briefly render here as "recommended" before
            disappearing once loading resolves. Same minimal guard
            pattern as the primary card fix (2026-09-21) — reuses the
            existing `assessmentLoading` branch/copy rather than adding
            a new loading state or fetch; nothing below this condition
            changed. */}
        {assessmentLoading || programParticipation.loading ? (
          <p className="text-[14px] text-black/60">Завантаження…</p>
        ) : featured && (featured.course || featured.meditation || featured.guide) ? (
          <div className="grid sm:grid-cols-3 gap-3">
            {featured.course && (
              <RecommendationTile
                kind="program"
                title={featured.course.title}
                subtitle={featured.course.author}
                onClick={onOpenProgram ? () => onOpenProgram(featured.course!.id) : undefined}
              />
            )}
            {featured.meditation && (
              <RecommendationTile
                kind="meditation"
                title={featured.meditation.title}
                subtitle={featured.meditation.duration}
                onClick={onOpenMeditation ? () => onOpenMeditation(featured.meditation!.id) : undefined}
              />
            )}
            {featured.guide && (
              <RecommendationTile
                kind="guide"
                title={featured.guide.title}
                subtitle={featured.guide.author}
                onClick={onOpenGuide ? () => onOpenGuide(featured.guide!.id) : undefined}
              />
            )}
          </div>
        ) : insight ? (
          /* Fixed 2026-09-15 (Dashboard technical audit): this used to
             fall through to the same "пройдіть оцінку" copy even when
             the real reason there's nothing to show is that the person
             already owns everything relevant — telling someone who just
             completed the assessment to go take it is factually wrong,
             not just unhelpful. */
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-[14px] text-black/60">
              Ви вже маєте все, що підходить під ваш поточний стан. Загляньте в каталог, щоб
              знайти більше.
            </p>
            {onBackToSite && (
              <button
                onClick={onBackToSite}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
              >
                Переглянути каталог →
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-[14px] text-black/60">
              Пройдіть коротку оцінку стану, щоб ми могли підібрати релевантні матеріали саме
              для вас.
            </p>
            {onRetakeAssessment && (
              <button
                onClick={onRetakeAssessment}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition shrink-0"
              >
                Пройти оцінку →
              </button>
            )}
          </div>
        )}
      </div>

      {/* "Може бути корисно" (2026-09-09, per Sasha's explicit context-
          recommendation spec) — deliberately its own card, not folded
          into "Підібрано для вас" above: that section is about the
          assessment result, this one is about actual behavior, and
          conflating the two would hide which is which. Only appears
          once there's a real repeated pattern — see
          utils/behaviorRecommendations.ts. */}
      {behaviorRecommendation && (
        <div className="w-full max-w-full min-w-0 overflow-hidden box-border rounded-2xl bg-white border border-black/5 p-6">
          <h2 className="text-[16px] font-semibold mb-4">Може бути корисно</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onOpenGuide?.(behaviorRecommendation.guide.id)}
              disabled={!onOpenGuide}
              className="min-w-0 text-left rounded-xl border border-black/5 p-4 transition hover:border-black/15 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] disabled:cursor-default disabled:hover:border-black/5 disabled:hover:shadow-none"
            >
              <div className="mb-2 text-black/60">
                <KindIcon kind="guide" />
              </div>
              <div className="text-[14px] font-medium leading-snug truncate">
                {behaviorRecommendation.guide.title}
              </div>
              <div className="text-[12px] text-black/60 mt-1 truncate">
                Ви часто звертаєтесь до медитацій на тему «
                {categoryLabels[behaviorRecommendation.tag as keyof typeof categoryLabels] ??
                  behaviorRecommendation.tag}
                »
              </div>
            </button>
          </div>
        </div>
      )}

      {/* minmax(0, ...) on both tracks, not plain "1.3fr_1fr" — same
          grid-overflow fix as ParticipantDashboardPage's sidebar
          column: a bare fr track has no real upper bound, so long
          sender names/preview text could push this whole row wider
          than the page instead of wrapping/truncating inside it. */}
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6">
        {/* RECENT MESSAGES */}
        <div className="rounded-2xl bg-white border border-black/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-semibold">Останні повідомлення</h2>
            <button
              onClick={() => onNavigate("messages")}
              className="inline-flex items-center min-h-[44px] text-[14px] text-blue-600 hover:underline"
            >
              Усі →
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-[14px] text-black/60">Немає нових повідомлень</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#eef2ff] flex items-center justify-center text-[14px] font-semibold text-[#4338ca] shrink-0">
                  {m.authorName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium truncate">{m.authorName}</span>
                    {m.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                  </div>
                  {m.contentTitle && (
                    <div className="text-[12px] text-black/60 truncate">{m.contentTitle}</div>
                  )}
                  <div className="text-[12px] text-black/60 truncate">{m.preview}</div>
                </div>
                <div className="text-[12px] text-black/60 shrink-0">{formatRelativeTime(m.date)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* "Ваші спостереження" — compact preview, real counts only,
            never a fabricated pattern (2026-09-11, new per Sasha's
            spec: "Поки недостатньо даних" instead of fake data). */}
        <div className="rounded-2xl bg-white border border-black/5 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[16px] font-semibold">Ваші спостереження</h2>
            {/* Was routing to "learning" — a copy/paste from the card
                next to it — so this button opened "Моє навчання"
                instead of the actual observations page (2026-09-15,
                found during the Dashboard technical audit). */}
            <button
              onClick={() => onNavigate("reflections")}
              className="inline-flex items-center min-h-[44px] text-[14px] text-blue-600 hover:underline"
            >
              Переглянути всі →
            </button>
          </div>
          {!observations || observations.total === 0 ? (
            <p className="text-[14px] text-black/60">Поки недостатньо даних для спостережень.</p>
          ) : observations.recent > 0 ? (
            <p className="text-[14px] text-black/60 leading-relaxed">
              За останні 7 днів ви додали {observations.recent} нов{observations.recent === 1 ? "е" : "их"}{" "}
              спостереження.
            </p>
          ) : (
            <p className="text-[14px] text-black/60 leading-relaxed">
              У вас вже є збережені спостереження — перегляньте їх, коли буде зручно.
            </p>
          )}
          {observations && observations.total > 0 && observations.lastAt && (
            <p className="text-[12px] text-black/60 mt-2 break-words">
              Остання запис: {lowerFirst(formatRelativeTime(observations.lastAt))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
