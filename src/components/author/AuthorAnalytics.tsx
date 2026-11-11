// «Аналітика» in the author cabinet. Everything is counted in the database for the author's own materials
// (author_analytics, supabase/author-analytics.sql) and comes back as numbers only: page views per source, sales and
// income, new people and activity, per-material results (completion, listens, readers, rating, «корисно», saves,
// carts), where people stop in programs, and a few plain-language hints. Demo numbers fill the tab in demo mode until
// the author has real views or sales.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthoredContent, ContentType } from "../../data/authorDashboard";
import { fetchAuthorAnalytics, type AuthorAnalytics, type AnalyticsMaterial } from "../../lib/authorAnalytics";
import { demoAnalytics } from "../../data/demoAnalytics";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import { pluralUk } from "../../utils/plural";
import { Icon, type IconName } from "../ui/Icon";

type Props = { content: AuthoredContent[] };

const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
const PERIODS = [7, 30, 90] as const;
const TYPE_ICON: Record<ContentType, IconName> = { program: "program", meditation: "meditation", guide: "guide" };
const TYPE_LABEL: Record<ContentType, string> = { program: "Програма", meditation: "Медитація", guide: "Гайд" };
const uah = (n: number) => `${Math.round(n).toLocaleString("uk-UA")} ₴`;
const num = (n: number) => Math.round(n).toLocaleString("uk-UA");
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const fmtPct = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;

