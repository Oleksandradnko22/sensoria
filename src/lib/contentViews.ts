// Counts that a material's page was opened (for the author's «Аналітика»): once per material per browser session,
// fire-and-forget, nothing personal is sent. The database decides the source (through Sensoria or the author's link)
// and ignores the author's own visits (supabase/author-analytics.sql).
import { supabase } from "./supabaseClient.ts";

const SEEN = "sensoria_viewed";

export function logContentView(key: string | null | undefined): void {
  if (!supabase || !key) return;
  try {
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem(SEEN) ?? "[]"));
    if (seen.has(key)) return;
    seen.add(key);
    sessionStorage.setItem(SEEN, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* no storage: still count once per page load */
  }
  let ref = false;
  try {
    ref = new URLSearchParams(window.location.search).has("ref") || !!localStorage.getItem("sensoria_ref");
  } catch {
    /* ignore */
  }
  void supabase.rpc("log_content_view", { p_key: key, p_ref: ref }).then(() => undefined, () => undefined);
}
