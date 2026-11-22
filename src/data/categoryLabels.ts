export const categoryLabels = {

  anxiety:
    "Тривожність",

  stress:
    "Стрес",

  burnout:
    "Вигорання",

  selfEsteem:
    "Самооцінка",

  relationships:
    "Стосунки",

  motivation:
    "Мотивація",

  emotionalBalance:
    "Емоційний баланс",

  innerPressure:
    "Внутрішній тиск",

  healthyBalance:
    "Здоровий баланс",

  awareness:
    "Усвідомленість",

  recovery:
    "Відновлення",

};

// The topics an author can pick today = the catalog categories (utils/catalogFilters.ts CATEGORIES). The other keys above
// are old categories that may still be stored on older profiles and materials; they are shown as the current category
// they belong to (lawyer, 22.11.2026: no old category names on public pages).
export const CURRENT_TOPICS = ["stress", "anxiety", "burnout", "relationships", "motivation", "selfEsteem", "emotionalBalance"] as const;
const OLD_TO_CURRENT: Record<string, string> = { innerPressure: "stress", healthyBalance: "emotionalBalance" };
/** current topic id for any stored category, or null (awareness, recovery… have no catalog category) */
export function currentTopic(id: string): string | null {
  const t = OLD_TO_CURRENT[id] ?? id;
  return (CURRENT_TOPICS as readonly string[]).includes(t) ? t : null;
}
/** [id, label] of the topics an author can pick */
export const currentTopicEntries = (): [string, string][] =>
  CURRENT_TOPICS.map((id) => [id, (categoryLabels as Record<string, string>)[id]]);
