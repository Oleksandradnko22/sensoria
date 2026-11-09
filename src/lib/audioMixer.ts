// Mixes a meditation's voice track with one or more chosen background
// tracks (data/meditationBackgroundSounds.ts) into a SINGLE rendered
// audio file — 2026-09-25, per Sasha's explicit call: "офлайн медитація
// повинна скачуватися на пристрій з можливістю вибору фонових звуків,
// які теж скачаються разом з медитацією одним файлом". Before this, an
// offline download was voice-only (see meditationDownloads.ts's own
// v1 comment on why background was left out); this is what makes that
// no longer true — the participant now genuinely gets the same
// voice+ambience experience offline that they'd get live, as one file
// they can also keep outside the app (a real device download, not just
// an app-internal IndexedDB blob).
//
// Pure Web Audio API, no server-side/native transcoding step: fetch +
// decodeAudioData for every source, mix them down through an
// OfflineAudioContext (so this runs instantly, not in real time), then
// hand-encode the rendered PCM as a WAV file. WAV specifically because
// it needs zero third-party encoder — every browser's Web Audio API can
// decode arbitrary formats (mp3, aac, ogg — whatever the source tracks
// already are) but none can ENCODE back to a compressed format without
// a library; WAV is just a raw-sample container, so writing one is ~40
// lines of pure JS with no dependency.
//
// Background tracks are looped for the FULL duration of the voice
// track (same "shorter ambience loops under a longer voice track"
// behavior as the live in-player mixing in MeditationPlayerContext —
// see that file's own header comment) and mixed at the same default
// 0.4 gain the live player defaults to, so the offline file sounds like
// what playing it live with the default Фон volume would sound like.

import { findBackgroundTrack } from "../data/meditationBackgroundSounds.ts";

// Matches MeditationPlayerContext's own default backgroundVolume state
// — see that file's own comment for why 0.4 specifically. Used only as
// the fallback when the download picker's own volume sliders (added
// 2026-09-29, per Sasha's explicit call to let people pick both Голос
// and Фон levels before downloading, same as the live player already
// lets them do) aren't passed a value.
const DEFAULT_BACKGROUND_GAIN = 0.4;
const DEFAULT_VOICE_GAIN = 1;

// 2026-09-29 bugfix: a background track fetch that never resolves or
// rejects (a stalled connection, a request silently swallowed by
// something between the browser and Supabase Storage) used to hang the
// whole download forever — no error, no progress, "Завантаження… 35%"
// stuck indefinitely, since nothing here ever timed out. Every fetch
// now races against a hard timeout and fails LOUDLY (a normal retryable
// error surfaces in the UI) instead of hanging silently.
const FETCH_TIMEOUT_MS = 45_000;

