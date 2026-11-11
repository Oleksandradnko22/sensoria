// "Ваші спостереження" — the participant's personal, self-only history:
//   · «Зміни стану»   — before/after ratings from lessons (lib/moodCheckins.ts,
//                       read-only history: the lesson UI that wrote them was
//                       removed) and from meditations (lib/meditationMoodCheckins.ts);
//   · «Ваші відповіді» — answers to in-lesson "Спробуйте зараз" questions
//                       (lib/practiceResponses.ts);
//   · «Ваші нотатки»   — notes written in the lesson player (lib/reflections.ts).
// Records can be opened at the place they were left ("Відкрити") or deleted
// (each with an inline confirm). RLS on all four tables is self-only.
// Presentation helpers live in ObservationParts / utils/observationsView.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "../ui/Icon";
import ObservationsChart from "./ObservationsChart";
import { ChangeFigure, DateBlock, MOMENT_CLS, MonthHeading } from "./ObservationParts";
import { buildChartSeries, buildInsights, groupByMonth } from "../../utils/observationsView";
import { getObservationsVersion, subscribeObservations } from "../../utils/observationsSignal";
import { matchesSearch } from "../../utils/savedLibrary";
import { useSavedCatalog } from "./useSavedCatalog";
import { resolveSavedLesson } from "../../utils/savedLibraryItems";
import { meditations } from "../../data/meditations";
import {
  STATE_SOURCE_LABEL,
  buildStateChanges,
  parseStateChangeKey,
  type StateChange,
  type StateChangeSource,
} from "../../utils/stateChanges";
import { useSession } from "../../context/SessionContext";
import { fetchAllReflections, deleteReflection, type Reflection } from "../../lib/reflections";
import { fetchAllMoodCheckIns, deleteMoodCheckInById, type MoodCheckInRecord } from "../../lib/moodCheckins";
import {
  fetchAllMeditationMoodCheckIns,
  deleteMeditationMoodCheckInById,
  type MeditationMoodCheckInRecord,
} from "../../lib/meditationMoodCheckins";
import {
  fetchAllPracticeResponses,
  deletePracticeResponseById,
  type PracticeResponseRecord,
  type PracticeResponseValue,
} from "../../lib/practiceResponses";

// A practice answer only reads as a real "logical end" for the "Спробуйте
// зараз" block if you can see what it was answering, not just the raw
// value — hence rendering it against its denormalized prompt below.
function formatPracticeAnswer(response: PracticeResponseValue): string {
  if ("text" in response) return response.text;
  if ("value" in response) return String(response.value);
  if ("choice" in response) return response.choice;
  if ("choices" in response) return response.choices.join(", ");
  return "";
}

type ReflectionTab = "changes" | "answers" | "notes";
type Kind = "change" | "answer" | "note";
type SourceFilter = "all" | StateChangeSource;

// Records rendered per tab before "Показати ще".
const PAGE_SIZE = 20;
// Search appears once a tab holds enough records to need it.
const SEARCH_FROM = 6;

type Props = {
  onNavigate?: (key: "learning") => void;
  // Opens the program's real Lesson Player deep-linked to the specific item
  // (and, via `anchor`, the exact block) a note / answer / check-in was left on.
  onOpenProgramAtItem?: (programId: string, itemId?: string, anchor?: string) => void;
  // Reopens MeditationExperience for that meditation.
  onOpenMeditation?: (meditationId: string) => void;
  // False while another dashboard section is shown (the page stays mounted).
  active?: boolean;
};

const actionRow = "flex flex-wrap items-center justify-end gap-2 mt-4";
const openBtn =
  "min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30";
const deleteBtn =
  "min-h-[44px] px-4 py-2 rounded-xl border border-black/15 bg-white text-[14px] font-medium text-black/65 hover:border-red-300 hover:text-red-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30";

