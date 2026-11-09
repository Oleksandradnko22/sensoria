// Real persistence for "Перед тим як почнемо" / "Що змінилося?" — a
// lighter, module-level wellbeing pulse (see supabase/schema.sql's
// content_module_mood_checkins), distinct from lib/moodCheckins.ts's
// per-lesson 1..10 scale. Deliberately two different small vocabularies
// before/after, not the same three options twice: before asks for a
// plain state, after asks for a change — matching what's actually
// being asked. One row per (module, person), upserted in place, same
// shape as lib/moodCheckins.ts otherwise.

import { supabase } from "./supabaseClient.ts";

export type ModuleMoodBefore = "calm" | "neutral" | "hard";
export type ModuleMoodAfter = "easier" | "same" | "harder";

export type ModuleCheckIn = {
  beforeValue: ModuleMoodBefore | null;
  afterValue: ModuleMoodAfter | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchModuleCheckIn(moduleId: string, userId: string): Promise<ModuleCheckIn | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_module_mood_checkins")
    .select("before_value, after_value")
    .eq("module_id", moduleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { beforeValue: data.before_value, afterValue: data.after_value };
}

// Every module check-in this person has for one program — feeds the
// "Ваш шлях" dynamics badge (ProgramExperience.tsx builds one
// Map<moduleId, ModuleCheckIn> from this, same pattern as its
// bookmarksById/savedPracticesById).
export async function fetchModuleCheckInsForProgram(
  programId: string,
  userId: string
): Promise<Map<string, ModuleCheckIn>> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_module_mood_checkins")
    .select("module_id, before_value, after_value")
    .eq("program_id", programId)
    .eq("user_id", userId);
  if (error || !data) return new Map();
  return new Map(
    data.map((row) => [row.module_id as string, { beforeValue: row.before_value, afterValue: row.after_value }])
  );
}

export async function submitModuleMoodBefore(params: {
  moduleId: string;
  userId: string;
  value: ModuleMoodBefore;
  programId?: string;
  programTitle?: string;
  moduleTitle?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_module_mood_checkins").upsert(
    {
      module_id: params.moduleId,
      user_id: params.userId,
      before_value: params.value,
      program_id: params.programId ?? null,
      program_title: params.programTitle ?? null,
      module_title: params.moduleTitle ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "module_id,user_id" }
  );
  if (error) throw error;
}

// Separate from submitModuleMoodBefore for the same reason as
// lib/moodCheckins.ts's submitMoodAfter — impossible to accidentally
// clear before_value while only meaning to set after_value.
export async function submitModuleMoodAfter(params: {
  moduleId: string;
  userId: string;
  value: ModuleMoodAfter;
  programId?: string;
  programTitle?: string;
  moduleTitle?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_module_mood_checkins").upsert(
    {
      module_id: params.moduleId,
      user_id: params.userId,
      after_value: params.value,
      program_id: params.programId ?? null,
      program_title: params.programTitle ?? null,
      module_title: params.moduleTitle ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "module_id,user_id" }
  );
  if (error) throw error;
}
