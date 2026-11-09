// Real data for the home hero: published reviews (as testimonials) and honest
// platform numbers. Everything here is publicly readable already (published
// content, reviews, profiles); nothing is invented, see utils/landingData.ts.
import { supabase } from "./supabaseClient.ts";
import { buildStats, pickTestimonials, type ReviewInput, type Stat, type Testimonial } from "../utils/landingData.ts";

export type LandingData = { testimonials: Testimonial[]; stats: Stat[] };

let cache: Promise<LandingData> | null = null;

async function load(): Promise<LandingData> {
  const empty: LandingData = { testimonials: [], stats: [] };
  if (!supabase) return empty;
  const c = supabase;
  try {
    const [published, participants, reviews] = await Promise.all([
      c.from("content").select("id", { count: "exact" }).eq("status", "published").limit(2000),
      c.from("profiles").select("id", { count: "exact", head: true }).eq("role", "participant"),
      c
        .from("reviews")
        .select("id, rating, text, created_at, participant_id, content_id")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    const publishedIds = new Set((published.data ?? []).map((r) => r.id as string));
    // Only reviews of content that is published right now.
    const liveReviews = (reviews.data ?? []).filter((r) => publishedIds.has(r.content_id as string));

    const candidateIds = Array.from(new Set(liveReviews.map((r) => r.participant_id as string)));
    const { data: people } = candidateIds.length
      ? await c.from("profiles").select("id, name").in("id", candidateIds)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((people ?? []).map((p) => [p.id, p.name]));

    const inputs: ReviewInput[] = liveReviews.map((r) => ({
      id: r.id as string,
      rating: r.rating as number,
      text: r.text as string,
      participantId: r.participant_id as string,
      name: nameById.get(r.participant_id as string) ?? "",
      createdAt: r.created_at as string,
    }));

    const ratingCount = liveReviews.length;
    const ratingAverage = ratingCount ? liveReviews.reduce((s, r) => s + (r.rating as number), 0) / ratingCount : null;

    return {
      testimonials: pickTestimonials(inputs),
      stats: buildStats({
        participants: participants.error ? null : participants.count ?? null,
        materials: published.error ? null : published.count ?? null,
        ratingAverage,
        ratingCount,
      }),
    };
  } catch {
    return empty;
  }
}

// DEV ONLY: `?landingDemo=1` fills the hero with obviously-fake sample data so
// the testimonial slides and the stats row can be checked without real
// reviews. Nothing is written anywhere; `import.meta.env.DEV` is false in
// production builds, so this branch is dropped from them.
function demoData(): LandingData {
  const now = Date.now();
  const rows: ReviewInput[] = [
    "Тестовий відгук номер один: зразок тексту для перевірки макета.",
    "Тестовий відгук номер два: ще один зразок для перевірки слайдів.",
    "Тестовий відгук номер три: довший зразок тексту, щоб побачити перенос рядків.",
  ].map((text, i) => ({
    id: `demo-${i}`,
    rating: 5,
    text,
    participantId: `demo-p${i}`,
    name: ["Тест Перший", "Тест Другий", "Тест Третій"][i],
    createdAt: new Date(now - i * 86400000).toISOString(),
  }));
  return {
    testimonials: pickTestimonials(rows),
    stats: buildStats({ participants: 120, materials: 14, ratingAverage: 4.8, ratingCount: 36 }),
  };
}

export function fetchLandingData(): Promise<LandingData> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("landingDemo")) {
    return Promise.resolve(demoData());
  }
  cache ??= load();
  return cache;
}
