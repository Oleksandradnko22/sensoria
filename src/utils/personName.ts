// An author is shown to the public under their real name: first name AND
// surname. "Ім'я Прізвище" = at least two words of 2+ letters.
export function isFullName(name: string | null | undefined): boolean {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((w) => w.replace(/[^\p{L}]/gu, "").length >= 2);
}
