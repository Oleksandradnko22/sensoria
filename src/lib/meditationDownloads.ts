// "Зберегти офлайн" (2026-08-30, per Sasha's explicit call): a
// meditation someone downloads has to keep playing with literally no
// network at all — on a plane, before sleep with the phone in do-not-
// disturb, mid-walk with no signal. That's a fundamentally different
// guarantee than everything else in lib/ (bookmarks, saved practices,
// audio positions), which all go through Supabase and are USELESS
// exactly when you'd want a download most (no connection = no request
// reaches the server either way). So this is deliberately NOT a
// Supabase table: the audio itself is fetched once and kept as a Blob
// in this browser's own IndexedDB, entirely on-device, and reading it
// back never touches the network again. "Downloaded" is a per-device
// fact, not an account-wide one, same as how a real podcast app's
// downloads don't follow you to a different phone — that's expected,
// not a limitation to work around.
//
// 2026-09-25 update, per Sasha's explicit call: offline downloads now
// support an optional background-sound layer, chosen BEFORE the
// download starts, merged with the voice track into one rendered file
// (see audioMixer.ts's own header for why WAV/Web-Audio and not a
// server-side step). Every download — with or without a background
// layer — also now triggers a REAL device save (saveBlobToDevice), not
// just this file's own IndexedDB cache; before this only the app's
// internal offline playback worked, the participant had no copy that
// survived outside the app itself.
//
// The two call sites without a background-picker UI (ParticipantLearning's
// quick per-item download toggle) simply pass no track ids and get the
// exact same voice-only fast path as before — no mixing/decoding
// overhead for a flow that never offers background choice anyway.

import type { Meditation } from "../data/meditations.ts";
import { mixMeditationAudioForDownload, saveBlobToDevice } from "./audioMixer.ts";

const DB_NAME = "sensoria-offline";
const DB_VERSION = 1;
const STORE = "meditation-audio";

type DownloadRecord = {
  id: string;
  title: string;
  blob: Blob;
  sizeBytes: number;
  downloadedAt: string;
  // 2026-09-29 addition, per Sasha's explicit call to close the "double
  // background" gap: which background tracks (if any) got mixed into
  // this specific blob at download time. Lets MeditationPlayerContext's
  // loadAndPlay tell a plain voice-only offline copy apart from one that
  // already has ambience baked in — a copy playing back from this
  // record must never ALSO have the live/author-default ambience layer
  // seeded on top of it, or the same sound plays twice at once. Older
  // records saved before this field existed simply have it absent,
  // which reads as "no background baked in" (getDownloadedAudioInfo
  // below defaults it to `[]`) — exactly the correct, safe assumption
  // for a download that predates this feature.
  backgroundTrackIds?: string[];
};

export type MeditationDownloadInfo = {
  id: string;
  title: string;
  sizeBytes: number;
  downloadedAt: string;
};

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(record: DownloadRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getRecord(id: string): Promise<DownloadRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as DownloadRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteRecord(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords(): Promise<DownloadRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as DownloadRecord[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

// blob: URLs are cheap to reuse but not to keep re-minting — one per
// downloaded id, revoked only when that download is actually removed.
const objectUrlCache = new Map<string, string>();
// Cached alongside the object URL above so a repeat getDownloadedMeditationAudio
// call (loadAndPlay runs on every "Почати"/resume, not just the first)
// doesn't need a fresh IndexedDB read just to answer "does this copy
// have background baked in" when the object URL was already cached.
const hasEmbeddedBackgroundCache = new Map<string, boolean>();

export async function isMeditationDownloaded(id: string): Promise<boolean> {
  if (!indexedDbAvailable()) return false;
  try {
    return (await getRecord(id)) !== null;
  } catch {
    return false;
  }
}

export type MeditationDownloadOptions = {
  // Empty/omitted → the plain voice-only fetch path below runs
  // unchanged (same streaming-progress fetch as before, no Web Audio
  // decode/render cost). One or more ids switches to audioMixer's
  // mix-down instead, producing a single WAV blob with the chosen
  // background(s) baked in.
  backgroundTrackIds?: string[];
  // Both default to audioMixer's own product defaults when omitted —
  // see that file's MixOptions for the exact values. Only meaningful
  // when backgroundTrackIds is non-empty (the plain fetch path has no
  // mixing step to apply a volume to).
  voiceVolume?: number;
  backgroundVolume?: number;
};

// Either way — mixed or plain — the result is stored in IndexedDB (for
// this app's own offline playback) AND handed to saveBlobToDevice so
// the participant also gets a real file on their device, not just an
// app-internal blob.
// Thrown when the device has no room for the file (or the browser refused to
// store it). The screen says so plainly instead of a generic failure.
export class NoStorageSpaceError extends Error {
  constructor() {
    super("Недостатньо місця на пристрої для офлайн-копії.");
    this.name = "NoStorageSpaceError";
  }
}

// Pure: is there room for `bytes` with a safety margin? Unknown quota → assume yes.
export function hasRoomFor(estimate: { quota?: number; usage?: number } | null | undefined, bytes: number): boolean {
  if (!estimate || estimate.quota == null || estimate.usage == null) return true;
  return estimate.quota - estimate.usage >= bytes * 1.2;
}

async function assertRoomFor(bytes: number): Promise<void> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!hasRoomFor(estimate, bytes)) throw new NoStorageSpaceError();
  } catch (err) {
    if (err instanceof NoStorageSpaceError) throw err;
    // estimate unsupported — carry on and rely on the quota error below
  }
}

