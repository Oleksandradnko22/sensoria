// What an author's save would change for PEOPLE WHO ALREADY HAVE PROGRESS
// (2026-10-06). Pure.
//
// Identity rule (same as guide block ids / meditation ids): a module/lesson id
// is immutable once saved. Editing, reordering and rewording keep it. Removing
// a lesson deletes its row; what participants did there (progress, reflections,
// practice answers, feedback) is kept in their own tables but no longer shown,
// and adding the "same" lesson again makes a NEW id with no history. So a
// removal, a type change, or a required/optional flip on a LIVE program must
// be a conscious step, with the number of people affected shown.

import { pluralUk } from "./plural.ts";
import type { AuthoredContent, AuthoredItem, AuthoredModule } from "../data/authorDashboard.ts";

export type EditImpact = {
  removedModules: { id: string; title: string; lessonIds: string[] }[];
  removedLessons: { id: string; title: string }[];
  requiredFlips: { id: string; title: string; nowRequired: boolean }[];
  typeChanges: { id: string; title: string; from: string; to: string }[];
};

const idOf = (x: { id?: string }) => x.id;

function itemsOf(m: AuthoredModule): AuthoredItem[] {
  return m.items ?? [];
}

export function analyzeEdit(before: AuthoredContent | null | undefined, after: AuthoredContent): EditImpact {
  const impact: EditImpact = { removedModules: [], removedLessons: [], requiredFlips: [], typeChanges: [] };
  if (!before) return impact;

  const afterModules = new Map((after.modules ?? []).filter(idOf).map((m) => [m.id!, m]));
  const afterItems = new Map(
    (after.modules ?? []).flatMap((m) => itemsOf(m).filter(idOf).map((it) => [it.id!, it] as const))
  );

  for (const m of before.modules ?? []) {
    if (!m.id) continue;
    if (!afterModules.has(m.id)) {
      impact.removedModules.push({
        id: m.id,
        title: m.title,
        lessonIds: itemsOf(m).map((it) => it.id).filter((x): x is string => Boolean(x)),
      });
    }
  }
  const removedModuleLessons = new Set(impact.removedModules.flatMap((m) => m.lessonIds));
  for (const m of before.modules ?? []) {
    for (const it of itemsOf(m)) {
      if (!it.id) continue;
      const next = afterItems.get(it.id);
      if (!next) {
        // A lesson inside a removed module is reported through the module.
        if (!removedModuleLessons.has(it.id)) impact.removedLessons.push({ id: it.id, title: it.title });
        continue;
      }
      if (next.isRequired !== it.isRequired) {
        impact.requiredFlips.push({ id: it.id, title: next.title, nowRequired: next.isRequired });
      }
      if (next.type !== it.type) {
        impact.typeChanges.push({ id: it.id, title: next.title, from: it.type, to: next.type });
      }
    }
  }
  return impact;
}

export function hasImpact(i: EditImpact): boolean {
  // A lesson's type is derived from what is attached, so a type change alone is not something the author decided.
  return i.removedModules.length + i.removedLessons.length + i.requiredFlips.length > 0;
}

// Every lesson id whose participants' history is at stake.
export function affectedLessonIds(i: EditImpact): string[] {
  return [
    ...i.removedModules.flatMap((m) => m.lessonIds),
    ...i.removedLessons.map((l) => l.id),
    ...i.requiredFlips.map((l) => l.id),
  ];
}

// How many participants have any recorded status on at least one of the given
// lessons. `progressMaps` = each participant's {lessonId: status} map.
export function countParticipantsAffected(progressMaps: Record<string, string>[], lessonIds: string[]): number {
  const ids = new Set(lessonIds);
  return progressMaps.filter((p) => Object.keys(p).some((k) => ids.has(k) && p[k] && p[k] !== "not_started")).length;
}

const plural = pluralUk;

// The text of the confirmation shown before saving a live program.
export function describeImpact(i: EditImpact, participants: number): string[] {
  const lines: string[] = [];
  for (const m of i.removedModules) lines.push(`Буде видалено модуль «${m.title}» разом з ${m.lessonIds.length} ${plural(m.lessonIds.length, "уроком", "уроками", "уроками")}.`);
  for (const l of i.removedLessons) lines.push(`Буде видалено урок «${l.title}».`);
  for (const l of i.requiredFlips) lines.push(`Урок «${l.title}» стане ${l.nowRequired ? "обов'язковим" : "необов'язковим"}: зміниться відсоток проходження в учасників.`);
  if (participants > 0) {
    lines.push(
      `Є прогрес у ${participants} ${plural(participants, "учасника", "учасників", "учасників")}. Видалений урок вони більше не побачать, і якщо додати такий самий знову, це буде новий урок без їхньої історії.`
    );
  }
  return lines;
}