export default function ParticipantReflections({ onNavigate, onOpenProgramAtItem, onOpenMeditation, active = true }: Props) {
  const session = useSession();
  const userId = session?.profile.id;
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [moodCheckIns, setMoodCheckIns] = useState<MoodCheckInRecord[]>([]);
  const [meditationMoodCheckIns, setMeditationMoodCheckIns] = useState<MeditationMoodCheckInRecord[]>([]);
  const [practiceResponses, setPracticeResponses] = useState<PracticeResponseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState<ReflectionTab>("changes");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reads the four sources. Re-runs when the page is shown again only if
  // something changed (a note / answer / before-after pair was written or
  // deleted anywhere — utils/observationsSignal), the user changed, the person
  // pressed "Спробувати ще раз", or the data is over 5 minutes old. A failed
  // read is an error, never an empty history.
  const changedSignal = useSyncExternalStore(subscribeObservations, getObservationsVersion);
  const hasLoaded = useRef(false);
  const lastLoad = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!userId || !active) return;
    const loadKey = `${userId}|${reloadKey}|${changedSignal}`;
    const last = lastLoad.current;
    if (hasLoaded.current && last && last.key === loadKey && Date.now() - last.at < 5 * 60_000) return;
    let cancelled = false;
    if (!hasLoaded.current) setLoading(true);
    const strict = { strict: true };
    Promise.all([
      fetchAllReflections(userId, strict),
      fetchAllMoodCheckIns(userId, strict),
      fetchAllMeditationMoodCheckIns(userId, strict),
      fetchAllPracticeResponses(userId, strict),
    ])
      .then(([notes, moods, meditationMoods, practice]) => {
        if (cancelled) return;
        setReflections(notes);
        setMoodCheckIns(moods);
        setMeditationMoodCheckIns(meditationMoods);
        setPracticeResponses(practice);
        hasLoaded.current = true;
        lastLoad.current = { key: loadKey, at: Date.now() };
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, active, reloadKey, changedSignal]);

  // One delete path for every kind of record; the confirm panel is keyed by
  // "kind:id" so only one is open at a time.
  const removeRecord = async (kind: Kind, id: string) => {
    setDeleting(true);
    setDeleteError(false);
    try {
      if (kind === "note") {
        await deleteReflection(id);
        setReflections((prev) => prev.filter((r) => r.id !== id));
      } else if (kind === "answer") {
        await deletePracticeResponseById(id);
        setPracticeResponses((prev) => prev.filter((r) => r.id !== id));
      } else {
        const parsed = parseStateChangeKey(id);
        if (!parsed) throw new Error("Невідомий запис.");
        if (parsed.source === "practice") {
          await deleteMoodCheckInById(parsed.id);
          setMoodCheckIns((prev) => prev.filter((r) => r.id !== parsed.id));
        } else {
          await deleteMeditationMoodCheckInById(parsed.id);
          setMeditationMoodCheckIns((prev) => prev.filter((r) => r.id !== parsed.id));
        }
      }
      setConfirmDeleteId(null);
      setStatus("Запис видалено");
      // The row that held focus is gone — keep focus inside the page.
      panelRef.current?.focus();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  // One unified list: before/after from practices AND meditations are the
  // same kind of record (see utils/stateChanges.ts).
  const stateChanges = useMemo(
    () => buildStateChanges(moodCheckIns, meditationMoodCheckIns),
    [moodCheckIns, meditationMoodCheckIns]
  );
  // Every saved answer, including old rows saved before program/prompt were
  // recorded (they have no context and no "Відкрити", but are still the
  // person's data and can be deleted).
  const answers = practiceResponses;

  // Same catalog the Saved library uses (static demo data, participation
  // context, one bulk fetch for the rest).
  const catalog = useSavedCatalog([
    ...moodCheckIns.map((m) => m.programId),
    ...answers.map((a) => a.programId),
    ...reflections.map((r) => r.programId),
  ]);
  // "current": the lesson still exists; "gone": it was removed; "none": not
  // linkable (no program recorded) or not known yet.
  const lessonStatus = (programId: string | null, itemId: string): "current" | "gone" | "none" => {
    if (!programId || !onOpenProgramAtItem) return "none";
    const r = resolveSavedLesson({
      programId,
      itemId,
      snapshotItemTitle: null,
      snapshotProgramTitle: null,
      fallbackTitle: "",
      catalog,
    });
    return r.status === "current" ? "current" : r.status === "unavailable" ? "gone" : "none";
  };
  const changeStatus = (c: StateChange): "current" | "gone" | "none" => {
    if (!c.target) return "none";
    if (c.target.kind === "program") return lessonStatus(c.target.programId, c.target.itemId);
    if (!onOpenMeditation) return "none";
    const id = c.target.meditationId;
    return meditations.some((m) => m.id === id) ? "current" : "gone";
  };
  const openStateChange = (c: StateChange) => {
    if (!c.target) return;
    if (c.target.kind === "program") onOpenProgramAtItem?.(c.target.programId, c.target.itemId, "practice");
    else onOpenMeditation?.(c.target.meditationId);
  };

  const ts = (iso: string) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : -Infinity;
  };
  // Newest first by each record's own real timestamp (state changes are
  // already ordered in buildStateChanges).
  const answersSorted = useMemo(
    () => [...answers].sort((a, b) => ts(b.updatedAt ?? b.createdAt) - ts(a.updatedAt ?? a.createdAt)),
    [answers]
  );
  const notesSorted = useMemo(() => [...reflections].sort((a, b) => ts(b.createdAt) - ts(a.createdAt)), [reflections]);

  const tabs: { key: ReflectionTab; label: string; count: number }[] = [
    { key: "changes", label: "Зміни стану", count: stateChanges.length },
    { key: "answers", label: "Ваші відповіді", count: answers.length },
    { key: "notes", label: "Ваші нотатки", count: reflections.length },
  ];
  const currentCount = tabs.find((t) => t.key === tab)?.count ?? 0;
  const searching = query.trim().length > 0;

  // Search / source filter, then "Показати ще" — all on the real records.
  const filteredChanges = useMemo(
    () =>
      stateChanges.filter(
        (c) =>
          (sourceFilter === "all" || c.source === sourceFilter) &&
          matchesSearch(
            [c.context, c.measure, STATE_SOURCE_LABEL[c.source], c.note, ...c.tags, c.before, c.after],
            query
          )
      ),
    [stateChanges, sourceFilter, query]
  );
  const filteredAnswers = useMemo(
    () =>
      answersSorted.filter((p) =>
        matchesSearch([p.programTitle, p.itemTitle, p.prompt, formatPracticeAnswer(p.response)], query)
      ),
    [answersSorted, query]
  );
  const filteredNotes = useMemo(
    () => notesSorted.filter((r) => matchesSearch([r.programTitle, r.itemTitle, r.note], query)),
    [notesSorted, query]
  );
  useEffect(() => setLimit(PAGE_SIZE), [tab, query, sourceFilter]);

  const chartSeries = useMemo(() => buildChartSeries(stateChanges), [stateChanges]);
  const insights = useMemo(() => buildInsights(stateChanges), [stateChanges]);
  const [chartSource, setChartSource] = useState<StateChangeSource | null>(null);
  const activeSeries = chartSeries.find((s) => s.source === chartSource) ?? chartSeries[0];
  const changeGroups = useMemo(
    () => groupByMonth(filteredChanges.slice(0, limit), (c) => c.at),
    [filteredChanges, limit]
  );
  const answerGroups = useMemo(
    () => groupByMonth(filteredAnswers.slice(0, limit), (a) => a.updatedAt ?? a.createdAt),
    [filteredAnswers, limit]
  );
  const noteGroups = useMemo(() => groupByMonth(filteredNotes.slice(0, limit), (n) => n.createdAt), [filteredNotes, limit]);

  const emptyState = (title: string, text: string) => (
    <div className="rounded-2xl bg-white border border-black/5 px-5 py-6">
      <div className="text-[14px] font-medium">{title}</div>
      <p className="text-[14px] text-black/60 mt-1">{text}</p>
      {onNavigate && (
        <button onClick={() => onNavigate("learning")} className="inline-flex items-center min-h-[44px] mt-3 text-[14px] text-blue-600 hover:underline">
          Перейти до навчання →
        </button>
      )}
    </div>
  );
  const showMore = (total: number) =>
    total > limit && (
      <div className="flex justify-center mt-4">
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-black/10 bg-white text-[14px] font-medium text-black/65 hover:border-black/25 transition"
        >
          Показати ще ({total - limit})
        </button>
      </div>
    );

  // Right-aligned actions of a record: "Видалити" (with an inline confirm) and
  // "Відкрити" — or, when the original is gone, a quiet note saying so.
  const renderActions = (
    kind: Kind,
    id: string,
    open: { status: "current" | "gone" | "none"; label: string; goneText: string; run: () => void },
    warning: string
  ) => {
    const key = `${kind}:${id}`;
    if (confirmDeleteId === key) {
      return (
        <div role="group" aria-label="Підтвердження видалення" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100">
          <div className="text-[14px] font-medium text-red-700">Видалити запис?</div>
          <p className="text-[12px] text-red-700/70 mt-1 mb-3">{warning} Це не можна скасувати.</p>
          {deleteError && (
            <p role="alert" className="text-[12px] text-red-700 mb-2">
              Не вдалося видалити. Спробуйте ще раз.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => removeRecord(kind, id)}
              disabled={deleting}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {deleting ? "Видаляємо…" : "Видалити"}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmDeleteId(null);
                setDeleteError(false);
              }}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-[14px] text-black/60 hover:bg-black/5 transition"
            >
              Скасувати
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={actionRow}>
        {open.status === "gone" && <span className="mr-auto text-[12px] text-black/60">{open.goneText}</span>}
        <button
          type="button"
          className={deleteBtn}
          onClick={() => {
            setDeleteError(false);
            setConfirmDeleteId(key);
          }}
        >
          Видалити
        </button>
        {open.status === "current" && (
          <button type="button" className={openBtn} onClick={open.run}>
            {open.label}
          </button>
        )}
      </div>
    );
  };

  const noData = reflections.length + moodCheckIns.length + meditationMoodCheckIns.length + practiceResponses.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold">Ваші спостереження</h1>
        <p className="text-black/60 mt-1">Особистий запис того, що ви помітили в собі: зміни стану, відповіді й нотатки.</p>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      {loadError && noData ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-8 sm:p-10 text-center">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Icon name="warning" size={18} />
          </div>
          <div className="text-[16px] font-medium mb-1.5">Не вдалося завантажити спостереження</div>
          <p className="text-[14px] text-black/60 mb-5">
            Ваші записи нікуди не зникли — перевірте з’єднання й спробуйте ще раз.
          </p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition"
          >
            Спробувати ще раз
          </button>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[14px] text-amber-800">
              <span>Не вдалося оновити список — показано останні завантажені дані.</span>
              <button onClick={() => setReloadKey((k) => k + 1)} className="font-semibold hover:underline">
                Спробувати ще раз
              </button>
            </div>
          )}

          <div
            role="tablist"
            aria-label="Розділи спостережень"
            className="flex flex-wrap gap-2"
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = tabs.findIndex((t) => t.key === tab);
              const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
              setTab(next.key);
              requestAnimationFrame(() => document.getElementById(`reflections-tab-${next.key}`)?.focus());
            }}
          >
            {tabs.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  id={`reflections-tab-${t.key}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls="reflections-panel"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setTab(t.key)}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[14px] font-medium border transition ${
                    isActive
                      ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35"
                      : "bg-white text-black/60 border-black/10 hover:border-black/25"
                  }`}
                >
                  {t.label}
                  {!loading && <span className={isActive ? "text-[#4338ca]/80" : "text-black/60"}> · {t.count}</span>}
                </button>
              );
            })}
          </div>

          {!loading && (currentCount >= SEARCH_FROM || searching) && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/60 pointer-events-none">
                  <Icon name="search" size={16} />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Пошук у цьому розділі"
                  aria-label="Пошук у цьому розділі"
                  className="w-full rounded-xl bg-white border border-black/10 pl-10 pr-20 py-2.5 text-[14px] focus:outline-none focus:border-black/30 transition"
                />
                {searching && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-black/60 hover:text-black/70 transition"
                  >
                    Очистити
                  </button>
                )}
              </div>
              {tab === "changes" && new Set(stateChanges.map((c) => c.source)).size > 1 && (
                <div className="flex gap-1.5" role="group" aria-label="Джерело">
                  {(["all", "practice", "meditation"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={sourceFilter === f}
                      onClick={() => setSourceFilter(f)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-[14px] font-medium border transition ${
                        sourceFilter === f
                          ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35"
                          : "bg-white text-black/60 border-black/10 hover:border-black/25"
                      }`}
                    >
                      {f === "all" ? "Усі" : f === "practice" ? "Практики" : "Медитації"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            id="reflections-panel"
            ref={panelRef}
            tabIndex={-1}
            role="tabpanel"
            aria-labelledby={`reflections-tab-${tab}`}
            aria-busy={loading}
            className="focus:outline-none"
          >
            {loading ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-2xl border border-black/5 bg-white p-4 animate-pulse">
                    <div className="h-2.5 w-24 rounded bg-black/[0.07]" />
                    <div className="h-3.5 w-2/3 rounded bg-black/[0.07] mt-3" />
                    <div className="h-8 w-28 rounded bg-black/[0.05] mt-3" />
                  </div>
                ))}
              </div>
            ) : tab === "changes" ? (
              stateChanges.length === 0 ? (
                emptyState("Тут поки порожньо", "Тут з'являться ваші спостереження за змінами стану.")
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Overview: a real chart once there are enough complete pairs,
                      an honest early-data note until then. Hidden while searching. */}
                  {!searching && (
                    <section aria-label="Огляд змін" className="rounded-2xl border border-black/5 bg-white p-4 sm:p-5">
                      {activeSeries ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
                            <div className="min-w-0">
                              <div className="text-[16px] font-semibold text-black/85">Як змінювалась ваша оцінка</div>
                              <div className="text-[12px] text-black/60 mt-0.5">
                                {activeSeries.measure} · шкала від {activeSeries.min} до {activeSeries.scale} ·{" "}
                                {activeSeries.points.length < activeSeries.total
                                  ? `останні ${activeSeries.points.length} з ${activeSeries.total}`
                                  : `${activeSeries.total} спостережень`}
                              </div>
                            </div>
                            {chartSeries.length > 1 && (
                              <div className="flex gap-1.5" role="group" aria-label="Джерело оцінок">
                                {chartSeries.map((sr) => (
                                  <button
                                    key={sr.source}
                                    type="button"
                                    aria-pressed={sr.source === activeSeries.source}
                                    onClick={() => setChartSource(sr.source)}
                                    className={`min-h-[44px] px-3 py-1 rounded-full text-[12px] font-medium border transition ${
                                      sr.source === activeSeries.source
                                        ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35"
                                        : "bg-white text-black/60 border-black/10 hover:border-black/25"
                                    }`}
                                  >
                                    {STATE_SOURCE_LABEL[sr.source]}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="sr-only">
                            Діаграма: {activeSeries.points.length} спостережень, від найстаршого до найновішого. Для кожного
                            показано оцінку до і після за шкалою від {activeSeries.min} до {activeSeries.scale}.
                          </p>
                          <ObservationsChart series={activeSeries} />
                          <div className="flex items-center gap-4 mt-3 text-[12px] text-black/60">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#4338ca]/60 bg-white" /> було
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#4338ca]" /> стало
                            </span>
                          </div>
                          {insights.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-black/[0.07] flex flex-col gap-1.5">
                              {insights.map((t) => (
                                <p key={t} className="text-[14px] text-black/65 leading-relaxed">
                                  {t}
                                </p>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <div className="text-[16px] font-semibold text-black/85">Історія змін складатиметься поступово</div>
                          <p className="text-[14px] text-black/60 mt-1 leading-relaxed">
                            Коли накопичиться кілька спостережень «було — стало», тут з'явиться огляд того, як змінювались
                            ваші оцінки. Поки що записів: {stateChanges.length}.
                          </p>
                          {insights.length > 0 && (
                            <div className="mt-3 flex flex-col gap-1.5">
                              {insights.map((t) => (
                                <p key={t} className="text-[14px] text-black/65 leading-relaxed">
                                  {t}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {filteredChanges.length === 0 ? (
                    emptyState("Нічого не знайдено", "За цим запитом і фільтром записів немає.")
                  ) : (
                    <>
                      {changeGroups.map((g) => (
                        <section key={g.key} aria-label={g.label}>
                          <MonthHeading>{g.label}</MonthHeading>
                          <div className="flex flex-col divide-y divide-black/[0.06]">
                            {g.items.map((c) => (
                              <article key={c.key} className={MOMENT_CLS}>
                                <div className="mb-2 sm:mb-0">
                                  <DateBlock iso={c.at} />
                                </div>
                                <div className="min-w-0">
                                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-black/60">
                                    <Icon name={c.source === "practice" ? "toolbox" : "meditation"} size={14} />
                                    {STATE_SOURCE_LABEL[c.source]} · {c.measure}
                                  </span>
                                  {c.context && (
                                    <div className="text-[16px] font-semibold text-black/85 leading-snug break-words mt-1">
                                      {c.context}
                                    </div>
                                  )}
                                  <div className="mt-3">
                                    <ChangeFigure c={c} />
                                  </div>
                                  {c.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                      {c.tags.map((t) => (
                                        <span
                                          key={t}
                                          className="rounded-full bg-black/[0.06] text-black/60 px-2 py-0.5 text-[12px] font-medium"
                                        >
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {c.note && (
                                    <blockquote className="mt-3 border-l-2 border-[#4338ca]/20 pl-3 font-serif italic text-[16px] leading-relaxed text-black/70 break-words">
                                      «{c.note}»
                                    </blockquote>
                                  )}
                                  {renderActions(
                                    "change",
                                    c.key,
                                    {
                                      status: changeStatus(c),
                                      label: c.source === "meditation" ? "Відкрити медитацію" : "Відкрити",
                                      goneText: c.source === "meditation" ? "Медитація більше недоступна" : "Урок більше недоступний",
                                      run: () => openStateChange(c),
                                    },
                                    c.source === "practice"
                                      ? "Це спостереження зникне з вашої історії й з підсумку програми."
                                      : "Це спостереження зникне з вашої історії."
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                      {showMore(filteredChanges.length)}
                    </>
                  )}
                </div>
              )
            ) : tab === "answers" ? (
              answers.length === 0 ? (
                emptyState("Тут поки порожньо", "Тут зберігатимуться ваші відповіді на практичні запитання.")
              ) : filteredAnswers.length === 0 ? (
                emptyState("Нічого не знайдено", "За цим запитом відповідей немає.")
              ) : (
                <div className="flex flex-col gap-5">
                  {answerGroups.map((g) => (
                    <section key={g.key} aria-label={g.label}>
                      <MonthHeading>{g.label}</MonthHeading>
                      <div className="flex flex-col divide-y divide-black/[0.06]">
                        {g.items.map((p) => {
                          const at = p.updatedAt ?? p.createdAt;
                          const context = [p.programTitle, p.itemTitle].filter(Boolean).join(" · ");
                          return (
                            <article key={p.id} className={MOMENT_CLS}>
                              <div className="mb-2 sm:mb-0">
                                <DateBlock iso={at} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12px] text-black/60 break-words">
                                  {context || "Відповідь без назви уроку"}
                                </div>
                                {p.prompt && (
                                  <div className="font-serif text-[20px] leading-snug text-black/85 break-words mt-1">
                                    {p.prompt}
                                  </div>
                                )}
                                <div className="mt-2.5 border-l-2 border-[#4338ca]/25 pl-3 text-[16px] font-medium text-black/85 leading-relaxed whitespace-pre-line break-words">
                                  {formatPracticeAnswer(p.response)}
                                </div>
                                {renderActions(
                                  "answer",
                                  p.id,
                                  {
                                    status: lessonStatus(p.programId, p.contentItemId),
                                    label: "Відкрити",
                                    goneText: "Урок більше недоступний",
                                    run: () => onOpenProgramAtItem!(p.programId!, p.contentItemId, "practice"),
                                  },
                                  "Відповідь зникне й з уроку, де ви її давали."
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {showMore(filteredAnswers.length)}
                </div>
              )
            ) : reflections.length === 0 ? (
              emptyState("Тут поки порожньо", "Тут зберігатимуться ваші особисті нотатки.")
            ) : filteredNotes.length === 0 ? (
              emptyState("Нічого не знайдено", "За цим запитом нотаток немає.")
            ) : (
              <div className="flex flex-col gap-5">
                {noteGroups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <MonthHeading>{g.label}</MonthHeading>
                    <div className="flex flex-col divide-y divide-black/[0.06]">
                      {g.items.map((r) => {
                        const context = [r.programTitle, r.itemTitle].filter(Boolean).join(" · ");
                        return (
                          <article key={r.id} className={MOMENT_CLS}>
                            <div className="mb-2 sm:mb-0">
                              <DateBlock iso={r.createdAt} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-serif text-[20px] leading-relaxed text-black/85 whitespace-pre-line break-words border-l-2 border-[#e3d6bd] pl-4">
                                {r.note}
                              </p>
                              {context && <div className="text-[12px] text-black/60 break-words mt-2.5 pl-4">{context}</div>}
                              {renderActions(
                                "note",
                                r.id,
                                {
                                  status: lessonStatus(r.programId, r.contentItemId),
                                  label: "Відкрити",
                                  goneText: "Урок більше недоступний",
                                  run: () => onOpenProgramAtItem!(r.programId!, r.contentItemId, `note:${r.id}`),
                                },
                                "Нотатку буде видалено."
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {showMore(filteredNotes.length)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

