// Real persistence for an author's payout requisites (bank name, IBAN,
// ЄДРПОУ/РНОКПП). Revenue/pending-balance/transactions on the same
// screen stay mock — those are genuinely blocked on real purchases
// existing — but requisites collection has no such dependency, so
// there's no reason to leave it as a dead "Зберегти реквізити" button.

import { supabase } from "./supabaseClient.ts";

export type PayoutSettings = {
  isRegisteredEntity: boolean;
  bankName: string;
  iban: string;
  edrpou: string;
};

const EMPTY: PayoutSettings = {
  isRegisteredEntity: false,
  bankName: "",
  iban: "",
  edrpou: "",
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — реквізити не можна зберегти.");
  }
  return supabase;
}

export async function fetchPayoutSettings(profileId: string): Promise<PayoutSettings> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("payout_settings")
    .select("is_registered_entity, bank_name, iban, edrpou")
    .eq("profile_id", profileId)
    .single();
  if (error || !data) return EMPTY;

  return {
    isRegisteredEntity: data.is_registered_entity,
    bankName: data.bank_name ?? "",
    iban: data.iban ?? "",
    edrpou: data.edrpou ?? "",
  };
}

export async function updatePayoutSettings(
  profileId: string,
  fields: PayoutSettings
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("payout_settings").upsert({
    profile_id: profileId,
    is_registered_entity: fields.isRegisteredEntity,
    bank_name: fields.bankName,
    iban: fields.iban,
    edrpou: fields.edrpou,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
