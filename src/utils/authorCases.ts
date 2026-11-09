// «Кейси»: a published case is a short, anonymised story the author wrote.
// Existing fields are reused (situation = «Запит», approach = «Що може
// допомогти»); the rest lives in one optional `details` object. Nothing here
// invents content: a part the author did not write is simply absent.
import { categoryLabels } from "../data/categoryLabels.ts";
import { containsContactInfo } from "./contactFilter.ts";

export type CaseDetails = {
  topic: string; // a key of categoryLabels, or ""
  summary: string;
  focus: string;
  context: string;
  process: string;
  changes: string;
  useful: string;
  tags: string[];
  order: number | null; // manual position in the author's list (0 = first)
  reviewImages: string[]; // optional anonymous review screenshots (public URLs, up to 3)
};
export const EMPTY_CASE_DETAILS: CaseDetails = { topic: "", summary: "", focus: "", context: "", process: "", changes: "", useful: "", tags: [], order: null, reviewImages: [] };

export const CASE_LIMITS = {
  title: { min: 5, max: 160 },
  summary: 160,
  section: { min: 2 }, // how many of the 7 sections must be filled
  sectionChars: 30, // a filled section needs at least this many characters
  situation: 600, // the existing column limit
  approach: 800, // the existing column limit
  focus: 300,
  context: 500,
  process: 600,
  changes: 400,
  useful: 400,
  tags: { items: 3, min: 3, max: 30 },
  reviews: 3,
} as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const reviewUrls = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .filter((x): x is string => typeof x === "string" && /^(https?:\/\/|\/)/.test(x))
    .map((x) => x.slice(0, 600))
    .slice(0, CASE_LIMITS.reviews);

// Reads whatever is stored (null / old / odd shapes) into a safe object.
export function normalizeCaseDetails(raw: unknown): CaseDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_CASE_DETAILS, tags: [] };
  const r = raw as Record<string, unknown>;
  const topic = typeof r.topic === "string" && r.topic in categoryLabels ? r.topic : "";
  const tags = (Array.isArray(r.tags) ? r.tags : [])
    .map((x) => str(x, CASE_LIMITS.tags.max))
    .filter((x) => x.length >= CASE_LIMITS.tags.min)
    .slice(0, CASE_LIMITS.tags.items);
  return {
    topic,
    summary: str(r.summary, CASE_LIMITS.summary),
    focus: str(r.focus, CASE_LIMITS.focus),
    context: str(r.context, CASE_LIMITS.context),
    process: str(r.process, CASE_LIMITS.process),
    changes: str(r.changes, CASE_LIMITS.changes),
    useful: str(r.useful, CASE_LIMITS.useful),
    tags,
    order: Number.isInteger(r.order) && (r.order as number) >= 0 && (r.order as number) < 1000 ? (r.order as number) : null,
    reviewImages: reviewUrls(r.reviewImages ?? r.reviewImage),
  };
}

export const hasCaseDetails = (d: CaseDetails) => !!(d.topic || d.summary || d.focus || d.context || d.process || d.changes || d.useful || d.tags.length || d.reviewImages.length || d.order !== null);

type CaseLike = { title: string; situation: string; approach: string; details: CaseDetails };

// The three-part narrative of a card. A part appears ONLY when the author wrote it.
export type NarrativeKey = "request" | "focus" | "helps";
export function caseNarrative(c: CaseLike): { key: NarrativeKey; label: string; text: string }[] {
  const parts: { key: NarrativeKey; label: string; text: string }[] = [
    { key: "request", label: "Запит", text: c.situation.trim() },
    { key: "focus", label: "Фокус роботи", text: c.details.focus.trim() },
    { key: "helps", label: "Що допомогло", text: c.approach.trim() },
  ];
  return parts.filter((p) => p.text);
}

// The category label and a few tags for a card (never the category twice).
export function caseLabels(c: Pick<CaseLike, "details">): { category: string; tags: string[] } {
  const category = c.details.topic ? categoryLabels[c.details.topic as keyof typeof categoryLabels] : "";
  const tags = c.details.tags.filter((t) => t.toLowerCase() !== category.toLowerCase());
  return { category, tags };
}

