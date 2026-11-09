import { parseCoverFocus } from "../utils/coverFocus";
// Real, published author content shown alongside the demo catalog
// (src/data/programs.ts) in the public "Каталог програм" — see
// App.tsx for how the two lists get merged. Only status='published'
// rows are fetched; RLS already enforces that (drafts/review/archived
// are only visible to their own author), this is a belt-and-suspenders
// filter, not the actual security boundary.
//
// Guides and meditations aren't wired up here yet — their catalog
// pages (GuidesCatalogPage/MeditationsCatalogPage) expect extra
// format-specific fields (pages count, PDF/checklist type, etc.) that
// the editor doesn't collect yet. Scoped to programs for now.

import { moduleCountLabel } from "../utils/moduleLabel.ts";
import { supabase } from "./supabaseClient.ts";
import type { Program } from "../data/programs.ts";
import { benefitsFromTags, stripBenefitTags } from "../utils/programBenefits.ts";
import type { ContentModule } from "../data/contentTypes.ts";

// App.tsx's Program type has authorId as optional (present only for
// real content) — this narrows it to required, since every row
// fetched here really does have a real author account behind it.
export type PublicProgram = Program & { authorId: string };

type AuthorJoin = { name: string } | { name: string }[] | null;

function authorName(join: AuthorJoin): string {
  if (!join) return "Sensoria";
  if (Array.isArray(join)) return join[0]?.name ?? "Sensoria";
  return join.name ?? "Sensoria";
}

// Shared row -> PublicProgram mapping between fetchPublishedPrograms
// (whole catalog) and fetchProgramById (one row, used by
// ProgramExperience.tsx for real programs) so the two never drift.
type ContentRow = {
  id: string;
  title: string;
  description: string | null;
  price: number | string;
  tags: string[] | null;
  author_id: string;
  cover_url: string | null;
  created_at?: string | null;
  author: AuthorJoin;
};

// Cover focal points (program-page-migration.sql); a missing column simply means "centred".
async function fetchCoverFocus(ids: string[]): Promise<Map<string, { x: number; y: number }>> {
  const out = new Map<string, { x: number; y: number }>();
  if (!supabase || ids.length === 0) return out;
  const { data, error } = await supabase.from("content").select("id, cover_focus").in("id", ids);
  if (error) return out;
  (data ?? []).forEach((r) => {
    const f = parseCoverFocus(r.cover_focus);
    if (f) out.set(r.id as string, f);
  });
  return out;
}

// The author's presentation video link (program-page-migration.sql); a missing column or row simply means "no video".
export async function fetchProgramIntroVideo(id: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("content").select("intro_video_url").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const v = (data as { intro_video_url?: string | null }).intro_video_url;
  return v?.trim() || null;
}

// Number of gift lessons per program (program-materials-migration.sql); a missing column means none.
async function fetchGiftCounts(programIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!supabase || programIds.length === 0) return out;
  const { data: mods, error } = await supabase.from("content_modules").select("id, content_id").in("content_id", programIds);
  if (error || !mods?.length) return out;
  const owner = new Map(mods.map((m) => [m.id as string, m.content_id as string]));
  const { data: items, error: e2 } = await supabase.from("content_items").select("module_id").in("module_id", [...owner.keys()]).not("material_id", "is", null);
  if (e2) return out;
  (items ?? []).forEach((it) => {
    const pid = owner.get(it.module_id as string);
    if (pid) out.set(pid, (out.get(pid) ?? 0) + 1);
  });
  return out;
}

function rowToPublicProgram(row: ContentRow, moduleCount: number, focus?: { x: number; y: number }, giftCount?: number): PublicProgram {
  return {
    coverFocus: focus,
    giftCount: giftCount || undefined,
    id: row.id,
    title: row.title,
    // Real content column, already populated by AuthorCourseEditor —
    // previously never selected here, so real authors' actual
    // descriptions never reached participants at all.
    description: row.description ?? "",
    author: authorName(row.author),
    authorId: row.author_id,
    price: String(row.price),
    duration: moduleCountLabel(moduleCount),
    // Author-written «Що ви отримаєте» (required on publish), kept in
    // reserved tags — see utils/programBenefits.ts. Older programs have
    // none; the page then simply has no benefits area.
    benefits: benefitsFromTags(row.tags),
    tags: stripBenefitTags(row.tags),
    coverUrl: row.cover_url ?? undefined,
    addedAt: row.created_at ?? undefined,
  };
}

