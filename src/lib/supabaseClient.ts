import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite only exposes env vars prefixed with VITE_ to the client bundle —
// set these in .env.local (see .env.example), never commit real values.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Until a real project is connected (see .env.example), the rest of the
// app should keep working against the existing mock data in src/data/*
// rather than crash — components that need the backend should check
// isSupabaseConfigured before calling into this client.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

// A throwaway client that shares nothing with the app's session (no storage,
// no refresh, no URL detection). Used to check a password without replacing
// the real session — see auth.ts's changePassword().
export function createIsolatedClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(url!, anonKey!, {
    // own storageKey: auth clients with the same key talk to each other (broadcast
    // sign-in/sign-out events), which could disturb the app's real session.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `sensoria-isolated-${Math.random().toString(36).slice(2)}`,
    },
  });
}

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
      "running against local mock data only. See .env.example."
  );
}
