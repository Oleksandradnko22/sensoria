// Pure helpers for an author's structured professional background
// (education / training / certificates, work experience). No supabase here.
// Nothing is computed that the author did not state: no "X years of
// experience", no verification claims.

export type CredentialKind = "education" | "training" | "certificate";

// Level of a higher-education record (author-credentials-degree-migration.sql).
export type DegreeLevel = "bachelor" | "master" | "specialist" | "phd";
export const DEGREE_LABEL: Record<DegreeLevel, string> = {
  bachelor: "Бакалавр",
  specialist: "Спеціаліст",
  master: "Магістр",
  phd: "Доктор філософії",
};
export const DEGREE_RANK: Record<DegreeLevel, number> = { bachelor: 1, specialist: 2, master: 3, phd: 4 };
export const isDegreeLevel = (v: unknown): v is DegreeLevel => typeof v === "string" && v in DEGREE_LABEL;

export type AuthorCredential = {
  id: string;
  kind: CredentialKind;
  degree: DegreeLevel | null; // education only
  title: string;
  issuer: string;
  year: number | null;
  description: string;
  imageUrl: string | null;
  isPublic: boolean;
};

export type AuthorExperience = {
  id: string;
  organization: string;
  role: string;
  description: string;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  isPublic: boolean;
};

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  education: "Освіта",
  training: "Курс",
  certificate: "Сертифікат",
};

// Sample-data marker «[demo]» is never shown to visitors.
export const plainTitle = (t: string): string => t.replace(/^\s*\[demo\]\s*/i, "").trim();

// A description is shown only when it says something (not «-», «.», «ok»).
export const isMeaningfulText = (t: string | null | undefined): boolean => {
  const x = (t ?? "").trim();
  return x.length >= 12 && /\p{L}{3,}/u.test(x);
};

// Work description = a short paragraph + «основні напрями роботи» (up to 5 short
// tags). Both live in the one `description` column: the tags are the lines that
// start with «- » / «• », everything else is the paragraph. No extra column.
export const EXPERIENCE_AREAS_MAX = 6;
export const EXPERIENCE_AREA_MIN = 3;
export const EXPERIENCE_AREA_MAX = 40;
export const EXPERIENCE_TEXT_MAX = 280;
export const EXPERIENCE_TEXT_HINT = [100, 220] as const; // recommended length, not a target
const BULLET = /^\s*[-•*–—]\s+/;
export function parseExperienceText(t: string | null | undefined): { text: string; areas: string[] } {
  const lines = (t ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const areas = lines.filter((x) => BULLET.test(x)).map((x) => x.replace(BULLET, "").trim()).filter(Boolean);
  const text = lines.filter((x) => !BULLET.test(x)).join(" ");
  return { text: isMeaningfulText(text) ? text : "", areas: areas.slice(0, EXPERIENCE_AREAS_MAX) };
}
export function composeExperienceText(text: string, areas: string[]): string {
  return [text.trim(), ...areas.map((x) => x.trim()).filter(Boolean).map((x) => `- ${x}`)].filter(Boolean).join("\n");
}

// «Освіта» vs «Сертифікати та курси» — the two public sub-tabs.
export function splitCredentials<T extends { kind: CredentialKind }>(list: T[]): { education: T[]; certificates: T[] } {
  return {
    education: list.filter((c) => c.kind === "education"),
    certificates: list.filter((c) => c.kind !== "education"),
  };
}

// Anonymised case story written by the author.
import type { CaseDetails } from "./authorCases.ts";
export type AuthorCase = {
  id: string;
  title: string;
  situation: string; // «Запит» — what people come with
  approach: string; // «Що допомагає» — how the author works with it
  contentKind: "program" | "guide" | "meditation" | null;
  contentId: string | null;
  details: CaseDetails; // optional extras (topic, summary, focus, …) — see utils/authorCases.ts
  isPublic: boolean;
};

export function validateCaseInput(c: { title: string; situation: string; approach: string }): ValidationResult {
  if (!c.title.trim()) return { ok: false, error: "Вкажіть назву кейсу." };
  if (!c.situation.trim() && !c.approach.trim()) return { ok: false, error: "Опишіть запит або те, що допомагає." };
  return { ok: true };
}

const KIND_ORDER: CredentialKind[] = ["education", "training", "certificate"];

// Education first, then training, then certificates; newest first inside a kind.
export function sortCredentials<T extends Pick<AuthorCredential, "kind" | "year">>(list: T[]): T[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.c.kind) - KIND_ORDER.indexOf(b.c.kind) ||
        (b.c.year ?? -1) - (a.c.year ?? -1) ||
        a.i - b.i
    )
    .map((x) => x.c);
}

