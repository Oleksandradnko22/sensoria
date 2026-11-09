// Author Cover System — pure logic (no UI, no supabase).
//
// A profile cover is NOT a free colour picker. It is one of a small set of
// art-directed compositions:
//
//   type    (how it is drawn)  abstract · atmospheric · editorial · personal
//   family  (visual style)     calm · grounded · focus · warm · energy
//   comp    (composition 1–4)  stored as the variant id "calm-02"
//
// Nothing stores a hex colour. If the author chose nothing, the cover is
// derived from their topics (family) and a stable seed (composition), so two
// authors who both work with stress still get different covers.

export type CoverType = "abstract" | "atmospheric" | "editorial" | "personal";
export type CoverFamily = "calm" | "grounded" | "focus" | "warm" | "energy";

export const COVER_TYPES: CoverType[] = ["abstract", "atmospheric", "editorial", "personal"];
export const COVER_FAMILIES: CoverFamily[] = ["calm", "grounded", "focus", "warm", "energy"];
export const COVER_COMPOSITIONS = [1, 2, 3, 4] as const;

export const COVER_TYPE_LABEL: Record<CoverType, string> = {
  abstract: "Абстрактна",
  atmospheric: "Атмосферна",
  editorial: "Редакційна",
  personal: "Власне фото",
};

export const COVER_TYPE_HINT: Record<CoverType, string> = {
  abstract: "М’які форми, лінії й градієнти",
  atmospheric: "Світло, туман, вода, простір",
  editorial: "Мінімалістична графіка, великі форми",
  personal: "Ваше власне зображення",
};

export const COVER_FAMILY_LABEL: Record<CoverFamily, string> = {
  calm: "Спокій",
  grounded: "Опора",
  focus: "Фокус",
  warm: "Тепло",
  energy: "Енергія",
};

export const COVER_FAMILY_HINT: Record<CoverFamily, string> = {
  calm: "лаванда · блакить · м’яке світло",
  grounded: "беж · пісок · приглушена зелень",
  focus: "синій · фіолетовий · глибший контраст",
  warm: "персик · крем · м’який корал",
  energy: "яскравіший синій · фіолетовий · легкий електрик",
};

export type CoverPalette = {
  // soft background wash (3 stops)
  bg: [string, string, string];
  // shape tones
  a: string;
  b: string;
  c: string;
  // line / ring colour (light, for atmospheric & abstract)
  ink: string;
  // darker accent for editorial lines and rings
  deep: string;
};

export const COVER_PALETTES: Record<CoverFamily, CoverPalette> = {
  calm: { bg: ["#ecebfb", "#e3e5fa", "#efe8fa"], a: "#c9cdfa", b: "#d8c9f7", c: "#c3d3f7", ink: "#ffffff", deep: "#8f8ad8" },
  grounded: { bg: ["#f5f0e7", "#ede6d8", "#eaede0"], a: "#e3d5bb", b: "#d3d9bd", c: "#ddcdb4", ink: "#ffffff", deep: "#a39a7a" },
  focus: { bg: ["#e0e4fb", "#d1d4f6", "#dbd2f4"], a: "#9fa8ee", b: "#a58fe6", c: "#7f93e6", ink: "#f4f2ff", deep: "#5b63c9" },
  warm: { bg: ["#fcf1e7", "#fbe7de", "#fdefe9"], a: "#f7cfb6", b: "#f6b9a6", c: "#fbe0c0", ink: "#ffffff", deep: "#d9967f" },
  energy: { bg: ["#dde7ff", "#e2dcff", "#d8edff"], a: "#8db4ff", b: "#a58aff", c: "#7fcdff", ink: "#ffffff", deep: "#5a7be8" },
};

export type CoverVariant = `${CoverFamily}-0${1 | 2 | 3 | 4}`;

export function variantId(family: CoverFamily, comp: number): CoverVariant {
  return `${family}-0${comp}` as CoverVariant;
}

export function parseVariant(v: string | null | undefined): { family: CoverFamily; comp: number } | null {
  const m = (v ?? "").match(/^(calm|grounded|focus|warm|energy)-0([1-4])$/);
  return m ? { family: m[1] as CoverFamily, comp: Number(m[2]) } : null;
}

export function isCoverType(t: unknown): t is CoverType {
  return typeof t === "string" && (COVER_TYPES as string[]).includes(t);
}

// topic key -> visual family (keys from data/categoryLabels.ts)
const TOPIC_FAMILY: Record<string, CoverFamily> = {
  stress: "calm",
  awareness: "calm",
  emotionalBalance: "calm",
  anxiety: "focus",
  innerPressure: "focus",
  burnout: "grounded",
  recovery: "grounded",
  healthyBalance: "grounded",
  selfEsteem: "warm",
  relationships: "warm",
  motivation: "energy",
};

// Most common family among the topics; ties go to the earliest topic.
export function familyFromTopics(topics: string[] | null | undefined): CoverFamily {
  const votes = new Map<CoverFamily, number>();
  const order: CoverFamily[] = [];
  for (const t of topics ?? []) {
    const f = TOPIC_FAMILY[t];
    if (!f) continue;
    if (!votes.has(f)) order.push(f);
    votes.set(f, (votes.get(f) ?? 0) + 1);
  }
  if (order.length === 0) return "calm";
  return order.reduce((best, f) => ((votes.get(f) ?? 0) > (votes.get(best) ?? 0) ? f : best), order[0]);
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export type CoverInput = {
  coverType?: string | null;
  coverVariant?: string | null;
  coverImageUrl?: string | null;
  topics?: string[] | null;
  // stable per author (profile id) so auto covers differ between authors
  seed: string;
};

export type CoverSpec = {
  type: CoverType;
  family: CoverFamily;
  comp: number;
  imageUrl: string | null;
  // true when nothing valid was chosen and everything was derived
  auto: boolean;
};

export function resolveCover(input: CoverInput): CoverSpec {
  const picked = parseVariant(input.coverVariant);
  const type = isCoverType(input.coverType) ? input.coverType : null;
  const image = (input.coverImageUrl ?? "").trim() || null;

  const family = picked?.family ?? familyFromTopics(input.topics);
  const comp = picked?.comp ?? (hashSeed(`${input.seed}|${family}`) % 4) + 1;

  // "personal" without an image falls back to an abstract cover — never a blank banner.
  if (type === "personal" && image) return { type, family, comp, imageUrl: image, auto: false };
  if (type && type !== "personal") return { type, family, comp, imageUrl: null, auto: !picked };
  return { type: "abstract", family, comp, imageUrl: null, auto: !picked && !type };
}

// What the editor saves. null columns = "automatic".
export function coverFields(spec: {
  type: CoverType | null;
  family: CoverFamily | null;
  comp: number | null;
  imageUrl: string | null;
}): { cover_type: string | null; cover_variant: string | null; cover_image_url: string | null } {
  if (!spec.type) return { cover_type: null, cover_variant: null, cover_image_url: null };
  const variant = spec.family && spec.comp ? variantId(spec.family, spec.comp) : null;
  return {
    cover_type: spec.type,
    cover_variant: variant,
    cover_image_url: spec.type === "personal" ? spec.imageUrl : null,
  };
}
