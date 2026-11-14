import { riskKeywordHit } from "./riskTopics.ts";

// Lesson content warning = one stored string. Chosen topics live in a leading sentence
// ("Урок може торкатися тем: a, b."), anything the author types follows it.

export const WARNING_TOPICS = [
  "втрата та горе",
  "панічні атаки та тривога",
  "травматичний досвід",
  "дитячі травми",
  "насильство",
  "сексуальне насильство",
  "булінг і приниження",
  "розлади харчової поведінки",
  "війна та військові події",
  "сильні емоції та сльози",
  "гучні звуки",
] as const;

// Topics that mean deep, clinical-level work: only an author with the «Фахівець» status (education documents
// reviewed by Sensoria) may pick them. Self-harm, suicidal thoughts, addictions, death and illness are not offered at all.
export const SPECIALIST_WARNING_TOPICS: readonly string[] = [
  "втрата та горе",
  "травматичний досвід",
  "дитячі травми",
  "насильство",
  "сексуальне насильство",
  "розлади харчової поведінки",
  "війна та військові події",
];

// the same themes typed as own text
const SPECIALIST_WORDS = /(горе|втрат|смерт|помер|насильств|згвалтув|травм|суїцид|самогуб|самоушкодж|залежн|наркот|алкогол|війн|військ|булімі|анорекс)/i;

// themes only a «Фахівець» may write about in posts and polls (mirrors supabase/feeds.sql feed_text_specialist)
export const SPECIALIST_TEXT_RE = /(птср|посттравм|травм|суїцид|самогуб|самоушкодж|розлад[иуіав]* харчов|булімі|анорекс|залежн|наркот|алкогол|діагноз|лікуванн|медикамент|антидепрес|психотерапі|насильств|згвалтув|втрат[аиуі] (близьк|рідн|дитин)|горе(?![а-яіїєґ])|смерт|помер|війн|бойов)/i;
export const SPECIALIST_ONLY_MESSAGE = "Ця тема доступна лише авторам зі статусом «Фахівець». Надішліть документи про освіту в розділі «Модерація» або оберіть іншу тему.";

export const isSpecialistWarningTopic = (topic: string): boolean => SPECIALIST_WARNING_TOPICS.includes(topic);

/** True when a lesson warning may be used only by a «Фахівець»: a specialist topic, a topic no longer offered
 *  (old data: self-harm, suicidal thoughts, addictions, death and illness), or own text with obvious high-risk words. */
export function warningNeedsSpecialist(text: string | undefined): boolean {
  const { topics, custom } = parseWarning(text);
  const open = new Set<string>(WARNING_TOPICS.filter((w) => !isSpecialistWarningTopic(w)));
  return topics.some((t) => !open.has(t)) || riskKeywordHit(custom) || SPECIALIST_WORDS.test(custom);
}

export const SPECIALIST_WARNING_MESSAGE = "ця тема попередження доступна лише авторам зі статусом «Фахівець». Оберіть іншу тему або надішліть документи про освіту в розділі «Модерація».";

// One warning per lesson: either one topic from the list or the author's own short text.
export const MAX_WARNING_CUSTOM_CHARS = 30;

const PREFIX = "Урок може торкатися тем: ";
const RE = /^Урок може торкатися тем: ([^\n]*?)\.(?:\n|$)/;

export function parseWarning(text: string | undefined): { topics: string[]; custom: string } {
  const t = text ?? "";
  const m = RE.exec(t);
  if (!m) return { topics: [], custom: t };
  return {
    topics: m[1].split(",").map((x) => x.trim()).filter(Boolean),
    custom: t.slice(m[0].length),
  };
}

export function buildWarning(topics: string[], custom: string): string | undefined {
  const flat = custom.replace(/\s*\n\s*/g, " ").slice(0, MAX_WARNING_CUSTOM_CHARS);
  const c = flat.trim() === "" ? "" : flat;
  if (topics.length === 0) return c === "" ? undefined : c;
  return `${PREFIX}${topics.join(", ")}.${c ? `\n${c}` : ""}`;
}

export function toggleWarningTopic(text: string | undefined, topic: string): string | undefined {
  return parseWarning(text).topics[0] === topic ? undefined : buildWarning([topic], "");
}

// Typing your own text replaces a chosen topic.
export function setCustomWarning(custom: string): string | undefined {
  return buildWarning([], custom);
}
