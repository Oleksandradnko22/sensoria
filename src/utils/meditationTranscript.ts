// Transcript of a meditation's spoken practice (2026-10-06).
//
// The AUTHOR-written, author-confirmed transcript is the source of truth for
// accessibility, the text version, future captions, search/indexing and future
// text/PDF exports. It is never produced by automatic speech-to-text as the
// final source (an auto draft may help an author start, but it counts only
// after the author edits it and confirms).
//
// Rules (tested in meditationTranscript.test.ts):
//  - a voice-based meditation ("guided", "minimal") MUST have one;
//  - only a CONFIRMED transcript (author + date recorded) is ever shown to
//    participants or exposed to search/export;
//  - confirming needs real text.

import type { MeditationFormat } from "../data/meditationFormats.ts";

export type TranscriptStatus = "draft" | "confirmed";

export type MeditationTranscript = {
  // The spoken text, paragraphs separated by a blank line.
  text: string;
  status: TranscriptStatus;
  // Who confirmed it and when — required once confirmed.
  confirmedBy?: string;
  confirmedAt?: string;
};

export type TranscriptState = "not_required" | "missing" | "draft" | "confirmed";

// A fully silent recording has no speech to transcribe; "silent" in our
// catalog means "almost without voice", so a few spoken cues are still voice.
export function needsTranscript(format: MeditationFormat): boolean {
  return format === "guided" || format === "minimal";
}

export const MIN_TRANSCRIPT_CHARS = 20;

export function transcriptState(m: { format: MeditationFormat; transcript?: MeditationTranscript }): TranscriptState {
  const t = m.transcript;
  if (t && t.text.trim().length > 0) return t.status === "confirmed" && isConfirmable(t) ? "confirmed" : "draft";
  return needsTranscript(m.format) ? "missing" : "not_required";
}

function isConfirmable(t: MeditationTranscript): boolean {
  return t.text.trim().length >= MIN_TRANSCRIPT_CHARS && Boolean(t.confirmedBy?.trim()) && Boolean(t.confirmedAt);
}

// What participants may see: the confirmed text only, as paragraphs.
export function publicTranscript(m: { format: MeditationFormat; transcript?: MeditationTranscript }): string[] | null {
  if (transcriptState(m) !== "confirmed") return null;
  return m.transcript!.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// The author's "I have read and corrected this, publish it" step.
export function confirmTranscript(
  t: MeditationTranscript,
  by: string,
  now: string
): { ok: true; transcript: MeditationTranscript } | { ok: false; reason: string } {
  if (t.text.trim().length < MIN_TRANSCRIPT_CHARS) {
    return { ok: false, reason: `Текст занадто короткий (мінімум ${MIN_TRANSCRIPT_CHARS} символів).` };
  }
  if (!by.trim()) return { ok: false, reason: "Потрібно вказати, хто підтверджує текст." };
  return { ok: true, transcript: { ...t, status: "confirmed", confirmedBy: by.trim(), confirmedAt: now } };
}

// Editing a confirmed transcript sends it back to draft until re-confirmed.
export function editTranscript(_previous: MeditationTranscript | undefined, text: string): MeditationTranscript {
  return { text, status: "draft" };
}

// Which meditations still lack what they need — for the catalog test and QA.
export function meditationsMissingTranscript(
  list: { id: string; format: MeditationFormat; transcript?: MeditationTranscript }[]
): string[] {
  return list.filter((m) => transcriptState(m) === "missing" || (needsTranscript(m.format) && transcriptState(m) === "draft")).map((m) => m.id);
}
