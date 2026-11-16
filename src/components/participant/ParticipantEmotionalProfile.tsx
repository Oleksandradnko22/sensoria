import { Icon, type IconName } from "../ui/Icon";
import { useEffect, useMemo, useState } from "react";
import { guideSizeLabel, type Guide } from "../../data/guides";
import { useSession } from "../../context/SessionContext";
import { useProgramParticipation } from "../../context/ProgramParticipationContext";
import funnelStore, { type Intensity } from "../../store/funnelStore";
import { fetchAssessmentHistory, combineAssessments, fetchAssessmentResult, type SavedAssessment } from "../../lib/assessment";
import { getStateProfile } from "../../utils/getStateProfile";
import { stateAccentColors, type StateAccent } from "../../data/stateAccentColors";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import {
  getIntensityLabel,
  getInfluencingFactors,
  getManifestations,
  hasStartedFirstPractice,
  hasAnyObservations,
  markEmotionalProfileViewed,
  type EmotionalProfileSource,
} from "../../lib/emotionalProfile";
import { pickTopMatchesExcludingOwned, type TopMatches } from "../../lib/dashboardPriority";
import { fetchRatingSummaryForContentIds, type RatingSummary } from "../../lib/reviews";

// Alias, not a redeclaration — `IntensityKey` is exactly
// `store/funnelStore.ts`'s real `Intensity` type (2026-09-16 audit fix:
// this used to be its own separately-spelled-out literal union, which
// happened to match today but had no actual link to the real type, so a
// future change to one could silently drift from the other). Aliasing
// it also means `insight.intensity` (typed `Intensity`) needs no cast
// anywhere below.
type IntensityKey = Intensity;

// Calm 4-point scale (kept from the previous redesign) — highlights the
// real category (`insight.intensity`) rather than implying a precise
// continuous measurement.
const INTENSITY_TICKS: { key: IntensityKey; label: string }[] = [
  { key: "low", label: "Низька" },
  { key: "moderate", label: "Помірна" },
  { key: "high", label: "Висока" },
  { key: "critical", label: "Дуже висока" },
];

// The Hero's big "living" visual object (2026-09-15, per Sasha's
// explicit "не progress bar, а м'яка форма/gradient field, яка залежить
// від інтенсивності" spec) — a soft blurred radial field, sized and
// made more opaque as intensity rises. Explicitly NOT a medical gauge:
// no numbers on it, no hard edges, just an ambient presence behind the
// Hero text using the same per-state accent color as everywhere else.
const INTENSITY_FIELD: Record<IntensityKey, { size: number; opacity: number }> = {
  low: { size: 220, opacity: 0.14 },
  moderate: { size: 280, opacity: 0.2 },
  high: { size: 340, opacity: 0.26 },
  critical: { size: 400, opacity: 0.32 },
};

// Severity color for the intensity label in the History timeline —
// distinct from the per-state accent color, same red/orange/yellow
// scale as the mockup Sasha approved.
const intensityColor: Record<IntensityKey, string> = {
  low: "text-emerald-600",
  moderate: "text-yellow-600",
  high: "text-orange-600",
  critical: "text-red-500",
};

