// «Про мене» story (author-story-migration.sql): one jsonb column on
// author_details. A missing column just means "no story yet".
import { supabase } from "./supabaseClient.ts";
import { uploadContentFile } from "./storage.ts";
import { EMPTY_STORY, normalizeStory, storyForSave, validateAudioFile, validatePortraitFile, type AuthorStory } from "../utils/authorStory.ts";

export async function fetchAuthorStory(authorId: string): Promise<AuthorStory> {
  if (!supabase) return { ...EMPTY_STORY };
  const { data, error } = await supabase.from("author_details").select("story").eq("profile_id", authorId).maybeSingle();
  if (error || !data) return { ...EMPTY_STORY };
  return normalizeStory((data as { story?: unknown }).story);
}

export async function saveAuthorStory(authorId: string, story: AuthorStory): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_details").upsert({ profile_id: authorId, story: storyForSave(story) });
  if (!error) return;
  if (/story|column|schema cache/i.test(error.message ?? "")) {
    throw new Error("Щоб зберегти, потрібно оновити базу даних (файл author-story-migration.sql).");
  }
  throw error;
}

// Uploads reuse the shared `content-files` bucket (author-only writes under
// {author_id}/…). Re-uploading overwrites, so no orphans accumulate.
export async function uploadStoryAudio(authorId: string, file: File): Promise<string> {
  const err = validateAudioFile(file);
  if (err) throw new Error(err);
  return uploadContentFile(authorId, file, "about/intro-audio");
}

export async function uploadStoryPortrait(authorId: string, file: File): Promise<string> {
  const err = validatePortraitFile(file);
  if (err) throw new Error(err);
  return uploadContentFile(authorId, file, "about/portrait");
}

// Extra personal photos: stable slot paths so re-uploading overwrites.
export async function uploadStoryPhoto(authorId: string, file: File, slot: number): Promise<string> {
  const err = validatePortraitFile(file);
  if (err) throw new Error(err);
  return uploadContentFile(authorId, file, `about/photo-${slot}-${Date.now().toString(36)}`);
}
