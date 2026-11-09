// Shared real PROGRAM participation data for the whole participant
// dashboard (2026-09-21, Overview/Learning consistency follow-up to the
// same-day architecture audit). Before this, the entire real-activity
// assembly (bulk content_progress fetch, bulk program_saved_for_later
// fetch, bulk real-catalog resolution, lib/programParticipation.ts's
// buildProgramLearningItems) lived only inside ParticipantLearning.tsx —
// correct for that one tab, but meant ParticipantOverview.tsx (and
// ParticipantEmotionalProfile.tsx) had no way to see the same real data
// without either duplicating the whole fetch/assembly a second time, or
// falling back to the static `enrollments` array, which is exactly the
// cross-page inconsistency the audit flagged.
//
// One provider, mounted once around the whole dashboard
// (pages/ParticipantDashboardPage.tsx, inside SessionProvider so it can
// read the real userId), fetches exactly once per participant session —
// Learning, Overview and Emotional Profile all read the SAME
// `useProgramParticipation()` result, so switching between the
// dashboard's keep-alive tabs never re-fetches or shows disagreeing
// data. `data/participantDashboard.ts`'s static `enrollments` array is
// untouched and still exists for the other things it feeds (guides,
// meditations, dashboardPriority's recommendation-exclusion — none of
// that is in scope here); this context is specifically the real
// PROGRAM layer, nothing else.
//
// Deliberately a plain React Context, not a new state-management
// library — the existing SessionContext.tsx is the established pattern
// for "one real value, read by many components under one provider" in
// this codebase, and this mirrors it exactly.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "./SessionContext";
import { fetchAllProgress } from "../lib/contentProgressSync";
import { ACQUIRED_EVENT, fetchAcquired } from "../lib/acquired";
import { mergeProgress } from "../lib/mergeProgress";
import { getItemProgress } from "../utils/demoProgressStore";
import { fetchAllSavedPrograms, addSavedProgram, removeSavedProgram } from "../lib/programSaves";
import { fetchProgramItemsForIds, fetchProgramsByIds, type PublicProgram } from "../lib/publicContent";
import { getProgramModules } from "../lib/programProgress";
import { buildProgramLearningItems, type ProgramActivityRow } from "../lib/programParticipation";
import { computeProgress } from "../lib/contentProgress";
import type { ContentModule, ProgramProgressSummary } from "../data/contentTypes";
import type { Enrollment } from "../data/participantDashboard";
import type { LearningItem } from "../lib/learningItems";
import { errorMessage } from "../lib/errorMessage";

export type ProgramParticipationValue = {
  // True until real activity, real saves, AND any real-catalog
  // resolution they depend on have all settled at least once — see
  // ParticipantLearning's own former "avoid a flash of fake enrollment
  // data" reasoning, now shared by every consumer instead of being
  // Learning-only.
  loading: boolean;
  // Assembled program LearningItems — Learning's grid input, unchanged
  // shape/contract from before this refactor (lib/programParticipation.ts's
  // own header covers exactly what "membership" means here).
  items: LearningItem[];
  // Enrollment-shaped view of `items` — only ever the activity-derived
  // rows (a saved-only program has no `enrollment`, by
  // buildProgramLearningItems' own contract), so this is already
  // exactly "real Continue/unfinished-count candidates," safe to feed
  // straight into lib/dashboardPriority.ts's existing
  // pickContinueEnrollment/pickLearningPreview unchanged.
  enrollments: Enrollment[];
  // Same items, keyed by contentId — convenience for a single-program
  // read (Overview's learning-preview rows, accessLabel) without every
  // consumer re-deriving its own `.find(...)`.
  byProgramId: Record<string, LearningItem>;
  // Real metadata for non-demo (authored) programs, keyed by contentId —
  // lets getContentInfo's real-program fallback resolve title/author
  // without a second catalog fetch.
  realProgramMetaById: Record<string, PublicProgram>;
  // Full computeProgress() output per program with real activity, keyed
  // by contentId — Overview needs more than the {state, percent} pair
  // items/enrollments already carry (current module/item index, total
  // modules) for its "Модуль X із Y" label and current-item-title
  // lookup, so this exposes the same summary buildProgramLearningItems
  // already derives internally, one real computeProgress() call per
  // program, not a second parallel derivation.
  summaryByProgramId: Record<string, ProgramProgressSummary>;
  // Same catalog resolution buildProgramLearningItems uses internally
  // (demo dictionary first, then the bulk real-catalog fetch this
  // provider already runs) — exposed directly so a consumer that needs
  // a program's module list itself (Overview's current-item-title
  // lookup) doesn't re-implement the demo/real fallback order.
  resolveProgramModules: (contentId: string) => ContentModule[] | null;
  // Real save-row state — string means saved (the row id, for
  // removal), null means confirmed not saved, a missing key means not
  // checked yet. Same shape ParticipantLearning already exposed
  // locally before this refactor.
  programSaveIds: Record<string, string | null>;
  savedProgramIds: Set<string>;
  toggleProgramSaved: (programId: string, programTitle?: string) => Promise<void>;
  saveError: string | null;
  clearSaveError: () => void;
  // Re-reads the participant's progress (call after the lesson player closes).
  refreshProgress: () => void;
};

