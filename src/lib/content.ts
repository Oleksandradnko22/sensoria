// Real persistence for an author's own content (src/data/authorDashboard.ts
// still supplies the rich Андрій demo catalog shown alongside this — see
// AuthorDashboardPage.tsx for how the two are merged). Only content
// created/edited through the editor from now on goes through here; the
// demo rows never touch the database.

import { parseCoverFocus } from "../utils/coverFocus";
import { checklistItems } from "../utils/lessonChecklist";
import { supabase } from "./supabaseClient.ts";
import { hasAcceptedAuthorAgreement, AGREEMENT_REQUIRED_MESSAGE } from "./consents.ts";
import type { AuthoredGuide, SaleStatus, AuthoredContent, AuthoredItem, AuthoredModule, ContentStatus, ContentType } from "../data/authorDashboard.ts";
import type { ContentItemType, PracticeSpec } from "../data/contentTypes.ts";
import { makeSlug } from "../utils/materialSlug.ts";
import { effectiveLessonCount, moduleDurationLabel } from "../utils/programModule.ts";

type ContentRow = {
  id: string;
  kind: ContentType;
  title: string;
  description: string | null;
  price: number;
  status: ContentStatus;
  sale_status?: SaleStatus;
  risk_topics?: string[] | null;
  cover_url: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  duration_minutes?: number | null;
  content_meditation_meta?: MeditationMetaRow | MeditationMetaRow[] | null;
  content_meditation_body?: MeditationBodyRow | MeditationBodyRow[] | null;
  content_guide_meta?: GuideMetaRow | GuideMetaRow[] | null;
  content_guide_body?: { file_url: string | null } | { file_url: string | null }[] | null;
};

type GuideMetaRow = {
  source: "uploaded_pdf" | "sensoria_structured";
  guide_type: AuthoredGuide["guideType"] | null;
  pages: number;
  read_minutes: number;
  relevant_if: string[] | null;
  outcomes: string[] | null;
};

type MeditationMetaRow = {
  format: "guided" | "minimal" | "silent";
  has_embedded_music: boolean;
  offline_download_enabled: boolean;
  when_to_use: string[] | null;
};
type MeditationBodyRow = { audio_url: string; transcript: NonNullable<AuthoredContent["meditation"]>["transcript"] | null };

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type ModuleRow = {
  id: string;
  content_id: string;
  order_index: number;
  title: string;
  lessons: number;
  duration_label: string | null;
  video_url: string | null;
  materials_url: string | null;
};

type ItemRow = {
  id: string;
  module_id: string;
  order_index: number;
  title: string;
  type: ContentItemType;
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
  practice: PracticeSpec | null;
  material_id?: string | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — контент не можна зберегти.");
  }
  return supabase;
}

function itemFromRow(row: ItemRow): AuthoredItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    isRequired: row.is_required,
    body: row.body ?? undefined,
    videoUrl: row.video_url ?? undefined,
    transcript: row.transcript ?? undefined,
    contentWarning: row.content_warning ?? undefined,
    audioUrl: row.audio_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    fileUrl: row.file_url ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSizeLabel: row.file_size_label ?? undefined,
    checklist: row.checklist ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    practice: row.practice ?? undefined,
    materialId: row.material_id ?? undefined,
  };
}

function fromRow(row: ContentRow, modules: ModuleRow[], items: ItemRow[]): AuthoredContent {
  const meta = row.kind === "meditation" ? first(row.content_meditation_meta) : null;
  const body = row.kind === "meditation" ? first(row.content_meditation_body) : null;
  const gmeta = row.kind === "guide" ? first(row.content_guide_meta) : null;
  const gbody = row.kind === "guide" ? first(row.content_guide_body) : null;
  return {
    guide: gmeta
      ? {
          guideType: gmeta.guide_type ?? "practical",
          pages: gmeta.pages,
          readMinutes: gmeta.read_minutes,
          relevantIf: gmeta.relevant_if ?? [],
          outcomes: gmeta.outcomes ?? [],
          source: gmeta.source,
        }
      : undefined,
    slug: row.slug ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    mainFileUrl: body?.audio_url || gbody?.file_url || undefined,
    meditation: meta
      ? {
          format: meta.format,
          hasEmbeddedMusic: meta.has_embedded_music,
          offlineDownloadEnabled: meta.offline_download_enabled,
          whenToUse: meta.when_to_use ?? [],
          transcript: body?.transcript ?? undefined,
        }
      : undefined,
    id: row.id,
    type: row.kind,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    saleStatus: row.sale_status ?? "published",
    riskTopics: row.risk_topics ?? [],
    price: String(row.price),
    // Real purchase/review aggregates don't exist yet (payments aren't
    // wired up) — honestly 0/null rather than inventing numbers.
    participants: 0,
    revenue: 0,
    rating: null,
    reviewsCount: 0,
    createdAt: row.created_at.slice(0, 10),
    updatedAt: row.updated_at.slice(0, 10),
    coverUrl: row.cover_url ?? undefined,
    tags: row.tags ?? [],
    modules: modules
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons,
        duration: m.duration_label ?? "",
        videoUrl: m.video_url ?? undefined,
        materialsUrl: m.materials_url ?? undefined,
        items: items
          .filter((it) => it.module_id === m.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map(itemFromRow),
      })),
  };
}

