// Pure rules for what the home page may claim about the platform.
// Nothing here is invented: testimonials are real published reviews, and a
// number is shown only when it is real AND big enough to be meaningful.

export type ReviewInput = {
  id: string;
  rating: number;
  text: string;
  participantId: string;
  name: string;
  createdAt: string;
};

export type Testimonial = { id: string; text: string; name: string };

export const TESTIMONIAL_MIN_RATING = 4;
export const TESTIMONIAL_MIN_CHARS = 40;
export const TESTIMONIAL_MAX_CHARS = 220;
export const TESTIMONIAL_MAX_COUNT = 6;

/** First name only — the full name of a reviewer is not shown on the landing. */
export function firstName(name: string): string {
  const t = name.trim().split(/\s+/)[0] ?? "";
  return t || "Учасник";
}

/**
 * Picks reviews worth showing: good rating, a real sentence (not "ok"),
 * short enough for the card, one per person, newest first. Reviews that are
 * too long are skipped rather than cut mid-thought.
 */
export function pickTestimonials(rows: readonly ReviewInput[]): Testimonial[] {
  const seen = new Set<string>();
  const out: Testimonial[] = [];
  const sorted = [...rows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const r of sorted) {
    const text = r.text.trim().replace(/\s+/g, " ");
    if (r.rating < TESTIMONIAL_MIN_RATING) continue;
    if (text.length < TESTIMONIAL_MIN_CHARS || text.length > TESTIMONIAL_MAX_CHARS) continue;
    if (seen.has(r.participantId)) continue;
    seen.add(r.participantId);
    out.push({ id: r.id, text, name: firstName(r.name) });
    if (out.length >= TESTIMONIAL_MAX_COUNT) break;
  }
  return out;
}

export type RawStats = {
  participants: number | null;
  materials: number | null; // published programs + guides + meditations
  ratingAverage: number | null;
  ratingCount: number;
};

export type Stat = { key: "participants" | "materials" | "rating"; value: string; label: string };

export const MIN_PARTICIPANTS = 50;
export const MIN_MATERIALS = 5;
export const MIN_RATINGS = 10;
/** The stats row is shown only if at least this many stats qualify. */
export const MIN_STATS_SHOWN = 2;

function formatInt(n: number): string {
  return new Intl.NumberFormat("uk-UA").format(n);
}

/** Rounds down to a plain claim ("1 200", not "1 200+"). Counts are exact. */
export function buildStats(raw: RawStats): Stat[] {
  const out: Stat[] = [];
  if (raw.participants != null && raw.participants >= MIN_PARTICIPANTS) {
    out.push({ key: "participants", value: formatInt(raw.participants), label: "учасників" });
  }
  if (raw.materials != null && raw.materials >= MIN_MATERIALS) {
    out.push({ key: "materials", value: formatInt(raw.materials), label: "матеріалів" });
  }
  if (raw.ratingAverage != null && raw.ratingCount >= MIN_RATINGS) {
    out.push({ key: "rating", value: raw.ratingAverage.toFixed(1).replace(".", ","), label: "середня оцінка" });
  }
  return out.length >= MIN_STATS_SHOWN ? out : [];
}
