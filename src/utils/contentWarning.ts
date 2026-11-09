// Lesson content warning = one stored string. Chosen topics live in a leading sentence
// ("Урок може торкатися тем: a, b."), anything the author types follows it.

export const WARNING_TOPICS = [
  "втрата та горе",
  "смерть і хвороба",
  "панічні атаки та тривога",
  "травматичний досвід",
  "дитячі травми",
  "насильство",
  "сексуальне насильство",
  "булінг і приниження",
  "самоушкодження",
  "суїцидальні думки",
  "розлади харчової поведінки",
  "залежності",
  "війна та військові події",
  "сильні емоції та сльози",
  "гучні звуки",
] as const;

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