const ProgramParticipationContext = createContext<ProgramParticipationValue | null>(null);

export function ProgramParticipationProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const userId = session?.profile.id;

  // Real program ACTIVITY — content_progress, bulk-fetched once per
  // session, not per tab. `null` means "not fetched yet" (distinct from
  // a real, empty `[]` for a genuinely fresh participant).
  const [programActivity, setProgramActivity] = useState<ProgramActivityRow[] | null>(null);
  // Bumped by refreshProgress() (lesson player closed) and when the tab becomes visible again,
  // so "where you are now" never shows an outdated lesson.
  const [progressRev, setProgressRev] = useState(0);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setProgressRev((n) => n + 1);
    const onChanged = () => setProgressRev((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("sensoria:progress-changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("sensoria:progress-changed", onChanged);
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchAllProgress(userId).then((map) => {
      if (cancelled) return;
      setProgramActivity(
        Object.entries(map).map(([contentId, row]) => ({
          contentId,
          // The player saves on this device first and to the server a moment later:
          // take the higher status per lesson from both copies.
          progress: mergeProgress(row.progress, getItemProgress(userId, contentId, false)),
          updatedAt: row.updatedAt,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, progressRev]);

  // Free programs added from the cart (acquired_content). Re-read when the cart adds one.
  const [acquiredProgramIds, setAcquiredProgramIds] = useState<Set<string>>(new Set());
  const [acquiredLoaded, setAcquiredLoaded] = useState(false);
  const [acquiredRev, setAcquiredRev] = useState(0);
  useEffect(() => {
    const onChanged = () => setAcquiredRev((n) => n + 1);
    window.addEventListener(ACQUIRED_EVENT, onChanged);
    return () => window.removeEventListener(ACQUIRED_EVENT, onChanged);
  }, []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchAcquired(userId).then((rows) => {
      if (cancelled) return;
      setAcquiredProgramIds(new Set(rows.filter((r) => r.kind === "program").map((r) => r.contentId)));
      setAcquiredLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, acquiredRev]);

  // Real program SAVES — program_saved_for_later, same bulk-once
  // pattern. Owns its own optimistic toggle (moved here from
  // ParticipantLearning) so a save/unsave from either Learning's card
  // or (in future) anywhere else updates the one shared value everyone
  // reads, instead of each screen keeping its own copy that can drift.
  const [programSaveIds, setProgramSaveIds] = useState<Record<string, string | null>>({});
  const [programSaveIdsLoaded, setProgramSaveIdsLoaded] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchAllSavedPrograms(userId).then((rows) => {
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      rows.forEach((row) => {
        map[row.programId] = row.id;
      });
      setProgramSaveIds(map);
      setProgramSaveIdsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const savedProgramIds = useMemo(
    () => new Set(Object.keys(programSaveIds).filter((id) => programSaveIds[id])),
    [programSaveIds]
  );

  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleProgramSaved = async (programId: string, programTitle?: string) => {
    if (!userId) {
      setSaveError("Не вдалося визначити акаунт — спробуйте перезайти.");
      return;
    }
    setSaveError(null);
    const existingId = programSaveIds[programId];
    if (existingId) {
      setProgramSaveIds((prev) => ({ ...prev, [programId]: null }));
      try {
        await removeSavedProgram(existingId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося прибрати зі збережених:", err);
        setSaveError(errorMessage(err));
        setProgramSaveIds((prev) => ({ ...prev, [programId]: existingId }));
      }
      return;
    }
    setProgramSaveIds((prev) => ({ ...prev, [programId]: "saving" }));
    try {
      const saved = await addSavedProgram({ programId, programTitle, userId });
      setProgramSaveIds((prev) => ({ ...prev, [programId]: saved.id }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти програму:", err);
      setSaveError(errorMessage(err));
      setProgramSaveIds((prev) => ({ ...prev, [programId]: null }));
    }
  };

  // Real programs (Supabase `content`, not the static demo catalog)
  // that this participant has activity or a save on — resolved in bulk
  // (two queries total, never one per program — see
  // lib/publicContent.ts's fetchProgramItemsForIds/fetchProgramsByIds'
  // own comments for why). A demo program (already fully resolvable via
  // the synchronous data/programModules.ts dictionary) never enters
  // this set at all.
  const idsNeedingRealCatalog = useMemo(() => {
    const ids = new Set<string>();
    (programActivity ?? []).forEach((row) => {
      if (!getProgramModules(row.contentId)) ids.add(row.contentId);
    });
    savedProgramIds.forEach((id) => {
      if (!getProgramModules(id)) ids.add(id);
    });
    acquiredProgramIds.forEach((id) => {
      if (!getProgramModules(id)) ids.add(id);
    });
    return Array.from(ids).sort();
  }, [programActivity, savedProgramIds, acquiredProgramIds]);
  const idsNeedingRealCatalogKey = idsNeedingRealCatalog.join(",");

  const [realProgramModulesById, setRealProgramModulesById] = useState<Record<string, ContentModule[]>>({});
  const [realProgramMetaById, setRealProgramMetaById] = useState<Record<string, PublicProgram>>({});
  // Tracks which exact id-set has already been resolved — a plain
  // boolean would read "loaded" forever after the first (possibly
  // empty) resolution, even once a newly-started real program needs
  // its own, not-yet-fetched structure.
  const [realCatalogLoadedKey, setRealCatalogLoadedKey] = useState<string>("");
  useEffect(() => {
    if (idsNeedingRealCatalog.length === 0) {
      setRealCatalogLoadedKey(idsNeedingRealCatalogKey);
      return;
    }
    let cancelled = false;
    Promise.all([fetchProgramItemsForIds(idsNeedingRealCatalog), fetchProgramsByIds(idsNeedingRealCatalog)]).then(
      ([modulesMap, metaMap]) => {
        if (cancelled) return;
        setRealProgramModulesById((prev) => ({ ...prev, ...modulesMap }));
        setRealProgramMetaById((prev) => ({ ...prev, ...metaMap }));
        setRealCatalogLoadedKey(idsNeedingRealCatalogKey);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsNeedingRealCatalogKey]);
  const realCatalogLoaded = realCatalogLoadedKey === idsNeedingRealCatalogKey;

  // Shared demo-first/real-fallback module resolver — the same order
  // lib/programProgress.ts's own getProgramModules already uses for a
  // single program, applied here so every consumer (buildProgramLearningItems
  // below, summaryByProgramId, and any component calling
  // resolveProgramModules directly) resolves a program's structure the
  // same way, once.
  const resolveModules = useMemo(
    () =>
      (contentId: string): ContentModule[] | null =>
        getProgramModules(contentId) ?? realProgramModulesById[contentId] ?? null,
    [realProgramModulesById]
  );

  const items = useMemo(() => {
    if (!programActivity) return [];
    return buildProgramLearningItems(programActivity, savedProgramIds, resolveModules, acquiredProgramIds);
  }, [programActivity, savedProgramIds, resolveModules, acquiredProgramIds]);

  // Full computeProgress() output per program with real activity and
  // resolvable structure — see the value type's own comment for why
  // Overview needs this beyond the {state, percent} pair items/
  // enrollments already carry. A program whose structure hasn't
  // resolved yet (real-catalog fetch still in flight) simply has no
  // entry here yet, same "not resolved yet" convention realProgramMetaById
  // already uses — never a fabricated placeholder summary.
  const summaryByProgramId = useMemo(() => {
    const map: Record<string, ProgramProgressSummary> = {};
    (programActivity ?? []).forEach((row) => {
      const modules = resolveModules(row.contentId);
      if (!modules) return;
      map[row.contentId] = computeProgress(modules, row.progress);
    });
    return map;
  }, [programActivity, resolveModules]);

  const enrollmentsForPriority = useMemo(
    () => items.map((i) => i.enrollment).filter((e): e is Enrollment => Boolean(e)),
    [items]
  );

  const byProgramId = useMemo(() => {
    const map: Record<string, LearningItem> = {};
    items.forEach((i) => {
      map[i.contentId] = i;
    });
    return map;
  }, [items]);

  const loading = programActivity === null || !programSaveIdsLoaded || !acquiredLoaded || !realCatalogLoaded;

  const value: ProgramParticipationValue = {
    loading,
    items,
    enrollments: enrollmentsForPriority,
    byProgramId,
    realProgramMetaById,
    summaryByProgramId,
    resolveProgramModules: resolveModules,
    programSaveIds,
    savedProgramIds,
    toggleProgramSaved,
    saveError,
    clearSaveError: () => setSaveError(null),
    refreshProgress: () => setProgressRev((n) => n + 1),
  };

  return <ProgramParticipationContext.Provider value={value}>{children}</ProgramParticipationContext.Provider>;
}

// Throws outside the provider (2026-09-21) rather than silently
// returning demo-shaped data — every real consumer lives inside
// pages/ParticipantDashboardPage.tsx, which always mounts the
// provider, so a missing provider here is a wiring bug worth failing
// loudly on, not something to paper over with a fallback.
export function useProgramParticipation(): ProgramParticipationValue {
  const value = useContext(ProgramParticipationContext);
  if (!value) {
    throw new Error("useProgramParticipation must be used within a ProgramParticipationProvider");
  }
  return value;
}
