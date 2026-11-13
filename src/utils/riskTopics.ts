// High-risk topics: only an author whose education documents Sensoria has
// reviewed («Фахівець») may publish material on them. The author declares the
// topics; the title/description are also scanned for obvious keywords. The
// same pattern guards the database (author-kind-migration.sql).

export const RISK_TOPICS: { id: string; label: string }[] = [
  { id: "trauma", label: "Травма, ПТСР" },
  { id: "suicide", label: "Кризові стани" },
  { id: "eating", label: "Розлади харчової поведінки" },
  { id: "addiction", label: "Залежності" },
  { id: "clinical", label: "Психосоматика" },
  { id: "children", label: "Робота з дітьми" },
];

export const RISK_PATTERN =
  /(птср|посттравм|суїцид|самоушкодж|розлад[иуіав]* харчов|булімі|анорекс|залежн(ість|остей|остям)|діагноз|лікуванн|ліки|медикамент|психотерапі)/i;

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

/** Saved topic ids that are not among the six known ones (old data): they must stay visible so the author can remove them. */
export function unknownRiskTopics(ids: readonly string[] | undefined): string[] {
  const known = new Set(RISK_TOPICS.map((t) => t.id));
  return (ids ?? []).filter((id) => !known.has(id));
}

/** True when the material touches a high-risk topic (declared or by keyword). */
export function isHighRisk(c: { title?: string; description?: string; riskTopics?: string[] }): boolean {
  return (c.riskTopics?.length ?? 0) > 0 || riskKeywordHit(`${c.title ?? ""} ${c.description ?? ""}`);
}

export const RISK_MESSAGE =
  "Тема підвищеного ризику (травма, суїцидальні думки, розлади харчової поведінки, залежності, діагнози й лікування) доступна лише авторам зі статусом «Фахівець» (документи про освіту переглянуто Sensoria). Надішліть документи в розділі «Модерація» або приберіть цю тему.";
