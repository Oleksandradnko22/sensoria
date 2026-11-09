// Browser side of referral tracking. The remembered author id is only a hint:
// the server verifies and stores the attribution (see claim_referral in SQL),
// and the finance function decides the commission rate from that record.
import { supabase } from "./supabaseClient.ts";
import { parseRefParam, readStoredReferral, serializeReferral } from "../utils/referral.ts";

const KEY = "sensoria_ref";

/** Call once on boot: remember `?ref=` (last click wins) and clean it out of the address bar. */
export function captureReferralFromUrl(): void {
  try {
    const authorId = parseRefParam(window.location.search);
    if (!authorId) return;
    localStorage.setItem(KEY, serializeReferral(authorId, Date.now()));
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    // storage blocked → no attribution, the sale simply uses the catalog rate
  }
}

/** After a participant signs in: hand the remembered author to the server. Never throws. */
export async function claimStoredReferral(): Promise<void> {
  try {
    if (!supabase) return;
    const ref = readStoredReferral(localStorage.getItem(KEY), Date.now());
    if (!ref) {
      localStorage.removeItem(KEY);
      return;
    }
    const { error } = await supabase.rpc("claim_referral", { p_author: ref.authorId });
    // keep the hint on a network error so the next sign-in can retry; drop it once the server has answered
    if (!error) localStorage.removeItem(KEY);
  } catch {
    // ignore: attribution is best-effort
  }
}
