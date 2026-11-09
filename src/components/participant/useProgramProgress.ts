// A participant's progress through one program: the map of lesson statuses,
// kept in localStorage (instant) and mirrored to the server (fire-and-forget),
// extracted from ProgramExperience.tsx with behaviour unchanged (2026-10-07).
// The rules for "what is the next map" live in utils/programProgressLogic.ts
// (tested on their own); this hook only holds the state and does the storing.
//
// Single source of truth: `progress`. Everything else on the lesson screen
// (percentage, next lesson, locks, closing report) is derived from it.
import { useEffect, useState } from "react";
import type { ContentModule, ItemProgressMap } from "../../data/contentTypes";
import { getItemProgress, setItemProgress } from "../../utils/demoProgressStore";
import { fetchServerProgress, pushServerProgress } from "../../lib/contentProgressSync";
import { applyComplete, applyOpen, applySkip, mergeServerProgress } from "../../utils/programProgressLogic";

export type ProgramProgressApi = {
  progress: ItemProgressMap;
  // Opening an untouched lesson makes it "У процесі" (never downgrades).
  markOpened: (itemId: string) => void;
  // Completes the lesson; returns true when that finished the whole program.
  markCompleted: (itemId: string, modules: ContentModule[]) => boolean;
  // "Не зараз" on a content warning.
  markSkipped: (itemId: string) => void;
};

export function useProgramProgress(programId: string, userId: string | null | undefined): ProgramProgressApi {
  // allowSeed=false — this is always a real, signed-in participant reading
  // their OWN progress, so a genuinely fresh open must start from actually
  // empty, never the demo seed. See utils/demoProgressStore.ts's
  // getItemProgress for the full reasoning (2026-09-21).
  const [progress, setProgress] = useState<ItemProgressMap>(() => getItemProgress(userId ?? null, programId, false));

  // Every progress change goes through here — updates local state +
  // localStorage (still the instant render source) and also pushes to
  // Supabase (lib/contentProgressSync.ts), fire-and-forget, so this device's
  // progress reaches the server without waiting on it. Without a signed-in
  // viewer the progress lives in memory only.
  const persistProgress = (next: ItemProgressMap) => {
    setProgress(next);
    if (userId) {
      setItemProgress(userId, programId, next);
      pushServerProgress(programId, userId, next);
    }
  };

  // Pulls this program's server-side progress once (per program+person) and
  // merges it into local state — the actual fix for "new device shows 0%":
  // localStorage on a fresh browser starts empty, but the server copy isn't.
  // The higher status per lesson wins, so a slightly stale server fetch can
  // never regress what is already showing. The merged result is pushed back
  // too, so both sides agree going forward.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchServerProgress(programId, userId).then((serverProgress) => {
      if (cancelled) return;
      setProgress((current) => {
        const merged = mergeServerProgress(current, serverProgress);
        if (!merged) return current;
        setItemProgress(userId, programId, merged);
        pushServerProgress(programId, userId, merged);
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [programId, userId]);

  const markOpened = (itemId: string) => {
    const next = applyOpen(progress, itemId);
    if (next) persistProgress(next);
  };

  const markCompleted = (itemId: string, modules: ContentModule[]) => {
    const { next, programCompleted } = applyComplete(progress, itemId, modules);
    persistProgress(next);
    return programCompleted;
  };

  const markSkipped = (itemId: string) => {
    persistProgress(applySkip(progress, itemId));
  };

  return { progress, markOpened, markCompleted, markSkipped };
}
