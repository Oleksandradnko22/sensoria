// High-risk topics: only an author whose education documents Sensoria has
// reviewed («Фахівець») may publish material on them. The author declares the
// topics; the title/description are also scanned for obvious keywords. The
// same pattern guards the database (author-kind-migration.sql).

export const RISK_TOPICS: { id: string; label: string }[] = [
  { id: "trauma", label: "Травма, ПТСР, наслідки війни й бойового досвіду" },
  { id: "suicide", label: "Суїцидальні думки, самоушкодження, кризові стани" },
  { id: "violence", label: "Насильство, зокрема домашнє й сексуальне" },
  { id: "grief", label: "Втрата близьких, горе" },
  { id: "eating", label: "Розлади харчової поведінки" },
  { id: "addiction", label: "Залежності (алкоголь, наркотики, азартні ігри)" },
  { id: "clinical", label: "Психічні розлади й психосоматика (депресія, тривожні розлади тощо)" },
  { id: "children", label: "Робота з дітьми й підлітками" },
];

// ONE word list for every place that looks for a high-risk TOPIC: materials, posts, own warning text — and the
// database (supabase/risk-topics-v2.sql risk_text_hit, keep in sync). Safety review 21.11.2026, С1:
// - topics only: claims such as «діагноз», «лікування», «психотерапія», «ліки» are forbidden to every author by the
//   offer and handled on complaint — they must not block the honest «курс не замінює психотерапію»;
// - a stem matches only at the start of a word («публіки», «незалежність» do not match);
// - Ukrainian and Russian spellings.
const L = "а-яіїєґё";
export const RISK_WORDS =
  `(?<![${L}'’])(птср|посттравм|травм|суїцид|суицид|самогуб|самоубийств|самоушкодж|самоповрежд|розлад[${L}]* харчов|` +
  `расстройств[${L}]* пищев|булімі|булими|анорекс|залежн|зависим|наркот|алкогол|азартн|лудоман|насильств|насили|` +
  `згвалтув|изнасил|гор(е|я|ю|ем)(?![${L}])|втрат[аиуі] (близьк|рідн|дитин)|утрат[аы] (близк|родн|ребен)|смерт|помер|війн|войн|` +
  `бойов|боев|депрес|біполяр|биполяр|шизофрен|панічн[${L}]* розлад|паническ[${L}]* расстройств|окр(?![${L}]))`;
export const RISK_PATTERN = new RegExp(RISK_WORDS, "i");

export function riskKeywordHit(text: string): boolean {
  return RISK_PATTERN.test(text);
}

/** The risky words found in a text (lower-cased, no repeats, at most `limit`), to show the author what was noticed. */
export function riskKeywordWords(text: string, limit = 3): string[] {
  const found: string[] = [];
  const re = new RegExp(RISK_PATTERN.source, "gi");
  for (const m of text.matchAll(re)) {
    const w = m[0].toLowerCase();
    if (!found.includes(w)) found.push(w);
    if (found.length >= limit) break;
  }
  return found;
}

/** Saved topic ids that are not among the known ones (old data): they must stay visible so the author can remove them. */
export function unknownRiskTopics(ids: readonly string[] | undefined): string[] {
  const known = new Set(RISK_TOPICS.map((t) => t.id));
  return (ids ?? []).filter((id) => !known.has(id));
}

/** True when the material touches a high-risk topic (declared or by keyword). */
export function isHighRisk(c: { title?: string; description?: string; riskTopics?: string[] }): boolean {
  return (c.riskTopics?.length ?? 0) > 0 || riskKeywordHit(`${c.title ?? ""} ${c.description ?? ""}`);
}

export const RISK_MESSAGE =
  "Тема підвищеного ризику (травма й наслідки війни, кризові стани, насильство, втрата й горе, розлади харчової поведінки, залежності, психічні розлади, робота з дітьми й підлітками) доступна лише авторам зі статусом «Фахівець» (документи про освіту переглянуто Sensoria). Надішліть документи в розділі «Модерація» або приберіть цю тему.";
