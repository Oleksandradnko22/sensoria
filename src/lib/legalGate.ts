import { supabase } from "./supabaseClient.ts";
import type { ConsentItem } from "../data/consentTexts.ts";

// Release B (docs/consent-legal-spec.md, 1–2): what the signed-in user must accept, and recording it on the server.
export type MissingConsent = { document: string; version: string | null; changesSummary: string | null; isUpdate: boolean };

/** null = cannot tell (not migrated yet / offline): the app does not block on that. */
export async function fetchMissingConsents(): Promise<MissingConsent[] | null> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("missing_consents");
  if (error) return null;
  return ((data ?? []) as { document: string; version: string | null; changes_summary: string | null; is_update: boolean }[]).map((r) => ({
    document: r.document,
    version: r.version,
    changesSummary: r.changes_summary,
    isUpdate: !!r.is_update,
  }));
}

const ERRORS: Record<string, string> = {
  stale_version: "Умови оновилися. Перегляньте нову редакцію.",
  otp_required: "Підтвердіть згоду кодом з листа.",
  missing_required: "Відмітьте всі обов’язкові пункти.",
};

export async function acceptLegal(kind: "participant" | "author" | "health_data" | "marketing_email", items: ConsentItem[], viewedMs: number, openedDocs: string[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("accept_legal", {
    p_kind: kind,
    p_items: items.map((i) => ({ key: i.key, text: i.text })),
    p_viewed_ms: Math.round(viewedMs),
    p_opened_docs: openedDocs,
  });
  if (error) {
    const code = Object.keys(ERRORS).find((k) => error.message.includes(k));
    throw new Error(code ? ERRORS[code] : "Не вдалося зберегти згоду. Спробуйте ще раз.");
  }
}

async function otpCall(body: Record<string, unknown>): Promise<{ to?: string }> {
  if (!supabase) return {};
  const { data, error } = await supabase.functions.invoke("legal-otp", { body });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const b = await ctx.clone().json().catch(() => null);
      if (typeof b?.message === "string") throw new Error(b.message);
    }
    throw new Error("Не вдалося зв’язатися із сервером. Спробуйте ще раз.");
  }
  return data ?? {};
}

export const sendLegalOtp = (purpose: "author_agreement" | "author_paid_sales" = "author_agreement") => otpCall({ action: "send", purpose });
export const verifyLegalOtp = (code: string, purpose: "author_agreement" | "author_paid_sales" = "author_agreement") =>
  otpCall({ action: "verify", purpose, code }).then(() => undefined);

/** Ask the app to re-check consents (e.g. after the server answered consent_required). */
export const requestConsentCheck = () => window.dispatchEvent(new Event("sensoria:consent-check"));
