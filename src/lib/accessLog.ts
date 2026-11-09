// Journal of the buyer's actions (chargeback evidence): the moment a buyer
// opens or downloads paid content, the server stores the exact time, the
// user id and the IP (read from the request by the Edge Function, never sent
// by the client). See supabase/functions/log-content-access and
// payments-migration.sql. Free/unowned content is ignored by the server.
//
// Logging never blocks the reader: a failure only goes to the console.

import { supabase } from "./supabaseClient.ts";

export type AccessAction = "open" | "download";

const recentOpens = new Map<string, number>();
const OPEN_DEDUPE_MS = 10 * 60 * 1000; // one "open" per content per 10 minutes is enough

export function logContentAccess(contentId: string, action: AccessAction): void {
  if (!supabase || !contentId) return;
  if (action === "open") {
    const last = recentOpens.get(contentId) ?? 0;
    if (Date.now() - last < OPEN_DEDUPE_MS) return;
    recentOpens.set(contentId, Date.now());
  }
  supabase.functions
    .invoke("log-content-access", { body: { contentId, action } })
    .then(({ error }) => {
      if (error) console.warn("log-content-access:", error.message);
    })
    .catch((e) => console.warn("log-content-access:", e));
}
