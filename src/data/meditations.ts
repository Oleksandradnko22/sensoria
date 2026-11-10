// Meditation catalog (static data; there is no author-side meditation editor
// yet). A meditation needs REAL audio first, a catalog entry second.
//
// Identity: `id` is the stable key every saved thing points at (positions,
// sessions, check-ins, saved practice, feedback, reports, author). Published
// ids are immutable: rewording a title/description or re-uploading better
// audio keeps the id; a semantically different practice gets a NEW id.
//
// Fields: `audioUrl` the voice track (public content-files bucket, which sends
// CORS headers — required for offline download); `format` how much of the
// track is voice vs music/silence (meditationFormats.ts); `backgroundSoundIds`
// the author's default ambience (meditationBackgroundSounds.ts); `whenToUse`
// the human situations shown on the intro screen; `offlineDownloadEnabled` an
// explicit per-meditation author choice; `hasEmbeddedMusic` whether the voice
// file already contains music. The duration label is derived from
// `durationMinutes`, never stored twice.
import type { MeditationFormat } from "./meditationFormats.ts";
import type { MeditationTranscript } from "../utils/meditationTranscript.ts";

type MeditationEntry = {
  id: string;
  title: string;
  durationMinutes: number;
  description: string;
  audioUrl: string;
  format: MeditationFormat;
  backgroundSoundIds?: string[];
  tags: string[];
  // "Ця практика може підійти, якщо ви:" (2026-08-30, per Sasha's
  // explicit call) — replaces the raw #anxiety/#stress tag pill on
  // MeditationExperience's intro screen with real, human situations.
  // `tags` stays exactly as-is underneath (still drives the Категорії
  // filter sidebar and the cover's emotional-topic icon/color via
  // getContentAccent) — this is purely an additional, editorial layer
  // for how it reads to a person deciding whether to press play.
  whenToUse: string[];
  // "Зберегти офлайн" (2026-09-26, per Sasha's explicit call — "опция
  // загрузки будет не обязательной, это будет решать автор"): whether
  // THIS meditation's author has actually turned offline download on.
  // Required (not optional-defaulting-true) so every meditation makes
  // an explicit choice, the same way `format`/`tags` do — a new entry
  // that forgets this field is a type error, not a silent "on by
  // default". There's no author-side meditation editor yet (meditations
  // are still static catalog data, like guides were before their own
  // editor existed — see GuideExperience.tsx's history), so for now
  // this is set by hand per demo entry; a real editor would just read/
  // write this same field once it exists.
  //
  // Root cause of "download does nothing" (2026-09-26 investigation,
  // confirmed live in a real browser): SoundHelix (the placeholder host
  // used before real content existed) sends no Access-Control-Allow-
  // Origin header — a cross-origin fetch() for the raw bytes (which
  // lib/meditationDownloads.ts needs to store the file in IndexedDB)
  // fails with a bare "Failed to fetch". A public Supabase Storage
  // bucket (content-files, the same one lib/storage.ts's
  // uploadContentFile writes to) DOES send that header — confirmed live
  // — which is why quick-grounding's real uploaded track can actually
  // be saved for offline playback now, not just look like it can.
  offlineDownloadEnabled: boolean;
  // Author-written, author-confirmed text of the spoken practice — required for
  // voice-based formats (see utils/meditationTranscript.ts). Never auto-generated
  // as the final source. Shown to participants only once confirmed.
  transcript?: MeditationTranscript;
  // "Аудіо автора" (2026-09-29, per Sasha's explicit product call): two
  // distinct authoring modes, not a spectrum. `false` (voice-only, like
  // quick-grounding's real ElevenLabs track) means the participant can
  // pick ANY background, including the four music variants — there's no
  // music underneath to clash with. `true` means the author already
  // mixed their own music into the recording when producing it, so the
  // four MUSIC-group tracks (data/meditationBackgroundSounds.ts's
  // `group: "music"`) are hidden from every background picker for this
  // meditation — layering a second, unrelated piece of music under one
  // that's already there would be genuinely wrong, not just redundant.
  // Plain ambience (rain/nature/sea/fire, everything with no `group`)
  // still mixes fine underneath either kind of recording and stays
  // available regardless. See meditationBackgroundSounds.ts's
  // availableBackgroundTracks — every picker reads through that rather
  // than the raw BACKGROUND_TRACKS list, so this can't be forgotten in
  // a new picker later. Required (not optional-defaulting) for the same
  // reason offlineDownloadEnabled is: every entry makes an explicit
  // choice, never a silent default.
  hasEmbeddedMusic: boolean;
  // From the database only (the static demo entry has none): the author's price ("0" = free), name and cover.
  price?: string;
  author?: string;
  coverUrl?: string;
  coverFocus?: import("../utils/coverFocus.ts").CoverFocus;
}

