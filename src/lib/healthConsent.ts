// Consent to process emotional-state data (Угода учасника п. 8; docs/consent-legal-spec.md, розділ 4).
// Every save of the test, mood check-ins, notes, reflections and practice answers asks `requireHealthConsent()` first:
// without the consent nothing is written and the app shows the consent window (HealthConsentPrompt).
// The database enforces the same (supabase/health-consent.sql). Reading what was saved earlier is never blocked.
import { supabase } from "./supabaseClient.ts";
import { acceptLegal, withdrawConsent } from "./legalGate.ts";
import { PARTICIPANT_ITEMS } from "../data/consentTexts.ts";

export type HealthConsent = "unknown" | "yes" | "no";

let cache: { uid: string; value: HealthConsent } | null = null;
const listeners = new Set<(v: HealthConsent) => void>();

export const HEALTH_CONSENT_NEEDED = "sensoria:health-consent-needed";

export class HealthConsentError extends Error {
  constructor() {
    super("Щоб зберігати відповіді, дайте згоду на обробку даних про емоційний стан.");
    this.name = "HealthConsentError";
  }
}

function set(uid: string, value: HealthConsent) {
  cache = { uid, value };
  listeners.forEach((l) => l(value));
}

/** "unknown" = cannot tell (no session, or the database is not migrated yet): then nothing is blocked. */
export async function fetchHealthConsent(force = false): Promise<HealthConsent> {
  if (!supabase) return "unknown";
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return "unknown";
  if (!force && cache?.uid === uid) return cache.value;
  const { data: ok, error } = await supabase.rpc("has_current_consent", { p_uid: uid, p_document: "health_data" });
  const value: HealthConsent = error ? "unknown" : ok === true ? "yes" : "no";
  set(uid, value);
  return value;
}

export function onHealthConsent(l: (v: HealthConsent) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Call before writing emotional-state data. Throws (and opens the consent window) when there is no consent. */
export async function requireHealthConsent(): Promise<void> {
  if ((await fetchHealthConsent()) === "no") {
    window.dispatchEvent(new Event(HEALTH_CONSENT_NEEDED));
    throw new HealthConsentError();
  }
}

/** Runs `task` once the consent is given in this session (e.g. the test result taken before signing up). */
export function whenHealthConsented(task: () => Promise<void>): void {
  const off = onHealthConsent((v) => {
    if (v !== "yes") return;
    off();
    void task().catch(() => undefined);
  });
}

export const HEALTH_ITEM = PARTICIPANT_ITEMS.find((i) => i.key === "p4")!;

export async function grantHealthConsent(): Promise<void> {
  await acceptLegal("health_data", [HEALTH_ITEM], 0, []);
  await fetchHealthConsent(true);
}

/** Withdraws the consent; the server deletes the emotional-state data (purge_health_data). */
export async function revokeHealthConsent(): Promise<void> {
  await withdrawConsent("health_data");
  await fetchHealthConsent(true);
}

if (supabase) supabase.auth.onAuthStateChange(() => { cache = null; });
