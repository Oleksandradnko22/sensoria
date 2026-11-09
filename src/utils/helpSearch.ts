// FAQ search for «Допомога». People type a sentence («я оплатив курс, але не
// бачу його»), not keywords, and Ukrainian words inflect — so each word is cut
// to a short stem and an item matches when enough stems occur in its question or
// answer. Questions weigh more than answers; results are ordered by relevance.

type Faq = { q: string; a: string };
export type FaqCat<T extends Faq = Faq> = { id: string; label: string; description: string; items: T[] };

const STOP = new Set(["але", "що", "чи", "як", "для", "при", "про", "його", "її", "їх", "мене", "мені", "ним", "нею", "там", "тут", "та", "і", "й", "в", "у", "на", "не", "це", "цей", "ця", "яка", "який", "щоб", "бо", "от", "ще"]);

export function stems(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return Array.from(new Set(words.map((w) => w.slice(0, Math.max(4, w.length - 2)).slice(0, 6))));
}

function wholeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 5 && !STOP.has(w));
}

export function scoreItem(item: Faq, queryStems: string[], query = ""): number {
  if (!queryStems.length) return 0;
  const q = item.q.toLowerCase();
  const a = item.a.toLowerCase();
  let score = 0;
  // the exact word the person typed beats a mere stem match
  for (const w of wholeWords(query)) {
    if (q.includes(w)) score += 3;
    else if (a.includes(w)) score += 1;
  }
  for (const s of queryStems) {
    if (q.includes(s)) score += 2;
    else if (a.includes(s)) score += 1;
  }
  return score;
}

export function searchFaq<T extends Faq>(categories: FaqCat<T>[], query: string): { categories: FaqCat<T>[]; total: number } {
  const qs = stems(query);
  if (!query.trim()) return { categories, total: categories.reduce((n, c) => n + c.items.length, 0) };
  // one or two stems must match; longer queries need about half of them
  const need = Math.max(1, Math.floor(qs.length / 2));
  const out: FaqCat<T>[] = [];
  let total = 0;
  for (const c of categories) {
    const hits = c.items
      .map((item) => ({ item, score: scoreItem(item, qs, query), matched: qs.filter((s) => (item.q + " " + item.a).toLowerCase().includes(s)).length }))
      .filter((x) => x.matched >= need || (qs.length === 0 && (x.item.q + x.item.a).toLowerCase().includes(query.trim().toLowerCase())))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
    if (hits.length) {
      out.push({ ...c, items: hits });
      total += hits.length;
    }
  }
  return { categories: out, total };
}
