import { supabase } from "./supabaseClient.ts";
import { requestConsentCheck } from "./legalGate.ts";

// Author agreement: accepted on the consent screen (ConsentGate, release B) with a code from the email;
// the database checks it again when a material is published. Without Supabase (local mock) nothing to check.
export async function hasAcceptedAuthorAgreement(): Promise<boolean> {
  if (!supabase) return true;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("has_current_consent", { p_uid: user.id, p_document: "author_agreement" });
  if (error) throw error;
  return data === true;
}

/** The editor's old dialog now hands over to the consent screen, which signs the offer with a code. */
export async function acceptAuthorAgreement(): Promise<void> {
  requestConsentCheck();
  throw new Error(AGREEMENT_REQUIRED_MESSAGE);
}

export const AGREEMENT_REQUIRED_MESSAGE =
  "Щоб публікувати матеріали, прийміть Договір з автором.";