export async function fetchPublishedPrograms(): Promise<PublicProgram[]> {
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from("content")
    .select("id, title, description, price, tags, author_id, cover_url, created_at, author:profiles(name)")
    .eq("kind", "program")
    .eq("status", "published");

  if (error || !rows) return [];

  const ids = rows.map((r) => r.id);
  const { data: moduleRows } = ids.length
    ? await supabase.from("content_modules").select("content_id").in("content_id", ids)
    : { data: [] as { content_id: string }[] };

  const moduleCounts = new Map<string, number>();
  (moduleRows ?? []).forEach((m) => {
    moduleCounts.set(m.content_id, (moduleCounts.get(m.content_id) ?? 0) + 1);
  });

  const [focus, gifts] = await Promise.all([fetchCoverFocus(ids), fetchGiftCounts(ids)]);
  return rows.map((row) =>
    rowToPublicProgram(row as ContentRow, moduleCounts.get(row.id) ?? 0, focus.get(row.id), gifts.get(row.id))
  );
}

// One published program by id — used by ProgramExperience.tsx (the
// Lesson Player) to resolve real authored programs, which it previously
// had no way to look up at all (it only ever searched the demo
// catalog). Returns null for demo ids too (they're never real content
// rows), which is exactly the "fall back to demo" signal the caller
// needs.
// Bulk metadata fetch for several real programs at once — used by
// "Моє навчання" (see lib/programParticipation.ts) to resolve real
// authored programs a participant has real progress on or has saved,
// without one fetchProgramById call per program (the exact N+1 the
// 2026-09-21 architecture audit flagged). Same two-query shape as
// fetchPublishedPrograms above (content, then a batched module count),
// just scoped to `ids` via `.in(...)` instead of the whole catalog.
export async function fetchProgramsByIds(ids: string[]): Promise<Record<string, PublicProgram>> {
  if (!supabase || ids.length === 0) return {};

  const { data: rows, error } = await supabase
    .from("content")
    .select("id, title, description, price, tags, author_id, cover_url, created_at, author:profiles(name)")
    .eq("kind", "program")
    .eq("status", "published")
    .in("id", ids);
  if (error || !rows) return {};

  const rowIds = rows.map((r) => r.id);
  const { data: moduleRows } = rowIds.length
    ? await supabase.from("content_modules").select("content_id").in("content_id", rowIds)
    : { data: [] as { content_id: string }[] };

  const moduleCounts = new Map<string, number>();
  (moduleRows ?? []).forEach((m) => {
    moduleCounts.set(m.content_id, (moduleCounts.get(m.content_id) ?? 0) + 1);
  });

  const focus = await fetchCoverFocus(rowIds);
  const result: Record<string, PublicProgram> = {};
  rows.forEach((row) => {
    result[row.id] = rowToPublicProgram(row as ContentRow, moduleCounts.get(row.id) ?? 0, focus.get(row.id));
  });
  return result;
}

export async function fetchProgramById(id: string): Promise<PublicProgram | null> {
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from("content")
    .select("id, title, description, price, tags, author_id, cover_url, created_at, author:profiles(name)")
    .eq("id", id)
    .eq("kind", "program")
    .eq("status", "published")
    .maybeSingle();
  if (error || !row) return null;

  const { data: moduleRows } = await supabase.from("content_modules").select("id").eq("content_id", id);
  const [focus, gifts] = await Promise.all([fetchCoverFocus([id]), fetchGiftCounts([id])]);
  return rowToPublicProgram(row as ContentRow, moduleRows?.length ?? 0, focus.get(id), gifts.get(id));
}

export type PublicProgramModule = {
  title: string;
  lessons: number;
  durationLabel: string | null;
  videoUrl: string | null;
  materialsUrl: string | null;
};

