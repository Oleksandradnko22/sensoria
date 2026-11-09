// "Запросити повернення коштів" — a participant asking Sensoria to
// refund a paid purchase, only offered within the 14-day window
// (see utils/refundWindow.ts) in ParticipantBilling.tsx. Filing is
// insert-only from here; the team reviews and marks requests
// "reviewed" through the admin panel (src/lib/admin.ts) — the actual
// money movement always happens manually outside the app, this table
// only tracks the request itself.

import { supabase } from "./supabaseClient.ts";
import type { ContentKind } from "../data/participantDashboard.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — запит на повернення не можна надіслати.");
  }
  return supabase;
}

export async function submitRefundRequest(params: {
  participantId: string;
  contentTitle: string;
  contentKind: ContentKind;
  amount: number;
  purchasedAt: string;
  fullName: string;
  email: string;
  phone: string;
  reason: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("refund_requests").insert({
    participant_id: params.participantId,
    content_title: params.contentTitle,
    content_kind: params.contentKind,
    amount: params.amount,
    purchased_at: params.purchasedAt,
    full_name: params.fullName.trim(),
    email: params.email.trim(),
    phone: params.phone.trim(),
    reason: params.reason.trim(),
  });
  if (error) throw error;
}