// Sections of the full case, in reading order, only those the author wrote.
export function caseSections(c: CaseLike): { label: string; text: string }[] {
  const all = [
    { label: "Контекст", text: c.details.context },
    { label: "Запит", text: c.situation },
    { label: "Фокус роботи", text: c.details.focus },
    { label: "Як відбувалася робота", text: c.details.process },
    { label: "Що змінилося", text: c.details.changes },
    { label: "Що допомогло", text: c.approach },
    { label: "Що може бути корисним іншим", text: c.details.useful },
  ];
  return all.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

export type CaseInput = { title: string; situation: string; approach: string; details: CaseDetails };
export type CaseResult = { ok: true } | { ok: false; error: string };

const over = (name: string, v: string, max: number) => (v.trim().length > max ? `${name}: не більше ${max} символів (зараз ${v.trim().length}).` : null);

// Save-time checks: length limits, at least a request or what helps, and no contact
// details in any text (the SAME detector the private messages and posts use).
export function validateCase(c: CaseInput): CaseResult {
  const d = c.details;
  const title = c.title.trim();
  if (title.length === 0) return { ok: false, error: "Вкажіть назву кейсу." };
  if (title.length < CASE_LIMITS.title.min) return { ok: false, error: `Назва закоротка (щонайменше ${CASE_LIMITS.title.min} символів).` };
  const e =
    over("Назва", c.title, CASE_LIMITS.title.max) ??
    over("Короткий опис", d.summary, CASE_LIMITS.summary) ??
    over("Запит", c.situation, CASE_LIMITS.situation) ??
    over("Фокус роботи", d.focus, CASE_LIMITS.focus) ??
    over("Що допомогло", c.approach, CASE_LIMITS.approach) ??
    over("Контекст", d.context, CASE_LIMITS.context) ??
    over("Як відбувалася робота", d.process, CASE_LIMITS.process) ??
    over("Що змінилося", d.changes, CASE_LIMITS.changes) ??
    over("Що може бути корисним іншим", d.useful, CASE_LIMITS.useful);
  if (e) return { ok: false, error: e };
  // the author picks which sections to write: any, but at least two, each meaningful
  const secs: [string, string][] = [["Контекст", d.context], ["Запит", c.situation], ["Фокус роботи", d.focus], ["Як відбувалася робота", d.process], ["Що змінилося", d.changes], ["Що допомогло", c.approach], ["Що може бути корисним іншим", d.useful]];
  const filled = secs.filter(([, t]) => t.trim());
  const short = filled.find(([, t]) => t.trim().length < CASE_LIMITS.sectionChars);
  if (short) return { ok: false, error: `${short[0]}: щонайменше ${CASE_LIMITS.sectionChars} символів (або залиште розділ порожнім).` };
  if (filled.length < CASE_LIMITS.section.min) return { ok: false, error: `Заповніть щонайменше ${CASE_LIMITS.section.min} розділи кейсу.` };
  if (d.tags.length > CASE_LIMITS.tags.items) return { ok: false, error: `Теги: не більше ${CASE_LIMITS.tags.items}.` };
  const badTag = d.tags.find((t) => t.trim().length < CASE_LIMITS.tags.min || t.trim().length > CASE_LIMITS.tags.max);
  if (badTag) return { ok: false, error: `Кожен тег: від ${CASE_LIMITS.tags.min} до ${CASE_LIMITS.tags.max} символів.` };
  const all = [c.title, c.situation, c.approach, d.summary, d.focus, d.context, d.process, d.changes, d.useful, ...d.tags].join("\n");
  if (containsContactInfo(all)) return { ok: false, error: "Кейс має бути знеособленим: приберіть телефони, пошту, посилання, адреси та інші контакти." };
  return { ok: true };
}

// What goes to the database: the `details` object, or null when nothing was written.
export function detailsForSave(d: CaseDetails): Record<string, unknown> | null {
  const n = normalizeCaseDetails(d);
  return hasCaseDetails(n) ? { ...n } : null;
}

// Public list: a case that does not pass the save rules (legacy / hand-edited rows:
// fewer than two sections, too-short text, contact details) stays stored but is not shown.
export const publishableCases = <T extends CaseInput>(list: T[]): T[] => list.filter((c) => validateCase(c).ok);

// Manual order first (lowest number first), cases without one keep their stored order at the end.
export function sortCases<T extends { details: CaseDetails }>(list: T[]): T[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.details.order ?? Infinity) - (b.c.details.order ?? Infinity) || a.i - b.i)
    .map((x) => x.c);
}
