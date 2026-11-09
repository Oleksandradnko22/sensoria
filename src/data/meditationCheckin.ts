// Vocabulary of the meditation check-in (2026-10-06). The database stores a
// stable KEY per option, never the label shown on screen, so rewording a
// label does not break old entries. Same principle as guide block ids:
// published keys are immutable; a reworded label stays the same key, a
// semantically different option gets a new key.
//
// History: entries written before keys existed stored the Ukrainian label
// itself. `legacyLabels` keeps every label an option ever had, so old rows
// still resolve to the right key when read (normalizeOption).

export type CheckinOption = { key: string; label: string; legacyLabels?: string[] };

// "Що зараз найближче до вас?" (before the practice)
export const FEELING_OPTIONS: CheckinOption[] = [
  { key: "anxious", label: "Тривожно" },
  { key: "tense", label: "Напружено" },
  { key: "tired", label: "Втомлено" },
  { key: "cant_focus", label: "Не можу зосередитись" },
  { key: "cant_sleep", label: "Важко заснути" },
  { key: "want_quiet", label: "Просто хочу побути в тиші" },
];

// "Що змінилося?" (after the practice)
export const CHANGE_OPTIONS: CheckinOption[] = [
  { key: "calmer", label: "Стало спокійніше" },
  { key: "fewer_thoughts", label: "Думок стало менше" },
  { key: "more_support", label: "Відчуваю більше опори" },
  { key: "little_changed", label: "Майже нічого не змінилося" },
  { key: "hard_to_say", label: "Важко сказати" },
];

// The single text column `change_note` holds several keys.
export const CHANGE_NOTE_DELIMITER = ", ";

const ALL = [...FEELING_OPTIONS, ...CHANGE_OPTIONS];

// A stored value (a key, or an old label) → the key. Unknown text is kept
// as is — never dropped, never rewritten into something else.
export function normalizeOption(value: string): string {
  const v = value.trim();
  const hit = ALL.find((o) => o.key === v || o.label === v || o.legacyLabels?.includes(v));
  return hit ? hit.key : v;
}

// A key (or unknown stored text) → what to show.
export function optionLabel(value: string): string {
  const key = normalizeOption(value);
  return ALL.find((o) => o.key === key)?.label ?? value;
}

export function parseChangeNote(note: string | null | undefined): string[] {
  if (!note) return [];
  return note
    .split(CHANGE_NOTE_DELIMITER)
    .map(normalizeOption)
    .filter(Boolean);
}

export function joinChangeNote(keys: string[]): string {
  return keys.join(CHANGE_NOTE_DELIMITER);
}

export function normalizeStates(states: string[] | null | undefined): string[] {
  return (states ?? []).map(normalizeOption);
}

// One scale for before and after: 1 = tense … 5 = calm.
export const MOOD_MIN = 1;
export const MOOD_MAX = 5;
