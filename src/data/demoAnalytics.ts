// «Аналітика» of the demo author, counted from the shared demo world (data/demoWorld.ts) with the same rules the
// database uses for real authors (supabase/author-analytics.sql): sales and income are the «Фінанси» sales, people
// are the «Учасники» people, materials match «Контент». Only page views are invented (the demo has no visitors), and
// they are tied to the sales so the conversion stays believable.
import type { AnalyticsMaterial, AuthorAnalytics } from "../lib/authorAnalytics.ts";
import { authoredContent } from "./authorDashboard.ts";
import { demoWorld } from "./demoWorld.ts";

const DAY = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// visitors of a day: a calm wave plus a bump on days with sales (about 2–3 % of visitors buy)
const viewsOn = (i: number, sales: number) => Math.round(70 + 25 * Math.sin(i / 2.7) + 15 * Math.cos(i / 5.3) + sales * 38);

export function demoAnalytics(days: number, now: Date = new Date()): AuthorAnalytics {
  const w = demoWorld(now);
  const t = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime();
  const prevStart = start - days * DAY;
  const kept = w.sales.filter((s) => s.refundedKop < s.priceKop);
  const inRange = (iso: string, from: number, to: number) => { const x = new Date(iso).getTime(); return x >= from && x < to; };
  const period = kept.filter((s) => inRange(s.confirmedAt, start, t + DAY));
  const prev = kept.filter((s) => inRange(s.confirmedAt, prevStart, start));
  const income = (list: typeof kept) => Math.round(list.reduce((n, s) => n + (s.authorKop - s.authorRefundedKop), 0) / 100);

  // day by day (views tied to sales)
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * DAY);
    const key = dayKey(d);
    const sales = period.filter((s) => dayKey(new Date(s.confirmedAt)) === key).length;
    return { day: key, views: viewsOn(Math.floor(start / DAY) + i, sales), sales };
  });
  const prevViews = Array.from({ length: days }, (_, i) => {
    const d = new Date(prevStart + i * DAY);
    const sales = prev.filter((s) => dayKey(new Date(s.confirmedAt)) === dayKey(d)).length;
    return viewsOn(Math.floor(prevStart / DAY) + i, sales);
  }).reduce((a, b) => a + b, 0);
  const views = series.reduce((n, s) => n + s.views, 0);
  const referralSales = period.filter((s) => s.source === "referral").length;

  // people (all time and in the period)
  const firstSeen = w.people.map((p) => new Date(p.firstSeen).getTime());
  const lastSeen = w.people.map((p) => Math.max(...p.entries.map((e) => new Date(e.lastActive).getTime())));
  const freeAdds = w.people.filter((p) => p.entries.some((e) => e.contentId === "demo-evening-meditation" && new Date(p.firstSeen).getTime() >= start)).length;

  const materials: AnalyticsMaterial[] = authoredContent
    .filter((c) => c.status === "published")
    .map((c) => {
      const mine = period.filter((s) => s.title === c.title);
      const people = w.people.filter((p) => p.entries.some((e) => e.contentId === c.id));
      const entries = people.map((p) => p.entries.find((e) => e.contentId === c.id)!);
      const facts = w.materials.get(c.id);
      const share = c.type === "program" ? (c.id === "stress-course" ? 0.45 : 0.3) : c.type === "guide" ? 0.15 : 0.1;
      return {
        id: c.id,
        kind: c.type,
        title: c.title,
        views: Math.round(views * share),
        sales: mine.length,
        income: income(mine),
        free_adds: c.type === "meditation" ? people.filter((p) => new Date(p.firstSeen).getTime() >= start).length : 0,
        participants: people.length,
        completion: c.type === "program" && entries.length ? Math.round((100 * entries.filter((e) => e.progressPercent >= 100).length) / entries.length) : null,
        listens: c.type === "meditation" ? people.length * Math.max(1, Math.round(days / 7)) : 0,
        listened_to_end: c.type === "meditation" && people.length ? 74 : null,
        readers: c.type === "guide" ? people.filter((p) => entries.length && new Date(p.entries.find((e) => e.contentId === c.id)!.lastActive).getTime() >= start).length : 0,
        rating: facts?.rating ?? null,
        reviews: facts?.reviewsCount ?? 0,
        helpful: c.type === "program" && entries.length ? 88 : null,
        saves: Math.round(people.length * 0.4),
        in_carts: c.type === "meditation" ? 0 : Math.max(0, Math.round(people.length * 0.3)),
      };
    })
    .sort((a, b) => b.income - a.income || b.views - a.views);

  // where people stop: from the progress of the demo participants of each program
  const funnels = authoredContent
    .filter((c) => c.type === "program" && c.status === "published" && c.modules?.length)
    .map((c) => {
      const entries = w.people.flatMap((p) => p.entries.filter((e) => e.contentId === c.id));
      const mods = c.modules ?? [];
      return {
        content_id: c.id,
        title: c.title,
        started: entries.length,
        modules: mods.map((m, i) => ({ title: m.title, reached: entries.length ? Math.round((100 * entries.filter((e) => e.progressPercent >= (i * 100) / mods.length).length) / entries.length) : null })),
      };
    })
    .filter((f) => f.started > 0);

  return {
    days,
    views,
    views_prev: prevViews,
    views_referral: Math.round(views * 0.22 + referralSales * 20),
    sales: period.length,
    sales_prev: prev.length,
    sales_referral: referralSales,
    income: income(period),
    income_prev: income(prev),
    free_adds: freeAdds,
    new_people: firstSeen.filter((x) => x >= start).length,
    active7: lastSeen.filter((x) => t - x <= 7 * DAY).length,
    active30: lastSeen.filter((x) => t - x <= 30 * DAY).length,
    series,
    materials,
    funnels,
  };
}
