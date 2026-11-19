// Can this author sell paid materials? (supabase/paid-readiness.sql: the same rule guards content.price in the
// database). Live: the FOP connected to monobank's split, the author's own cash register, the A6 consent.
// Test mode: only the consent — test payments go to monobank's test receiver and Sensoria's test register.
import { supabase } from "./supabaseClient.ts";

export type PaidReadiness = { live: boolean; mono: boolean; prro: boolean; consent: boolean; ready: boolean };

export const paidReady = (r: Omit<PaidReadiness, "ready">): boolean => r.consent && (!r.live || (r.mono && r.prro));

/** null while unknown (no Supabase, not migrated yet, a network error): the database still guards the price. */
export async function fetchPaidReadiness(): Promise<PaidReadiness | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_paid_readiness");
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const r = { live: d.live === true, mono: d.mono === true, prro: d.prro === true, consent: d.consent === true };
  return { ...r, ready: paidReady(r) };
}

/** The database's refusal (content_paid_price_guard) as a sentence for the author. */
export const PAID_NOT_READY_TEXT =
  "Щоб зробити матеріал платним, спершу підключіть у розділі «Фінанси» приймання оплат (ФОП), касу для чеків і прийміть умови платних продажів.";
export const isPaidNotReadyError = (e: unknown): boolean => /paid_not_ready/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