export default function AuthorAnalytics({ content }: Props) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [data, setData] = useState<AuthorAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let off = false;
    setLoading(true);
    setFailed(false);
    fetchAuthorAnalytics(days)
      .then((d) => { if (!off) setData(d); })
      .catch(() => { if (!off) { setFailed(true); setData(null); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => {
      off = true;
    };
  }, [days, reload]);

  const empty = !data || (data.views === 0 && data.sales === 0 && data.materials.every((m) => m.participants === 0));
  const demo = SHOW_AUTHOR_DEMO && !loading && empty;
  const a: AuthorAnalytics | null = useMemo(() => (demo ? demoAnalytics(days) : data), [demo, data, days]);
  const byId = useMemo(() => new Map(content.map((c) => [c.id, c])), [content]);

  // smooth period switch: the old numbers fade out, the new ones fade in (no empty flash in between)
  const [fading, setFading] = useState(false);
  const pickPeriod = (p: (typeof PERIODS)[number]) => {
    if (p === days) return;
    setFading(true);
    window.setTimeout(() => {
      setDays(p);
      window.setTimeout(() => setFading(false), 60);
    }, 180);
  };
  const dim = fading || (loading && !!data);

  // «Результати матеріалів»: by type, four at a time
  const [kind, setKind] = useState<"all" | ContentType>("all");
  const [shown, setShown] = useState(4);
  useEffect(() => setShown(4), [kind, days]);
  const matList = (a?.materials ?? []).filter((m) => kind === "all" || m.kind === kind);

  const conversion = a ? pct(a.sales, a.views) : 0;
  const conversionPrev = a ? pct(a.sales_prev, a.views_prev) : 0;
  const hints = a ? buildHints(a) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Аналітика</h1>
          <p className="mt-1 text-[15px] text-black/55">Як люди знаходять ваші матеріали, купують і проходять їх.</p>
        </div>
        <div className="flex rounded-2xl bg-white p-1 shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff]" role="group" aria-label="Період">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={days === p} onClick={() => pickPeriod(p)} className={`min-h-[40px] rounded-xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${days === p ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "text-[#1d2240] hover:bg-[#faf9ff]"}`}>
              {p} днів
            </button>
          ))}
        </div>
      </div>

      {failed && !demo && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100">
          Не вдалося завантажити аналітику.
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}
      {demo && <div className="rounded-2xl bg-sky-50 px-5 py-3.5 text-[14px] text-sky-900 ring-1 ring-sky-100">Демо-дані: так виглядатиме аналітика, коли ваші матеріали почнуть переглядати й купувати.</div>}

      <div className={`flex flex-col gap-6 transition-opacity duration-300 ease-out ${dim ? "opacity-35" : "opacity-100"}`} aria-busy={dim || undefined}>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon="search" label="Перегляди сторінок" value={a ? num(a.views) : null} now={a?.views} prev={a?.views_prev} />
        <Kpi icon="card" label="Продажі" value={a ? num(a.sales) : null} now={a?.sales} prev={a?.sales_prev} />
        <Kpi icon="chart" label="Ваш дохід" value={a ? uah(a.income) : null} now={a?.income} prev={a?.income_prev} />
        <Kpi icon="bolt" label="Конверсія" value={a ? fmtPct(conversion) : null} now={conversion} prev={conversionPrev} hint="Продажі ÷ перегляди" />
        <Kpi icon="graduation" label="Нові учасники" value={a ? num(a.new_people) : null} hint={a ? `${num(a.free_adds)} додали безкоштовне` : undefined} />
      </div>

      {/* CHART + SOURCES */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="an-chart">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="an-chart" className="text-[20px] font-bold text-[#12172b]">Перегляди й продажі</h2>
            <div className="flex gap-4 text-[12px] text-black/60">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-full bg-[#7c5cf0]" /> Перегляди</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#22a35a]" /> Продажі</span>
            </div>
          </div>
          {a ? <Chart series={a.series} /> : <div className="mt-4 h-[220px] animate-pulse rounded-2xl bg-[#f3f1fd]" />}
        </section>

        <section className={`${card} p-5 sm:p-6`} aria-labelledby="an-sources">
          <h2 id="an-sources" className="text-[20px] font-bold text-[#12172b]">Звідки приходять</h2>
          {a && (
            <div className="mt-4 flex flex-col gap-3">
              <SourceRow color="bg-[#7c5cf0]" title="Через Sensoria" hint="Каталог, пошук, рекомендації" views={a.views - a.views_referral} sales={a.sales - a.sales_referral} share={70} />
              <SourceRow color="bg-[#22a35a]" title="За вашим посиланням" hint="Соцмережі, розсилки, консультації" views={a.views_referral} sales={a.sales_referral} share={85} />
              <p className="text-[12px] leading-snug text-black/50">Посилання для поширення є у вкладці «Фінанси». З продажів за ним ви отримуєте 85% замість 70%.</p>
            </div>
          )}
        </section>
      </div>

      {/* HINTS */}
      {hints.length > 0 && (
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="an-hints">
          <h2 id="an-hints" className="text-[20px] font-bold text-[#12172b]">Що варто помітити</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {hints.map((h) => (
              <li key={h.text} className="flex gap-3 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${h.good ? "bg-emerald-100 text-emerald-700" : "bg-[#ece9fe] text-[#6d5bd0]"}`}><Icon name={h.icon} size={17} /></span>
                <p className="text-[14px] leading-snug text-[#2d2a5c]">{h.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* MATERIALS */}
      <section className={card} aria-labelledby="an-materials">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 id="an-materials" className="text-[20px] font-bold text-[#12172b]">Результати матеріалів</h2>
          <p className="mt-1 text-[14px] text-black/55">Перегляди, продажі й дохід за обраний період; учасники, оцінки та збереження — за весь час.</p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Тип матеріалу">
            {([["all", "Усі"], ["program", "Програми"], ["meditation", "Медитації"], ["guide", "Гайди"]] as ["all" | ContentType, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-2xl px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${kind === k ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
                {k !== "all" && <Icon name={TYPE_ICON[k]} size={15} />}{l}
              </button>
            ))}
          </div>
        </div>
        {!a ? (
          <div className="px-6 py-8"><span className="block h-4 w-1/3 animate-pulse rounded bg-[#e7e3fb]" /></div>
        ) : matList.length === 0 ? (
          <p className="px-6 py-10 text-center text-[14px] text-black/55">{a.materials.length === 0 ? "Опублікуйте перший матеріал, і його результати з’являться тут." : "Матеріалів цього типу поки немає."}</p>
        ) : (
          <ul className="mt-3">
            {matList.slice(0, shown).map((m) => <MaterialRow key={m.id} m={m} known={byId.has(m.id)} />)}
          </ul>
        )}
        {matList.length > shown && (
          <div className="border-t border-[#eceef7] px-5 py-3 sm:px-6">
            <button type="button" onClick={() => setShown((n) => n + 4)} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
              Показати ще ({Math.min(4, matList.length - shown)}) <span aria-hidden="true">↓</span>
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* FUNNELS */}
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="an-funnels">
          <h2 id="an-funnels" className="text-[20px] font-bold text-[#12172b]">Де учасники зупиняються</h2>
          <p className="mt-1 text-[14px] text-black/55">Яка частка тих, хто почав програму, дійшла до кожного модуля.</p>
          {a && a.funnels.length === 0 && <p className="mt-4 text-[14px] text-black/55">З’явиться, коли учасники почнуть проходити ваші програми.</p>}
          <div className="mt-4 flex flex-col gap-6">
            {a?.funnels.map((f) => (
              <div key={f.content_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] font-semibold text-[#12172b]">{f.title}</span>
                  <span className="shrink-0 text-[12px] text-black/50">почали {num(f.started)}</span>
                </div>
                <ol className="mt-2.5 flex flex-col gap-2">
                  {f.modules.map((md, i) => {
                    const v = md.reached ?? 0;
                    const prev = i > 0 ? f.modules[i - 1].reached ?? 0 : 100;
                    const drop = prev - v;
                    return (
                      <li key={`${f.content_id}-${i}`} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ece9fe] text-[12px] font-bold text-[#4a2fd0]">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 text-[13px]"><span className="truncate text-[#2d2a5c]">{md.title}</span><span className="font-semibold text-[#12172b]">{v}%</span></div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#ece9fe]"><div className={`h-full rounded-full transition-[width] duration-500 ${drop >= 20 ? "bg-gradient-to-r from-[#f59e0b] to-[#f97316]" : "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0]"}`} style={{ width: `${v}%` }} /></div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* ACTIVITY */}
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="an-activity">
          <h2 id="an-activity" className="text-[20px] font-bold text-[#12172b]">Активність учасників</h2>
          {a && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Tile label="Активні за 7 днів" value={num(a.active7)} />
              <Tile label="Активні за 30 днів" value={num(a.active30)} />
              <Tile label="Прослуховування медитацій" value={num(a.materials.reduce((n, m) => n + m.listens, 0))} hint={`за ${a.days} днів`} />
              <Tile label="Читачі гайдів" value={num(a.materials.reduce((n, m) => n + m.readers, 0))} hint={`за ${a.days} днів`} />
              <Tile label="Збережено «на потім»" value={num(a.materials.reduce((n, m) => n + m.saves, 0))} />
              <Tile label="Зараз у кошиках" value={num(a.materials.reduce((n, m) => n + m.in_carts, 0))} hint="ще не купили" />
            </div>
          )}
          <p className="mt-4 text-[12px] leading-snug text-black/50">Аналітика показує лише числа: імена, відповіді й записи учасників у ній не видно.</p>
        </section>
      </div>
      </div>
    </div>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, now, prev, hint }: { icon: IconName; label: string; value: string | null; now?: number; prev?: number; hint?: string }) {
  const trend = now != null && prev != null && prev > 0 ? ((now - prev) / prev) * 100 : null;
  return (
    <div className={`${card} flex min-w-0 flex-col gap-2 px-5 py-5`}>
      <div className="flex items-center gap-2 text-[14px] font-medium text-black/60"><span className="text-[#7a68e0]"><Icon name={icon} size={17} /></span>{label}</div>
      <div className="truncate text-[26px] font-bold leading-none text-[#12172b]">{value ?? <span className="inline-block h-7 w-20 animate-pulse rounded-lg bg-[#e7e3fb]" />}</div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {trend != null && Math.abs(trend) >= 0.5 && (
          <span className={`rounded-full px-2 py-0.5 font-semibold ${trend > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{trend > 0 ? "↑" : "↓"} {Math.abs(Math.round(trend))}%</span>
        )}
        {trend != null && <span className="text-black/45">до попереднього періоду</span>}
        {hint && trend == null && <span className="text-black/50">{hint}</span>}
      </div>
    </div>
  );
}

function Chart({ series }: { series: { day: string; views: number; sales: number }[] }) {
  const W = 640, H = 220, P = 8;
  const maxV = Math.max(1, ...series.map((s) => s.views));
  const maxS = Math.max(1, ...series.map((s) => s.sales));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, series.length - 1);
  const yV = (v: number) => H - 28 - (v / maxV) * (H - 50);
  const line = series.map((s, i) => `${x(i)},${yV(s.views)}`).join(" ");
  const area = `${P},${H - 28} ${line} ${x(series.length - 1)},${H - 28}`;
  const bw = Math.max(2, Math.min(14, (W - 2 * P) / series.length - 3));
  const label = (iso: string) => new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((v, i, arr) => arr.indexOf(v) === i);
  const totalV = series.reduce((n, s) => n + s.views, 0);
  const totalS = series.reduce((n, s) => n + s.sales, 0);
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" role="img" aria-label={`За період: ${totalV} переглядів, ${totalS} продажів`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="an-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c5cf0" stopOpacity="0.28" /><stop offset="100%" stopColor="#7c5cf0" stopOpacity="0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={P} x2={W - P} y1={H - 28 - g * (H - 50)} y2={H - 28 - g * (H - 50)} stroke="#efeafd" strokeWidth="1" />)}
        {series.map((s, i) => s.sales > 0 && <rect key={s.day} x={x(i) - bw / 2} y={H - 28 - (s.sales / maxS) * 60} width={bw} height={(s.sales / maxS) * 60} rx="2" fill="#22a35a" opacity="0.85" />)}
        <polygon points={area} fill="url(#an-area)" />
        <polyline points={line} fill="none" stroke="#7c5cf0" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[12px] text-black/50">
        {ticks.map((t) => <span key={t}>{series[t] ? label(series[t].day) : ""}</span>)}
      </div>
    </div>
  );
}

function SourceRow({ color, title, hint, views, sales, share }: { color: string; title: string; hint: string; views: number; sales: number; share: number }) {
  return (
    <div className="rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="text-[15px] font-semibold text-[#12172b]">{title}</span><span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold text-[#4d5278] ring-1 ring-[#ebe8ff]">вам {share}%</span></div>
      <div className="mt-0.5 text-[12px] text-black/50">{hint}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Перегляди" value={num(views)} />
        <Mini label="Продажі" value={num(sales)} />
        <Mini label="Конверсія" value={fmtPct(pct(sales, views))} />
      </div>
    </div>
  );
}

function MaterialRow({ m, known }: { m: AnalyticsMaterial; known: boolean }) {
  const kind = m.kind as ContentType;
  const conv = pct(m.sales, m.views);
  const facts: [string, string][] = [
    ["Перегляди", num(m.views)],
    m.kind === "meditation" && m.sales === 0 ? ["Додали", num(m.free_adds)] : ["Продажі", num(m.sales)],
    ["Конверсія", m.views ? fmtPct(m.kind === "meditation" && m.sales === 0 ? pct(m.free_adds, m.views) : conv) : "—"],
    ["Дохід", m.income ? uah(m.income) : "—"],
    ["Учасники", num(m.participants)],
    m.kind === "program" ? ["Пройшли", m.completion != null ? `${m.completion}%` : "—"] : m.kind === "meditation" ? ["Дослухали", m.listened_to_end != null ? `${m.listened_to_end}%` : "—"] : ["Читачі", num(m.readers)],
    ["Оцінка", m.rating ? `${m.rating} ★ · ${m.reviews}` : "—"],
    m.kind === "program" ? ["Корисно", m.helpful != null ? `${m.helpful}%` : "—"] : ["Збережено", num(m.saves)],
  ];
  return (
    <li className="border-t border-black/5 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#6d5bd0]"><Icon name={TYPE_ICON[kind]} size={13} />{TYPE_LABEL[kind]}{!known && <span className="text-black/40">· демо</span>}</div>
      <div className="mt-0.5 text-[16px] font-semibold text-[#12172b]">{m.title}</div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {facts.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-[#faf9ff] px-3 py-2 ring-1 ring-[#efeafd]">
            <dt className="text-[11px] text-black/50">{l}</dt>
            <dd className="truncate text-[15px] font-bold text-[#12172b]">{v}</dd>
          </div>
        ))}
      </dl>
      {m.in_carts > 0 && <p className="mt-2 text-[12px] text-black/50">Зараз у кошиках: {m.in_carts} {pluralUk(m.in_carts, "людина", "людини", "людей")}</p>}
    </li>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
      <div className="text-[13px] text-black/55">{label}</div>
      <div className="mt-1 text-[24px] font-bold leading-none text-[#12172b]">{value}</div>
      {hint && <div className="mt-1 text-[12px] text-black/45">{hint}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 ring-1 ring-[#efeafd]">
      <div className="text-[11px] text-black/50">{label}</div>
      <div className="text-[15px] font-bold text-[#12172b]">{value}</div>
    </div>
  );
}

// Plain-language observations from the numbers (never advice about a person).
function buildHints(a: AuthorAnalytics): { icon: IconName; text: string; good?: boolean }[] {
  const out: { icon: IconName; text: string; good?: boolean }[] = [];
  const refViews = a.views_referral, catViews = a.views - a.views_referral;
  const refConv = pct(a.sales_referral, refViews), catConv = pct(a.sales - a.sales_referral, catViews);
  if (refViews >= 20 && refConv > catConv * 1.2) out.push({ icon: "heart", good: true, text: `За вашим посиланням купують частіше (${fmtPct(refConv)} проти ${fmtPct(catConv)}). Діліться ним активніше: з таких продажів ви отримуєте 85%.` });
  if (a.views >= 50 && refViews < a.views * 0.1) out.push({ icon: "megaphone", text: "Майже всі покупці приходять через каталог. Поділіться своїм посиланням у соцмережах: з таких продажів ваша частка 85%." });
  const carted = [...a.materials].sort((x, y) => y.in_carts - x.in_carts)[0];
  if (carted && carted.in_carts >= 5 && carted.in_carts > carted.sales) out.push({ icon: "card", text: `«${carted.title}» лежить у кошиках у ${carted.in_carts} ${pluralUk(carted.in_carts, "людини", "людей", "людей")}. Можливо, варто доповнити опис або відповісти на часті питання.` });
  for (const f of a.funnels) {
    let worst = { i: -1, drop: 0 };
    f.modules.forEach((m, i) => { if (i > 0) { const d = (f.modules[i - 1].reached ?? 0) - (m.reached ?? 0); if (d > worst.drop) worst = { i, drop: d }; } });
    if (worst.i > 0 && worst.drop >= 20) { out.push({ icon: "compass", text: `У «${f.title}» найбільше людей зупиняються перед модулем «${f.modules[worst.i].title}» (−${worst.drop}%). Можна зробити перехід м’якшим або коротшим.` }); break; }
  }
  const lowConv = a.materials.find((m) => m.views >= 100 && m.kind !== "meditation" && pct(m.sales, m.views) < 1);
  if (lowConv) out.push({ icon: "search", text: `«${lowConv.title}» часто переглядають, але рідко купують. Перевірте обкладинку, опис і ціну.` });
  const loved = a.materials.find((m) => (m.rating ?? 0) >= 4.8 && m.reviews >= 10);
  if (loved) out.push({ icon: "star", good: true, text: `«${loved.title}» має оцінку ${loved.rating} ★ від ${loved.reviews} людей. Це сильна сторона: згадуйте її в описі й постах.` });
  if (a.sales > a.sales_prev && a.sales_prev > 0) out.push({ icon: "chart", good: true, text: `Продажів більше, ніж у попередньому періоді: ${a.sales} проти ${a.sales_prev}.` });
  return out.slice(0, 6);
}
