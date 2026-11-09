// "Ваші спостереження" preview data for the overview — a real count of
// personal records (notes + before/after check-ins), never a fabricated
// pattern. null until loaded or without a signed-in user.
import { useEffect, useState, useSyncExternalStore } from "react";
import { getObservationsVersion, subscribeObservations } from "../../utils/observationsSignal";
import { fetchAllReflections } from "../../lib/reflections";
import { fetchAllMoodCheckIns } from "../../lib/moodCheckins";
import { fetchAllMeditationMoodCheckIns } from "../../lib/meditationMoodCheckins";
import { summarizeObservations, type ObservationsSummary } from "../../utils/observationsSummary";

export function useObservationsSummary(userId: string | undefined): ObservationsSummary | null {
  const [summary, setSummary] = useState<ObservationsSummary | null>(null);
  // Re-read when a note / answer / before-after pair is written or deleted.
  const changed = useSyncExternalStore(subscribeObservations, getObservationsVersion);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      fetchAllReflections(userId),
      fetchAllMoodCheckIns(userId),
      fetchAllMeditationMoodCheckIns(userId),
    ]).then(([notes, moods, medMoods]) => {
      if (cancelled) return;
      setSummary(
        summarizeObservations([
          ...notes.map((n) => n.createdAt),
          ...moods.map((m) => m.updatedAt ?? m.createdAt),
          ...medMoods.map((m) => m.updatedAt ?? m.createdAt),
        ])
      );
    });
    return () => {
      cancelled = true;
    };
  }, [userId, changed]);
  return summary;
}