// Current position first, then by start year (newest first); stable otherwise.
export function sortExperience<T extends Pick<AuthorExperience, "startYear" | "endYear" | "isCurrent">>(list: T[]): T[] {
  const key = (e: T) => (e.isCurrent ? 10000 : (e.endYear ?? e.startYear ?? -1));
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => key(b.e) - key(a.e) || (b.e.startYear ?? -1) - (a.e.startYear ?? -1) || a.i - b.i)
    .map((x) => x.e);
}

// "2019 — зараз" · "2016 — 2019" · "з 2020" · "до 2018" · "2021" · "" (unknown)
export function periodLabel(e: Pick<AuthorExperience, "startYear" | "endYear" | "isCurrent">): string {
  const { startYear: s, endYear: end, isCurrent } = e;
  if (isCurrent) return s ? `${s} — зараз` : "Зараз";
  if (s && end) return s === end ? `${s}` : `${s} — ${end}`;
  if (s) return `з ${s}`;
  if (end) return `до ${end}`;
  return "";
}

// The period split over two lines: «2016 -» / «2019», «2019 -» / «зараз»; a single date stays on one line.
export function periodLines(e: Pick<AuthorExperience, "startYear" | "endYear" | "isCurrent">): string[] {
  const { startYear: s, endYear: end, isCurrent } = e;
  if (s && isCurrent) return [`${s} -`, "зараз"];
  if (s && end) return s === end ? [`${s}`] : [`${s} -`, `${end}`];
  const one = periodLabel(e);
  return one ? [one] : [];
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

const thisYear = () => new Date().getFullYear();
// a four-digit year, 1950 … the current year (nothing is completed in the future)
const yearValid = (y: number | null, now = thisYear()) => y !== null && Number.isInteger(y) && y >= 1950 && y <= now;
const YEAR_ERROR = "Вкажіть коректний рік (від 1950 до поточного).";

// Character limits (spaces included) for the TEXT FIELDS the author types in
// «Освіта та кваліфікація» and «Професійний досвід». Nothing else is limited:
// not the headings, the dates the interface formats, or the uploaded documents.
// ONE source: the form counters, the save validation, the public-profile
// filter and (as CHECK constraints) the database
// (author-background-limits-migration.sql).
export type Range = { min: number; max: number };
export const CREDENTIAL_LIMITS: Record<CredentialKind, { title: Range; issuer: Range; description: Range }> = {
  // every field is required: title, institution, description, year and the document picture
  education: { title: { min: 10, max: 80 }, issuer: { min: 2, max: 100 }, description: { min: 30, max: 160 } },
  training: { title: { min: 10, max: 100 }, issuer: { min: 2, max: 100 }, description: { min: 30, max: 160 } },
  certificate: { title: { min: 10, max: 100 }, issuer: { min: 2, max: 100 }, description: { min: 30, max: 160 } },
};
export const EXPERIENCE_LIMITS = {
  role: { min: 5, max: 80 },
  organization: { min: 2, max: 100 },
} as const;
export const EXPERIENCE_TEXT_MIN = 60; // the work description is required: 60–280 characters
export const EXPERIENCE_AREAS_MIN = 2; // at least two main areas of work

const trimmed = (v: string | null | undefined) => (v ?? "").trim();

// null = fine. Required: needs min…max. Optional: empty is fine, otherwise min…max.
function rangeIssue(v: string, r: Range, o: { optional?: boolean; empty: string; short: string; long: string }): string | null {
  const n = trimmed(v).length;
  if (n === 0) return o.optional ? null : o.empty;
  if (n < r.min) return `${o.short} (щонайменше ${r.min} символів, зараз ${n}).`;
  if (n > r.max) return `${o.long}: не більше ${r.max} символів (зараз ${n}). Скоротіть текст.`;
  return null;
}

export type CredentialField = "title" | "issuer" | "description" | "year" | "document";
export type CredentialInput = { kind: CredentialKind; title: string; issuer: string; description?: string; year: number | null; hasDocument: boolean };

const TITLE_MSG: Record<CredentialKind, { empty: string; short: string; long: string }> = {
  education: { empty: "Вкажіть назву кваліфікації.", short: "Назва кваліфікації закоротка", long: "Кваліфікація" },
  training: { empty: "Вкажіть назву курсу.", short: "Назва курсу закоротка", long: "Назва курсу" },
  certificate: { empty: "Вкажіть назву сертифіката.", short: "Назва сертифіката закоротка", long: "Назва сертифіката" },
};
const ISSUER_MSG: Record<CredentialKind, { empty: string; short: string }> = {
  education: { empty: "Вкажіть назву навчального закладу.", short: "Назва закладу закоротка" },
  training: { empty: "Вкажіть, хто проводив курс.", short: "Назва організації закоротка" },
  certificate: { empty: "Вкажіть організацію, яка видала сертифікат.", short: "Назва організації закоротка" },
};

// All parts are required: title, institution, description, year, and the document picture.
export function credentialErrors(c: CredentialInput, now = thisYear()): Partial<Record<CredentialField, string>> {
  const L = CREDENTIAL_LIMITS[c.kind];
  const e: Partial<Record<CredentialField, string>> = {};
  const t = TITLE_MSG[c.kind];
  const title = rangeIssue(c.title, L.title, { empty: t.empty, short: t.short, long: t.long });
  if (title) e.title = title;
  const i = ISSUER_MSG[c.kind];
  const issuer = rangeIssue(c.issuer, L.issuer, { empty: i.empty, short: i.short, long: "Заклад чи організація" });
  if (issuer) e.issuer = issuer;
  const d = rangeIssue(c.description ?? "", L.description, { empty: "Додайте короткий опис.", short: "Опис закороткий", long: "Опис" });
  if (d) e.description = d;
  if (!yearValid(c.year, now)) e.year = YEAR_ERROR;
  if (!c.hasDocument) e.document = "Додайте зображення документа.";
  return e;
}

const firstError = (e: Record<string, string | undefined>): string | null => Object.values(e).find(Boolean) ?? null;

export function validateCredentialInput(c: CredentialInput, now = thisYear()): ValidationResult {
  const err = firstError(credentialErrors(c, now));
  return err ? { ok: false, error: err } : { ok: true };
}

export type ExperienceField = "role" | "organization" | "start" | "end" | "description" | "areas";
export type ExperienceInput = {
  organization: string; role: string; startYear: number | null; endYear: number | null; isCurrent: boolean; description?: string; areas?: string[];
};

// All parts are required: role, organisation, years, the description and at least one main area of work.
export function experienceErrors(e: ExperienceInput, now = thisYear()): Partial<Record<ExperienceField, string>> {
  const out: Partial<Record<ExperienceField, string>> = {};
  const role = rangeIssue(e.role, EXPERIENCE_LIMITS.role, { empty: "Вкажіть посаду.", short: "Посада закоротка", long: "Посада" });
  if (role) out.role = role;
  const org = rangeIssue(e.organization, EXPERIENCE_LIMITS.organization, { empty: "Вкажіть організацію або місце роботи.", short: "Назва організації закоротка", long: "Організація" });
  if (org) out.organization = org;
  if (e.startYear === null) out.start = "Вкажіть рік початку.";
  else if (!yearValid(e.startYear, now)) out.start = YEAR_ERROR;
  if (!e.isCurrent) {
    if (e.endYear === null) out.end = "Вкажіть рік завершення або позначте «Працюю тут зараз».";
    else if (!yearValid(e.endYear, now)) out.end = YEAR_ERROR;
    else if (e.startYear !== null && e.endYear < e.startYear) out.end = "Дата завершення не може бути раніше дати початку.";
  }
  const d = rangeIssue(e.description ?? "", { min: EXPERIENCE_TEXT_MIN, max: EXPERIENCE_TEXT_MAX }, { empty: "Опишіть, що ви робили.", short: "Опис закороткий", long: "Опис" });
  if (d) out.description = d;
  const areas = (e.areas ?? []).map((x) => x.trim()).filter(Boolean);
  if (areas.length < EXPERIENCE_AREAS_MIN) out.areas = `Додайте щонайменше ${EXPERIENCE_AREAS_MIN} напрями роботи (зараз ${areas.length}).`;
  else if (areas.length > EXPERIENCE_AREAS_MAX) out.areas = `Основні напрями: не більше ${EXPERIENCE_AREAS_MAX}.`;
  else {
    const bad = areas.find((x) => x.length < EXPERIENCE_AREA_MIN || x.length > EXPERIENCE_AREA_MAX);
    if (bad) out.areas = `Кожен напрям: від ${EXPERIENCE_AREA_MIN} до ${EXPERIENCE_AREA_MAX} символів («${bad.slice(0, 24)}»).`;
  }
  return out;
}

export function validateExperienceInput(e: ExperienceInput, now = thisYear()): ValidationResult {
  const err = firstError(experienceErrors(e, now));
  return err ? { ok: false, error: err } : { ok: true };
}

// ── Public profile: only COMPLETE records are shown (every field above is required).
// Incomplete / legacy records stay in the database untouched; the author sees
// them marked «потребує уваги» in the cabinet and can fix or delete them.
// Over-long legacy text does not hide a record: it is shown as stored.
const lenOk = (v: string | null | undefined, r: Range) => trimmed(v).length >= r.min;
export function credentialIssue(c: Pick<AuthorCredential, "kind" | "title" | "issuer" | "year" | "description" | "imageUrl">, now = thisYear()): string | null {
  const L = CREDENTIAL_LIMITS[c.kind];
  const e = credentialErrors({ kind: c.kind, title: c.title, issuer: c.issuer, description: c.description, year: c.year, hasDocument: !!c.imageUrl }, now);
  // too LONG is not a reason to hide; missing / too short is
  const drop = (f: "title" | "issuer" | "description", r: Range) => { if (e[f] && lenOk(c[f], r)) delete e[f]; };
  drop("title", L.title); drop("issuer", L.issuer); drop("description", L.description);
  return firstError(e);
}
export function experienceIssue(x: Pick<AuthorExperience, "organization" | "role" | "description" | "startYear" | "endYear" | "isCurrent">, now = thisYear()): string | null {
  const { text, areas } = parseExperienceText(x.description);
  const e = experienceErrors({ organization: x.organization, role: x.role, startYear: x.startYear, endYear: x.endYear, isCurrent: x.isCurrent, description: text, areas }, now);
  if (e.role && lenOk(x.role, EXPERIENCE_LIMITS.role)) delete e.role;
  if (e.organization && lenOk(x.organization, EXPERIENCE_LIMITS.organization)) delete e.organization;
  if (e.description && lenOk(text, { min: EXPERIENCE_TEXT_MIN, max: EXPERIENCE_TEXT_MAX })) delete e.description;
  if (e.areas && areas.length > EXPERIENCE_AREAS_MAX) delete e.areas;
  return firstError(e);
}
export const publishableCredentials = <T extends Pick<AuthorCredential, "kind" | "title" | "issuer" | "year" | "description" | "imageUrl">>(l: T[], now = thisYear()): T[] => l.filter((c) => credentialIssue(c, now) === null);
export const publishableExperience = <T extends Pick<AuthorExperience, "organization" | "role" | "description" | "startYear" | "endYear" | "isCurrent">>(l: T[], now = thisYear()): T[] => l.filter((x) => experienceIssue(x, now) === null);

// Document images: only common raster formats, bounded size.
export const CREDENTIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export function validateCredentialImage(file: { type: string; size: number }): ValidationResult {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: "Підійде зображення JPG, PNG або WebP." };
  if (file.size > CREDENTIAL_IMAGE_MAX_BYTES) return { ok: false, error: "Файл завеликий (до 5 МБ)." };
  return { ok: true };
}
