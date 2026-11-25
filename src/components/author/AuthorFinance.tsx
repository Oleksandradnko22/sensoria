// «Фінанси» in the author cabinet. What does not depend on the bank is complete: how a payment is split (70 % when
// the buyer came through Sensoria, 85 % through the author's own link), income by month and by material, every sale
// with its source and status, and the connection of the author's FOP/TOV to monobank's split (the bank sends the
// author's share straight to the author's account; Sensoria's commission comes as agentFeePercent).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "../../context/SessionContext";
import { supabase } from "../../lib/supabaseClient";
import { acceptLegal, sendLegalOtp, verifyLegalOtp } from "../../lib/legalGate";
import { AUTHOR_PAID_ITEM, OTP_TEXT } from "../../data/consentTexts";
import { DPS_NON_MONETARY_NOTE } from "../../data/ipkTemplate";
import AuthorActs from "./AuthorActs";
import FinanceSetupCard from "./FinanceSetupCard";
import { connectPrro, fetchPrroStatus, type PrroStatus } from "../../lib/finance";
import { fetchMonoConnection, fetchMyFinance, markFinanceNotificationsRead, requestMonoConnection, touchFinanceActivity, type FinanceSale, type MonoConnection, type MyFinance } from "../../lib/finance";
import { STATUS_LABEL, type HistoryRow, authorBankFeeKop, financeTotals, historyRows, incomeByMaterial, isFullyRefunded, monthReportCsv, monthlyIncome, priceBreakdown, statusExplanation, toAccountKop, uahFromKop } from "../../utils/financeView";
import { buildReferralLink } from "../../utils/referral";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import { demoWorld } from "../../data/demoWorld";
import { Icon, type IconName } from "../ui/Icon";

const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) : "");
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
const PAGE = 8;
const TONE = { info: "bg-sky-50 text-sky-900 ring-sky-100", warn: "bg-amber-50 text-amber-900 ring-amber-100", danger: "bg-rose-50 text-rose-900 ring-rose-100" };

type SaleFilter = "all" | "catalog" | "referral" | "refunds";
type FinTab = "overview" | "sales" | "calc" | "refunds" | "tax" | "history";
const TABS: { key: FinTab; label: string; icon: IconName }[] = [
  { key: "overview", label: "Огляд", icon: "chart" },
  { key: "sales", label: "Продажі", icon: "graduation" },
  { key: "calc", label: "Розрахунки", icon: "card" },
  { key: "refunds", label: "Повернення", icon: "refresh" },
  { key: "tax", label: "Податки й документи", icon: "note" },
  { key: "history", label: "Історія", icon: "clock" },
];

