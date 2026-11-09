// Canonical program/lesson lookups for the Saved library.
//
// Sources, in order (all existing — nothing new is introduced):
//  1. the static demo catalog (data/programs.ts + data/programModules.ts);
//  2. ProgramParticipationContext — real programs the participant already
//     has activity/saves on are resolved there once for the whole dashboard;
//  3. only for programs referenced by saved lessons that neither of those
//     knows, ONE bulk fetch (lib/publicContent: fetchProgramsByIds +
//     fetchProgramItemsForIds — two queries each, regardless of how many
//     programs or saved cards there are).
import { useEffect, useMemo, useState } from "react";
import { useProgramParticipation } from "../../context/ProgramParticipationContext";
import { fetchProgramItemsForIds, fetchProgramsByIds, type PublicProgram } from "../../lib/publicContent";
import { getProgramModules } from "../../lib/programProgress";
import { programs as staticPrograms } from "../../data/programs";
import type { ContentModule } from "../../data/contentTypes";
import { idsToFetch, type SavedCatalog } from "../../utils/savedLibraryItems";

export function useSavedCatalog(programIds: (string | null)[]): SavedCatalog {
  const participation = useProgramParticipation();

  const staticTitle = (id: string) => staticPrograms.find((p) => p.id === id)?.title ?? null;
  const knownLocally = (id: string) =>
    !!staticTitle(id) || !!getProgramModules(id) || !!participation.realProgramMetaById[id];

  // Wait for the shared provider before deciding what is missing, so ids it
  // is about to resolve are never fetched a second time here.
  const missing = participation.loading ? [] : idsToFetch(programIds, knownLocally);
  const missingKey = missing.join(",");

  const [extraMeta, setExtraMeta] = useState<Record<string, PublicProgram>>({});
  const [extraModules, setExtraModules] = useState<Record<string, ContentModule[]>>({});
  // Ids already asked for (found or not) — a program that does not exist is
  // asked about once, not on every render.
  const [asked, setAsked] = useState<Set<string>>(new Set());

  const toAsk = missing.filter((id) => !asked.has(id));
  const toAskKey = toAsk.join(",");
  useEffect(() => {
    if (toAsk.length === 0) return;
    let cancelled = false;
    Promise.all([fetchProgramsByIds(toAsk), fetchProgramItemsForIds(toAsk)])
      .then(([meta, modules]) => {
        if (cancelled) return;
        setExtraMeta((prev) => ({ ...prev, ...meta }));
        setExtraModules((prev) => ({ ...prev, ...modules }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAsked((prev) => new Set([...prev, ...toAsk]));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toAskKey]);

  const ready = !participation.loading && missing.every((id) => asked.has(id));

  return useMemo<SavedCatalog>(
    () => ({
      ready,
      programTitle: (id) =>
        staticTitle(id) ?? participation.realProgramMetaById[id]?.title ?? extraMeta[id]?.title ?? null,
      modules: (id) => participation.resolveProgramModules(id) ?? extraModules[id] ?? null,
      programPrice: (id) =>
        staticPrograms.find((p) => p.id === id)?.price ?? participation.realProgramMetaById[id]?.price ?? extraMeta[id]?.price ?? null,
      programAuthor: (id) =>
        staticPrograms.find((p) => p.id === id)?.author ??
        participation.realProgramMetaById[id]?.author ??
        extraMeta[id]?.author ??
        null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, participation.realProgramMetaById, participation.resolveProgramModules, extraMeta, extraModules, missingKey]
  );
}
