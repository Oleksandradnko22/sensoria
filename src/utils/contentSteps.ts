// Step-by-step creation of a program, a meditation and a guide: the steps of each, the words that change between
// them (gender: «ця програма», «ця медитація», «цей гайд») and the checks of the steps only a meditation / a guide has.
// Pure, so it is tested without the editor.

import type { ContentType } from "../data/authorDashboard.ts";
import { MIN_TRANSCRIPT_CHARS } from "./meditationTranscript.ts";

export const PROGRAM_STEP_LABELS = [
  "Назва та опис", "Вартість", "Категорії", "Що ви отримаєте", "Обкладинка",
  "Відео-презентація", "Використання ШІ", "Теми ризику", "Модулі та уроки",
] as const;
export const MEDITATION_STEP_LABELS = [
  "Назва та опис", "Вартість", "Категорії", "Обкладинка", "Аудіо та про запис", "Текст практики", "Теми ризику",
] as const;
export const GUIDE_STEP_LABELS = [
  "Назва та опис", "Вартість", "Категорії", "Обкладинка", "PDF та про гайд", "Кому підійде гайд", "Теми ризику",
] as const;

export type StepKey =
  | "title" | "price" | "categories" | "benefits" | "cover" | "video" | "ai" | "risk" | "modules"
  | "audio" | "practice" | "file" | "about";

const KEYS: Record<ContentType, readonly StepKey[]> = {
  program: ["title", "price", "categories", "benefits", "cover", "video", "ai", "risk", "modules"],
  meditation: ["title", "price", "categories", "cover", "audio", "practice", "risk"],
  guide: ["title", "price", "categories", "cover", "file", "about", "risk"],
};

export const stepLabelsFor = (t: ContentType): readonly string[] =>
  t === "program" ? PROGRAM_STEP_LABELS : t === "meditation" ? MEDITATION_STEP_LABELS : GUIDE_STEP_LABELS;
export const stepKeysFor = (t: ContentType): readonly StepKey[] => KEYS[t];
/** 1-based number of a step of this kind of material, 0 when it has no such step. */
export const stepNumber = (t: ContentType, key: StepKey): number => KEYS[t].indexOf(key) + 1;

/** The same words in the right gender for each kind. */
export interface Words {
  /** «програми» */ gen: string;
  /** «програму» */ acc: string;
  /** «програма» (lower case) */ nom: string;
  /** «Ця програма» */ dem: string;
  /** «Платна програма» */ paid: string;
  /** «вашої програми» */ your: string;
  /** «її» / «його»: for «за ними її знаходять» */ pron: string;
  /** «таку програму» */ suchAcc: string;
  /** «Програма вже опублікована» */ publishedNote: string;
  /** «Ця програма буде доступна безкоштовно.» */ freeNote: string;
  /** «Програма була безкоштовна, а тепер стане платною.» */ toPaid: string;
  /** «Програма була платною, а тепер стане безкоштовною.» */ toFree: string;
  /** a title typed as an example */ exampleTitle: string;
  exampleText: string;
  descPlaceholder: string;
  descTip: string;
  coverNote: string;
}

const WORDS: Record<ContentType, Words> = {
  program: {
    gen: "програми", acc: "програму", nom: "програма", dem: "Ця програма", paid: "Платна програма", your: "вашої програми", pron: "її", suchAcc: "таку програму",
    publishedNote: "Програма вже опублікована", freeNote: "Ця програма буде доступна безкоштовно.",
    toPaid: "Програма була безкоштовна, а тепер стане платною.", toFree: "Програма була платною, а тепер стане безкоштовною.",
    exampleTitle: "Робота з тривожністю",
    exampleText: "Для тих, хто хоче спокійніше реагувати на тривогу щодня: прості практики й підтримка в запиті.",
    descPlaceholder: "Коротко: про що програма, для кого і який результат дає",
    descTip: "Для кого програма, з яким запитом працює і що отримає учасник.",
    coverNote: "Програму можна опублікувати й без неї: тоді в каталозі буде стандартна обкладинка Sensoria. Але такі програми зазвичай помічають менше, тому радимо додати власну.",
  },
  meditation: {
    gen: "медитації", acc: "медитацію", nom: "медитація", dem: "Ця медитація", paid: "Платна медитація", your: "вашої медитації", pron: "її", suchAcc: "таку медитацію",
    publishedNote: "Медитація вже опублікована", freeNote: "Ця медитація буде доступна безкоштовно.",
    toPaid: "Медитація була безкоштовна, а тепер стане платною.", toFree: "Медитація була платною, а тепер стане безкоштовною.",
    exampleTitle: "Вечірнє заспокоєння",
    exampleText: "Спокійна голосова практика на 10 хвилин, щоб відпустити напругу дня й підготуватися до сну.",
    descPlaceholder: "Коротко: про що ця практика, кому підійде і що відчує слухач",
    descTip: "Для кого практика, в яких ситуаціях допоможе і що відчує слухач.",
    coverNote: "Медитацію можна опублікувати й без неї: тоді в каталозі буде стандартна обкладинка Sensoria. Але такі медитації зазвичай помічають менше, тому радимо додати власну.",
  },
  guide: {
    gen: "гайду", acc: "гайд", nom: "гайд", dem: "Цей гайд", paid: "Платний гайд", your: "вашого гайду", pron: "його", suchAcc: "такий гайд",
    publishedNote: "Гайд вже опублікований", freeNote: "Цей гайд буде доступний безкоштовно.",
    toPaid: "Гайд був безкоштовний, а тепер стане платним.", toFree: "Гайд був платним, а тепер стане безкоштовним.",
    exampleTitle: "Як пережити тривожний день",
    exampleText: "Короткий практичний гайд із вправами, які можна робити самостійно, коли тривога наростає.",
    descPlaceholder: "Коротко: про що гайд, кому він підійде і що дасть читачеві",
    descTip: "Для кого гайд, з яким запитом допомагає і що отримає читач.",
    coverNote: "Гайд можна опублікувати й без неї: тоді в каталозі буде стандартна обкладинка Sensoria. Але такі гайди зазвичай помічають менше, тому радимо додати власну.",
  },
};
export const wordsFor = (t: ContentType): Words => WORDS[t];

