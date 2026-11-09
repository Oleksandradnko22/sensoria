import { supabase } from "./supabaseClient.ts";
import { LEGAL } from "../data/legalOperator.ts";

// Author agreement acceptance: stored in public.legal_consents
// (supabase/consent-migration.sql) with the edition that was accepted.
// Without Supabase (local mock mode) there is nothing to check.
export async function hasAcceptedAuthorAgreement(): Promise<boolean> {
  if (!supabase) return true;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("legal_consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("document", "author_agreement")
    .eq("version", LEGAL.edition)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function acceptAuthorAgreement(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Потрібно увійти в акаунт.");
  const { error } = await supabase.from("legal_consents").upsert(
    [{ user_id: user.id, document: "author_agreement", version: LEGAL.edition }],
    { onConflict: "user_id,document,version", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export const AGREEMENT_REQUIRED_MESSAGE =
  "Щоб публікувати матеріали, прийміть Договір з автором.";
