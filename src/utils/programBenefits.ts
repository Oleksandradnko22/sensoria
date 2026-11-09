// «Що ви отримаєте» — up to three short benefits written by the program's author.
// All THREE are required for every program (utils/programPublish.ts). Like the AI declaration
// (utils/contentLabels.ts) they are stored inside the existing `tags` column as
// reserved "benefit:<text>" entries, so no database change is needed. Category
// filters and labels ignore unknown tags, so these never show up as categories.
// Presentation never depends on the text (one checkmark, abstract waves).

export const BENEFIT_PREFIX = "benefit:";
export const MAX_BENEFITS = 3;
export const MIN_BENEFIT_CHARS = 20; // shorter reads as a label, not a benefit
export const MAX_BENEFIT_CHARS = 40; // ≈ 3–4 short words, at most 3 lines in a tile

export const isBenefitTag = (t: string): boolean => t.startsWith(BENEFIT_PREFIX);

/** Tidy one benefit: single-spaced, trimmed, capped. */
export function cleanBenefit(text: string): string {
  return [...text.replace(/\s+/g, " ").trim()].slice(0, MAX_BENEFIT_CHARS).join("").trim();
}

/** Benefits stored in tags, in order, cleaned, no empty/duplicate entries, at most MAX_BENEFITS. */
export function benefitsFromTags(tags?: readonly string[] | null): string[] {
  const out: string[] = [];
  for (const t of tags ?? []) {
    if (!isBenefitTag(t)) continue;
    const b = cleanBenefit(t.slice(BENEFIT_PREFIX.length));
    if (b && !out.some((x) => x.toLowerCase() === b.toLowerCase())) out.push(b);
    if (out.length === MAX_BENEFITS) break;
  }
  return out;
}

/** All three benefits are required, each 20-40 characters (three tiles look right on the program page): null when complete. */
export function benefitsProblem(benefits: readonly string[]): string | null {
  if (benefits.length >= MAX_BENEFITS) {
    const k = benefits.findIndex((b) => [...b].length < MIN_BENEFIT_CHARS);
    return k < 0 ? null : `Перевага ${k + 1} закоротка: від ${MIN_BENEFIT_CHARS} до ${MAX_BENEFIT_CHARS} символів, зараз ${[...benefits[k]].length}.`;
  }
  return benefits.length === 0
    ? `Додайте ${MAX_BENEFITS} переваги: що отримає учасник.`
    : `Додайте всі ${MAX_BENEFITS} різні переваги: зараз заповнено ${benefits.length} з ${MAX_BENEFITS}.`;
}

/** Tags without the benefit entries (what category code should see). */
export const stripBenefitTags = (tags?: readonly string[] | null): string[] => (tags ?? []).filter((t) => !isBenefitTag(t));

/** Tags with the benefits replaced by `benefits` (empty ones dropped); every other tag is kept as it was. */
export function withBenefits(tags: readonly string[], benefits: readonly string[]): string[] {
  const kept = stripBenefitTags(tags);
  const next = benefits.map(cleanBenefit).filter(Boolean).slice(0, MAX_BENEFITS);
  return [...kept, ...next.map((b) => BENEFIT_PREFIX + b)];
}