// "Може бути корисно зараз" card chrome per content type (2026-09-16
// refinement, per Sasha's explicit follow-up spec) — three sections of
// up to 3 real, owned-excluded, author-diversified picks each
// (lib/dashboardPriority.ts's pickTopMatchesExcludingOwned).
// `itemTypeLabel` names the content type on the card itself ("Програма",
// "Медитація", "Гайд" — her explicit "title + type + author + duration +
// reason + CTA" card spec); `subtitle` is deliberately phrased as
// something Sensoria curated ("підібрані для вашого стану"), not "3
// найбільш релевантні" — her explicit "звучить алгоритмічно" note.
const RECOMMENDATION_SECTIONS: {
  key: keyof TopMatches;
  title: string;
  subtitle: string;
  itemTypeLabel: string;
  icon: IconName;
  cta: string;
  roleLabel?: string;
  viewAllLabel: string;
}[] = [
  {
    key: "courses",
    title: "Програми",
    subtitle: "3 програми, підібрані для вашого стану",
    itemTypeLabel: "Програма",
    icon: "program",
    cta: "Почати",
    roleLabel: "Автор програми",
    viewAllLabel: "Дивитися всі →",
  },
  {
    key: "meditations",
    title: "Медитації",
    subtitle: "3 практики для вашого стану",
    itemTypeLabel: "Медитація",
    icon: "meditation",
    cta: "Слухати",
    viewAllLabel: "Дивитися всі →",
  },
  {
    key: "guides",
    title: "Гайди",
    subtitle: "3 матеріали, які можуть допомогти",
    itemTypeLabel: "Гайд",
    icon: "guide",
    cta: "Читати",
    roleLabel: "Автор гайда",
    viewAllLabel: "Дивитися всі →",
  },
];

// A single real point on the History mini-chart — today there is at
// most one (assessment_results keeps only the latest row per profile,
// see lib/assessment.ts), but this is written to generalize once a real
// multi-attempt history exists, per the file-wide "don't fabricate, but
// don't paint yourself into a corner either" convention.
type HistoryPoint = { score: number; intensity: IntensityKey; dateLabel: string };

// Small inline sparkline — one dot per real assessment, connected by a
// line once there's more than one. No axis/gridlines (this isn't a
// clinical chart), just enough structure to see "did this go up or
// down." Kept local to this file since it's a one-off, page-specific
// visual, not a shared chart component.
function HistorySparkline({ points, accent }: { points: HistoryPoint[]; accent: StateAccent }) {
  const width = Math.max(240, (points.length - 1) * 140 + 80);
  const height = 96;
  const padX = 40;
  const padY = 20;
  const xFor = (i: number) =>
    points.length <= 1 ? width / 2 : padX + (i * (width - padX * 2)) / (points.length - 1);
  const yFor = (score: number) => padY + (1 - Math.max(0, Math.min(100, score)) / 100) * (height - padY * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }} height={height}>
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke={accent.hex}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          points={points.map((p, i) => `${xFor(i)},${yFor(p.score)}`).join(" ")}
        />
      )}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xFor(i)} cy={yFor(p.score)} r={5} fill={accent.hex} />
          <text x={xFor(i)} y={yFor(p.score) - 12} textAnchor="middle" fontSize={11} fill="rgba(0,0,0,0.55)">
            {p.score}
          </text>
          <text x={xFor(i)} y={height - 2} textAnchor="middle" fontSize={10} fill="rgba(0,0,0,0.35)">
            {p.dateLabel}
          </text>
        </g>
      ))}
    </svg>
  );
}

type Props = {
  // Back to "Огляд" — this page has no browser URL of its own (the whole
  // dashboard is one client-side state machine, see
  // ParticipantDashboardPage.tsx), so "back navigation" here means this
  // explicit link rather than a browser back button.
  onBack: () => void;
  onRetakeAssessment?: () => void;
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  // "Переглянути всі" per category (2026-09-11, per Sasha's explicit "з
  // уже виставленими фільтрами під стан" request) — leaves the dashboard
  // for the real Programs/Meditations/Guides catalog page with the
  // person's own state tags already applied as the category filter.
  onViewAllPrograms?: (categories: string[]) => void;
  onViewAllMeditations?: (categories: string[]) => void;
  onViewAllGuides?: (categories: string[]) => void;
};

