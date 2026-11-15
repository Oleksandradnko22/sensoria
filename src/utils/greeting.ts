// "Олександра" -> "Олександро" for the greeting; other endings are left as they are (no guessing)
export function greetingName(full: string | undefined): string {
  const first = (full ?? "").trim().split(/\s+/)[0];
  if (!first) return "";
  if (/ія$/i.test(first)) return first.slice(0, -1) + "є";
  if (/я$/i.test(first)) return first.slice(0, -1) + "ю";
  if (/а$/i.test(first)) return first.slice(0, -1) + "о";
  return first;
}
