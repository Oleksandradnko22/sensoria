// Has this author left the platform? (profiles.left_platform_at, set when an
// author's account is closed — see supabase/author-exit-migration.sql.)
// Buyers keep their access to purchased materials; only the chat is closed.
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.ts";

const cache = new Map<string, boolean>();

export async function fetchAuthorLeft(authorId: string): Promise<boolean> {
  const hit = cache.get(authorId);
  if (hit !== undefined) return hit;
  if (!supabase) return false;
  const { data, error } = await supabase.from("profiles").select("left_platform_at").eq("id", authorId).maybeSingle();
  // A failed read (e.g. migration not applied yet) is treated as "still here".
  const left = !error && !!data?.left_platform_at;
  cache.set(authorId, left);
  return left;
}

export function useAuthorLeft(authorId: string | null | undefined): boolean {
  const [left, setLeft] = useState(() => (authorId ? cache.get(authorId) ?? false : false));
  useEffect(() => {
    let cancelled = false;
    if (!authorId) return;
    fetchAuthorLeft(authorId).then((v) => !cancelled && setLeft(v));
    return () => {
      cancelled = true;
    };
  }, [authorId]);
  return !!authorId && left;
}

export const AUTHOR_LEFT_NOTICE =
  "Автор завершив співпрацю з платформою, тому нові повідомлення йому недоступні. Придбані матеріали залишаються у вашому доступі.";