export default function ParticipantEmotionalProfile({
  onBack,
  onRetakeAssessment,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
  onViewAllPrograms,
  onViewAllMeditations,
  onViewAllGuides,
}: Props) {
  const session = useSession();
  // Real program activity — same shared source Overview reads (2026-09-21
  // participation follow-up), so "Спробували практику" below recognizes
  // a real program the same way Overview's own journey step does,
  // instead of relying on the old static-`enrollments` percent check.
  const programParticipation = useProgramParticipation();

  const [savedAssessment, setSavedAssessment] = useState<SavedAssessment | null>(null);
  const [assessmentChecked, setAssessmentChecked] = useState(false);
  // the last 3 attempts, newest first: the profile is built from them, the history shows them
  const [assessmentHistory, setAssessmentHistory] = useState<SavedAssessment[]>([]);
  useEffect(() => {
    if (!session) {
      setAssessmentChecked(true);
      return;
    }
    let cancelled = false;
    fetchAssessmentHistory(session.profile.id, 3)
      .then(async (history) => (history.length > 0 ? { history, result: combineAssessments(history) } : { history, result: await fetchAssessmentResult(session.profile.id) }))
      .then(({ history, result }) => {
        if (cancelled) return;
        setAssessmentHistory(history);
        setSavedAssessment(result);
        setAssessmentChecked(true);
      })
      .catch(() => {
        if (!cancelled) setAssessmentChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id]);

  // Real, persisted result (assessment_results) wins; funnelStore.insight
  // (sessionStorage) is the same-session fallback for the brief window
  // right after finishing the assessment, before the save has landed —
  // identical convention to ParticipantOverview.tsx.
  const insight: EmotionalProfileSource | null = savedAssessment ?? funnelStore.insight;

  // "Розуміння свого стану" — marked true the moment a real profile is
  // actually shown to this person, not before. The Dashboard's own "Ваш
  // шлях" summary (ParticipantOverview.tsx) reads this same flag; this
  // page shows its own, simpler 3-step version further down (see
  // progressSteps below) rather than duplicating that exact checklist.
  useEffect(() => {
    if (insight) markEmotionalProfileViewed();
  }, [insight]);

  const [hasObservations, setHasObservations] = useState(false);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    hasAnyObservations(session.profile.id).then((result) => {
      if (!cancelled) setHasObservations(result);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id]);

  const [explainerExpanded, setExplainerExpanded] = useState(false);

  const stateProfile = insight ? getStateProfile(insight.primaryState, insight.intensity) : null;
  const accent = insight ? stateAccentColors[insight.primaryState] : null;
  const manifestations = insight ? getManifestations(insight.primaryState) : [];
  const influencingFactors = insight ? getInfluencingFactors(insight.supportingPatterns) : [];

  const startedPractice = hasStartedFirstPractice(programParticipation.enrollments.length > 0);

  // "Ваш шлях" — 3 fixed, real steps (2026-09-16, per Sasha's follow-up
  // spec: same 3 signals as before, exact copy she gave, compacted into
  // one inline line instead of three spaced-out circles).
  const progressSteps = [
    { id: "assessment", label: "Оцінили стан", done: !!insight },
    { id: "observations", label: "Помітили зміни", done: hasObservations },
    { id: "practice", label: "Спробували практику", done: startedPractice },
  ];
  const progressDoneCount = progressSteps.filter((s) => s.done).length;

  // "Що може допомогти зараз" — up to 3 real, owned-excluded,
  // author-diversified picks per content type (lib/dashboardPriority.ts).
  //
  // 4th arg omitted (`undefined`) to keep the static demo `enrollments`
  // default for guides/meditations, unchanged; 5th arg is the same real
  // program-activity id override ParticipantOverview.tsx now passes
  // (2026-09-21 MVP "owned" decision) — programParticipation.enrollments
  // only ever contains activity-derived programs, never saved-only, so
  // this excludes exactly "programs with real activity," nothing more.
  const recommendations = useMemo(
    () =>
      insight
        ? pickTopMatchesExcludingOwned(
            insight.primaryState,
            insight.secondaryState,
            3,
            undefined,
            programParticipation.enrollments.map((e) => e.contentId)
          )
        : null,
    [insight?.primaryState, insight?.secondaryState, programParticipation.enrollments]
  );

  // Real ★ average · N оцінок per recommended item, when it exists
  // (2026-09-16, per Sasha's explicit "тільки якщо дані реально є"
  // spec) — one lean batched query (lib/reviews.ts's
  // fetchRatingSummaryForContentIds) over every id currently
  // recommended, not one query per card. An id with zero real reviews
  // simply has no entry here — cards check for that and render nothing,
  // never a fabricated "0.0 · 0 оцінок".
  const [ratings, setRatings] = useState<Record<string, RatingSummary>>({});
  useEffect(() => {
    if (!recommendations) {
      setRatings({});
      return;
    }
    const ids = [
      ...recommendations.courses.map((c) => c.id),
      ...recommendations.meditations.map((m) => m.id),
      ...recommendations.guides.map((g) => g.id),
    ];
    let cancelled = false;
    fetchRatingSummaryForContentIds(ids).then((result) => {
      if (!cancelled) setRatings(result);
    });
    return () => {
      cancelled = true;
    };
  }, [recommendations]);

  const openContentFor = (kind: keyof TopMatches) =>
    kind === "courses" ? onOpenProgram : kind === "meditations" ? onOpenMeditation : onOpenGuide;
  const viewAllFor = (kind: keyof TopMatches) =>
    kind === "courses" ? onViewAllPrograms : kind === "meditations" ? onViewAllMeditations : onViewAllGuides;
  const openViewAll = (kind: keyof TopMatches) => {
    if (!insight) return;
    const categories = insight.secondaryState
      ? [insight.primaryState, insight.secondaryState]
      : [insight.primaryState];
    viewAllFor(kind)?.(categories);
  };

  // History — real attempts only (assessment_history, newest first; up to 3).
  const historyPoints: HistoryPoint[] = assessmentHistory.length > 0
    ? assessmentHistory.map((h) => ({ score: h.primaryScore, intensity: h.intensity, dateLabel: formatAbsoluteDate(h.completedAt) }))
    : savedAssessment
    ? [{ score: savedAssessment.primaryScore, intensity: savedAssessment.intensity, dateLabel: formatAbsoluteDate(savedAssessment.completedAt) }]
    : [];

  const field = insight ? INTENSITY_FIELD[insight.intensity] : null;

  return (
    <div className="flex flex-col gap-10">
      <button
        onClick={onBack}
        className="text-[14px] text-black/60 hover:text-black/70 transition self-start"
      >
        ← Назад до Огляду
      </button>

      {!assessmentChecked && !insight ? (
        <div className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-10 text-center text-black/60 text-[14px]">
          Завантаження…
        </div>
      ) : !insight || !stateProfile || !accent ? (
        <div className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-8 sm:p-10 flex flex-col items-center text-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="heart" size={24} /></span>
          <div>
            <div className="text-[20px] font-bold text-[#12172b]">Ви ще не проходили оцінку стану</div>
            <p className="text-[14px] text-black/60 mt-2 leading-relaxed max-w-[420px]">
              Коротка оцінка допоможе Sensoria зрозуміти, що з вами зараз відбувається, і зібрати
              для вас персональний профіль.
            </p>
          </div>
          {onRetakeAssessment && (
            <button
              onClick={onRetakeAssessment}
              className="min-h-[46px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold shadow-[0_10px_24px_-12px_rgba(91,61,245,0.7)] hover:opacity-95 transition"
            >
              Пройти оцінку →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 01 — МІЙ РЕЗУЛЬТАТ: Hero with the big soft intensity field
              behind it (2026-09-15 redesign) + the calmer 4-segment
              scale beneath for an accurate, non-medical read of exactly
              where this sits. */}
          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] p-6 ring-1 ring-[#e4def9] shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] sm:p-8">
            <div
              aria-hidden="true"
              className="emotion-field-breathe absolute rounded-full pointer-events-none"
              style={{
                width: field?.size,
                height: field?.size,
                right: "-8%",
                top: "-30%",
                background: `radial-gradient(circle, ${accent.hex} 0%, transparent 72%)`,
                opacity: field?.opacity,
                filter: "blur(48px)",
              }}
            />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
                <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#6d5bd0]">Ваш емоційний профіль</span>
              </div>
              <h1 className="text-[32px] sm:text-[36px] leading-tight font-bold tracking-tight text-[#12172b]">{stateProfile.title}</h1>

              {/* Intensity label carries the visual weight, the raw
                  score rides along small and muted (2026-09-16, per
                  Sasha's explicit "100/100 не повинно виглядати як
                  медичний діагноз" note) — showing the number at all is
                  still useful for someone who wants it, it just isn't
                  the thing the eye lands on first. */}
              <div className={`text-[20px] font-semibold mt-5 ${intensityColor[insight.intensity]}`}>
                {getIntensityLabel(insight.intensity)} інтенсивність
                <span className="ml-2 rounded-full bg-white/80 px-2.5 py-0.5 text-[13px] font-semibold text-black/50 ring-1 ring-[#ebe8ff]">{insight.primaryScore}/100</span>
              </div>

              <p className="text-[16px] text-[#2d2a5c] mt-4 leading-relaxed max-w-[640px]">
                {stateProfile.insight}
              </p>
              <p className="text-[12px] font-medium text-black/45 mt-4">
                {assessmentHistory.length > 1 ? `За останніми ${assessmentHistory.length} оцінками Sensoria` : "На основі вашої оцінки Sensoria"}
                {savedAssessment?.completedAt && ` · остання ${formatAbsoluteDate(savedAssessment.completedAt)}`}
              </p>
            </div>

            <div className="relative mt-6 rounded-2xl bg-white/80 px-5 py-4 ring-1 ring-[#ebe8ff] sm:px-6">
              <div className="flex gap-1.5">
                {INTENSITY_TICKS.map((tick) => {
                  const active = tick.key === insight.intensity;
                  return (
                    <div key={tick.key} className="flex-1 min-w-0">
                      <div className={`h-1.5 rounded-full ${active ? accent.dot : "bg-[#ece9fe]"}`} />
                      <div
                        className={`mt-2 text-[12px] truncate ${
                          active ? "font-bold text-[#12172b]" : "text-black/50"
                        }`}
                      >
                        {tick.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 02 — ЩО ЦЕ ОЗНАЧАЄ: one short paragraph up front
              (stateProfile.explanation), the longer validation text
              tucked behind a "Дізнатися більше" toggle (2026-09-15, per
              Sasha's explicit "не лекція" spec) — a genuinely different
              field from the Hero's insight line, not the same text
              twice. Influencing factors, if any, ride along as small
              tags rather than their own full section (her fixed 7-section
              architecture doesn't list them separately, but the real
              signal shouldn't just disappear). */}
          <section className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6">
            <SectionHead icon="note" title="Що це означає" />
            <p className="text-[15px] text-[#2d2a5c] leading-relaxed max-w-[720px]">{stateProfile.explanation}</p>

            {explainerExpanded && (
              <p className="text-[15px] text-[#2d2a5c] leading-relaxed max-w-[720px] mt-3">
                {stateProfile.validation}
              </p>
            )}

            <button
              type="button"
              onClick={() => setExplainerExpanded((v) => !v)}
              className="mt-3 text-[14px] font-semibold text-[#4338ca] hover:underline"
            >
              {explainerExpanded ? "Згорнути ↑" : "Дізнатися більше про цей стан →"}
            </button>

            {influencingFactors.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {influencingFactors.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-[#f1eeff] px-3 py-1 text-[12px] font-semibold text-[#6d5bd0]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* 03 — ЯК ЦЕ МОЖЕ ПРОЯВЛЯТИСЯ: scannable chips instead of a
              bullet list (2026-09-15 redesign). Each chip is one real
              observation from emotionalManifestations.ts, unchanged. */}
          <section className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6">
            <SectionHead icon="heart" title="Як це може проявлятися" />
            <div className="grid sm:grid-cols-2 gap-2.5">
              {manifestations.map((m) => (
                <div key={m} className="flex items-start gap-2.5 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-[#2d2a5c] leading-snug ring-1 ring-[#f1eefb]"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#8f7ff0]" />
                  <span>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 04 — ВАШ ШЛЯХ: one compact inline line instead of three
              spaced-out circles (2026-09-16 follow-up) — every step is
              the same real, already-computed signal as before, just
              denser: a checkmark (done) or a plain number (not yet),
              joined by "→", with an "X / 3 кроки" counter on the right. */}
          <section className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <SectionHead icon="chart" title="Ваш шлях" inline />
              <span className="rounded-full bg-[#f1eeff] px-3 py-1 text-[12px] font-bold text-[#6d5bd0]">{progressDoneCount} / {progressSteps.length}</span>
            </div>
            <ol className="grid gap-2.5 sm:grid-cols-3">
              {progressSteps.map((step, index) => (
                <li key={step.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${step.done ? "bg-emerald-50/70 ring-emerald-100" : "bg-[#faf9ff] ring-[#f1eefb]"}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold ${step.done ? "bg-emerald-500 text-white" : "bg-white text-[#6d5bd0] ring-1 ring-[#e3def9]"}`}>
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className={`text-[14px] font-semibold leading-snug ${step.done ? "text-emerald-800" : "text-[#2d2a5c]"}`}>{step.label}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* 05 — ЩО МОЖЕ ДОПОМОГТИ ЗАРАЗ: 3 sections x up to 3 real,
              owned-excluded, author-diversified picks each (2026-09-15
              redesign, per Sasha's explicit "не 9 карток підряд, а три
              підписані секції" spec) — a distribution engine, not a
              generic CTA: this is also where authors get discovery. */}
          <section className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6">
            <SectionHead icon="sparkle" title="Може бути корисно зараз" hint="Підібрано на основі вашого емоційного профілю" />

            {programParticipation.loading ? (
              <p className="text-[14px] text-black/60">Завантаження…</p>
            ) : (() => {
              // one grid of everything that fits, each card marked with its type — not three half-empty rows
              const cards = RECOMMENDATION_SECTIONS.flatMap((section) =>
                (recommendations ? recommendations[section.key] : []).map((item) => ({ section, item }))
              );
              return (
                <>
                  {cards.length === 0 ? (
                    <p className="rounded-2xl bg-[#faf9ff] px-4 py-6 text-center text-[14px] text-black/55 ring-1 ring-[#f1eefb]">
                      Усе, що зараз підходить під ваш стан, ви вже маєте або проходите.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {cards.map(({ section, item }) => {
                        const open = openContentFor(section.key);
                        const duration = "pages" in item ? guideSizeLabel(item as Guide) : "duration" in item ? item.duration : "";
                        const rating = ratings[item.id];
                        return (
                          <button
                            key={`${section.key}:${item.id}`}
                            type="button"
                            onClick={() => open?.(item.id)}
                            disabled={!open}
                            className="flex flex-col gap-1.5 rounded-2xl bg-white p-4 text-left ring-1 ring-[#ebe8ff] transition hover:ring-[#c9bff7] hover:shadow-[0_10px_24px_-14px_rgba(60,60,140,0.35)] disabled:cursor-default disabled:hover:shadow-none"
                          >
                            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#f1eeff] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6d5bd0]">
                              <Icon name={section.icon} size={12} /> {section.itemTypeLabel}
                            </span>
                            <span className="mt-1 text-[16px] font-bold leading-snug text-[#12172b] line-clamp-2">{item.title}</span>
                            <span className="text-[13px] text-black/55">
                              {[duration, "author" in item ? item.author : null].filter(Boolean).join(" · ")}
                            </span>
                            {/* real rating only */}
                            {rating && rating.count > 0 && (
                              <span className="text-[13px] font-medium text-amber-600">★ {rating.average.toFixed(1)} · {rating.count} оцінок</span>
                            )}
                            <span className="text-[13px] leading-snug text-black/60 line-clamp-2">{item.description}</span>
                            <span className="mt-auto pt-1.5 text-[13px] font-semibold text-[#4338ca]">{section.cta} →</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {RECOMMENDATION_SECTIONS.map((section) => (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => openViewAll(section.key)}
                        disabled={!viewAllFor(section.key)}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] transition hover:ring-[#c9bff7] hover:bg-[#faf9ff] disabled:opacity-40"
                      >
                        <Icon name={section.icon} size={14} /> Усі {section.title.toLowerCase()} →
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </section>

          {/* 06 — ЯК ЗМІНЮВАВСЯ ВАШ СТАН: a real chart only once there's
              genuinely something to chart (2026-09-16, per Sasha's
              explicit "якщо є лише одна оцінка — я взагалі не показувала
              б графік, це виглядає як недороблений графік" spec). At
              exactly one result — the only case this architecture can
              produce today (assessment_results keeps one row per
              profile) — this is plain honest text, not a single dot
              pretending to be a chart. HistorySparkline itself still
              handles N points, ready for whenever a real multi-attempt
              history exists — the >=2 branch below is unreachable today
              but not fake. */}
          <section className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6">
            <SectionHead icon="chart" title="Як змінювався ваш стан" />

            {historyPoints.length >= 2 ? (
              <>
                <p className="text-[12px] text-black/60 mb-4">Останні 3 проходження оцінки · найновіше зверху</p>
                <HistorySparkline points={historyPoints} accent={accent} />
                <p className="text-[12px] text-black/60 leading-relaxed mt-4">
                  Показуються останні 3 проходження оцінки, найновіше — зверху. Коли з'явиться 4-те,
                  найстаріше проходження автоматично зникне зі списку.
                </p>
              </>
            ) : historyPoints.length === 1 ? (
              <p className="text-[14px] text-black/60 leading-relaxed">
                Ви пройшли оцінку 1 раз. Коли пройдете її ще раз, тут з'явиться ваша динаміка, а профіль рахуватиметься за останніми трьома оцінками.
              </p>
            ) : (
              <p className="text-[14px] text-black/60">Історія з'явиться після повторної оцінки.</p>
            )}

            {/* 07 — ПОВТОРИТИ ОЦІНКУ: secondary CTA, plain outlined
                button, with the disclaimer kept but muted rather than
                red (2026-09-15, per Sasha's explicit copy + styling). */}
            {onRetakeAssessment && (
              <div className="mt-6 pt-6 border-t border-[#f1eefb]">
                <button
                  onClick={onRetakeAssessment}
                  className="min-h-[44px] px-5 rounded-xl bg-white ring-1 ring-[#e3def9] text-[14px] font-semibold text-[#4338ca] hover:ring-[#c9bff7] hover:bg-[#faf9ff] transition"
                >
                  Пройти оцінку ще раз
                </button>
                <p className="text-[12px] text-black/60 mt-2">
                  Повторіть оцінку, коли відчуєте зміни у своєму стані.
                </p>
              </div>
            )}

          </section>

          <p className="flex items-start gap-2 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[13px] leading-relaxed text-black/55 ring-1 ring-[#f1eefb]">
            <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-[#6d5bd0]" />
            Профіль допомагає краще зрозуміти ваш емоційний стан і не є медичною діагностикою.
          </p>
        </>
      )}
    </div>
  );
}

// a section heading with an icon, as everywhere in the cabinet
function SectionHead({ icon, title, hint, inline = false }: { icon: IconName; title: string; hint?: string; inline?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${inline ? "" : "mb-4"}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#6d5bd0]"><Icon name={icon} size={19} /></span>
      <div className="min-w-0">
        <h2 className="text-[20px] font-bold text-[#12172b]">{title}</h2>
        {hint && <p className="text-[13px] text-black/55">{hint}</p>}
      </div>
    </div>
  );
}