// `strict`: a failed read throws (so the content page can show "could not load" with a retry) instead of quietly
// returning an empty list, which is what the other callers want.
export async function fetchMyContent(authorId: string, opts?: { strict?: boolean }): Promise<AuthoredContent[]> {
  const client = requireSupabase();
  const base = "id, kind, title, description, price, status, cover_url, tags, created_at, updated_at";
  // sale_status exists after supabase/complaints-migration.sql; fall back so the
  // author's list still loads before it has been run.
  // slug / duration / meditation tables exist after materials-db-model-migration.sql
  const materials = "slug, duration_minutes, content_meditation_meta(*), content_meditation_body(*), content_guide_meta(*), content_guide_body(file_url)";
  let res = (await client
    .from("content")
    .select(`${base}, sale_status, risk_topics, ${materials}`)
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false })) as unknown as { data: ContentRow[] | null; error: unknown };
  if (res.error) {
    res = (await client
    .from("content")
    .select(`${base}, sale_status, risk_topics`)
    .eq("author_id", authorId)
    .order("updated_at", { ascending: false })) as unknown as { data: ContentRow[] | null; error: unknown };
  }
  if (res.error) {
    res = (await client
      .from("content")
      .select(base)
      .eq("author_id", authorId)
      .order("updated_at", { ascending: false })) as unknown as { data: ContentRow[] | null; error: unknown };
  }
  const { data: rows, error } = res;
  if (error || !rows) {
    if (opts?.strict) throw error ?? new Error("content not loaded");
    return [];
  }

  // Intro video + cover focus live in columns added by program-page-migration.sql; read separately so a database
  // that has not run it yet still loads everything else.
  const extras = new Map<string, { intro?: string; focus?: { x: number; y: number } }>();
  const everPublished = new Map<string, boolean>();
  const epRes = await client.from("content").select("id, ever_published").eq("author_id", authorId);
  if (!epRes.error) (epRes.data ?? []).forEach((r) => everPublished.set(r.id as string, !!r.ever_published));
  const stepRes = await client.from("content").select("id, draft_step").eq("author_id", authorId);
  const draftSteps = new Map<string, number>();
  if (!stepRes.error) (stepRes.data ?? []).forEach((r) => typeof r.draft_step === "number" && draftSteps.set(r.id as string, r.draft_step));
  const extraRes = await client.from("content").select("id, intro_video_url, cover_focus").eq("author_id", authorId);
  if (!extraRes.error) {
    (extraRes.data ?? []).forEach((r) => extras.set(r.id as string, { intro: (r.intro_video_url as string | null) ?? undefined, focus: parseCoverFocus(r.cover_focus) }));
  }

  const ids = rows.map((r) => r.id);
  const { data: moduleRows } = ids.length
    ? await client
        .from("content_modules")
        .select("id, content_id, order_index, title, lessons, duration_label, video_url, materials_url")
        .in("content_id", ids)
    : { data: [] as ModuleRow[] };

  const moduleIds = (moduleRows ?? []).map((m) => m.id);
  const { data: itemRows } = moduleIds.length
    ? await client
        .from("content_items")
        .select(
          "id, module_id, order_index, title, type, is_required, body, video_url, transcript, content_warning, audio_url, image_url, file_url, file_name, file_size_label, checklist, duration_minutes, practice"
        )
        .in("module_id", moduleIds)
    : { data: [] as ItemRow[] };

  // Gift lessons (content_items.material_id, program-materials-migration.sql) are read separately so an older
  // database still loads everything else.
  if (itemRows && itemRows.length) {
    const mat = await client.from("content_items").select("id, material_id").in("id", itemRows.map((r) => r.id)).not("material_id", "is", null);
    if (!mat.error) {
      const byId = new Map((mat.data ?? []).map((r) => [r.id as string, r.material_id as string]));
      (itemRows as ItemRow[]).forEach((r) => { r.material_id = byId.get(r.id) ?? null; });
    }
  }

  return rows.map((row) => {
    const base = fromRow(
      row as ContentRow,
      (moduleRows ?? []).filter((m) => m.content_id === row.id) as ModuleRow[],
      (itemRows ?? []) as ItemRow[]
    );
    const extra = extras.get(row.id);
    const withStep = draftSteps.has(row.id) ? { ...base, draftStep: draftSteps.get(row.id) } : base;
    const withEp = everPublished.has(row.id) ? { ...withStep, everPublished: everPublished.get(row.id) } : withStep;
    return extra ? { ...withEp, introVideoUrl: extra.intro, coverFocus: extra.focus } : withEp;
  });
}

