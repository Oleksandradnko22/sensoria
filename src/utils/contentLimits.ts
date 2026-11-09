// Length rules for what an author types when creating a program. One place, used by the step-by-step editor
// (live counters, «Далі») and by validatePublishable (moderation), so the two can never disagree.
export const CONTENT_LIMITS = {
  title: { min: 5, max: 80 },
  description: { min: 40, max: 600 },
  moduleTitle: { min: 3, max: 60 },
  lessonTitle: { min: 3, max: 80 },
  lessonBody: { min: 10, max: 5000 },
  practicePrompt: { min: 3, max: 150 },
} as const;

// Characters as a person counts them: an emoji is one, not two UTF-16 units.
export const charCount = (s: string) => [...s.trim()].length;

export function titleProblem(title: string): string | null {
  const n = charCount(title);
  if (n === 0) return "Вкажіть назву.";
  if (n < CONTENT_LIMITS.title.min) return `Назва закоротка: щонайменше ${CONTENT_LIMITS.title.min} символів, зараз ${n}.`;
  if (n > CONTENT_LIMITS.title.max) return `Назва задовга: не більше ${CONTENT_LIMITS.title.max} символів, зараз ${n}.`;
  return null;
}

export function descriptionProblem(description: string): string | null {
  const n = charCount(description);
  if (n === 0) return "Додайте опис.";
  if (n < CONTENT_LIMITS.description.min) return `Опис закороткий: щонайменше ${CONTENT_LIMITS.description.min} символів, зараз ${n}.`;
  if (n > CONTENT_LIMITS.description.max) return `Опис задовгий: не більше ${CONTENT_LIMITS.description.max} символів, зараз ${n}.`;
  return null;
}

// Price is whole hryvnias; 0 means free.
export function priceProblem(price: string): string | null {
  if (!/^\d+$/.test(price.trim())) return "Вкажіть вартість числом: 0, якщо безкоштовно.";
  if (Number(price) > 100000) return "Вартість задовга: не більше 100 000 ₴.";
  return null;
}

// "" when the text is fine (or empty and optional), otherwise what is wrong.
export function lengthProblem(value: string, limit: { min: number; max: number }, what: string, optional = false): string | null {
  const n = charCount(value);
  if (n === 0) return optional ? null : `${what}: заповніть.`;
  if (n < limit.min) return `${what}: щонайменше ${limit.min} символів, зараз ${n}.`;
  if (n > limit.max) return `${what}: не більше ${limit.max} символів, зараз ${n}.`;
  return null;
}
