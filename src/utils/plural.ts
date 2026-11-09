// Ukrainian plural forms — ONE rule instead of a copy in every file.
// 1, 21, 31… → one; 2–4, 22–24… → few; 0, 5–20, 25–30… → many.
export function pluralFormIndex(n: number): 0 | 1 | 2 {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

export function pluralUk(n: number, one: string, few: string, many: string): string {
  return [one, few, many][pluralFormIndex(n)];
}