// Modules/items used to be deleted and fully re-inserted on EVERY save,
// regenerating every id each time. That silently orphaned every
// participant-facing table keyed by a module/item id (bookmarks,
// progress, saved practices, reflections, mood check-ins, practice
// answers, warning acks, module check-ins) the moment an author touched
// anything and re-saved — a participant's whole history on that lesson
// would just stop resolving to anything, with no error anywhere to
// notice it by. saveContent below instead diffs by AuthoredModule/
// AuthoredItem's own `id` (present once a row has actually been saved
// before, absent for something just added in this editing session):
// existing rows get UPDATEd in place (same id, so every downstream
// reference stays valid), genuinely new ones get INSERTed, and only
// rows the author actually removed get DELETEd (deleting a module still
// cascades to its items, same as before).

async function saveModules(
  client: NonNullable<typeof supabase>,
  contentId: string,
  modules: AuthoredModule[]
): Promise<Map<number, string>> {
  const { data: existingRows, error: existingError } = await client
    .from("content_modules")
    .select("id")
    .eq("content_id", contentId);
  if (existingError) throw existingError;
  const existingIds = new Set((existingRows ?? []).map((m) => m.id));

  const keptIds = new Set(modules.filter((m) => m.id && existingIds.has(m.id)).map((m) => m.id!));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    const { error: deleteError } = await client.from("content_modules").delete().in("id", removedIds);
    if (deleteError) throw deleteError;
  }

  // order_index reflects the module's CURRENT position in `modules`
  // (its array index) — reordering in the editor is exactly this, an
  // order_index update, same as any other field.
  const idByIndex = new Map<number, string>();
  for (const [mi, m] of modules.entries()) {
    if (!m.id || !keptIds.has(m.id)) continue;
    idByIndex.set(mi, m.id);
    const { error: updateError } = await client
      .from("content_modules")
      .update({
        order_index: mi,
        title: m.title,
        lessons: effectiveLessonCount(m),
        duration_label: moduleDurationLabel(m) || null,
        video_url: m.videoUrl || null,
        materials_url: m.materialsUrl || null,
      })
      .eq("id", m.id);
    if (updateError) throw updateError;
  }

  const newEntries = modules.map((m, mi) => ({ m, mi })).filter(({ m }) => !m.id || !keptIds.has(m.id));
  if (newEntries.length > 0) {
    const { data: inserted, error: insertError } = await client
      .from("content_modules")
      .insert(
        newEntries.map(({ m, mi }) => ({
          content_id: contentId,
          order_index: mi,
          title: m.title,
          lessons: effectiveLessonCount(m),
          duration_label: moduleDurationLabel(m) || null,
          video_url: m.videoUrl || null,
          materials_url: m.materialsUrl || null,
        }))
      )
      .select("id, order_index");
    if (insertError) throw insertError;
    // Matched back by the order_index VALUE just assigned, not by array
    // position — a multi-row INSERT's RETURNING order isn't guaranteed
    // to match the input order.
    for (const row of inserted ?? []) {
      idByIndex.set(row.order_index, row.id);
    }
  }

  return idByIndex;
}

