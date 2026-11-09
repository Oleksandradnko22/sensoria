// Turns the database rows of a meditation / a guide into the shapes the app already uses (data/meditations.ts,
// data/guides.ts), and merges them into the lists. Pure: no network, so it is unit-tested.
import type { Meditation } from "../data/meditations.ts";
import type { Guide } from "../data/guides.ts";

// PostgREST returns a one-to-one embed as an object, older versions as a one-element array.
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type ContentRow = {
  id: string;
  kind: "meditation" | "guide";
  slug: string | null;
  title: string;
  description: string | null;
  price: number | string | null;
  tags: string[] | null;
  created_at: string;
  duration_minutes: number | null;
  author?: { name: string | null } | { name: string | null }[] | null;
  content_meditation_meta?: Record<string, unknown> | Record<string, unknown>[] | null;
  content_meditation_body?: Record<string, unknown> | Record<string, unknown>[] | null;
  content_guide_meta?: Record<string, unknown> | Record<string, unknown>[] | null;
  content_guide_body?: Record<string, unknown> | Record<string, unknown>[] | null;
};

export function meditationFromRow(row: ContentRow): Meditation | null {
  if (row.kind !== "meditation" || !row.slug) return null;
  const meta = one(row.content_meditation_meta);
  if (!meta) return null; // a material without its details is not shown
  const body = one(row.content_meditation_body);
  const minutes = row.duration_minutes ?? 0;
  const sounds = list(meta.background_sound_ids);
  return {
    id: row.slug,
    title: row.title,
    durationMinutes: minutes,
    duration: `${minutes} хв`,
    description: row.description ?? "",
    // not readable for someone without access (a paid material): empty, nothing can be played
    audioUrl: typeof body?.audio_url === "string" ? body.audio_url : "",
    format: (meta.format as Meditation["format"]) ?? "guided",
    backgroundSoundIds: sounds.length ? sounds : undefined,
    tags: row.tags ?? [],
    whenToUse: list(meta.when_to_use),
    offlineDownloadEnabled: meta.offline_download_enabled === true,
    hasEmbeddedMusic: meta.has_embedded_music === true,
    transcript: (body?.transcript as Meditation["transcript"]) ?? undefined,
  };
}

export function guideFromRow(row: ContentRow): Guide | null {
  if (row.kind !== "guide" || !row.slug) return null;
  const meta = one(row.content_guide_meta);
  if (!meta) return null;
  const body = one(row.content_guide_body);
  const blocks = Array.isArray(body?.blocks) ? (body?.blocks as Guide["guideContent"]) : undefined;
  const source = (meta.source as Guide["source"]) ?? "uploaded_pdf";
  const author = one(row.author)?.name ?? "";
  return {
    id: row.slug,
    title: row.title,
    author,
    type: source === "sensoria_structured" ? "Interactive guide" : "PDF",
    pages: Number(meta.pages) || 0,
    readMinutes: Number(meta.read_minutes) || 0,
    fileUrl: typeof body?.file_url === "string" ? body.file_url : "",
    price: String(row.price ?? 0),
    tag: typeof meta.tag === "string" ? meta.tag : undefined,
    publishedAt: row.created_at.slice(0, 10),
    category: typeof meta.category === "string" ? meta.category : "PDF-гайди",
    description: row.description ?? "",
    tags: row.tags ?? [],
    guideType: (meta.guide_type as Guide["guideType"]) ?? undefined,
    source,
    relevantIf: list(meta.relevant_if),
    outcomes: list(meta.outcomes),
    outline: (meta.outline as Guide["outline"]) ?? undefined,
    pdf: (meta.pdf_meta as Guide["pdf"]) ?? undefined,
    guideContent: blocks,
  };
}

// Puts the database items into the list IN PLACE (the list is an exported array other files already hold):
//  * an item whose id is already there is updated field by field; fields the database does not carry (legacy
//    content, the editorial author name) stay as they were;
//  * a new item is added at the end;
//  * items the database does not know stay (the code copy is the fallback).
// `keep` lists the fields never overwritten on an existing item. Returns true when anything changed.
export function mergeIntoList<T extends { id: string }>(target: T[], incoming: T[], keep: (keyof T)[] = []): boolean {
  let changed = false;
  for (const item of incoming) {
    const i = target.findIndex((t) => t.id === item.id);
    if (i === -1) {
      target.push(item);
      changed = true;
      continue;
    }
    const current = target[i];
    const next = { ...current } as T;
    for (const key of Object.keys(item) as (keyof T)[]) {
      if (keep.includes(key)) continue;
      const value = item[key];
      if (value === undefined) continue; // never blank out something the code copy has
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
        next[key] = value;
        changed = true;
      }
    }
    if (changed) target[i] = next;
  }
  return changed;
}