async function fetchAndDecode(url: string, audioCtx: BaseAudioContext): Promise<AudioBuffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Не вдалося завантажити аудіо: ${url}`);
    const arrayBuffer = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Перевищено час очікування завантаження: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Hand-rolled 16-bit PCM WAV encoder — see this file's own header for
// why WAV (no encoder dependency) rather than mp3/aac. Interleaves all
// channels, same as any standard WAV reader expects.
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferLength = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF/WAVE header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleaved 16-bit PCM samples, clamped to [-1, 1] before scaling —
  // a mixed voice+background sum can briefly exceed 1.0, which would
  // otherwise wrap around into loud digital noise instead of just
  // clipping cleanly.
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export type MixOptions = {
  // Both default to the product's own live-player defaults (1 = full
  // volume for voice, 0.4 for background — see MeditationPlayerContext's
  // own backgroundVolume default) when omitted, so callers that don't
  // offer these controls (nothing does yet outside the download picker)
  // get the exact same mix as before this option existed.
  voiceVolume?: number;
  backgroundVolume?: number;
};

// The one exported entry point: given the meditation's own voice URL
// and a list of chosen background track ids (from
// data/meditationBackgroundSounds.ts — may be empty, in which case this
// just re-encodes the voice track alone as a WAV, still a single valid
// offline file), returns a rendered WAV Blob combining all of them.
// `onProgress` reports one increment per source track fetched/decoded
// (not just a fixed handful of coarse milestones) so a meditation with
// several chosen background tracks shows real incremental movement
// instead of sitting on one number until every track is done.
export async function mixMeditationAudioForDownload(
  voiceUrl: string,
  backgroundTrackIds: string[],
  onProgress?: (fraction: number) => void,
  options?: MixOptions
): Promise<Blob> {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Цей браузер не підтримує змішування аудіо.");
  }
  const voiceVolume = options?.voiceVolume ?? DEFAULT_VOICE_GAIN;
  const backgroundVolume = options?.backgroundVolume ?? DEFAULT_BACKGROUND_GAIN;

  const decodeCtx = new AudioContextCtor();
  try {
    const backgroundUrls = backgroundTrackIds
      .map((id) => findBackgroundTrack(id)?.url)
      .filter((url): url is string => Boolean(url));

    // Fetch/decode makes up the first 80% of the reported progress,
    // split evenly across the voice track + every background track —
    // each one completing bumps the number, rather than one jump from
    // "just started" straight to "all fetching done".
    const totalTracks = 1 + backgroundUrls.length;
    let tracksDone = 0;
    const reportTrackDone = () => {
      tracksDone += 1;
      onProgress?.((tracksDone / totalTracks) * 0.8);
    };

    const [voiceBuffer, backgroundBuffers] = await Promise.all([
      fetchAndDecode(voiceUrl, decodeCtx).then((buf) => {
        reportTrackDone();
        return buf;
      }),
      Promise.all(
        backgroundUrls.map((url) =>
          fetchAndDecode(url, decodeCtx).then((buf) => {
            reportTrackDone();
            return buf;
          })
        )
      ),
    ]);

    const OfflineCtx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error("Цей браузер не підтримує змішування аудіо.");

    const offlineCtx = new OfflineCtx(voiceBuffer.numberOfChannels, voiceBuffer.length, voiceBuffer.sampleRate);

    const voiceSource = offlineCtx.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = voiceVolume;
    voiceSource.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);
    voiceSource.start(0);

    // Every background track loops for the full render length —
    // OfflineAudioContext stops rendering once its fixed `length` is
    // reached regardless of what the source nodes are still doing, so a
    // shorter background loop never needs an explicit stop time (same
    // "just let it loop, the context's own length is the real clock"
    // behavior the live player relies on).
    for (const bgBuffer of backgroundBuffers) {
      const bgSource = offlineCtx.createBufferSource();
      bgSource.buffer = bgBuffer;
      bgSource.loop = true;
      bgSource.loopEnd = bgBuffer.duration;
      const gain = offlineCtx.createGain();
      gain.gain.value = backgroundVolume;
      bgSource.connect(gain);
      gain.connect(offlineCtx.destination);
      bgSource.start(0);
    }

    onProgress?.(0.85);
    const rendered = await offlineCtx.startRendering();
    onProgress?.(0.95);

    const blob = audioBufferToWavBlob(rendered);
    onProgress?.(1);
    return blob;
  } finally {
    decodeCtx.close().catch(() => {});
  }
}

// audio/mpeg -> .mp3 (the plain voice-only fast path re-uses the
// source file's own content-type as-is, unmixed), audio/wav -> .wav
// (this file's own mixed-render output) — falls back to .mp3 for
// anything unrecognized rather than producing an extensionless file.
function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "m4a";
  return "mp3";
}

// Triggers a REAL device download (not just this app's own IndexedDB
// cache) — a plain off-DOM <a download> click, the standard way to save
// a Blob to the browser's Downloads folder without a server round-trip.
// Filename is sanitized (no path separators/quotes) since it's built
// from a free-text meditation title.
export function saveBlobToDevice(blob: Blob, filename: string): void {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, "").trim() || "meditation";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.${extensionForMimeType(blob.type)}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on a delay, not immediately — some browsers (notably
  // Safari) can drop the download if the object URL is revoked before
  // the save actually starts.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
