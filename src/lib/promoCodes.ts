// The author's promo codes (supabase/promo-codes.sql; offer Б33). The author creates and switches off their own codes;
// the uses are counted only by the server after a confirmed payment, and the price is computed only there.
import { supabase } from "./supabaseClient.ts";

export type AuthorPromo = {
  id: string;
  code: string;
  discountPercent: number;
  contentId: string | null;
  maxUses: number;
  uses: number;
  active: boolean;
  expiresAt: string | null;
  reason: string;
};

export type PaidMaterial = { id: string; title: string; priceKop: number };

const ERR: [RegExp, string][] = [
  [/promo_limit/, "Одночасно можуть діяти не більше 5 промокодів. Вимкніть один зі старих."],
  [/duplicate key|author_promo_codes_author_id_code_key/, "Такий промокод у вас уже є."],
  [/discount_percent/, "Знижка — від 1 до 50%."],
  [/code_check|author_promo_codes_code_check/, "Код — 3–20 латинських літер або цифр."],
];
const friendly = (m: string) => ERR.find(([re]) => re.test(m))?.[1] ?? "Не вдалося зберегти промокод. Спробуйте ще раз.";

/** null = the table is not there yet (before promo-codes.sql). */
export async function fetchMyPromoCodes(): Promise<AuthorPromo[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("author_promo_codes")
    .select("id, code, discount_percent, content_id, max_uses, uses, active, expires_at, reason")
    .order("created_at", { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    discountPercent: Number(r.discount_percent),
    contentId: (r.content_id as string | null) ?? null,
    maxUses: Number(r.max_uses),
    uses: Number(r.uses),
    active: !!r.active,
    expiresAt: (r.expires_at as string | null) ?? null,
    reason: (r.reason as string) ?? "",
  }));
}

/** The author's published paid materials (uuid + price), for «which material» and the example. */
export async function fetchMyPaidMaterials(authorId: string): Promise<PaidMaterial[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("content").select("id, title, price").eq("author_id", authorId).eq("status", "published");
  return (data ?? [])
    .map((r) => ({ id: r.id as string, title: (r.title as string) ?? "", priceKop: Math.round(Number(r.price) * 100) }))
    .filter((m) => m.priceKop > 0);
}

export async function createPromoCode(authorId: string, v: { code: string; discountPercent: number; contentId: string | null; maxUses: number; expiresAt: string | null; reason: string }): Promise<void> {
  if (!supabase) throw new Error("Немає з’єднання.");
  const { error } = await supabase.from("author_promo_codes").insert({
    author_id: authorId,
    code: v.code.trim().toUpperCase(),
    discount_percent: v.discountPercent,
    content_id: v.contentId,
    max_uses: v.maxUses,
    expires_at: v.expiresAt,
    reason: v.reason,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function setPromoActive(id: string, active: boolean): Promise<void> {
  if (!supabase) throw new Error("Немає з’єднання.");
  const { error } = await supabase.from("author_promo_codes").update({ active }).eq("id", id);
  if (error) throw new Error(friendly(error.message));
}
