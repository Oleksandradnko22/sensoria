// Sound of the meditation studio, all in the author's browser: the microphone, recording
// a fragment, background layers (Sensoria's sounds and music, or the author's own files),
// mixing everything into one recording, and packing it as MP3. Only the finished MP3
// is uploaded.
import { STUDIO_LEAD_IN, STUDIO_DEFAULT_PAUSE, voiceBounds, type StudioFragment, type StudioTake } from "../utils/meditationStudio.ts";

// Mono, 32 kHz, 96 kbit/s: clear voice and soft background at about 0.7 MB a minute.
const SAMPLE_RATE = 32000;
const KBPS = 96;

// ---------- microphone and recording ----------

export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Цей браузер не дає записувати звук. Спробуйте Chrome, Edge або Safari.");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: false, autoGainControl: false, channelCount: 1 },
    });
  } catch {
    throw new Error("Немає доступу до мікрофона. Дозвольте його в адресному рядку браузера й спробуйте ще раз.");
  }
}

function recorderType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

// Starts recording the stream; the returned function stops it and gives the recorded file.
export function startRecording(stream: MediaStream): () => Promise<Blob> {
  const type = recorderType();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.start(500);
  return () =>
    new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }));
      if (rec.state !== "inactive") rec.stop();
      else resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    });
}

// Live loudness of the microphone, 0..1, for the level meter.
export function micLevel(stream: MediaStream): { read: () => number; close: () => void } {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const data = new Float32Array(an.fftSize);
  return {
    read: () => {
      an.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    },
    close: () => void ctx.close(),
  };
}

async function decode(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

function mono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

// A recorded fragment becomes a take: where the voice is inside it. null = only silence.
export async function makeTake(blob: Blob): Promise<StudioTake | null> {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buf = await decode(blob, ctx);
  const b = voiceBounds(mono(buf), buf.sampleRate);
  return b ? { blob, start: b.start, end: b.end } : null;
}

// ---------- background ----------

// A background layer: a link to a Sensoria track or the author's own file.
export type BgSource = string | Blob;

// Sensoria tracks are fetched once per page and reused (preview and mixing).
const fetched = new Map<string, Promise<Blob>>();
function sourceBlob(src: BgSource): Promise<Blob> {
  if (typeof src !== "string") return Promise.resolve(src);
  let p = fetched.get(src);
  if (!p) {
    p = fetch(src).then((r) => { if (!r.ok) throw new Error("bg"); return r.blob(); });
    p.catch(() => fetched.delete(src));
    fetched.set(src, p);
  }
  return p;
}

// Plays one background layer alone (to choose it and its volume). Returns stop().
export async function previewBackground(src: BgSource, volume: number): Promise<() => void> {
  const ctx = new AudioContext();
  const buf = await decode(await sourceBlob(src), ctx);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.loop = true;
  const g = ctx.createGain();
  g.gain.value = volume;
  node.connect(g).connect(ctx.destination);
  node.start();
  return () => { try { node.stop(); } catch { /* already stopped */ } void ctx.close(); };
}

// ---------- the finished recording ----------

export type MixInput = {
  fragments: StudioFragment[];
  takes: Record<string, StudioTake>;
  pauses: Record<string, number>;
  endPause: number;
  // background layers (sound, music), volume 0..1 relative to the voice
  layers: { src: BgSource; volume: number }[];
  onProgress?: (share: number, label: string) => void;
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// Voice (cleaned: low rumble cut, levels evened out, soft edges), pauses and background in one track.
export async function mixMeditation(input: MixInput): Promise<AudioBuffer> {
  const recorded = input.fragments.filter((f) => input.takes[f.id]);
  input.onProgress?.(0.02, "Готуємо фрагменти…");
  const probe = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const voices: { buf: AudioBuffer; take: StudioTake; pause: number }[] = [];
  for (let i = 0; i < recorded.length; i++) {
    const f = recorded[i];
    const take = input.takes[f.id];
    voices.push({ buf: await decode(take.blob, probe), take, pause: i === recorded.length - 1 ? input.endPause : input.pauses[f.id] ?? STUDIO_DEFAULT_PAUSE });
    input.onProgress?.(0.02 + (0.2 * (i + 1)) / recorded.length, "Готуємо фрагменти…");
  }
  const total = STUDIO_LEAD_IN + voices.reduce((s, v) => s + (v.take.end - v.take.start) + v.pause, 0);
  const ctx = new OfflineAudioContext(1, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE);

  // voice chain
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 80;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  hp.connect(comp).connect(ctx.destination);

  let at = STUDIO_LEAD_IN;
  const FADE = 0.03;
  for (const v of voices) {
    const len = v.take.end - v.take.start;
    const src = ctx.createBufferSource();
    src.buffer = v.buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(1, at + FADE);
    g.gain.setValueAtTime(1, Math.max(at + FADE, at + len - FADE));
    g.gain.linearRampToValueAtTime(0, at + len);
    src.connect(g).connect(hp);
    src.start(at, v.take.start, len);
    at += len + v.pause;
  }

  // background layers: fade in over the lead-in and out over the last seconds
  for (const layer of input.layers) {
    const bg = await decode(await sourceBlob(layer.src), ctx);
    const src = ctx.createBufferSource();
    src.buffer = bg;
    src.loop = true;
    const g = ctx.createGain();
    const vol = Math.max(0, Math.min(1, layer.volume)) * 0.35;
    const out = Math.min(6, total / 3);
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(vol, Math.min(STUDIO_LEAD_IN, total / 3));
    g.gain.setValueAtTime(vol, Math.max(0, total - out));
    g.gain.linearRampToValueAtTime(0, total);
    src.connect(g).connect(ctx.destination);
    src.start(0);
  }

  input.onProgress?.(0.3, "Зводимо голос і фон…");
  const mixed = await ctx.startRendering();

  // even loudness: the loudest moment just under the top
  const d = mixed.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  if (peak > 0) { const k = 0.89 / peak; for (let i = 0; i < d.length; i++) d[i] *= k; }
  return mixed;
}

// The mixed track as an MP3 file. Packing is split into short steps so the page stays responsive.
export async function encodeMp3(buf: AudioBuffer, onProgress?: (share: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, buf.sampleRate, KBPS);
  const data = buf.getChannelData(0);
  const parts: Uint8Array[] = [];
  const FRAME = 1152;
  const STEP = FRAME * 200;
  const pcm = new Int16Array(STEP);
  for (let i = 0; i < data.length; i += STEP) {
    const n = Math.min(STEP, data.length - i);
    for (let j = 0; j < n; j++) {
      const s = Math.max(-1, Math.min(1, data[i + j]));
      pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const out = enc.encodeBuffer(n === STEP ? pcm : pcm.subarray(0, n));
    if (out.length) parts.push(new Uint8Array(out));
    onProgress?.(i / data.length);
    await tick();
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}
