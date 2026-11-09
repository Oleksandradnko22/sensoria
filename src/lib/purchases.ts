// Real purchase history: rows of `purchases` (RLS: only the buyer's own),
// joined client-side with the content they point at. Payments are not
// connected yet, so today this is normally empty — and that is shown as
// the honest empty state, never as sample data. Throws on a failed read so
// the page can show an error instead of «Покупок поки немає».
import { supabase } from "./supabaseClient.ts";
import { purchaseStatus, type PurchaseKind, type PurchaseView } from "../utils/purchasesView.ts";

export async function fetchMyPurchases(participantId: string): Promise<PurchaseView[]> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { data: rows, error } = await supabase
    .from("purchases")
    .select("id, content_id, amount, status, purchased_at")
    .eq("participant_id", participantId)
    .order("purchased_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw error;
  if (!rows?.length) return [];

  const contentIds = Array.from(new Set(rows.map((r) => r.content_id as string)));
  const { data: contentRows, error: cErr } = await supabase
    .from("content")
    .select("id, title, kind, author_id")
    .in("id", contentIds);
  if (cErr) throw cErr;
  const byId = new Map((contentRows ?? []).map((c) => [c.id as string, c]));

  const authorIds = Array.from(new Set((contentRows ?? []).map((c) => c.author_id as string).filter(Boolean)));
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", authorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((authors ?? []).map((a) => [a.id, a.name]));

  return rows.map((r) => {
    const c = byId.get(r.content_id as string);
    const amount = Number(r.amount);
    return {
      id: r.id as string,
      contentId: r.content_id as string,
      kind: (c?.kind as PurchaseKind | undefined) ?? null,
      title: (c?.title as string | undefined) ?? null,
      author: c ? nameById.get(c.author_id as string) ?? null : null,
      amount: Number.isFinite(amount) ? amount : 0,
      date: r.purchased_at as string,
      status: purchaseStatus(r.status as string, amount),
    };
  });
}
