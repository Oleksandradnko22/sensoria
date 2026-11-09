// Pure helpers for the "Про автора" tab. Nothing here invents author facts:
// help areas are derived only from the topics the author themselves picked,
// each mapped to a fixed, non-clinical "what you can come here for" phrase.

export type HelpIcon = "wave" | "leaf" | "heart" | "compass" | "spark" | "sun";
export type HelpArea = { key: string; title: string; line: string; icon: HelpIcon };

const HELP_BY_TOPIC: Record<string, Omit<HelpArea, "key">> = {
  anxiety: { title: "Розуміти тривогу", line: "Краще бачити, що відбувається, коли з’являється тривога", icon: "wave" },
  stress: { title: "Відновити спокій", line: "Знайти спосіб відпустити повсякденну напругу", icon: "wave" },
  burnout: { title: "Берегти ресурс", line: "Помічати перевтому раніше й м’яко відновлюватися", icon: "leaf" },
  selfEsteem: { title: "Бути добрішим до себе", line: "Ставитися до себе уважніше, без постійної самокритики", icon: "heart" },
  relationships: { title: "Розуміти свої реакції", line: "Краще бачити, як ви реагуєте у стосунках", icon: "compass" },
  motivation: { title: "Знаходити опору", line: "Розуміти, що підтримує вас, коли складно почати", icon: "spark" },
  emotionalBalance: { title: "Краще розуміти свій стан", line: "Помічати свій емоційний стан і розуміти його", icon: "compass" },
  innerPressure: { title: "Послабити внутрішній тиск", line: "Розпізнавати тиск і залишати для себе більше простору", icon: "wave" },
  healthyBalance: { title: "Знайти свій ритм", line: "Шукати спокійніший баланс між справами та відпочинком", icon: "leaf" },
  awareness: { title: "Бути уважнішим до себе", line: "Практикувати уважність у невеликих кроках", icon: "sun" },
  recovery: { title: "Відновлюватися у своєму темпі", line: "Повертати сили без поспіху", icon: "leaf" },
};

// Derived only from the topics the author themselves chose.
export function helpAreas(topicKeys: string[], max = 4): HelpArea[] {
  const out: HelpArea[] = [];
  for (const k of topicKeys) {
    const h = HELP_BY_TOPIC[k];
    if (h && !out.some((o) => o.key === k)) out.push({ key: k, ...h });
    if (out.length >= max) break;
  }
  return out;
}

// The author's own "approach" text, split conservatively: the first sentence
// becomes the large statement, the rest the quieter supporting line. Nothing
// is rewritten. A first sentence that is too long to work as a statement
// means no split (whole text = statement).
export function splitApproach(raw: string | null | undefined): { statement: string; support: string } {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { statement: "", support: "" };
  const m = text.match(/^.+?[.!?…](?=\s|$)/);
  const first = m ? m[0].trim() : text;
  if (!m || first.length > 120 || first.length === text.length) return { statement: text, support: "" };
  return { statement: first, support: text.slice(first.length).trim() };
}

// Credentials are free text written by the author: one line = one item.
export function credentialLines(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n|;/)
    .map((l) => l.replace(/^[\s•\-–—*]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}
