// 🎧 Фоновий звук — an independent ambience layer an author can attach
// to a meditation, mixed under the voice track (see
// context/MeditationPlayerContext.tsx's bg-track mixing).
//
// 2026-09-24 (per Sasha — "человек может выбирать сколько захочет
// звуков на фон, сейчас мы еще музыку пару вариантов закинем, просто
// сделай так чтобы это работало"): this used to be a single, mutually-
// exclusive choice (pick ONE of rain/nature/etc., or "silence" to turn
// it off). Now it's a flat list of independently selectable tracks —
// the participant can layer as many as they want at once (rain + fire
// + music together, just one, or none), each playing through its own
// independently-looping <audio> element, all sharing one "Фон" volume
// slider. "Без фону" is now just "nothing selected", not a track of
// its own.
//
// Adding a new track — including the "пара варіантів музики" Sasha
// mentioned — is just pushing another entry to BACKGROUND_TRACKS below.
// Nothing else needs to change: MeditationPlayerContext's mixing logic
// and MeditationExperience's chip picker both read this list directly,
// so a new entry shows up as its own independently-toggleable chip
// automatically.
//
// `group` (2026-09-24, per Sasha — "музику при этом можно выбрать
// только одну"): most tracks mix freely with anything (rain + fire +
// music all at once is fine), but the four music variants are
// alternates of EACH OTHER, not layers — picking one should swap out
// any other track sharing the same group, same way radio buttons work
// within a group while checkboxes (everything without a group) stay
// independent. See MeditationPlayerContext's addBackgroundTrack for the
// enforcement.
export type BackgroundTrack = {
  // Stable id — persisted on Meditation.backgroundSoundIds (the
  // author's default) and in MeditationPlayerContext's live
  // backgroundSoundIds state. Never reuse/rename an existing id once a
  // meditation references it.
  id: string;
  label: string;
  url: string;
  group?: string;
};

export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  {
    id: "rain",
    label: "Дощ",
    // Real recording (2026-09-24, per Sasha), uploaded into the app's
    // own content-files Supabase Storage bucket — not a SoundHelix
    // placeholder.
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/dragon-studio-copyright-free-rain-sounds-331497.mp3",
  },
  {
    id: "nature",
    label: "Природа",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/audiopapkin-forest-ambience-296528.mp3",
  },
  {
    id: "sea",
    label: "Море",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/freesound_community-water-ocean-waves-01-58360.mp3",
  },
  {
    id: "fire",
    label: "Вогонь",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/king_of_the_christmas-fireplace-loop-original-noise-178209.mp3",
  },
  // Four real music variants (2026-09-24, per Sasha — "я еще добавила
  // 4 варианта музики фоновой для медитації"), uploaded into the same
  // content-files bucket, replacing the earlier single SoundHelix
  // placeholder. Kept as separate independently-selectable chips, same
  // as rain/nature/sea/fire — a participant can mix any of these with
  // each other or with the ambience tracks above.
  {
    id: "music-sigma",
    label: "Музика I",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/sigmamusicart-meditation-music-368634.mp3",
    group: "music",
  },
  {
    id: "music-velario-1",
    label: "Музика II",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/velariomusic-meditation-music-603880.mp3",
    group: "music",
  },
  {
    id: "music-velario-2",
    label: "Музика III",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/velariomusic-meditation-background-603870.mp3",
    group: "music",
  },
  {
    id: "music-andriig",
    label: "Музика IV",
    url: "https://gvetalfctsojvwucxmeo.supabase.co/storage/v1/object/public/content-files/andriig-meditation-meditation-music-581020.mp3",
    group: "music",
  },
];

export function findBackgroundTrack(id: string): BackgroundTrack | undefined {
  return BACKGROUND_TRACKS.find((track) => track.id === id);
}

// 2026-09-29, per Sasha's explicit product call on how author content
// interacts with background choice — two distinct authoring modes:
//   - A "voice only" recording (today's quick-grounding): the author's
//     own track carries just their voice, nothing else. The listener is
//     free to pick ANY background, including the four music variants,
//     since there's no music underneath to clash with.
//   - A "full production" recording: the author already mixed their own
//     music into the track when producing it. Offering the four MUSIC
//     variants on top of that would layer a second, unrelated piece of
//     music under a track that already has one — genuinely wrong, not
//     just redundant. Plain ambience (rain/nature/sea/fire — anything
//     with no `group`) still mixes fine underneath either kind of
//     recording, so only the `group: "music"` tracks are excluded here,
//     never the whole list.
// Every picker that lets a participant choose background tracks
// (MeditationExperience's live in-player chips, MeditationDownloadPicker's
// popover) reads this instead of BACKGROUND_TRACKS directly, so a new
// picker added later can't reintroduce the same clash by forgetting to
// filter.
export function availableBackgroundTracks(meditationHasEmbeddedMusic: boolean): BackgroundTrack[] {
  return meditationHasEmbeddedMusic ? BACKGROUND_TRACKS.filter((track) => track.group !== "music") : BACKGROUND_TRACKS;
}
