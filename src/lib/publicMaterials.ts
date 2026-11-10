// Reads the published meditations and guides from the database (content + the *_meta / *_body tables) and puts
// them into the lists the app already uses. If the read fails or the tables are empty, the code copy stays as it
// is, so the catalog never goes blank because of the network.
import { supabase } from "./supabaseClient.ts";
import { meditations } from "../data/meditations.ts";
import { guides } from "../data/guides.ts";
import { parseCoverFocus } from "../utils/coverFocus.ts";
import { guideFromRow, meditationFromRow, mergeIntoList, type ContentRow } from "./publicMaterialsMap.ts";
import { isPaidFileRef, signPaidFileRefs } from "./storage.ts";
import { bumpMaterialsVersion, markMaterialsReady } from "./materialsStore.ts";

const SELECT =
  "id, kind, slug, title, description, price, cover_url, tags, created_at, duration_minutes, author:profiles(name), " +
  "content_meditation_meta(*), content_meditation_body(*), content_guide_meta(*), content_guide_body(*)";

// Fields that keep the code copy's value for a material that exists in both places: the editorial author name
// (the database holds the account that owns the row, which for the first materials is a person, not «Sensoria»).
const KEEP_MEDITATION: (keyof (typeof meditations)[number])[] = [];
const KEEP_GUIDE: (keyof (typeof guides)[number])[] = ["author", "tag"];

let inFlight: Promise<void> | null = null;

export function loadMaterialsFromDb(): Promise<void> {
  if (!supabase) {
    markMaterialsReady();
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  const client = supabase;
  inFlight = (async () => {
    const { data, error } = await client.from("content").select(SELECT).in("kind", ["meditation", "guide"]).eq("status", "published").not("slug", "is", null);
    if (error || !data) return;
    const rows = data as unknown as ContentRow[];
    const m = rows.map(meditationFromRow).filter((x): x is NonNullable<typeof x> => !!x);
    const g = rows.map(guideFromRow).filter((x): x is NonNullable<typeof x> => !!x);
    // paid files are stored as references; swap them for signed links (only people with access get one)
    // cover focal points live in a separate column; a missing column simply means "centred"
    const withCover = m.filter((x) => x.coverUrl);
    if (withCover.length) {
      const ids = rows.filter((r) => r.kind === "meditation" && r.cover_url).map((r) => r.id);
      const focusRes = await client.from("content").select("id, slug, cover_focus").in("id", ids);
      if (!focusRes.error) (focusRes.data ?? []).forEach((r) => {
        const f = parseCoverFocus(r.cover_focus);
        const med = m.find((x) => x.id === r.slug);
        if (f && med) med.coverFocus = f;
      });
    }
    // pictures inside a paid interactive guide are private references too
    const pictureRefs = g.flatMap((x) => (x.guideContent ?? []).flatMap((b) => (b.type === "media" && isPaidFileRef(b.url) ? [b.url] : [])));
    const signed = await signPaidFileRefs([...m.map((x) => x.audioUrl), ...g.map((x) => x.fileUrl), ...pictureRefs]);
    m.forEach((x) => {
      if (isPaidFileRef(x.audioUrl)) x.audioUrl = signed.get(x.audioUrl) ?? "";
    });
    g.forEach((x) => {
      if (isPaidFileRef(x.fileUrl)) x.fileUrl = signed.get(x.fileUrl) ?? "";
      // no access → no picture (the block draws nothing)
      (x.guideContent ?? []).forEach((b) => {
        if (b.type === "media" && isPaidFileRef(b.url)) b.url = signed.get(b.url) ?? "";
      });
    });
    const changedM = mergeIntoList(meditations, m, KEEP_MEDITATION);
    const changedG = mergeIntoList(guides, g, KEEP_GUIDE);
    if (changedM || changedG) bumpMaterialsVersion();
  })()
    .catch(() => {})
    .finally(() => {
      markMaterialsReady();
      inFlight = null;
    });
  return inFlight;
}