// ── checks of the steps that only a meditation or a guide has (the same texts as the publish check) ──

export const MEDITATION_MAX_MINUTES = 60;
/** Biggest audio file of a meditation: about an hour of mp3, so the player and downloads stay fast. */
export const MEDITATION_MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const GUIDE_MAX_PAGES = 500;

const isPaidRef = (url: string) => url.startsWith("paid:");

/** A paid material keeps its file in the private storage, a free one in the public: a changed price needs the file again. */
export function fileVisibilityProblem(fileUrl: string | null | undefined, price: number): string | null {
  if (!fileUrl || !fileUrl.trim() || !Number.isFinite(price)) return null;
  const priv = isPaidRef(fileUrl);
  if (price > 0 && !priv) return "Матеріал платний, а файл завантажено як відкритий. Завантажте файл ще раз, щоб він був захищений.";
  if (price === 0 && priv) return "Матеріал безкоштовний, а файл захищений. Завантажте файл ще раз, щоб його могли відкрити.";
  return null;
}

export function meditationAudioProblems(a: { fileUrl: string | null | undefined; durationMinutes: string; price: number }): string[] {
  const out: string[] = [];
  if (!a.fileUrl || !a.fileUrl.trim()) out.push("Завантажте аудіо медитації.");
  const d = Number(a.durationMinutes);
  if (!a.durationMinutes.trim() || !Number.isFinite(d) || Math.round(d) < 1) out.push("Вкажіть тривалість у хвилинах.");
  else if (Math.round(d) > MEDITATION_MAX_MINUTES) out.push(`Тривалість не більше ${MEDITATION_MAX_MINUTES} хвилин.`);
  const v = fileVisibilityProblem(a.fileUrl, a.price);
  if (v) out.push(v);
  return out;
}

export const TRANSCRIPT_MAX_CHARS = 20000;

// «Коли підійде»: situations in which the practice helps, shown to participants as a short list.
export const WHEN_MIN_ITEMS = 3;
export const WHEN_MAX_ITEMS = 5;
export const WHEN_ITEM_MIN = 5;
export const WHEN_ITEM_MAX = 100;

export function meditationWhenProblems(items: readonly string[]): string[] {
  const filled = items.map((i) => i.trim()).filter(Boolean);
  if (filled.length < WHEN_MIN_ITEMS) return [`Додайте щонайменше ${WHEN_MIN_ITEMS} пункти: коли підійде ця практика.`];
  if (filled.length > WHEN_MAX_ITEMS) return [`Пунктів не більше ${WHEN_MAX_ITEMS}.`];
  const short = filled.findIndex((i) => i.length < WHEN_ITEM_MIN);
  if (short >= 0) return [`Пункт ${short + 1} закороткий: від ${WHEN_ITEM_MIN} символів.`];
  if (filled.some((i) => i.length > WHEN_ITEM_MAX)) return [`Кожен пункт не довший за ${WHEN_ITEM_MAX} символів.`];
  return [];
}

/** The text of the practice is optional: empty is fine, but a started text must be real and not huge. */
export function meditationTranscriptProblems(text: string): string[] {
  const n = text.trim().length;
  if (n === 0) return [];
  if (n < MIN_TRANSCRIPT_CHARS) return [`Текст практики закороткий: від ${MIN_TRANSCRIPT_CHARS} символів. Або залиште поле порожнім.`];
  if (n > TRANSCRIPT_MAX_CHARS) return [`Текст практики задовгий: не більше ${TRANSCRIPT_MAX_CHARS} символів.`];
  return [];
}

export function guideFileProblems(g: { fileUrl: string | null | undefined; pages: string; price: number; structured: boolean }): string[] {
  if (g.structured) return []; // a guide made by Sensoria has no PDF to upload
  const out: string[] = [];
  if (!g.fileUrl || !g.fileUrl.trim()) out.push("Завантажте PDF-файл гайду.");
  const pages = Math.round(Number(g.pages));
  if (!g.pages.trim() || !Number.isFinite(pages) || pages < 1) out.push("Вкажіть кількість сторінок.");
  else if (pages > GUIDE_MAX_PAGES) out.push(`Сторінок не більше ${GUIDE_MAX_PAGES}.`);
  const v = fileVisibilityProblem(g.fileUrl, g.price);
  if (v) out.push(v);
  return out;
}