export async function downloadMeditationAudio(
  meditation: Meditation,
  options: MeditationDownloadOptions = {},
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (!indexedDbAvailable()) {
    throw new Error("Цей браузер не підтримує офлайн-збереження.");
  }
  const backgroundTrackIds = options.backgroundTrackIds ?? [];
  // Ask the browser not to evict this copy under storage pressure (best-effort;
  // some browsers ignore or refuse it).
  try {
    await navigator.storage?.persist?.();
  } catch {
    // ignore
  }

  let blob: Blob;
  if (backgroundTrackIds.length > 0) {
    blob = await mixMeditationAudioForDownload(meditation.audioUrl, backgroundTrackIds, onProgress, {
      voiceVolume: options.voiceVolume,
      backgroundVolume: options.backgroundVolume,
    });
  } else {
    const res = await fetch(meditation.audioUrl);
    if (!res.ok) throw new Error("Не вдалося завантажити аудіо.");

    const contentLength = Number(res.headers.get("content-length")) || 0;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (contentLength > 0) onProgress?.(Math.min(1, received / contentLength));
      }
      blob = new Blob(chunks, { type: res.headers.get("content-type") ?? "audio/mpeg" });
    } else {
      // No streaming reader available (older browser, or an opaque
      // response) — still downloads fine, just without live progress.
      blob = await res.blob();
    }
  }

  await assertRoomFor(blob.size);
  try {
    await putRecord({
      id: meditation.id,
      title: meditation.title,
      blob,
      sizeBytes: blob.size,
      downloadedAt: new Date().toISOString(),
      backgroundTrackIds,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") throw new NoStorageSpaceError();
    throw err;
  }
  // Any previously cached blob: URL (and its background flag) for this
  // id now points at nothing useful once the record's been replaced.
  const stale = objectUrlCache.get(meditation.id);
  if (stale) {
    URL.revokeObjectURL(stale);
    objectUrlCache.delete(meditation.id);
  }
  hasEmbeddedBackgroundCache.delete(meditation.id);

  // Real on-device copy, in addition to the app's own IndexedDB cache —
  // see this file's own header for why this now happens unconditionally.
  saveBlobToDevice(blob, meditation.title);
}

export type DownloadedMeditationAudio = {
  url: string;
  // Whether THIS specific saved blob already has background sound mixed
  // in — see DownloadRecord's own comment on backgroundTrackIds above.
  hasEmbeddedBackground: boolean;
};

// What MeditationPlayerContext's loadAndPlay feeds straight into
// audio.src when present — reading purely from IndexedDB, no network
// request involved, which is the entire point. Also reports whether
// this copy already has background baked in, so loadAndPlay knows NOT
// to also seed the author's live default ambience on top of it.
export async function getDownloadedMeditationAudio(id: string): Promise<DownloadedMeditationAudio | null> {
  if (!indexedDbAvailable()) return null;
  const cachedUrl = objectUrlCache.get(id);
  if (cachedUrl) {
    return { url: cachedUrl, hasEmbeddedBackground: hasEmbeddedBackgroundCache.get(id) ?? false };
  }
  try {
    const record = await getRecord(id);
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    const hasEmbeddedBackground = (record.backgroundTrackIds?.length ?? 0) > 0;
    objectUrlCache.set(id, url);
    hasEmbeddedBackgroundCache.set(id, hasEmbeddedBackground);
    return { url, hasEmbeddedBackground };
  } catch {
    return null;
  }
}

export async function deleteMeditationDownload(id: string): Promise<void> {
  const cached = objectUrlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    objectUrlCache.delete(id);
  }
  hasEmbeddedBackgroundCache.delete(id);
  if (!indexedDbAvailable()) return;
  await deleteRecord(id);
}

// Not wired into any screen yet in v1 (per Sasha's call — a plain
// per-meditation toggle is enough for now), but kept here so a future
// "Завантажено" management view doesn't need any new storage-layer
// work, just this.
export async function listDownloadedMeditations(): Promise<MeditationDownloadInfo[]> {
  if (!indexedDbAvailable()) return [];
  try {
    const records = await getAllRecords();
    return records
      .map((r) => ({ id: r.id, title: r.title, sizeBytes: r.sizeBytes, downloadedAt: r.downloadedAt }))
      .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  } catch {
    return [];
  }
}
