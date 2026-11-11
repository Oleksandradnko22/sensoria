// A person's own private profile fields (email, ban, notification settings…). Other people's rows only expose the
// public card (supabase/privacy-profiles-reflections.sql), so these are read through my_private_profile().
// Until that file is applied, the old direct read is used, so the site works before and after the migration.
import { supabase } from "./supabaseClient.ts";

export type PrivateProfile = {
  email: string;
  is_banned: boolean;
  deletion_requested_at: string | null;
  notification_prefs: Record<string, unknown> | null;
  chat_banned_until: string | null;
  chat_ban_permanent: boolean;
  admin_role: string | null;
};

export async function fetchMyPrivateProfile(userId: string): Promise<PrivateProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_private_profile");
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return (row as PrivateProfile) ?? null;
  }
  const { data: legacy } = await supabase
    .from("profiles")
    .select("email, is_banned, deletion_requested_at, notification_prefs, chat_banned_until, chat_ban_permanent")
    .eq("id", userId)
    .maybeSingle();
  return legacy ? ({ admin_role: null, ...legacy } as PrivateProfile) : null;
}