export default function AuthorFinance() {
  const session = useSession();
  const authorId = session?.profile.id ?? null;
  const [data, setData] = useState<MyFinance | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setData(await fetchMyFinance());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не вдалося завантажити фінанси.");
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    if (!authorId) return;
    touchFinanceActivity("view_finance");
    void reload();
  }, [authorId]);

  // demo showcase while the author has no real sales yet
  const realSales = useMemo(() => data?.sales ?? [], [data]);
  const demo = SHOW_AUTHOR_DEMO && ready && realSales.length === 0;
  // with monobank's split the bank pays the author's share at once: nothing is held by Sensoria
  const split = data?.terms?.splitAtSource ?? true;
  const sales: FinanceSale[] = useMemo(() => (demo ? demoWorld().sales.map((s) => (split ? { ...s, pendingKop: 0 } : s)) : realSales), [demo, realSales, split]);

  const totals = useMemo(() => financeTotals(sales), [sales]);
  const months = useMemo(() => monthlyIncome(sales, 6), [sales]);
  const materials = useMemo(() => incomeByMaterial(sales).slice(0, 5), [sales]);
  const maxMonth = Math.max(1, ...months.map((m) => m.catalogKop + m.referralKop));

  const terms = data?.terms;
  const catalogPct = terms ? (10000 - terms.commissionBps) / 100 : 70;
  const referralPct = terms ? (10000 - terms.referralCommissionBps) / 100 : 85;
  const acc = data?.account;
  const banner = acc ? statusExplanation(acc.status, acc.debtKop) : null;
  // this month, as it reaches the account (the bank keeps its fee from the author's share before crediting it)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const inMonth = sales.filter((s) => new Date(s.confirmedAt).getTime() >= monthStart);
  const thisMonth = inMonth.filter((s) => !isFullyRefunded(s));
  const monthCount = thisMonth.length;
  const monthRef = thisMonth.filter((s) => s.source === "referral").length;
  const monthShareKop = inMonth.reduce((n, s) => n + s.authorKop, 0);
  const monthFeeKop = inMonth.reduce((n, s) => n + authorBankFeeKop(s), 0);
  const monthRefundKop = inMonth.reduce((n, s) => n + s.authorRefundedKop, 0);
  const monthToAccountKop = inMonth.reduce((n, s) => n + toAccountKop(s), 0);
  const live = sales.filter((s) => !isFullyRefunded(s));
  const avgKop = live.length ? Math.round(live.reduce((n, s) => n + s.priceKop, 0) / live.length) : 0;
  const lastSale = live[0] ?? null;
  // paid in the last day: the bank credits it the next working day
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const comingKop = live.filter((s) => new Date(s.confirmedAt).getTime() > dayAgo).reduce((n, s) => n + toAccountKop(s), 0);
  const catalogEx = priceBreakdown(100000, terms?.commissionBps ?? 3000);
  // «Як ділиться оплата»: the author tries their own price and the buyer's card
  const [calcPrice, setCalcPrice] = useState("1000");
  const [calcCard, setCalcCard] = useState<"ua" | "foreign">("ua");
  const calcKop = (Number(calcPrice) || 0) * 100;
  const calcCatalog = priceBreakdown(calcKop, terms?.commissionBps ?? 3000, calcCard);
  const calcReferral = priceBreakdown(calcKop, terms?.referralCommissionBps ?? 1500, calcCard);

  // monthly report (CSV for Excel)
  const reportMonths = useMemo(() => [...new Set(sales.map((s) => s.confirmedAt.slice(0, 7)))].sort().reverse(), [sales]);
  const [reportMonth, setReportMonth] = useState("");
  const month = reportMonth || reportMonths[0] || "";
  const downloadReport = () => {
    if (!month) return;
    const url = URL.createObjectURL(new Blob([monthReportCsv(sales, month)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sensoria-zvit-${month}${demo ? "-demo" : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

  // referral link
  const link = authorId && typeof window !== "undefined" ? buildReferralLink(window.location.origin, authorId) : "";
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the link stays selectable on screen */
    }
  };

  // tabs
  const [tab, setTab] = useState<FinTab>("overview");
  // demo: operations made from the demo sales (each sale credited, refunds taken back)
  const histRows: HistoryRow[] = useMemo(() => {
    if (!demo) {
      // split: the bank credits the share at once, so «earning» and its «payout» are one event for the author
      const real = (data ? historyRows(data.ledger) : [])
        .filter((h) => !(split && h.key.endsWith("|AUTHOR_PAYOUT")))
        .map((h) => {
          if (!split || !h.key.endsWith("|AUTHOR_EARNING") || h.amountKop == null) return h;
          // as it reaches the account: the share minus the bank's fee (the sale's card, else the Ukrainian rate)
          const sale = sales.find((s) => s.purchaseId && h.key.startsWith(`payment:${s.purchaseId}|`));
          return { ...h, label: "Надходження з продажу", amountKop: h.amountKop - authorBankFeeKop({ priceKop: sale?.priceKop, authorKop: h.amountKop, cardOrigin: sale?.cardOrigin }) };
        });
      // localhost only: with too few real operations, add examples to see the list, «Переглянути далі» and the calendar
      if (!import.meta.env.DEV || real.length >= 5) return real;
      const day = (n: number, h: number) => new Date(Date.now() - n * 864e5 - h * 36e5).toISOString();
      const examples: HistoryRow[] = [
        { key: "ex-1", date: day(1, 2), label: "Надходження з продажу", amountKop: 69090, note: "Приклад · Робота зі стресом" },
        { key: "ex-2", date: day(3, 5), label: "Надходження з продажу", amountKop: 41454, note: "Приклад · Спокій у темпі життя" },
        { key: "ex-3", date: day(6, 1), label: "Повернення покупцю", amountKop: -42000, note: "Приклад · Спокій у темпі життя" },
        { key: "ex-4", date: day(9, 3), label: "Надходження з продажу", amountKop: 50320, note: "Приклад · Усвідомленість у житті" },
        { key: "ex-5", date: day(14, 6), label: "Надходження з продажу", amountKop: 27636, note: "Приклад · Гайд «Тиша всередині»" },
      ];
      return [...real, ...examples].sort((x, y) => (x.date < y.date ? 1 : -1));
    }
    const out: HistoryRow[] = [];
    sales.forEach((s) => {
      out.push({ key: `${s.id}:in`, date: s.confirmedAt, label: "Надходження з продажу", amountKop: s.authorKop - authorBankFeeKop(s), note: s.title });
      if (s.authorRefundedKop > 0) out.push({ key: `${s.id}:ref`, date: new Date(new Date(s.confirmedAt).getTime() + 3 * 864e5).toISOString(), label: "Повернення покупцю", amountKop: -s.authorRefundedKop, note: s.title });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [demo, data, sales, split]);
  const notes = demo ? [] : data?.notifications ?? [];
  const hasHistory = histRows.length > 0 || notes.length > 0;

  // sales list
  const [filter, setFilter] = useState<SaleFilter>("all");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filter]);
  const filteredSales = sales.filter((s) => (filter === "all" ? true : filter === "refunds" ? s.refundedKop > 0 : s.source === filter));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Фінанси</h1>
          <p className="mt-1 text-[15px] text-black/55">Ваш дохід, продажі, повернення й документи.</p>
        </div>
      </div>

      {/* what is missing for paid sales + a Zoom consultation with the team (replaces the «test mode» badge) */}
      <FinanceSetupCard card={card} />

      {ready && loadError && <Notice tone="danger">{loadError} <button type="button" onClick={() => void reload()} className="ml-2 font-semibold underline">Спробувати ще раз</button></Notice>}
      {demo && <Notice tone="info">Демо-дані: так виглядатиме розділ, коли з’являться ваші перші продажі.</Notice>}
      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

      {/* SECTIONS: one topic per tab, so each answer has one place */}
      <div role="tablist" aria-label="Розділи фінансів" className="-mx-1 -my-1 flex gap-2 overflow-x-auto px-1 py-1.5">
        {TABS.filter((t) => t.key !== "history" || hasHistory).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-2xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${tab === t.key ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* TOTALS */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat icon="card" label="Зароблено за весь час" value={uahFromKop(totals.allTimeKop)} hint="Ваша частка, без повернень" />
            <Stat icon="chart" label="Середня покупка" value={uahFromKop(avgKop)} hint="Ціна для покупця" />
            <Stat icon="graduation" label="Продажів" value={String(totals.salesCount)} hint={totals.salesCount ? `${totals.referralCount} за вашим посиланням` : undefined} />
            <Stat icon="refresh" label="Повернень" value={String(totals.refundsCount)} hint="Протягом 14 днів після оплати" />
          </div>


          {/* INCOME THIS MONTH */}
          <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-income">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="fin-income" className="text-[20px] font-bold text-[#12172b]">Надходження</h2>
                <p className="mt-1 text-[14px] text-black/55">monobank зараховує оплату на ваш рахунок наступного дня. Sensoria ваші гроші не тримає.</p>
              </div>
              <div className="text-right">
                <div className={`text-[34px] font-bold leading-none sm:text-[40px] ${monthToAccountKop < 0 ? "text-rose-600" : "text-[#12172b]"}`}>{monthToAccountKop < 0 ? "−" : ""}{uahFromKop(Math.abs(monthToAccountKop))}</div>
                <div className="mt-1 text-[12px] text-black/50">на ваш рахунок цього місяця</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Mini label="Ваша частка" value={uahFromKop(monthShareKop)} hint={`${monthCount} ${monthCount === 1 ? "продаж" : monthCount > 1 && monthCount < 5 ? "продажі" : "продажів"}, ${monthRef} за посиланням`} />
              <Mini label="Комісія банку" value={monthFeeKop ? `−${uahFromKop(monthFeeKop)}` : uahFromKop(0)} hint="1,3 % або 2 % — за тарифами банку, можуть змінюватися" />
              <Mini label="Повернено покупцям" value={monthRefundKop ? `−${uahFromKop(monthRefundKop)}` : uahFromKop(0)} hint="ваша частка" />
              <Mini label="Надійде завтра" value={uahFromKop(comingKop)} hint="оплати за останню добу" />
            </div>
            {lastSale && (
              <p className="mt-3 text-[13px] text-black/55">
                Остання оплата: <span className="font-semibold text-[#12172b]">{lastSale.title}</span> · {fmtShort(lastSale.confirmedAt)} · +{uahFromKop(toAccountKop(lastSale))}
              </p>
            )}
            <p className="mt-3 rounded-2xl bg-[#f6f4ff] px-4 py-3 text-[12px] leading-relaxed text-black/55">
              Суми на рахунок і комісія банку тут — оцінка за тарифом. Точні суми дивіться у виписці вашого рахунку в monobank.
            </p>
          </section>

          {/* REFERRAL LINK */}
          {link && (
            <section aria-labelledby="fin-link" className={`${card} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon name="heart" size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h2 id="fin-link" className="text-[18px] font-bold text-[#12172b]">Ваше посилання: {referralPct}% замість {catalogPct}%</h2>
                  <p className="text-[13px] text-black/55">Покупець, що прийшов за ним, закріплюється за вами на 30 днів.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#faf9ff] p-2 ring-1 ring-[#efeafd]">
                <div className="min-w-0 flex-1 truncate px-2 text-[14px] text-[#4d5278]" title={link}>{link}</div>
                <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[14px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] transition hover:ring-[#c9bff7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                  <Icon name={copied ? "check" : "clip"} size={16} /> {copied ? "Скопійовано" : "Копіювати"}
                </button>
              </div>
            </section>
          )}

          <MonoConnectCard />
          <PrroCard />
        </>
      )}

      {tab === "sales" && (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* INCOME BY MONTH */}
            <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-months">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="fin-months" className="text-[20px] font-bold text-[#12172b]">Дохід за 6 місяців</h2>
                <div className="flex gap-4 text-[12px] text-black/60">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#7c5cf0]" /> Через Sensoria</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#22a35a]" /> За вашим посиланням</span>
                </div>
              </div>
              <div className="mt-5 flex h-[200px] items-end gap-3 sm:gap-5" role="img" aria-label={months.map((m) => `${m.label}: ${uahFromKop(m.catalogKop + m.referralKop)}`).join(", ")}>
                {months.map((m) => {
                  const total = m.catalogKop + m.referralKop;
                  return (
                    <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[12px] font-semibold text-[#2d2a5c]">{total ? uahFromKop(total).replace(/\s?₴/, "") : ""}</span>
                      <div className="flex w-full max-w-[56px] flex-col justify-end overflow-hidden rounded-xl bg-[#f3f1fd]" style={{ height: `${Math.max(4, (total / maxMonth) * 150)}px` }}>
                        <div className="bg-[#22a35a]" style={{ height: `${total ? (m.referralKop / total) * 100 : 0}%` }} />
                        <div className="bg-gradient-to-b from-[#8a6cf3] to-[#6d4cf6]" style={{ height: `${total ? (m.catalogKop / total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-[12px] text-black/55">{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* BY MATERIAL */}
            <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-materials">
              <h2 id="fin-materials" className="text-[20px] font-bold text-[#12172b]">За матеріалами</h2>
              {materials.length === 0 ? (
                <p className="mt-3 text-[14px] text-black/55">Тут з’явиться, які матеріали приносять найбільше.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {materials.map((m) => (
                    <li key={m.title} className="rounded-2xl bg-[#faf9ff] p-3.5 ring-1 ring-[#efeafd]">
                      <div className="flex items-start justify-between gap-3">
                        <span className="line-clamp-2 text-[14px] font-semibold text-[#12172b]">{m.title}</span>
                        <span className="shrink-0 text-[14px] font-bold text-[#12172b]">{uahFromKop(m.authorKop)}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-black/55">
                        {m.sales} {m.sales === 1 ? "продаж" : m.sales < 5 && m.sales > 1 ? "продажі" : "продажів"}
                        {m.sales > 0 && ` · ${Math.round(m.referralShare * 100)}% за вашим посиланням`}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* SALES */}
          <section className={card} aria-labelledby="fin-sales">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 id="fin-sales" className="text-[20px] font-bold text-[#12172b]">Продажі</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Які продажі показати">
                {([["all", "Усі"], ["catalog", "Через Sensoria"], ["referral", "За посиланням"], ["refunds", "Повернення"]] as [SaleFilter, string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`min-h-[40px] rounded-2xl px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${filter === k ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!ready ? (
              <div className="px-6 py-8"><span className="block h-4 w-1/3 animate-pulse rounded bg-[#e7e3fb]" /></div>
            ) : filteredSales.length === 0 ? (
              <p className="px-6 py-10 text-center text-[14px] text-black/55">{sales.length === 0 ? "Продажів поки немає. Поділіться своїм посиланням, щоб отримати перших покупців." : "Таких продажів немає."}</p>
            ) : (
              <ul className="mt-3">
                {filteredSales.slice(0, shown).map((s) => {
                  const refunded = isFullyRefunded(s);
                  const recent = new Date(s.confirmedAt).getTime() > dayAgo;
                  const status = refunded
                    ? "Повернено покупцю"
                    : s.refundedKop > 0
                      ? `Частково повернено (${uahFromKop(s.refundedKop)})`
                      : recent
                        ? "Надійде наступного дня"
                        : "Зараховано на рахунок";
                  const fee = authorBankFeeKop(s);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/5 px-5 py-3.5 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-[#12172b]">{s.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-black/55">
                          <span>{fmtShort(s.confirmedAt)}</span>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${s.source === "referral" ? "bg-emerald-50 text-emerald-700" : "bg-[#f1eeff] text-[#5b4bd0]"}`}>{s.source === "referral" ? `Ваше посилання · ${(10000 - s.commissionBps) / 100}%` : `Через Sensoria · ${(10000 - s.commissionBps) / 100}%`}</span>
                          <span>ціна {uahFromKop(s.priceKop)}</span>
                          {s.cardOrigin && <span>· {s.cardOrigin === "foreign" ? "іноземна картка" : "українська картка"}</span>}
                          <span className={refunded ? "text-rose-600" : recent ? "text-amber-700" : ""}>· {status}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[16px] font-bold ${refunded ? "text-black/35 line-through" : "text-[#1d7a45]"}`}>+{uahFromKop(refunded ? s.authorKop - fee : toAccountKop(s))}</div>
                        <div className="text-[12px] text-black/45">частка {uahFromKop(s.authorKop)} · банк −{uahFromKop(fee)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {filteredSales.length > shown && (
              <div className="border-t border-[#eceef7] px-5 py-3 sm:px-6">
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                  Показати ще ({Math.min(PAGE, filteredSales.length - shown)}) <span aria-hidden="true">↓</span>
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "calc" && (
        <>
          {/* HOW A PAYMENT IS SPLIT: the author tries their own price */}
          <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-split">
            <h2 id="fin-split" className="text-[20px] font-bold text-[#12172b]">Як ділиться оплата</h2>
            <p className="mt-1 text-[14px] text-black/55">Вкажіть ціну свого матеріалу: побачите, скільки дійде на ваш рахунок. Покупець платить лише ціну.</p>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-[13px] font-semibold text-[#2d2a5c]">
                Ціна матеріалу
                <span className="mt-1 flex min-h-[48px] items-center rounded-xl bg-[#faf9ff] px-4 ring-1 ring-[#e3def9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#7c5cf0]">
                  <input value={calcPrice} onChange={(e) => setCalcPrice(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} inputMode="numeric" aria-label="Ціна матеріалу в гривнях" className="w-[120px] bg-transparent text-[18px] font-bold text-[#12172b] focus:outline-none" />
                  <span className="text-[16px] font-semibold text-black/45">₴</span>
                </span>
              </label>
              <div role="group" aria-label="Картка покупця" className="flex gap-2">
                {([["ua", "Українська картка · 1,3 %"], ["foreign", "Іноземна · 2 %"]] as ["ua" | "foreign", string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={calcCard === k} onClick={() => setCalcCard(k)} className={`min-h-[48px] rounded-xl px-4 text-[13px] font-semibold transition ${calcCard === k ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {([
                ["compass", "Через Sensoria", "Каталог, пошук, рекомендації.", calcCatalog, catalogPct, false],
                ["heart", "За вашим посиланням", "Особисте посилання, діє 30 днів.", calcReferral, referralPct, true],
              ] as [IconName, string, string, ReturnType<typeof priceBreakdown>, number, boolean][]).map(([icon, title, text, b, pct, accent]) => (
                <div key={title} className={`rounded-2xl p-4 ring-1 sm:p-5 ${accent ? "bg-emerald-50/60 ring-emerald-100" : "bg-[#faf9ff] ring-[#efeafd]"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-emerald-100 text-emerald-700" : "bg-[#ece9fe] text-[#6d5bd0]"}`}><Icon name={icon} size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-[#12172b]">{title}</div>
                      <div className="mt-0.5 text-[13px] text-black/55">{text}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-black/5" aria-hidden="true">
                    <div className={accent ? "bg-[#22a35a]" : "bg-[#7c5cf0]"} style={{ width: `${pct}%` }} />
                    <div className="flex-1 bg-[#d9d4f5]" />
                  </div>
                  <dl className="mt-3 flex flex-col gap-1.5 text-[14px]">
                    <div className="flex justify-between"><dt className="text-black/60">Ціна</dt><dd>{uahFromKop(calcKop)}</dd></div>
                    <div className="flex justify-between"><dt className="text-black/60">Тариф Sensoria, {Math.round((100 - pct) * 100) / 100} %</dt><dd>−{uahFromKop(b.sensoriaKop)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>Ваша частка, {pct} %</dt><dd>{uahFromKop(b.authorKop)}</dd></div>
                    <div className="flex justify-between"><dt className="text-black/60">Комісія банку, {calcCard === "foreign" ? "2" : "1,3"} %</dt><dd>−{uahFromKop(b.feeKop)}</dd></div>
                    <div className={`mt-1 flex items-baseline justify-between border-t pt-2 ${accent ? "border-emerald-100" : "border-[#ebe8ff]"}`}><dt className="font-semibold text-[#12172b]">На ваш рахунок</dt><dd className="text-[22px] font-bold text-[#1d7a45]">{uahFromKop(b.toAccountKop)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-black/50">Комісія банку — 1,3 % або 2 % від усієї оплати, за тарифами банку, можуть змінюватися; точні суми — у виписці банку. Знижка банку «0 % на 30 днів» на цю схему не поширюється.</p>
          </section>

          {/* HOW THE MONEY ARRIVES */}
          <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-payouts">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="card" size={20} /></span>
              <div>
                <h2 id="fin-payouts" className="text-[20px] font-bold text-[#12172b]">Як надходять кошти</h2>
                <p className="text-[13px] text-black/55">Оплата надходить на ваш рахунок; тариф Sensoria банк перераховує з вашого рахунку за вашим дорученням у день зарахування.</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Row label="Хто переказує" value="monobank, напряму" note={`Оплата надходить на ваш рахунок; тариф Sensoria (${100 - catalogPct} % або ${100 - referralPct} % за вашим посиланням) банк перераховує з вашого рахунку за вашим дорученням.`} />
              <Row label="Куди" value="Основний гривневий рахунок" note="Рахунок вашого ФОП або ТОВ у monobank. Інший рахунок указати не можна." />
              <Row label="Коли" value="Наступного дня" note="І вам, і Sensoria банк зараховує кошти наступного дня після оплати." />
              <Row label="Мінімальна сума" value="Немає" note="Запитувати виплату не потрібно: кожна оплата надходить окремо." />
              <Row label="Комісія банку" value="1,3 % або 2 %" note="Від усієї суми оплати: 1,3 % — українські картки, 2 % — іноземні; за тарифами банку, можуть змінюватися; точні суми — у виписці банку." />
              <Row label="Що бачить покупець" value="Сторінка monobank" note="Оплата карткою, Apple Pay або Google Pay. У виписці покупця — назва платформи." />
            </dl>
          </section>
        </>
      )}

      {tab === "refunds" && (
        <>
          {/* REFUNDS & DISPUTES */}
          <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-refunds">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="refresh" size={20} /></span>
              <div>
                <h2 id="fin-refunds" className="text-[20px] font-bold text-[#12172b]">Повернення й спірні оплати</h2>
                <p className="text-[13px] text-black/55">Що відбувається, коли покупець повертає кошти.</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Row label="Строк для покупця" value="14 днів" note="За правилами Sensoria покупець може повернути кошти протягом 14 днів після оплати." />
              <Row label="Звідки списується" value="З вашого рахунку" note={`Якщо повернення в день оплати — банк скасовує платіж повністю. Якщо пізніше — банк списує всю суму з вашого рахунку (за матеріал за 1000 ₴ — 1000 ₴), а Sensoria протягом 5 робочих днів перераховує вам тариф (${uahFromKop(catalogEx.sensoriaKop)}).`} />
              <Row label="Комісія банку" value="Не повертається" note="Утримана при оплаті комісія залишається в банку." />
              <Row label="Якщо на рахунку бракує коштів" value="Повернення не пройде" note="Банк відхилить операцію, і ми зв’яжемося з вами. Тримайте на рахунку суму можливих повернень за останні 14 днів." />
              <Row label="Коли покупець отримає гроші" value="До 3 робочих днів" />
              <Row label="Спірна оплата (чарджбек)" value="Пояснення — 1 робочий день" note="Ми повідомимо листом і в кабінеті. Надайте пояснення до вказаного часу: банк чекає відповіді 2 банківські дні. Якщо банк спише всю суму з вашого рахунку, Sensoria поверне вам тариф протягом 5 робочих днів." />
            </dl>
          </section>
          {/* М5: the tariff Sensoria transfers back after a refund on a later day or a lost chargeback */}
          <TariffBackList card={card} />
          {/* DEBTS (only when there are any) */}
          {(data?.debts.length ?? 0) > 0 && (
            <section className={`${card} p-5 sm:p-6`}>
              <h2 className="text-[20px] font-bold text-[#12172b]">Заборгованість</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-black/55">Борг виникає, коли покупцеві повертають гроші, а ваша частка вже надійшла. Нові продажі автоматично його погашають.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {data!.debts.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-[#faf9ff] px-4 py-3 text-[13px] ring-1 ring-[#efeafd]">
                    <div className="flex justify-between gap-3 font-semibold text-[#12172b]"><span>{d.status === "open" ? "Залишок" : "Погашено"}: {uahFromKop(d.outstandingKop)} з {uahFromKop(d.originalKop)}</span><span className="font-normal text-black/50">{fmtDate(d.createdAt)}</span></div>
                    <div className="mt-1 text-black/55">{d.reason}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === "tax" && (
        <>
          {/* TAXES & DOCUMENTS */}
          <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-tax">
            <h2 id="fin-tax" className="text-[20px] font-bold text-[#12172b]">Податки й документи</h2>
            <p className="mt-1 text-[14px] text-black/55">У вебі monobank по таких оплатах видно лише зарахування, тому звіт про продажі формуємо ми.</p>

            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f6f4ff] p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[#12172b]">Звіт про продажі за місяць</div>
                <p className="mt-0.5 text-[13px] text-black/55">Кожен продаж: ціна, ваша ставка, частка, картка, комісія банку, повернення й сума на рахунок. Файл CSV відкривається в Excel і Google Таблицях.</p>
              </div>
              {reportMonths.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <MonthPicker months={reportMonths} value={month} onChange={setReportMonth} label={monthName} />
                  <button type="button" onClick={downloadReport} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white hover:opacity-95">
                    <Icon name="note" size={16} /> Завантажити звіт
                  </button>
                </div>
              ) : (
                <span className="text-[13px] text-black/50">З’явиться після першого продажу.</span>
              )}
            </div>

            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoTile icon="idcard" title="Податки з усієї оплати покупця" text="Ваш дохід для єдиного податку — уся сума, яку сплатив покупець (з урахуванням знижки за промокодом). Тариф Sensoria й комісія банку його не зменшують; повернення коштів покупцям — зменшують. На рахунок надходить сума за вирахуванням тарифу Sensoria й комісії банку. Для Книги обліку доходів беріть суму «Загалом» із призначення платежу або суми ваших чеків, а не суму зарахування. Порадьтеся зі своїм бухгалтером." />
              <InfoTile icon="note" title="Акт про надання послуг Sensoria" text="Щомісячний акт про надання послуг з’явиться тут після запуску оплат." />
              <InfoTile icon="card" title="Чеки покупцям" text="Чек покупцю на повну ціну видає ваш ПРРО; Sensoria формує його автоматично після оплати. Підключіть касу в розділі «Приймання оплат»." />
              <InfoTile icon="shield" title="Реквізити захищені" text="Код ФОП або ТОВ бачите лише ви й команда Sensoria. Дані картки покупця ми не бачимо й не зберігаємо: оплату приймає банк." />
            </ul>
            {/* Б37: the DPS position is explained here, in the cabinet only — not in the public offer */}
            <div className="mt-4"><Notice tone="info">{DPS_NON_MONETARY_NOTE.replace("шаблон запиту нижче", "шаблон запиту — у «Налаштуваннях», розділ «Документи і згоди»")}</Notice></div>
          </section>
          <AuthorActs card={card} />
        </>
      )}

      {tab === "history" && (
        <>
          {/* HISTORY & NOTIFICATIONS */}
          {hasHistory && (
            <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-history">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="clock" size={20} /></span>
                  <div>
                    <h2 id="fin-history" className="text-[20px] font-bold text-[#12172b]">{notes.length > 0 ? "Історія операцій і сповіщення" : "Історія операцій"}</h2>
                    {acc && <p className="text-[13px] text-black/55">Статус фінансового акаунта: {STATUS_LABEL[acc.status] ?? acc.status}{acc.salesSuspended ? " · нові продажі призупинено" : ""}</p>}
                  </div>
                </div>
                {notes.some((n) => !n.readAt) && (
                  <button type="button" onClick={() => void markFinanceNotificationsRead().then(reload).catch(() => {})} className="min-h-[40px] rounded-xl bg-[#f1eeff] px-4 text-[13px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]">Позначити прочитаними</button>
                )}
              </div>
              {histRows.length > 0 && (
                <div className="mt-5">
                  <HistoryPanel rows={histRows} />
                </div>
              )}
              {notes.length > 0 && (
                <div className="mt-6 border-t border-[#f1eefb] pt-5">
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-[#6d5bd0]">Сповіщення</div>
                  <ul className="mt-2 grid gap-2 lg:grid-cols-2">
                    {notes.slice(0, 12).map((n) => (
                      <li key={n.id} className={`flex gap-3 rounded-2xl px-4 py-3 ring-1 ${n.readAt ? "bg-white ring-[#f1eefb]" : "bg-[#f6f4ff] ring-[#e3def9]"}`}>
                        <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-black/15" : "bg-[#7c5cf0]"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block whitespace-pre-line text-[13px] leading-relaxed ${n.readAt ? "text-black/55" : "text-[#12172b]"}`}>{n.message}</span>
                          <span className="mt-0.5 block text-[12px] text-black/40">{fmtShort(n.createdAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}

    </div>
  );
}

function MonoConnectCard() {
  const [conn, setConn] = useState<MonoConnection | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [ipn, setIpn] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [singlePartner, setSinglePartner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A6 — the conditions of paid sales, signed with a code from the email before the first connection
  const [paidOk, setPaidOk] = useState<boolean>(true);
  const [a6, setA6] = useState(false);
  const [codeStep, setCodeStep] = useState<{ email: string } | null>(null);
  const [code, setCode] = useState("");

  const load = async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const { data: ok, error: e } = await supabase.rpc("has_current_consent", { p_uid: data.user.id, p_document: "author_paid_sales" });
          setPaidOk(e ? true : ok === true); // before the migration nothing is asked
        }
      }
      setConn(await fetchMonoConnection());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const problem = legalName.trim().length < 5 ? "Вкажіть назву ФОП або ТОВ повністю, як у документах." : legalAddress.trim().length < 10 ? "Вкажіть місцезнаходження, як у Єдиному державному реєстрі." : !/^(\d{8}|\d{10})$/.test(ipn) ? "РНОКПП ФОП — 10 цифр, ЄДРПОУ ТОВ — 8 цифр." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyerEmail.trim()) ? "Вкажіть робочий email для покупців." : !/^(\+?38)?0\d{9}$/.test(buyerPhone.replace(/[\s()-]/g, "")) ? "Вкажіть робочий телефон для покупців у форматі +380XXXXXXXXX." : !singlePartner ? "Підтвердіть, що не приймаєте оплати з розподілом платежу через іншу платформу — партнера monobank." : null;
  const save = async () => {
    if (problem) return setError(problem);
    if (!paidOk && !a6) return setError("Підтвердьте умови платних продажів.");
    setSaving(true);
    setError(null);
    try {
      if (!paidOk) {
        if (!codeStep) {
          const r = await sendLegalOtp("author_paid_sales");
          setCodeStep({ email: r.to ?? "" });
          return;
        }
        await verifyLegalOtp(code, "author_paid_sales");
        await acceptLegal("author_paid", [AUTHOR_PAID_ITEM], 0, []);
        setPaidOk(true);
        setCodeStep(null);
        setCode("");
      }
      await requestMonoConnection({ ipn, legalName: legalName.trim(), legalAddress: legalAddress.trim(), buyerEmail: buyerEmail.trim(), buyerPhone: buyerPhone.trim(), singlePartner });
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати.");
    } finally {
      setSaving(false);
    }
  };
  const input = "min-h-[46px] w-full rounded-xl border border-[#d9d4f5] bg-[#faf9ff] px-4 text-[14px] focus:border-[#5b3df5] focus:bg-white focus:outline-none";
  const status = conn?.status ?? "none";

  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-mono">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="idcard" size={20} /></span>
        <div>
          <h2 id="fin-mono" className="text-[20px] font-bold text-[#12172b]">Прийом оплат</h2>
          <p className="text-[13px] text-black/55">Ваш ФОП або ТОВ з рахунком у monobank. Фізичних осіб банк не підключає.</p>
        </div>
      </div>
      {loadFailed && <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-black/60">Не вдалося завантажити стан підключення. Оновіть сторінку пізніше.</p>}
      {!loadFailed && conn && !editing && (
        <>
          {status === "active" && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">Підключено: {conn.legalName} · код ••••{conn.ipnLast4}<div className="text-[13px] text-emerald-800/70">Ваша частка надходить на основний гривневий рахунок у monobank.</div></div>}
          {status === "requested" && <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">На підключенні: {conn.legalName} · код ••••{conn.ipnLast4}<div className="text-[13px] text-amber-800/80">Ми надішлемо вам анкету банку. Після її заповнення банк підключає рахунок до 24 годин.</div></div>}
          {status === "disabled" && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900">Прийом оплат призупинено. Деталі — у сповіщеннях, або надішліть дані ще раз.</div>}
          {status === "none" && (
            <div className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-black/65">
              Поки ФОП не підключено, платні матеріали не можна купити.
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-black/55">
                <li>Відкрийте рахунок ФОП або ТОВ у monobank, якщо його ще немає.</li>
                <li>Надішліть тут назву й код.</li>
                <li>Заповніть анкету банку, яку ми надішлемо.</li>
              </ol>
            </div>
          )}
        </>
      )}
      {editing ? (
        <div className="mt-4 grid gap-3">
          <label className="text-[13px] font-semibold text-[#2d2a5c]">Назва ФОП або ТОВ (як у документах)<input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="ФОП Прізвище Ім’я По батькові" className={`${input} mt-1`} /></label>
          {/* the buyer sees it before paying (ЗУ «Про електронну комерцію», ст. 7) */}
          <label className="text-[13px] font-semibold text-[#2d2a5c]">Місцезнаходження (як у Єдиному державному реєстрі)<input value={legalAddress} onChange={(e) => setLegalAddress(e.target.value.slice(0, 300))} placeholder="Україна, індекс, область, місто, вулиця, будинок" className={`${input} mt-1`} /><span className="mt-1 block text-[12px] font-normal text-black/50">Покупці бачать його в кошику перед оплатою, як вимагає закон.</span></label>
          <label className="text-[13px] font-semibold text-[#2d2a5c]">РНОКПП (ФОП) або ЄДРПОУ (ТОВ)<input value={ipn} onChange={(e) => setIpn(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" className={`${input} mt-1`} /></label>
          {/* working contacts for buyers: before payment and in the order confirmation only, never in the public profile (Ю-Б, Б-3) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-[#2d2a5c]">Робочий email для покупців<input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value.slice(0, 160))} autoComplete="email" placeholder="name@example.com" className={`${input} mt-1`} /></label>
            <label className="text-[13px] font-semibold text-[#2d2a5c]">Робочий телефон для покупців<input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value.slice(0, 20))} autoComplete="tel" placeholder="+380 XX XXX XX XX" className={`${input} mt-1`} /></label>
          </div>
          <p className="-mt-1 text-[12px] text-black/50">Обов’язково, як і адреса: покупці бачать ці контакти перед оплатою й у листі-підтвердженні замовлення. У вашому публічному профілі вони не показуються. Можна вказати окремий робочий номер.</p>
          <p className="rounded-xl bg-[#faf9ff] px-4 py-3 text-[13px] leading-relaxed text-black/65 ring-1 ring-[#efeafd]">Тримайте на рахунку ФОП у monobank залишок не менше 600 ₴ — цього вимагає банк для повернень коштів покупцям і спірних платежів. Якщо банк не провів повернення через брак коштів, поповніть рахунок не пізніше наступного робочого дня.</p>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-2 ${singlePartner ? "bg-[#eef0fd]" : ""}`}>
            <input type="checkbox" checked={singlePartner} onChange={(e) => setSinglePartner(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#4338ca]" />
            <span className="text-[14px] leading-relaxed text-[#12172b]">Я не приймаю оплати з розподілом платежу через іншу платформу — партнера monobank. <a href="/author-agreement#technical-services" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Чому це важливо</a></span>
          </label>
          {status === "active" && <p className="text-[13px] text-amber-800">Після зміни даних продажі зупиняться, доки банк не підключить новий рахунок.</p>}
          {!paidOk && (
            <div className="rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-2 ${a6 ? "bg-[#eef0fd]" : ""}`}>
                <input type="checkbox" checked={a6} disabled={!!codeStep} onChange={(e) => setA6(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#4338ca]" />
                <span className="text-[14px] leading-relaxed text-[#12172b]">{AUTHOR_PAID_ITEM.text}</span>
              </label>
              <p className="mt-2 text-[13px] text-black/55">
                Докладно в оферті:{" "}
                <a href="/author-agreement#commission-payouts" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Тариф і комісія банку</a>
                {" · "}
                <a href="/author-agreement#taxes" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Податки та розрахункові документи</a>
              </p>
              {codeStep && (
                <div className="mt-3">
                  <p className="text-[13px] leading-relaxed text-black/70">{OTP_TEXT.replace("{{email автора}}", codeStep.email || "вашу пошту")}</p>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Код з листа"
                    placeholder="Код з листа"
                    className={`${input} mt-2 max-w-[220px] text-center text-[20px] tracking-[0.3em]`}
                  />
                </div>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-[13px] text-rose-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60">{saving ? "Надсилаємо…" : !paidOk && !codeStep ? "Надіслати код на пошту" : !paidOk ? "Підписати й надіслати" : "Надіслати"}</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); setCodeStep(null); setCode(""); }} className="min-h-[46px] rounded-xl px-4 text-[14px] font-semibold text-black/55 hover:text-black">Скасувати</button>
          </div>
        </div>
      ) : (
        conn && <button type="button" onClick={() => { setLegalName(conn.legalName ?? ""); setLegalAddress(conn.legalAddress ?? ""); setBuyerEmail(conn.buyerEmail ?? ""); setBuyerPhone(conn.buyerPhone ?? ""); setSinglePartner(!!conn.singlePartner); setIpn(""); setEditing(true); }} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[#f1eeff] px-4 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]">{status === "none" ? "Підключити ФОП" : "Змінити дані"}</button>
      )}
    </section>
  );
}

// «Каса для чеків»: the author's own PRRO in Checkbox. The receipt for the full price goes to the buyer from it,
// formed by Sensoria right after the bank confirms the payment. Only the register's license key and the cashier's PIN
// are accepted (the cashier key is the author's PRRO seal, form 5-ПРРО); the author's personal key is never asked.
function PrroCard() {
  const [st, setSt] = useState<PrroStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      setSt(await fetchPrroStatus());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectPrro({ licenseKey: licenseKey.trim(), pin });
      setEditing(false);
      setLicenseKey("");
      setPin("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося підключити касу.");
    } finally {
      setBusy(false);
    }
  };
  const input = "min-h-[46px] w-full rounded-xl border border-[#d9d4f5] bg-[#faf9ff] px-4 text-[14px] focus:border-[#5b3df5] focus:bg-white focus:outline-none";
  const status = st?.status ?? "none";
  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-prro">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="note" size={20} /></span>
        <div>
          <h2 id="fin-prro" className="text-[20px] font-bold text-[#12172b]">Каса для чеків (ПРРО)</h2>
          <p className="text-[13px] text-black/55">Ви — продавець: покупцю видається фіскальний чек з вашої каси на повну суму оплати. Sensoria формує його автоматично.</p>
        </div>
      </div>
      {failed && <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-black/60">Не вдалося завантажити стан каси. Оновіть сторінку пізніше.</p>}
      {!failed && st && !editing && (
        <>
          {status === "active" && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">Касу підключено. Чеки покупцям формуються автоматично після оплати.</div>}
          {status === "error" && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900">Каса не приймає дані доступу. Перевірте ключ і PIN у кабінеті Checkbox і підключіть ще раз.</div>}
          {status === "none" && (
            <div className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-black/65">
              Без каси платні матеріали не можна купити; безкоштовні публікуються й без неї. Касу підключають один раз —
              інструкція нижче.
            </div>
          )}
        </>
      )}
      {!failed && st && status !== "active" && <PrroGuide />}
      {editing ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-[#2d2a5c]">Ключ ліцензії каси<input type="password" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value.trim())} autoComplete="new-password" spellCheck={false} className={input} /></label>
          <label className="grid gap-1 text-[13px] font-semibold text-[#2d2a5c]">PIN касира<input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="new-password" className={`${input} w-full max-w-[220px]`} /></label>
          <p className="text-[12px] text-black/50">Дані зберігаються лише на сервері в зашифрованому сховищі й потрібні тільки для чеків за вашими продажами на Sensoria. Особистий ключ КЕП не потрібен і не приймається.</p>
          {error && <p role="alert" className="text-[13px] text-rose-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={busy || licenseKey.trim().length < 10 || pin.length < 4} className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60">{busy ? "Перевіряємо касу…" : "Підключити касу"}</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="min-h-[46px] rounded-xl px-4 text-[14px] font-semibold text-black/55 hover:text-black">Скасувати</button>
          </div>
        </div>
      ) : (
        st && <button type="button" onClick={() => setEditing(true)} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[#f1eeff] px-4 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]">{status === "active" ? "Змінити дані каси" : "Підключити касу"}</button>
      )}
    </section>
  );
}

// Step-by-step connection of the author's register — the exact path the operator went through on 18–19.11.2026
// (20-ОПП → Checkbox register → DepositSign cashier key → license key + PIN here). Values are the ones the tax
// cabinet and Checkbox actually ask for; the author signs everything with their own key, Sensoria never does.
/** Plain link: the Checkbox partner programme is not used (20.11.2026 — the contract adds client-support duties). */
const CHECKBOX_URL = "https://checkbox.ua/";

function PrroGuide() {
  const step = "rounded-2xl border border-[#ece8fb] bg-white px-4 py-3";
  const sum = "cursor-pointer list-none text-[14px] font-semibold text-[#2d2a5c] [&::-webkit-details-marker]:hidden";
  const body = "mt-3 space-y-2 text-[13px] leading-relaxed text-black/65";
  const warn = "rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900";
  const row = (k: string, v: string) => (
    <tr key={k} className="border-t border-[#f1eeff] align-top">
      <td className="py-1.5 pr-3 font-semibold text-[#2d2a5c]">{k}</td>
      <td className="py-1.5">{v}</td>
    </tr>
  );
  return (
    <div className="mt-4 grid gap-2">
      <p className="text-[13px] text-black/55">
        Усі форми (20-ОПП, 1-ПРРО, 5-ПРРО) ви подаєте самі, своїм КЕП: Sensoria не подає їх за вас і не отримує вашого ключа.
        Займає 30–40 хвилин і до 1–2 днів очікування відповідей ДПС. Потрібен лише ваш КЕП, яким ви входите в Електронний кабінет.
        Перші 30 днів Checkbox безкоштовний, далі — щомісячна плата за касу (актуальний тариф — на checkbox.ua).
        Надсилати чеки покупцям вам не потрібно: Sensoria формує їх на вашій касі автоматично, покупець отримує чек на пошту й бачить його в «Оплатах».
      </p>

      <details className={step}>
        <summary className={sum}>Крок 1. Повідомте ДПС про місце діяльності (форма 20-ОПП)</summary>
        <div className={body}>
          <p>cabinet.tax.gov.ua → «Введення звітності» → рік і поточний місяць → «Створити» → у пошуку «20-ОПП» (код форми для ФОП починається на F1312). У рядку таблиці:</p>
          <table className="w-full text-[13px]"><tbody>
            {row("Графа 2", "1 — первинне подання")}
            {row("Графа 3", "682 — квартира або 685 — житловий будинок (за адресою реєстрації ФОП)")}
            {row("Графа 4", "назва з довідника, наприклад «Житловий будинок». Запам’ятайте її")}
            {row("Графа 5", "код типу + 00001: 68200001 або 68500001")}
            {row("Графи 6–13", "адреса реєстрації ФОП точно як у витязі з ЄДР")}
            {row("Графа 14", "2 — експлуатується")}
            {row("Графа 15", "1 — власне житло; 3 — житло родичів, де ви проживаєте; 7 — оренда за договором")}
            {row("Графи 16, 17", "порожні (жодних «+»)")}
          </tbody></table>
          <p>«Зберегти» → галочка перевірки → підпис вашим КЕП → «Відправити». Чекайте квитанцію № 2 у «Вхідні/вихідні документи» («документ опрацьовано»), а потім рядок в «Облікові дані платника → Об’єкти оподаткування».</p>
          <p className={warn}>Вказуйте адресу реєстрації ФОП, а не орендоване житло без договору: адреса має підтверджуватися документом. Якщо 20-ОПП ви вже колись подавали — не обирайте «первинне», напишіть у підтримку Sensoria.</p>
        </div>
      </details>

      <details className={step}>
        <summary className={sum}>Крок 2. Зареєструйте касу в Checkbox (форма 1-ПРРО)</summary>
        <div className={body}>
          <p>
            Зареєструйтеся на{" "}
            <a href={CHECKBOX_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#5b4bd0] underline">checkbox.ua</a>{" "}
            → підтвердіть ФОП своїм КЕП. «Каси» → «Додати касу» → <b>основна</b>. Адреса підтягнеться з ДПС сама (з кроку 1) — заявку Checkbox подає сам.
          </p>
          <p>Дочекайтеся статусу «Активна» і фіскального номера каси (зазвичай від кількох хвилин до доби).</p>
          <p className={warn}>Не додавайте резервну касу — це ще одна платна каса, для Sensoria достатньо основної.</p>
        </div>
      </details>

      <details className={step}>
        <summary className={sum}>Крок 3. Додайте касира з окремим ключем (форма 5-ПРРО)</summary>
        <div className={body}>
          <p>Checkbox → «Касири» → «Додати касира» → <b>«Створити ключ DepositSign»</b> → підтвердіть особу своїм КЕП або Дія.Підписом. Назва — будь-яка, наприклад «Sensoria каса 1». Задайте PIN (запишіть його) і прив’яжіть касира до каси з кроку 2. Форму 5-ПРРО Checkbox подасть сам; чекайте статусу «Активний».</p>
          <p className={warn}>Радимо не обирати «ключ ЕЦП, яким заходили в ДПС». Ключ касира постійно зберігається в Checkbox і підписує кожен чек, тому безпечніше мати для цього окремий ключ, а не ваш особистий КЕП, яким підписуються декларації й договори.</p>
        </div>
      </details>

      <details className={step}>
        <summary className={sum}>Крок 4. Підключіть касу тут</summary>
        <div className={body}>
          <p>Ключ ліцензії: Checkbox → «Каси» → колонка «Ключ ліцензії» вашої основної каси. PIN — той, що ви задали касиру. Натисніть «Підключити касу» нижче: ми перевіримо, що каса відкривається.</p>
          <p>Нікому не пересилайте ключ ліцензії й PIN, зокрема в чат підтримки.</p>
        </div>
      </details>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} flex min-w-0 items-center gap-4 px-4 py-5 sm:px-5`}>
      <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0] sm:flex"><Icon name={icon} size={24} /></span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-black/60">{label}</div>
        <div className="mt-0.5 truncate text-[22px] font-bold text-[#12172b] sm:text-[26px]">{value}</div>
        {hint && <div className="text-[12px] leading-snug text-black/50">{hint}</div>}
      </div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#f1eefb]">
      <dt className="text-[13px] text-black/55">{label}</dt>
      <dd className="mt-0.5 text-[16px] font-bold text-[#12172b]">{value}</dd>
      {note && <p className="mt-1.5 text-[13px] leading-snug text-black/55">{note}</p>}
    </div>
  );
}

function Mini({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#efeafd]">
      <div className="text-[12px] text-black/55">{label}</div>
      <div className={`font-bold ${danger ? "text-rose-700" : "text-[#12172b]"}`}>{value}</div>
      {hint && <div className="text-[12px] text-black/45">{hint}</div>}
    </div>
  );
}

function InfoTile({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <li className="rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ece9fe] text-[#6d5bd0]"><Icon name={icon} size={17} /></span>
      <div className="mt-2 text-[14px] font-semibold text-[#12172b]">{title}</div>
      <p className="mt-1 text-[13px] leading-snug text-black/55">{text}</p>
    </li>
  );
}

function Notice({ tone, children }: { tone: "info" | "warn" | "danger"; children: ReactNode }) {
  return <div className={`rounded-2xl px-5 py-3.5 text-[14px] leading-relaxed ring-1 ${TONE[tone]}`}>{children}</div>;
}

// Month choice for the report, in the site's own style (a native <select> opens the browser's grey list).
function MonthPicker({ months, value, onChange, label }: { months: string[]; value: string; onChange: (m: string) => void; label: (m: string) => string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Місяць звіту: ${label(value)}`} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-[44px] items-center gap-3 rounded-xl bg-white pl-4 pr-3 text-[14px] font-semibold text-[#12172b] ring-1 ring-[#e3def9] transition hover:ring-[#c9bff7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
        <span className="first-letter:uppercase">{label(value)}</span>
        <span className={`text-[#6d5bd0] transition-transform ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={16} /></span>
      </button>
      {open && (
        <ul role="listbox" aria-label="Місяць звіту" className="absolute right-0 z-20 mt-2 max-h-[260px] min-w-full overflow-auto rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(60,60,140,0.45)] ring-1 ring-[#ebe8ff]">
          {months.map((m) => (
            <li key={m} role="option" aria-selected={m === value}>
              <button type="button" onClick={() => { onChange(m); setOpen(false); }} className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-left text-[14px] first-letter:uppercase ${m === value ? "bg-[#eef0fd] font-semibold text-[#4338ca]" : "text-[#12172b] hover:bg-[#faf9ff]"}`}>
                <span className="first-letter:uppercase">{label(m)}</span>
                {m === value && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// «Історія»: the latest operations first (4, then more on request), a filter by direction and a month calendar
// that marks the days with operations; picking a day shows only that day.
type HistKind = "all" | "in" | "out";
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function HistoryPanel({ rows }: { rows: HistoryRow[] }) {
  const [kind, setKind] = useState<HistKind>("all");
  const [day, setDay] = useState<string | null>(null);
  const [shown, setShown] = useState(4);
  const latest = rows[0] ? new Date(rows[0].date) : new Date();
  const [view, setView] = useState(() => new Date(latest.getFullYear(), latest.getMonth(), 1));
  useEffect(() => setShown(4), [kind, day]);

  const byKind = rows.filter((r) => (kind === "all" ? true : kind === "in" ? (r.amountKop ?? 0) > 0 : (r.amountKop ?? 0) < 0));
  const list = day ? byKind.filter((r) => dayKey(r.date) === day) : byKind;
  const marks = new Map<string, { inn: boolean; out: boolean }>();
  byKind.forEach((r) => {
    const k = dayKey(r.date);
    const m = marks.get(k) ?? { inn: false, out: false };
    if ((r.amountKop ?? 0) > 0) m.inn = true;
    if ((r.amountKop ?? 0) < 0) m.out = true;
    marks.set(k, m);
  });

  const y = view.getFullYear();
  const mo = view.getMonth();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(y, mo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayKey = dayKey(new Date().toISOString());
  const monthTitle = view.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  const pill = (on: boolean) => `min-h-[40px] rounded-2xl px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${on ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Які операції показати">
          {([["all", "Усі"], ["in", "Надходження"], ["out", "Виплати й списання"]] as [HistKind, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>{l}</button>
          ))}
          {day && (
            <button type="button" onClick={() => setDay(null)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-2xl bg-[#f1eeff] px-3.5 text-[13px] font-semibold text-[#5b4bd0]">
              {new Date(`${day}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })} <span aria-hidden="true">✕</span><span className="sr-only">Показати всі дні</span>
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-6 text-center text-[14px] text-black/50 ring-1 ring-[#f1eefb]">{day ? "Цього дня таких операцій не було." : "Таких операцій поки немає."}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {list.slice(0, shown).map((h) => (
              <li key={h.key} className="flex items-start justify-between gap-3 rounded-2xl bg-[#faf9ff] px-4 py-3 ring-1 ring-[#f1eefb]">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-[#12172b]">{h.label}</span>
                  <span className="block text-[12px] text-black/50">{new Date(h.date).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{h.note ? ` · ${h.note}` : ""}</span>
                </span>
                {h.amountKop != null && <span className={`shrink-0 text-[14px] font-bold ${h.amountKop < 0 ? "text-rose-600" : "text-[#1d7a45]"}`}>{h.amountKop > 0 ? "+" : "−"}{uahFromKop(Math.abs(h.amountKop))}</span>}
              </li>
            ))}
          </ul>
        )}
        {list.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + 10)} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff]">
            Переглянути далі ({Math.min(10, list.length - shown)}) <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>

      {/* calendar */}
      <div className="self-start rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#f1eefb]">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Попередній місяць" onClick={() => setView(new Date(y, mo - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6d5bd0] hover:bg-white"><span className="rotate-90"><Icon name="chevron" size={16} /></span></button>
          <div className="text-[14px] font-semibold text-[#12172b] first-letter:uppercase">{monthTitle}</div>
          <button type="button" aria-label="Наступний місяць" onClick={() => setView(new Date(y, mo + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6d5bd0] hover:bg-white"><span className="-rotate-90"><Icon name="chevron" size={16} /></span></button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[12px] font-medium text-black/40">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={`e${i}`} />;
            const k = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const m = marks.get(k);
            const on = day === k;
            return (
              <button
                key={k}
                type="button"
                disabled={!m}
                aria-pressed={on}
                aria-label={`${d} ${monthTitle}${m ? ", є операції" : ""}`}
                onClick={() => setDay(on ? null : k)}
                className={`relative flex h-9 flex-col items-center justify-center rounded-xl text-[13px] transition ${on ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] font-semibold text-white" : m ? "bg-white font-semibold text-[#12172b] ring-1 ring-[#e3def9] hover:ring-[#c9bff7]" : "text-black/35"} ${k === todayKey && !on ? "text-[#4338ca]" : ""}`}
              >
                {d}
                {m && !on && (
                  <span className="absolute bottom-1 flex gap-0.5" aria-hidden="true">
                    {m.inn && <span className="h-1 w-1 rounded-full bg-[#22a35a]" />}
                    {m.out && <span className="h-1 w-1 rounded-full bg-rose-500" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-black/50">
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#22a35a]" /> надходження</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> виплати й списання</span>
        </div>
      </div>
    </div>
  );
}

// «Тариф до повернення»: after a refund on a later day (or a chargeback debited from the author in full) Sensoria
// transfers its tariff back within 5 working days (offer: «Повернення коштів покупцям», Б39). The author's own rows only.
function TariffBackList({ card }: { card: string }) {
  type Row = { purchase_id: string; amount_kop: number; due_date: string; status: string; paid_at: string | null; reason?: string | null };
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!supabase) return;
    void supabase.from("tariff_refund_tasks").select("purchase_id, amount_kop, due_date, status, paid_at, reason").order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);
  if (!rows.length) return null;
  const order = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-tariff-back">
      <h2 id="fin-tariff-back" className="text-[20px] font-bold text-[#12172b]">Тариф до повернення вам</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-black/55">Після повернення коштів покупцю пізніше дня оплати (або програного спору) Sensoria перераховує вам свій тариф окремим платежем протягом 5 робочих днів.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.purchase_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[13px] ring-1 ring-[#efeafd]">
            <span className="text-[#12172b]">Замовлення № {order(r.purchase_id)}{r.reason === "chargeback" ? " · спірний платіж" : ""}</span>
            {r.status === "paid" ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">Тариф повернено {r.paid_at ? day(r.paid_at) : ""} · {uahFromKop(r.amount_kop)}</span>
            ) : (
              <span className="rounded-full bg-[#eef0fd] px-3 py-1 font-semibold text-[#4338ca]">Тариф до повернення: {uahFromKop(r.amount_kop)}, до {day(r.due_date)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