async function saveItems(client: NonNullable<typeof supabase>, moduleId: string, items: AuthoredItem[]): Promise<void> {
  const { data: existingRows, error: existingError } = await client
    .from("content_items")
    .select("id")
    .eq("module_id", moduleId);
  if (existingError) throw existingError;
  const existingIds = new Set((existingRows ?? []).map((it) => it.id));

  const keptIds = new Set(items.filter((it) => it.id && existingIds.has(it.id)).map((it) => it.id!));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    const { error: deleteError } = await client.from("content_items").delete().in("id", removedIds);
    if (deleteError) throw deleteError;
  }

  for (const [ii, it] of items.entries()) {
    if (!it.id || !keptIds.has(it.id)) continue;
    const { error: updateError } = await client
      .from("content_items")
      .update({
        order_index: ii,
        title: it.title,
        type: it.type,
        is_required: it.isRequired,
        body: it.body || null,
        video_url: it.videoUrl || null,
        transcript: it.transcript || null,
        content_warning: it.contentWarning || null,
        audio_url: it.audioUrl || null,
        image_url: it.imageUrl || null,
        file_url: it.fileUrl || null,
        file_name: it.fileName || null,
        file_size_label: it.fileSizeLabel || null,
        checklist: it.checklist && checklistItems(it.checklist).length > 0 ? it.checklist.map((l) => l.trim()).filter(Boolean) : null,
        duration_minutes: it.durationMinutes ?? null,
        practice: it.practice ? { ...it.practice, options: it.practice.options ? [...new Set(it.practice.options.map((o) => o.trim()).filter(Boolean))] : undefined } : null,
        ...(it.materialId ? { material_id: it.materialId } : {}),
      })
      .eq("id", it.id);
    if (updateError) throw updateError;
  }

  const newRows = items
    .map((it, ii) => ({ it, ii }))
    .filter(({ it }) => !it.id || !keptIds.has(it.id))
    .map(({ it, ii }) => ({
      module_id: moduleId,
      order_index: ii,
      title: it.title,
      type: it.type,
      is_required: it.isRequired,
      body: it.body || null,
      video_url: it.videoUrl || null,
      transcript: it.transcript || null,
      content_warning: it.contentWarning || null,
      audio_url: it.audioUrl || null,
      image_url: it.imageUrl || null,
      file_url: it.fileUrl || null,
      file_name: it.fileName || null,
      file_size_label: it.fileSizeLabel || null,
      checklist: it.checklist && checklistItems(it.checklist).length > 0 ? it.checklist.map((l) => l.trim()).filter(Boolean) : null,
      duration_minutes: it.durationMinutes ?? null,
      practice: it.practice ? { ...it.practice, options: it.practice.options ? [...new Set(it.practice.options.map((o) => o.trim()).filter(Boolean))] : undefined } : null,
      ...(it.materialId ? { material_id: it.materialId } : {}),
    }));
  if (newRows.length > 0) {
    const { error: insertError } = await client.from("content_items").insert(newRows);
    if (insertError) throw insertError;
  }
}

async function saveMeditationParts(client: ReturnType<typeof requireSupabase>, item: AuthoredContent): Promise<void> {
  const m = item.meditation;
  if (!m) return;
  const { error: metaError } = await client.from("content_meditation_meta").upsert({
    content_id: item.id,
    format: m.format,
    has_embedded_music: m.hasEmbeddedMusic,
    offline_download_enabled: m.offlineDownloadEnabled,
    when_to_use: m.whenToUse,
  });
  if (metaError) throw metaError;
  // audio_url is not null in the table: a draft without a recording stores '' (so the transcript is kept too)
  const { error: bodyError } = await client.from("content_meditation_body").upsert({
    content_id: item.id,
    audio_url: item.mainFileUrl ?? "",
    transcript: m.transcript ?? null,
  });
  if (bodyError) throw bodyError;
}

async function saveGuideParts(client: ReturnType<typeof requireSupabase>, item: AuthoredContent): Promise<void> {
  const g = item.guide;
  if (!g) return;
  const { error: metaError } = await client.from("content_guide_meta").upsert({
    content_id: item.id,
    source: g.source ?? "uploaded_pdf",
    guide_type: g.guideType,
    pages: g.pages,
    read_minutes: g.readMinutes,
    relevant_if: g.relevantIf,
    outcomes: g.outcomes,
  });
  if (metaError) throw metaError;
  // only the file column is written: the structured blocks of a Sensoria guide stay untouched
  const { error: bodyError } = await client.from("content_guide_body").upsert({ content_id: item.id, file_url: item.mainFileUrl ?? null });
  if (bodyError) throw bodyError;
}

