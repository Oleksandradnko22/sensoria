// ONE demo world for the whole author cabinet, so the showcase is consistent the same way real data is (real tabs
// read the same tables): every demo sale has a buyer, every buyer is a participant, and «Контент», «Огляд»,
// «Учасники», «Фінанси» and «Аналітика» all count from here. Dates are relative to today, so «активні за 7 днів»
// and the charts always look alive. Shown only in demo mode (utils/demoMode.ts).
import type { FinanceSale } from "../lib/finance.ts";
import { authoredContent, reviews, type AuthoredContent, type ParticipantSegment } from "./authorDashboard.ts";

const DAY = 86_400_000;

// title in a sale → material id
const MATERIALS: { id: string; title: string; price: number }[] = [
  { id: "stress-course", title: "Робота зі стресом", price: 150000 },
  { id: "demo-sleep-program", title: "Спокійний сон за 21 день", price: 120000 },
  { id: "panic-sos", title: "SOS при панічних атаках", price: 29000 },
];
const FREE_MEDITATION = "demo-evening-meditation";

const NAMES = [
  "Олена Гуменюк", "Тарас Мельник", "Юлія Бондаренко", "Ірина Ковальська", "Максим Дорошенко", "Софія Литвиненко",
  "Андрій Савчук", "Марія Ткаченко", "Оксана Кравець", "Дмитро Лисенко", "Катерина Шевчук", "Наталія Поліщук",
  "Віктор Гнатюк", "Анна Мороз", "Роман Бойко", "Ірина Павленко", "Олег Зінченко", "Світлана Руденко",
  "Богдан Кузьменко", "Леся Остапенко", "Євген Марченко", "Христина Онищенко", "Тетяна Ярошенко", "Ігор Сидоренко",
  "Вікторія Левченко", "Павло Гордієнко", "Людмила Коваль", "Артем Вакуленко", "Яна Білик", "Сергій Дяченко",
];

export type DemoEntry = { contentId: string; progressPercent: number; lastActive: string; segment: ParticipantSegment };
export type DemoPerson = { name: string; entries: DemoEntry[]; firstSeen: string };
export type DemoWorld = {
  sales: FinanceSale[];
  // sale id → buyer name (for «Останні події»)
  buyers: Record<string, string>;
  people: DemoPerson[];
  // per material (all time): people, the author's income in ₴, rating from demo reviews
  materials: Map<string, { participants: number; revenue: number; rating: number | null; reviewsCount: number }>;
};

// deterministic «random» 0..1 from a string
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

const segmentOf = (percent: number, completed: boolean, last: number, now: number): ParticipantSegment => {
  const days = (now - last) / DAY;
  if (!completed && percent <= 15 && days <= 3) return "new";
  if (!completed && days > 21) return "inactive";
  return "active";
};

let cache: { at: number; world: DemoWorld } | null = null;

export function demoWorld(now: Date = new Date()): DemoWorld {
  // the same world for the whole visit (rebuilt once a day)
  if (cache && Math.abs(cache.at - now.getTime()) < DAY) return cache.world;
  const t = now.getTime();

  // 1. half a year of sales: gentle growth, every third through the author's own link, two refunds
  const sales: FinanceSale[] = [];
  const buyers: string[] = [];
  const perMonth = [3, 4, 4, 6, 7, 5];
  let n = 0;
  perMonth.forEach((count, i) => {
    const monthsAgo = perMonth.length - 1 - i;
    for (let k = 0; k < count; k++) {
      const m = MATERIALS[(n + k) % MATERIALS.length];
      const referral = (n + k) % 3 === 0;
      const bps = referral ? 1500 : 3000;
      const author = Math.round((m.price * (10000 - bps)) / 10000);
      const day = 2 + ((k * 5) % 25);
      let date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, 11, 20);
      if (date.getTime() > t) date = new Date(t - (count - k) * DAY);
      const refunded = n + k === 7 || n + k === 19;
      // Олена buys the first three; the rest go round the list (some people buy twice)
      const buyer = n + k < 3 ? NAMES[0] : NAMES[1 + ((n + k) % (NAMES.length - 1))];
      buyers.push(buyer);
      sales.push({
        id: `demo-sale-${n + k}`,
        confirmedAt: date.toISOString(),
        title: m.title,
        priceKop: m.price,
        authorKop: author,
        refundedKop: refunded ? m.price : 0,
        authorRefundedKop: refunded ? author : 0,
        pendingKop: t - date.getTime() < 14 * DAY && !refunded ? author : 0,
        holdUntil: new Date(date.getTime() + 14 * DAY).toISOString(),
        disputed: false,
        source: referral ? "referral" : "catalog",
        commissionBps: bps,
      });
    }
    n += count;
  });

  // 2. participants: every buyer (refunded sales don't make a participant), plus people who added the free meditation
  const people = new Map<string, DemoPerson>();
  const add = (name: string, contentId: string, since: number) => {
    const p = people.get(name) ?? { name, entries: [], firstSeen: new Date(since).toISOString() };
    if (p.entries.some((e) => e.contentId === contentId)) return;
    if (since < new Date(p.firstSeen).getTime()) p.firstSeen = new Date(since).toISOString();
    const r = hash(`${name}:${contentId}`);
    const isProgram = contentId === "stress-course" || contentId === "demo-sleep-program";
    const age = (t - since) / DAY;
    // older buyers are further along; some paused
    const percent = isProgram ? Math.min(100, Math.round(Math.min(1, age / 50) * (60 + r * 40))) : 100;
    const last = Math.min(t - DAY * 0.2, since + Math.round(r * Math.max(1, age) * DAY));
    p.entries.push({ contentId, progressPercent: percent, lastActive: new Date(last).toISOString(), segment: segmentOf(percent, percent >= 100 && isProgram, last, t) });
    people.set(name, p);
  };
  sales.forEach((s, i) => {
    if (s.refundedKop >= s.priceKop) return;
    const m = MATERIALS.find((x) => x.title === s.title);
    if (m) add(buyers[i], m.id, new Date(s.confirmedAt).getTime());
  });
  NAMES.forEach((name, i) => {
    if (i % 2 === 0) add(name, FREE_MEDITATION, t - (5 + i * 7) * DAY);
  });

  // 3. per material: people, income, rating
  const materials = new Map<string, { participants: number; revenue: number; rating: number | null; reviewsCount: number }>();
  for (const c of authoredContent) {
    const ppl = [...people.values()].filter((p) => p.entries.some((e) => e.contentId === c.id)).length;
    const revenue = Math.round(sales.filter((s) => s.title === c.title).reduce((sum, s) => sum + Math.max(0, s.authorKop - s.authorRefundedKop), 0) / 100);
    const rs = reviews.filter((r) => r.contentId === c.id);
    materials.set(c.id, { participants: ppl, revenue, rating: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : null, reviewsCount: rs.length });
  }

  const buyerBySale: Record<string, string> = {};
  sales.forEach((s, i) => { buyerBySale[s.id] = buyers[i]; });
  const world: DemoWorld = { buyers: buyerBySale, sales: sales.sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()), people: [...people.values()], materials };
  cache = { at: t, world };
  return world;
}

/** The demo materials with their numbers taken from the demo world (so the lists match the other tabs). */
export function demoAuthoredContent(): AuthoredContent[] {
  const w = demoWorld();
  return authoredContent.map((c) => {
    const m = w.materials.get(c.id);
    return m ? { ...c, participants: m.participants, revenue: m.revenue, rating: m.rating, reviewsCount: m.reviewsCount } : c;
  });
}