// Real content_modules rows for one authored/published program — used
// by programDetail/ProgramDetailPage.tsx's "Ваш шлях" section for real (non-demo)
// content. Unlike the demo catalog's programModules.ts, this schema
// only stores a lesson COUNT per module (content_modules.lessons is a
// plain int), never individual titled lesson rows — so real content
// can only ever show "N уроків", not named lessons, until the schema
// is extended.
export async function fetchProgramModules(contentId: string): Promise<PublicProgramModule[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("content_modules")
    .select("title, lessons, duration_label, video_url, materials_url")
    .eq("content_id", contentId)
    .order("order_index", { ascending: true });
  if (error || !data) return [];
  return data.map((m) => ({
    title: m.title,
    lessons: m.lessons ?? 0,
    durationLabel: m.duration_label ?? null,
    videoUrl: m.video_url ?? null,
    materialsUrl: m.materials_url ?? null,
  }));
}

// Real per-lesson (content_items) data for a published program — what
// actually drives the Lesson Player (ProgramExperience.tsx) for real
// authored content, as opposed to fetchProgramModules above (module-
// level counts only, used by ProgramDetailPage's lighter "Ваш шлях"
// preview). Returns null rather than [] when the program has modules
// but none of them have any authored lessons yet, so callers can tell
// "real program with no per-item experience built yet" apart from
// "real program with zero modules" — same null-means-"nothing to play
// here" convention lib/programProgress.ts already uses for demo
// programs.
const ITEM_SELECT_COLUMNS =
  "id, module_id, order_index, title, type, is_required, body, video_url, transcript, content_warning, audio_url, image_url, file_url, file_name, file_size_label, checklist, duration_minutes, practice";

type ContentItemRow = {
  id: string;
  module_id: string;
  order_index: number;
  title: string;
  type: ContentModule["items"][number]["type"];
  is_required: boolean;
  body: string | null;
  video_url: string | null;
  transcript: string | null;
  content_warning: string | null;
  audio_url: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_label: string | null;
  checklist: string[] | null;
  duration_minutes: number | null;
  practice: ContentModule["items"][number]["practice"] | null;
};

// Shared row -> ContentItem mapping between fetchProgramItems (one
// program) and fetchProgramItemsForIds (many programs at once) — kept
// as one function so the two can never drift on which columns get
// mapped to which fields.
function rowToContentItem(it: ContentItemRow): ContentModule["items"][number] {
  return {
    id: it.id,
    title: it.title,
    type: it.type,
    isRequired: it.is_required,
    body: it.body ?? undefined,
    videoUrl: it.video_url ?? undefined,
    transcript: it.transcript ?? undefined,
    contentWarning: it.content_warning ?? undefined,
    audioUrl: it.audio_url ?? undefined,
    imageUrl: it.image_url ?? undefined,
    fileUrl: it.file_url ?? undefined,
    fileName: it.file_name ?? undefined,
    fileSizeLabel: it.file_size_label ?? undefined,
    checklist: it.checklist ?? undefined,
    durationMinutes: it.duration_minutes ?? undefined,
    practice: it.practice ?? undefined,
  };
}