const entries: MeditationEntry[] = [
  {
    id: "quick-grounding",

    title: "Швидке заземлення",

    durationMinutes: 4,

    description: "Проста техніка, щоб повернутися в теперішній момент, коли думки йдуть по колу.",

    // Real author track (2026-09-24, per Sasha): an actual ElevenLabs
    // voice recording ("Sofiia — Clear, Warm and Bright"), uploaded by
    // Sasha into the app's own content-files Supabase Storage bucket —
    // the same bucket lib/storage.ts's uploadContentFile already writes
    // to, so this is the real intended hosting path, not a workaround.
    // A public Supabase Storage bucket sends a proper CORS header,
    // confirmed live (streamed fetch from a different origin succeeded,
    // 1,821,395 bytes) — which is what makes offlineDownloadEnabled
    // actually work end-to-end for this meditation now, not just look
    // like it does.
    audioUrl:
      "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/ElevenLabs_2026-09-23T21_51_53_Sofiia%20-%20Clear%2C%20Warm%20and%20Bright_pvc_s50_m2.mp3",

    format: "minimal",

    tags: [
      "anxiety",
      "emotionalBalance",
    ],

    whenToUse: [
      "думки крутяться по колу, і важко їх зупинити",
      "відчуваєте себе розгублено або ніби «не тут»",
      "потрібно швидко повернутися в теперішній момент",
      "є лише кілька хвилин між справами",
    ],

    offlineDownloadEnabled: true,

    // Text of the practice, shown under the player. ПЕРЕВІРТЕ: це робочий текст у дусі техніки «5-4-3-2-1»,
    // його треба замінити точним сценарієм запису (того, що озвучено в ElevenLabs).
    transcript: {
      text: [
        "Влаштуйтеся зручно. Можна сидіти або стояти, головне, щоб тілу було спокійно. Зробіть повільний вдих і довгий видих.",
        "Подивіться навколо й назвіть про себе п'ять речей, які ви бачите. Не поспішайте, просто помічайте кольори й форми.",
        "Тепер зверніть увагу на тіло. Відчуйте чотири дотики: одяг на плечах, опору під ногами, поверхню під руками, повітря на шкірі.",
        "Прислухайтеся. Знайдіть три звуки поруч із вами: далекі й близькі, гучні й ледь чутні.",
        "Помітьте два запахи. Якщо їх немає, просто зробіть вдих і відчуйте повітря.",
        "І одне, що ви відчуваєте на смак, або просто ковток води чи спокійний видих.",
        "Ви тут, у теперішньому моменті. Зробіть ще один повільний вдих. Коли будете готові, повертайтеся до справ.",
      ].join("\n\n"),
      status: "confirmed",
      confirmedBy: "Sensoria",
      confirmedAt: "2026-11-10T09:00:00.000Z",
    },

    // A real ElevenLabs voice-only recording — no music baked in — so
    // every background, including the four music variants, stays
    // available for the participant to pick.
    hasEmbeddedMusic: false,
  },
];

// "4 хв" — derived, so it can never disagree with durationMinutes.
export const meditations = entries.map((entry) => ({ ...entry, duration: `${entry.durationMinutes} хв` }));

export type Meditation = (typeof meditations)[number];
