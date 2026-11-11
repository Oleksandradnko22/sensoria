// Pure rules of the meditation recording studio: how the practice text is cut into
// fragments the author reads one by one, the pauses between them, and the length of
// the finished recording. No browser APIs here, so it is tested without a browser.

export type StudioFragment = { id: string; text: string };

// A recorded take of one fragment: the voice inside it (silence around it is cut off).
export type StudioTake = { blob: Blob; start: number; end: number };

// Pause after a fragment, in seconds. The last pause is the quiet ending of the recording.
export const STUDIO_PAUSES = [0, 2, 3, 5, 10, 15, 20, 30, 45, 60];
export const STUDIO_DEFAULT_PAUSE = 3;
export const STUDIO_DEFAULT_END_PAUSE = 5;
// Background only, before the first words.
export const STUDIO_LEAD_IN = 3;
// A fragment longer than this is cut further, at sentence ends: easier to read and to retake.
export const STUDIO_FRAGMENT_MAX_CHARS = 420;

// Stable id of a fragment from its text, so a take stays with its words when the text around it changes.
export function fragmentId(text: string, nth: number): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `f${(h >>> 0).toString(36)}_${nth}`;
}

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= STUDIO_FRAGMENT_MAX_CHARS) return [paragraph];
  const sentences = paragraph.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [paragraph];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > STUDIO_FRAGMENT_MAX_CHARS) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Paragraphs (a blank line between them) become fragments; a text with single line breaks
// only is cut at every line. Very long paragraphs are cut at sentence ends.
export function splitTranscript(text: string): StudioFragment[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const byBlank = clean.split(/\n\s*\n/);
  const parts = byBlank.length > 1 ? byBlank : clean.split("\n");
  const seen = new Map<string, number>();
  return parts
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(splitLong)
    .map((t) => {
      const n = seen.get(t) ?? 0;
      seen.set(t, n + 1);
      return { id: fragmentId(t, n), text: t };
    });
}

// One background layer (a sound or music): a Sensoria track id, "own" (the author's file), or null (none).
export type BgChoice = { id: string | null; own: Blob | null; ownName: string; volume: number };
const noLayer = (): BgChoice => ({ id: null, own: null, ownName: "", volume: 0.5 });

// What the studio keeps while the editor is open (closing the studio loses nothing).
export type StudioState = {
  takes: Record<string, StudioTake>;
  pauses: Record<string, number>;
  endPause: number;
  sound: BgChoice;
  music: BgChoice;
};

export const emptyStudioState = (): StudioState => ({ takes: {}, pauses: {}, endPause: STUDIO_DEFAULT_END_PAUSE, sound: noLayer(), music: noLayer() });

export const takeSeconds = (t: StudioTake | undefined) => (t ? Math.max(0, t.end - t.start) : 0);

// Length of the finished recording: lead-in, every recorded fragment with its pause, the quiet ending.
export function totalSeconds(fragments: StudioFragment[], takes: Record<string, StudioTake>, pauses: Record<string, number>, endPause: number): number {
  const recorded = fragments.filter((f) => takes[f.id]);
  if (recorded.length === 0) return 0;
  let s = STUDIO_LEAD_IN;
  recorded.forEach((f, i) => {
    s += takeSeconds(takes[f.id]);
    s += i === recorded.length - 1 ? endPause : pauses[f.id] ?? STUDIO_DEFAULT_PAUSE;
  });
  return s;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function pauseLabel(sec: number): string {
  return sec === 0 ? "без паузи" : sec < 60 ? `${sec} с` : `${sec / 60} хв`;
}

// Where the voice is inside a take: windows of 20 ms louder than a share of the loudest one.
// A short padding is kept so soft first and last sounds are not clipped; the first 80 ms
// (the click of the button) never count as voice.
export function voiceBounds(samples: Float32Array, sampleRate: number): { start: number; end: number } | null {
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const skip = Math.round(sampleRate * 0.08);
  const rms: number[] = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    rms.push(i < skip ? 0 : Math.sqrt(sum / (end - i)));
  }
  const peak = Math.max(0, ...rms);
  if (peak < 0.003) return null; // nothing but silence
  const threshold = Math.max(0.004, peak * 0.05);
  const first = rms.findIndex((v) => v > threshold);
  let last = rms.length - 1;
  while (last > first && rms[last] <= threshold) last--;
  const dur = samples.length / sampleRate;
  const start = Math.max(0.08, (first * win) / sampleRate - 0.2);
  const end = Math.min(dur, ((last + 1) * win) / sampleRate + 0.35);
  return end - start > 0.15 ? { start, end } : null;
}