export async function fetchProgramItems(contentId: string): Promise<ContentModule[] | null> {
  if (!supabase) return null;

  const { data: moduleRows, error: moduleError } = await supabase
    .from("content_modules")
    .select("id, title, order_index")
    .eq("content_id", contentId)
    .order("order_index", { ascending: true });
  if (moduleError || !moduleRows || moduleRows.length === 0) return null;

  const moduleIds = moduleRows.map((m) => m.id);
  const { data: itemRows, error: itemError } = await supabase
    .from("content_items")
    .select(ITEM_SELECT_COLUMNS)
    .in("module_id", moduleIds)
    .order("order_index", { ascending: true });
  if (itemError) return null;

  // No authored lessons anywhere in this program yet — module rows
  // exist (from the editor's bare lessons-count fields), but nothing
  // for the Lesson Player to actually show item-by-item.
  if (!itemRows || itemRows.length === 0) return null;

  // Gift lessons (content_items.material_id): read separately so an older database keeps working. A buyer reads the
  // material's row through the has_material_access policy; if it cannot be read the lesson simply has no card.
  const giftByItem = new Map<string, NonNullable<ContentModule["items"][number]["material"]> & { materialId: string }>();
  const mat = await supabase.from("content_items").select("id, material_id").in("id", (itemRows as ContentItemRow[]).map((r) => r.id)).not("material_id", "is", null);
  if (!mat.error && mat.data && mat.data.length) {
    const ids = [...new Set(mat.data.map((r) => r.material_id as string))];
    const { data: mats } = await supabase.from("content").select("id, kind, slug, title, description").in("id", ids);
    const byId = new Map((mats ?? []).map((c) => [c.id as string, c]));
    mat.data.forEach((r) => {
      const c = byId.get(r.material_id as string);
      if (c && (c.kind === "meditation" || c.kind === "guide")) {
        giftByItem.set(r.id as string, { materialId: c.id as string, kind: c.kind, title: c.title as string, description: (c.description as string | null) ?? undefined, appId: ((c.slug as string | null) ?? (c.id as string)) });
      }
    });
  }

  const modules: ContentModule[] = moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    // content_modules has no description column — the module-level
    // "Ваш шлях" card in ProgramExperience just renders this blank for
    // real programs rather than fabricating one, same honesty rule as
    // the benefits note in fetchPublishedPrograms above.
    description: "",
    items: (itemRows as ContentItemRow[])
      .filter((it) => it.module_id === m.id)
      .map((it) => {
        const base = rowToContentItem(it);
        const gift = giftByItem.get(it.id);
        if (!gift) return base;
        const { materialId, ...material } = gift;
        return { ...base, materialId, material };
      }),
  }));

  return modules;
}

// Bulk per-item structure fetch for several real programs at once —
// exactly two queries (content_modules, then content_items) regardless
// of how many program ids are passed, grouped back into a per-program
// map in memory. This is what "Моє навчання" uses to derive real
// percent/state for real authored programs it has activity/saves on,
// instead of calling fetchProgramItems once per program (the N+1 the
// 2026-09-21 architecture audit identified as the main performance
// risk of this feature). A program id with modules but zero authored
// items — or no rows at all — is simply absent from the returned map,
// same "nothing to compute from yet" convention as fetchProgramItems'
// own `null` return.
export async function fetchProgramItemsForIds(contentIds: string[]): Promise<Record<string, ContentModule[]>> {
  if (!supabase || contentIds.length === 0) return {};

  const { data: moduleRows, error: moduleError } = await supabase
    .from("content_modules")
    .select("id, content_id, title, order_index")
    .in("content_id", contentIds)
    .order("order_index", { ascending: true });
  if (moduleError || !moduleRows || moduleRows.length === 0) return {};

  const moduleIds = moduleRows.map((m) => m.id);
  const { data: itemRows, error: itemError } = await supabase
    .from("content_items")
    .select(ITEM_SELECT_COLUMNS)
    .in("module_id", moduleIds)
    .order("order_index", { ascending: true });
  if (itemError) return {};

  const modulesByContentId = new Map<string, { id: string; content_id: string; title: string }[]>();
  moduleRows.forEach((m) => {
    const list = modulesByContentId.get(m.content_id) ?? [];
    list.push(m);
    modulesByContentId.set(m.content_id, list);
  });

  const result: Record<string, ContentModule[]> = {};
  modulesByContentId.forEach((modRows, contentId) => {
    const modules: ContentModule[] = modRows.map((m) => ({
      id: m.id,
      title: m.title,
      description: "",
      items: (itemRows as ContentItemRow[] | null ?? []).filter((it) => it.module_id === m.id).map(rowToContentItem),
    }));
    // Same "no authored lessons yet" convention as fetchProgramItems —
    // a program whose modules exist but carry zero real items is
    // omitted entirely rather than reported as an empty-but-present
    // structure, so callers can tell "nothing to compute from" apart
    // from "genuinely zero items after computing."
    const totalItems = modules.reduce((sum, m) => sum + m.items.length, 0);
    if (totalItems > 0) result[contentId] = modules;
  });

  return result;
}
