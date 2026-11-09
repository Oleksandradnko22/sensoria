// "Як змінюється ваш стан": the before/after observations from lessons/
// practices and from meditations are the same kind of record, so they are
// shown as one list. Pure presentation model — only the real stored values
// are used (no averages, trends or scores are derived).
import type { MoodCheckInRecord } from "../lib/moodCheckins.ts";
import type { MeditationMoodCheckInRecord } from "../lib/meditationMoodCheckins.ts";
import { optionLabel, parseChangeNote } from "../data/meditationCheckin.ts";

export type StateChangeSource = "practice" | "meditation";

export type StateChange = {
  key: string;
  source: StateChangeSource;
  // "Підтримка емоційного балансу · Дихальні техніки" / meditation title
  context: string | null;
  // What was rated: the question the person answered ("Напруга" for a
  // meditation check-in, "Самопочуття" for the lesson wellbeing scale).
  measure: string;
  // Raw stored numbers (null = that half was never answered) and the scale
  // they were recorded on. The scale comes from the record's own source (see
  // resolveScale) — it is never assumed to be the same for every record.
  beforeValue: number | null;
  afterValue: number | null;
  scale: number | null;
  // Display strings built from the above: "2/5", "6/10", "—".
  before: string;
  after: string;
  // Meditation only: what the person marked about how they felt.
  note: string | null;
  tags: string[];
  // updatedAt ?? createdAt — the time shown and used for ordering.
  at: string;
  // Where the record opens.
  target:
    | { kind: "program"; programId: string; itemId: string }
    | { kind: "meditation"; meditationId: string }
    | null;
};

const PRACTICE_SCALE = 10; // content_item_mood_checkins: check (1..10)
const MEDITATION_SCALE = 5; // current meditation check-in: 1..5
// Meditation check-ins used to be recorded on 1–10 before the scale was
// unified to 1–5 (see lib/meditationMoodCheckins.ts), so older rows hold
// values above 5. Such a row is shown on its real 1–10 scale instead of as
// an impossible "10/5". Anything beyond 10 has no known scale (null).
export function resolveScale(source: StateChangeSource, values: (number | null)[]): number | null {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  if (source === "practice") return max <= PRACTICE_SCALE ? PRACTICE_SCALE : null;
  if (max <= MEDITATION_SCALE) return MEDITATION_SCALE;
  if (max <= 10) return 10;
  return null;
}

const show = (n: number | null, scale: number | null) =>
  n === null ? "—" : scale === null ? String(n) : `${n}/${scale}`;
const time = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : -Infinity;
};

export function buildStateChanges(
  practice: MoodCheckInRecord[],
  meditation: MeditationMoodCheckInRecord[]
): StateChange[] {
  const fromPractice = practice.map((m): StateChange => {
    const scale = resolveScale("practice", [m.beforeValue, m.afterValue]);
    return {
      key: `practice-${m.id}`,
      source: "practice",
      context: [m.programTitle, m.itemTitle].filter(Boolean).join(" · ") || null,
      measure: "Самопочуття",
      beforeValue: m.beforeValue,
      afterValue: m.afterValue,
      scale,
      before: show(m.beforeValue, scale),
      after: show(m.afterValue, scale),
      note: null,
      tags: [],
      at: m.updatedAt ?? m.createdAt,
      target: m.programId ? { kind: "program", programId: m.programId, itemId: m.contentItemId } : null,
    };
  });
  const fromMeditation = meditation.map((m): StateChange => {
    const scale = resolveScale("meditation", [m.beforeValue, m.afterValue]);
    return {
      key: `meditation-${m.id}`,
      source: "meditation",
      context: m.meditationTitle,
      measure: "Напруга",
      beforeValue: m.beforeValue,
      afterValue: m.afterValue,
      scale,
      before: show(m.beforeValue, scale),
      after: show(m.afterValue, scale),
      note: m.changeNote ? parseChangeNote(m.changeNote).map(optionLabel).join(", ") : null,
      tags: m.states.map(optionLabel),
      at: m.updatedAt ?? m.createdAt,
      target: { kind: "meditation", meditationId: m.meditationId },
    };
  });
  // Newest first; ties keep their order (practice records first).
  return [...fromPractice, ...fromMeditation]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ta = time(a.entry.at);
      const tb = time(b.entry.at);
      return ta === tb ? a.index - b.index : tb > ta ? 1 : -1;
    })
    .map((x) => x.entry);
}

export const STATE_SOURCE_LABEL: Record<StateChangeSource, string> = {
  practice: "Практика",
  meditation: "Медитація",
};

// Most recent real record of any kind, for the small line under the intro.
export type LatestRecord = { label: string; at: string };

export function latestRecord(
  candidates: { label: string; at: string | null | undefined }[]
): LatestRecord | null {
  let best: LatestRecord | null = null;
  for (const c of candidates) {
    if (!c.at || !Number.isFinite(new Date(c.at).getTime())) continue;
    if (!best || time(c.at) > time(best.at)) best = { label: c.label, at: c.at };
  }
  return best;
}

// A StateChange key is "<source>-<row id>"; this is the one place that turns
// it back into the table row to delete (see ParticipantReflections).
export function parseStateChangeKey(key: string): { source: StateChangeSource; id: string } | null {
  for (const source of ["practice", "meditation"] as const) {
    const prefix = `${source}-`;
    if (key.startsWith(prefix) && key.length > prefix.length) return { source, id: key.slice(prefix.length) };
  }
  return null;
}
