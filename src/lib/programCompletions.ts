// Real persistence for the "Підсумок програми" report's frozen stats
// (see supabase/schema.sql's content_program_completions for the full
// reasoning). One row per (program, person), written exactly once — the
// FIRST time a program reaches 100% — and never updated again: a person
// who later reopens an already-completed program and re-answers a
// practice, writes another reflection, or redoes a lesson must still see
// the exact same report every time, per Sasha's explicit call. There is
// deliberately no updateProgramCompletion export here — the table has
// no update policy either (see schema.sql), so this is enforced at both
// layers, not just by client discipline. That's also why this snapshot
// carries its own copies of things that could otherwise drift later —
// reflection text (not just a count) and the module/item list with each
// item's frozen status — rather than pointing back at live tables that
// keep growing or that an author could still edit after the fact.

import { supabase } from "./supabaseClient.ts";

export type ProgramCompletionModuleSnapshot = {
  title: string;
  items: { title: string; status: string; isRequired: boolean }[];
};

export type ProgramCompletionSnapshot = {
  id: string;
  programId: string;
  programTitle: string | null;
  completedAt: string;
  modulesDone: number;
  modulesTotal: number;
  itemsDone: number;
  itemsTotal: number;
  practicesCount: number;
  reflectionsCount: number;
  investedMinutes: number;
  // null means no mood check-in pair existed yet at the moment of
  // completion — the report omits the "стан" line entirely rather than
  // showing a meaningless 0 -> 0.
  moodBeforeAvg: number | null;
  moodAfterAvg: number | null;
  // A few actual note excerpts (most recent first, short free text),
  // not just the count — what makes the report feel like a real
  // keepsake instead of a row of statistics. Capped small on write (see
  // recordProgramCompletion) since this is a frozen copy, not a live
  // view into "Ваші спостереження".
  reflectionExcerpts: string[];
  // The program's own module/item titles + each item's frozen progress
  // status — lets the report show a real "Зміст програми" checklist
  // that can't later disagree with itself if the author edits/reorders
  // lessons after someone has already completed the program.
  modulesSnapshot: ProgramCompletionModuleSnapshot[];
};

type CompletionRow = {
  id: string;
  program_id: string;
  program_title: string | null;
  completed_at: string;
  modules_done: number;
  modules_total: number;
  items_done: number;
  items_total: number;
  practices_count: number;
  reflections_count: number;
  invested_minutes: number;
  mood_before_avg: number | null;
  mood_after_avg: number | null;
  reflection_excerpts: string[] | null;
  modules_snapshot: ProgramCompletionModuleSnapshot[] | null;
};

const SELECT_COLUMNS =
  "id, program_id, program_title, completed_at, modules_done, modules_total, items_done, items_total, practices_count, reflections_count, invested_minutes, mood_before_avg, mood_after_avg, reflection_excerpts, modules_snapshot";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: CompletionRow): ProgramCompletionSnapshot {
  return {
    id: row.id,
    programId: row.program_id,
    programTitle: row.program_title,
    completedAt: row.completed_at,
    modulesDone: row.modules_done,
    modulesTotal: row.modules_total,
    itemsDone: row.items_done,
    itemsTotal: row.items_total,
    practicesCount: row.practices_count,
    reflectionsCount: row.reflections_count,
    investedMinutes: row.invested_minutes,
    moodBeforeAvg: row.mood_before_avg,
    moodAfterAvg: row.mood_after_avg,
    reflectionExcerpts: row.reflection_excerpts ?? [],
    modulesSnapshot: row.modules_snapshot ?? [],
  };
}

// Null means "not completed yet" (or not recorded yet this session) —
// callers fall back to live-computed numbers for that brief window,
// see ProgramExperience.tsx.
export async function fetchProgramCompletion(
  programId: string,
  userId: string
): Promise<ProgramCompletionSnapshot | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_program_completions")
    .select(SELECT_COLUMNS)
    .eq("program_id", programId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as CompletionRow);
}

// Freezes today's real numbers — call this exactly once, right when
// summary.isCompleted first flips true. Safe to call more than once in
// practice (e.g. a second tab finishing the same last item at the same
// time): the table's unique (program_id, user_id) constraint rejects
// the second insert, and this just fetches back the snapshot the first
// call already wrote instead of erroring or overwriting it.
export async function recordProgramCompletion(params: {
  programId: string;
  programTitle?: string;
  userId: string;
  modulesDone: number;
  modulesTotal: number;
  itemsDone: number;
  itemsTotal: number;
  practicesCount: number;
  reflectionsCount: number;
  investedMinutes: number;
  moodBeforeAvg?: number | null;
  moodAfterAvg?: number | null;
  reflectionExcerpts: string[];
  modulesSnapshot: ProgramCompletionModuleSnapshot[];
}): Promise<ProgramCompletionSnapshot> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_program_completions")
    .insert({
      program_id: params.programId,
      program_title: params.programTitle ?? null,
      user_id: params.userId,
      modules_done: params.modulesDone,
      modules_total: params.modulesTotal,
      items_done: params.itemsDone,
      items_total: params.itemsTotal,
      practices_count: params.practicesCount,
      reflections_count: params.reflectionsCount,
      invested_minutes: params.investedMinutes,
      mood_before_avg: params.moodBeforeAvg ?? null,
      mood_after_avg: params.moodAfterAvg ?? null,
      reflection_excerpts: params.reflectionExcerpts,
      modules_snapshot: params.modulesSnapshot,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (!error && data) return fromRow(data as CompletionRow);

  const existing = await fetchProgramCompletion(params.programId, params.userId);
  if (existing) return existing;
  throw error ?? new Error("Не вдалося зберегти підсумок програми.");
}