export async function saveContent(authorId: string, item: AuthoredContent): Promise<void> {
  const client = requireSupabase();

  // Safety net: nothing goes live or to moderation without the accepted
  // author agreement (the editor shows the acceptance dialog before this).
  if (item.status === "published" || item.status === "review") {
    if (!(await hasAcceptedAuthorAgreement())) {
      throw new Error(AGREEMENT_REQUIRED_MESSAGE);
    }
  }

  const row = {
    id: item.id,
    author_id: authorId,
    kind: item.type,
    title: item.title,
    description: item.description ?? null,
    price: Number(item.price) || 0,
    status: item.status,
    cover_url: item.coverUrl ?? null,
    tags: item.tags ?? [],
    updated_at: new Date().toISOString(),
  };
  // A guide / meditation needs a readable id (slug) to appear in the catalog; it is made once and then never changes.
  const withSlug = item.type === "program" ? {} : { slug: item.slug ?? makeSlug(item.title, item.id), duration_minutes: item.durationMinutes ?? null };
  let { error } = await client.from("content").upsert({ ...row, ...withSlug, risk_topics: item.riskTopics ?? [] });
  // risk_topics exists after supabase/author-kind-migration.sql.
  if (error && (error.code === "42703" || error.code === "PGRST204" || /risk_topics/i.test(error.message ?? ""))) {
    ({ error } = await client.from("content").upsert({ ...row, ...withSlug }));
  }
  if (error) throw error;

  // Needs program-page-migration.sql; before it is run the rest of the content still saves.
  const extra = await client
    .from("content")
    .update({ intro_video_url: item.introVideoUrl?.trim() || null, cover_focus: item.coverFocus ?? null })
    .eq("id", item.id);
  if (extra.error && !(extra.error.code === "42703" || extra.error.code === "PGRST204" || /intro_video_url|cover_focus/i.test(extra.error.message ?? ""))) {
    throw extra.error;
  }

  // Which wizard step the author stopped on (draft-step-migration.sql); before it is run nothing is lost but the step.
  if (item.type === "program" && item.draftStep) {
    const st = await client.from("content").update({ draft_step: item.draftStep }).eq("id", item.id);
    if (st.error && !(st.error.code === "42703" || st.error.code === "PGRST204" || /draft_step/i.test(st.error.message ?? ""))) throw st.error;
  }

  if (item.type === "meditation") await saveMeditationParts(client, item);
  if (item.type === "guide") await saveGuideParts(client, item);

  const modules = item.modules ?? [];
  const moduleIdByIndex = await saveModules(client, item.id, modules);

  for (const [mi, m] of modules.entries()) {
    const moduleId = moduleIdByIndex.get(mi);
    if (!moduleId) continue;
    await saveItems(client, moduleId, m.items ?? []);
  }
}

// Permanently deletes a draft that was never published or bought (draft-delete-migration.sql checks it all again).
export async function deleteDraft(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_my_draft", { p_id: id });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("Видалення ще не підключене в базі: потрібно виконати draft-delete-migration.sql.");
    throw new Error(error.message || "Не вдалося видалити чернетку.");
  }
}

// "Нові матеріали" broadcast — call this only on a genuine
// draft/review -> published transition (AuthorCourseEditor.tsx checks
// `editing?.status !== "published"` before calling), never on every
// re-save of already-published content. Fire-and-forget, same
// convention as sendNotificationEmail: has to be a server-side
// function (targeting reads other participants' data, which RLS
// correctly won't let this client do directly) — see
// supabase/functions/notify-new-content/index.ts for the actual
// targeting + send logic.
export function notifyNewContent(contentId: string): void {
  if (!supabase) return;
  supabase.functions.invoke("notify-new-content", { body: { contentId } }).then(({ error }) => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося розіслати сповіщення про новий матеріал:", error.message);
    }
  });
}

// ── Lifecycle (docs/content-lifecycle.md) ───────────────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The latest completed purchase of each material, in ONE query for the whole list (the author may read the
// purchases of their own materials). Ids that are not uuids (the demo showcase) are skipped.
export async function fetchLastPurchaseDates(contentIds: string[]): Promise<Map<string, string>> {
  const client = requireSupabase();
  const ids = contentIds.filter((id) => UUID.test(id));
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await client.from("purchases").select("content_id, purchased_at").in("content_id", ids).eq("status", "completed");
  if (error) throw error;
  for (const row of data ?? []) {
    const prev = out.get(row.content_id as string);
    if (!prev || new Date(row.purchased_at as string) > new Date(prev)) out.set(row.content_id as string, row.purchased_at as string);
  }
  return out;
}

// Archive / restore: ONLY the status changes (the rest of the material is untouched). The database refuses an
// archive inside the 14-day window and the error text is shown to the author.
export async function setContentStatus(id: string, status: ContentStatus): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
