// Reads the published meditations and guides from the database (content + the *_meta / *_body tables) and puts
// them into the lists the app already uses. If the read fails or the tables are empty, the code copy stays as it
// is, so the catalog never goes blank because of the network.
import { supabase } from "./supabaseClient.ts";
import { meditations } from "../data/meditations.ts";
import { guides } from "../data/guides.ts";
import { guideFromRow, meditationFromRow, mergeIntoList, type ContentRow } from "./publicMaterialsMap.ts";
import { isPaidFileRef, signPaidFileRefs } from "./storage.ts";
import { bumpMaterialsVersion, markMaterialsReady } from "./materialsStore.ts";

const SELECT =
  "id, kind, slug, title, description, price, tags, created_at, duration_minutes, author:profiles(name), " +
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
    const signed = await signPaidFileRefs([...m.map((x) => x.audioUrl), ...g.map((x) => x.fileUrl)]);
    m.forEach((x) => {
      if (isPaidFileRef(x.audioUrl)) x.audioUrl = signed.get(x.audioUrl) ?? "";
    });
    g.forEach((x) => {
      if (isPaidFileRef(x.fileUrl)) x.fileUrl = signed.get(x.fileUrl) ?? "";
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
