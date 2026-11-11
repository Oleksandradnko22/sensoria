// «Фінанси» in the author cabinet. What does not depend on the bank is complete: how a payment is split (70 % when
// the buyer came through Sensoria, 85 % through the author's own link), income by month and by material, every sale
// with its source and status, the bank account. How the money reaches the author (payouts) depends on monobank's
// answer, so that block shows the rules that will be filled in then («Уточнюється»), not invented numbers.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "../../context/SessionContext";
import { fetchMyFinance, markFinanceNotificationsRead, saveBankAccount, touchFinanceActivity, type FinanceSale, type MyFinance } from "../../lib/finance";
import { STATUS_LABEL, financeTotals, historyRows, incomeByMaterial, isFullyRefunded, monthlyIncome, netAuthorKop, statusExplanation, uahFromKop } from "../../utils/financeView";
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
  const sales: FinanceSale[] = useMemo(() => (demo ? demoWorld().sales : realSales), [demo, realSales]);

  const totals = useMemo(() => financeTotals(sales), [sales]);
  const months = useMemo(() => monthlyIncome(sales, 6), [sales]);
  const materials = useMemo(() => incomeByMaterial(sales).slice(0, 5), [sales]);
  const maxMonth = Math.max(1, ...months.map((m) => m.catalogKop + m.referralKop));

  const terms = data?.terms;
  const catalogPct = terms ? (10000 - terms.commissionBps) / 100 : 70;
  const referralPct = terms ? (10000 - terms.referralCommissionBps) / 100 : 85;
  const acc = data?.account;
  const banner = acc ? statusExplanation(acc.status, acc.debtKop) : null;
  // Unpaid balance: what Sensoria owes the author and has not paid out yet. Refunds are taken from HERE (never from the
  // author's FOP account); when it is not enough the balance goes below zero and the next income covers it.
  const demoPending = demo ? sales.reduce((n, s) => n + s.pendingKop, 0) : 0;
  const bal = demo
    ? { pending: demoPending, available: Math.max(0, totals.monthKop - demoPending), reserved: 0, debt: 0 }
    : { pending: acc?.pendingKop ?? 0, available: acc?.availableKop ?? 0, reserved: acc?.reservedKop ?? 0, debt: acc?.debtKop ?? 0 };
  const balanceKop = bal.pending + bal.available + bal.reserved - bal.debt;
  // the worked example uses the real rate: a 1000 ₴ program bought through the catalog
  const exampleAuthor = Math.round(1000 * catalogPct) / 100;

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
          <p className="mt-1 text-[15px] text-black/55">Ваш дохід, продажі й умови співпраці.</p>
        </div>
        {terms?.mode === "test" && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-800 ring-1 ring-amber-200">Тестовий режим: реальні гроші не рухаються</span>}
      </div>

      {ready && loadError && <Notice tone="danger">{loadError} <button type="button" onClick={() => void reload()} className="ml-2 font-semibold underline">Спробувати ще раз</button></Notice>}
      {demo && <Notice tone="info">Демо-дані: так виглядатиме розділ, коли з’являться ваші перші продажі.</Notice>}
      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

      {/* BALANCE */}
      <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-balance">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="fin-balance" className="text-[20px] font-bold text-[#12172b]">Баланс</h2>
            <p className="mt-1 text-[14px] text-black/55">Ваші кошти, які ще не виплачено.</p>
          </div>
          <div className={`text-[34px] font-bold leading-none sm:text-[40px] ${balanceKop < 0 ? "text-rose-600" : "text-[#12172b]"}`}>{balanceKop < 0 ? "−" : ""}{uahFromKop(Math.abs(balanceKop))}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Mini label="Доступно" value={uahFromKop(bal.available)} />
          <Mini label="Очікує підтвердження" value={uahFromKop(bal.pending)} hint={!demo && data?.nextReleaseAt ? `з ${fmtShort(data.nextReleaseAt)}` : terms ? `${terms.holdDays} днів після покупки` : undefined} />
          <Mini label="Резерв на повернення" value={uahFromKop(bal.reserved)} />
          <Mini label="Мінус після повернень" value={bal.debt ? `−${uahFromKop(bal.debt)}` : uahFromKop(0)} danger={bal.debt > 0} hint={bal.debt ? "покривається наступними надходженнями" : undefined} />
        </div>
        <div className="mt-4 rounded-2xl bg-[#f6f4ff] p-4 text-[13px] leading-relaxed text-[#2d2a5c]">
          <div className="flex items-center gap-2 font-semibold"><Icon name="refresh" size={15} /> Повернення коштів покупцю списуються з цього балансу, а не з вашого рахунку ФОП</div>
          <p className="mt-1.5 text-black/60">
            Наприклад, програма за 1000 ₴: вам {exampleAuthor} ₴, Sensoria {1000 - exampleAuthor} ₴. Якщо покупець повертає кошти, Sensoria повертає свою частину, а на вашому балансі з’являється −{exampleAuthor} ₴. Якщо балансу не вистачає, він стає від’ємним, і наступні надходження (одне чи кілька) спершу покривають цей мінус, а решта йде вам.
          </p>
        </div>
      </section>

      {/* HOW A PAYMENT IS SPLIT */}
      <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-split">
        <h2 id="fin-split" className="text-[20px] font-bold text-[#12172b]">Як ділиться оплата</h2>
        <p className="mt-1 text-[14px] text-black/55">Ваша частка залежить від того, звідки прийшов покупець.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SplitTile icon="compass" title="Покупець прийшов через Sensoria" text="З каталогу, пошуку, рекомендацій платформи." you={catalogPct} />
          <SplitTile icon="heart" title="Покупець прийшов за вашим посиланням" text="Перейшов за вашим особистим посиланням (діє 30 днів)." you={referralPct} accent />
        </div>
        {link && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#f6f4ff] p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[#2d2a5c]">Ваше посилання</div>
              <div className="mt-0.5 truncate text-[13px] text-[#4d5278]" title={link}>{link}</div>
            </div>
            <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2">
              <Icon name={copied ? "check" : "clip"} size={16} /> {copied ? "Скопійовано" : "Копіювати"}
            </button>
            <p className="w-full text-[12px] leading-snug text-black/55">Діліться ним у соцмережах, розсилках і на консультаціях: з кожної покупки за ним ви отримуєте {referralPct}% замість {catalogPct}%.</p>
          </div>
        )}
      </section>

      {/* TOTALS */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat icon="card" label="Зароблено за весь час" value={uahFromKop(totals.allTimeKop)} hint="Ваша частка, без повернень" />
        <Stat icon="chart" label="Цього місяця" value={uahFromKop(totals.monthKop)} />
        <Stat icon="graduation" label="Продажів" value={String(totals.salesCount)} hint={totals.salesCount ? `${totals.referralCount} за вашим посиланням` : undefined} />
        <Stat icon="refresh" label="Повернень" value={String(totals.refundsCount)} hint="Покупці можуть повернути кошти протягом 14 днів" />
      </div>

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
                  <span className="text-[11px] font-semibold text-[#2d2a5c]">{total ? uahFromKop(total).replace(/\s?₴/, "") : ""}</span>
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
              const status = refunded
                ? "Повернено покупцю"
                : s.refundedKop > 0
                  ? `Частково повернено (${uahFromKop(s.refundedKop)})`
                  : s.pendingKop > 0
                    ? `Підтвердження до ${fmtShort(s.holdUntil)}`
                    : "Зараховано";
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/5 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-[#12172b]">{s.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-black/55">
                      <span>{fmtShort(s.confirmedAt)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${s.source === "referral" ? "bg-emerald-50 text-emerald-700" : "bg-[#f1eeff] text-[#5b4bd0]"}`}>{s.source === "referral" ? `Ваше посилання · ${(10000 - s.commissionBps) / 100}%` : `Через Sensoria · ${(10000 - s.commissionBps) / 100}%`}</span>
                      <span>ціна {uahFromKop(s.priceKop)}</span>
                      <span className={refunded ? "text-rose-600" : s.pendingKop > 0 ? "text-amber-700" : ""}>· {status}</span>
                    </div>
                  </div>
                  <div className={`shrink-0 text-[16px] font-bold ${refunded ? "text-black/35 line-through" : "text-[#1d7a45]"}`}>+{uahFromKop(refunded ? s.authorKop : netAuthorKop(s))}</div>
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

      <div className="grid gap-6 xl:grid-cols-2">
        {/* PAYOUTS: rules to be filled in after monobank */}
        <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-payouts">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="card" size={20} /></span>
            <div>
              <h2 id="fin-payouts" className="text-[20px] font-bold text-[#12172b]">Виплати</h2>
              <p className="text-[13px] text-black/55">З’являться після підключення оплати через банк.</p>
            </div>
          </div>
          <dl className="mt-4 flex flex-col divide-y divide-black/5 text-[14px]">
            <Row label="Як надходять кошти" value="Уточнюється" note="Одразу на ваш рахунок ФОП у момент покупки або виплатою від Sensoria: залежить від схеми банку." />
            <Row label="Коли надходять" value="Уточнюється" note={terms ? `Сьогодні в системі: ${terms.holdDays} днів на підтвердження покупки.` : undefined} />
            <Row label="Мінімальна сума" value="Уточнюється" />
            <Row label="Комісія банку" value="Уточнюється" note="Комісію за еквайринг сплачує Sensoria зі своєї частки: ваша частка не зменшується." />
            <Row label="Повернення коштів" value="14 днів" note="Покупець може повернути кошти протягом 14 днів. Вашу частку буде списано з балансу, не з рахунку ФОП." />
          </dl>
        </section>

        <BankAccountCard data={data} reload={reload} />
      </div>

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

      {/* TAXES & DOCUMENTS */}
      <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-tax">
        <h2 id="fin-tax" className="text-[20px] font-bold text-[#12172b]">Податки й документи</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          <InfoTile icon="idcard" title="Ви працюєте як ФОП" text="Податки зі своєї частки ви сплачуєте самостійно. Sensoria сплачує податки лише зі своєї комісії." />
          <InfoTile icon="note" title="Акти й звіти" text="Щомісячний звіт про продажі та акт про комісію Sensoria з’являться тут після підключення оплати." />
          <InfoTile icon="shield" title="Реквізити захищені" text="Номер рахунку видно лише вам і команді Sensoria для перевірки. Номер картки ми не приймаємо й не зберігаємо." />
        </ul>
      </section>

      {/* HISTORY & NOTIFICATIONS (rarely needed: folded) */}
      {data && (data.ledger.length > 0 || data.notifications.length > 0) && (
        <details className={`${card} group p-5 sm:p-6`}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-[17px] font-bold text-[#12172b]">
            Історія операцій і сповіщення {data.notifications.some((n) => !n.readAt) && <span className="ml-2 rounded-full bg-[#7c5cf0] px-2 py-0.5 text-[11px] text-white">нові</span>}
            <span className="transition-transform group-open:rotate-180"><Icon name="chevron" size={18} /></span>
          </summary>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <ul className="flex flex-col">
              {historyRows(data.ledger).slice(0, 40).map((h) => (
                <li key={h.key} className="flex justify-between gap-3 border-b border-black/5 py-2.5 text-[13px] last:border-0">
                  <span><span className="font-medium text-[#12172b]">{h.label}</span><span className="block text-black/50">{fmtShort(h.date)}{h.note ? ` · ${h.note}` : ""}</span></span>
                  {h.amountKop != null && <span className={`font-semibold ${h.amountKop < 0 ? "text-rose-600" : "text-[#1d7a45]"}`}>{h.amountKop > 0 ? "+" : "−"}{uahFromKop(Math.abs(h.amountKop))}</span>}
                </li>
              ))}
            </ul>
            <div>
              {data.notifications.some((n) => !n.readAt) && (
                <button type="button" onClick={() => void markFinanceNotificationsRead().then(reload).catch(() => {})} className="mb-2 text-[13px] font-semibold text-[#5b4bd0] hover:underline">Позначити прочитаними</button>
              )}
              <ul className="flex flex-col">
                {data.notifications.slice(0, 12).map((n) => (
                  <li key={n.id} className={`whitespace-pre-line border-b border-black/5 py-2.5 text-[13px] leading-relaxed last:border-0 ${n.readAt ? "text-black/50" : "text-[#12172b]"}`}>{n.message}</li>
                ))}
              </ul>
            </div>
          </div>
          {acc && <p className="mt-4 text-[12px] text-black/50">Статус фінансового акаунта: {STATUS_LABEL[acc.status] ?? acc.status}{acc.salesSuspended ? " · нові продажі призупинено" : ""}</p>}
        </details>
      )}
    </div>
  );
}

function BankAccountCard({ data, reload }: { data: MyFinance | null; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState("");
  const [taxId, setTaxId] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verified = data?.bankAccounts.find((b) => b.status === "verified") ?? null;
  const pending = data?.bankAccounts.find((b) => b.status === "pending") ?? null;
  const rejected = !pending && !verified ? data?.bankAccounts.find((b) => b.status === "rejected") ?? null : null;
  const cleanIban = iban.replace(/\s+/g, "").toUpperCase();
  const problem = !holder.trim() ? "Вкажіть ПІБ власника рахунку." : !/^\d{8}(\d{2})?$/.test(taxId.trim()) ? "РНОКПП — 10 цифр, ЄДРПОУ — 8 цифр." : !/^UA\d{27}$/.test(cleanIban) ? "IBAN має починатися з UA і містити 29 символів." : null;

  const save = async () => {
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await saveBankAccount({ iban: cleanIban, bankName, holderName: holder.trim(), taxId: taxId.trim() });
      setSaved(true);
      setEditing(false);
      window.setTimeout(() => setSaved(false), 3500);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти.");
    } finally {
      setSaving(false);
    }
  };
  const input = "min-h-[46px] w-full rounded-xl border border-[#d9d4f5] bg-[#faf9ff] px-4 text-[14px] focus:border-[#5b3df5] focus:bg-white focus:outline-none";

  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-bank">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="idcard" size={20} /></span>
        <div>
          <h2 id="fin-bank" className="text-[20px] font-bold text-[#12172b]">Рахунок для надходжень</h2>
          <p className="text-[13px] text-black/55">Рахунок ФОП, власником якого є ви. Перевіряє команда Sensoria.</p>
        </div>
      </div>
      {verified && !editing && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">Підтверджено: {verified.bankName || "Банк"} · IBAN ••••{verified.ibanLast4}<div className="text-[13px] text-emerald-800/70">{verified.holderName}</div></div>}
      {pending && !editing && <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">На перевірці: IBAN ••••{pending.ibanLast4}, {pending.holderName}.</div>}
      {rejected && !editing && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900">Рахунок ••••{rejected.ibanLast4} не підтверджено{rejected.rejectReason ? `: ${rejected.rejectReason}` : ""}. Вкажіть рахунок ще раз.</div>}
      {!verified && !pending && !rejected && !editing && <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[14px] text-black/60">Рахунок ще не вказано. Без нього оплати за ваші матеріали не зможуть надходити.</p>}
      {editing ? (
        <div className="mt-4 grid gap-3">
          <label className="text-[13px] font-semibold text-[#2d2a5c]">ПІБ власника рахунку (як у банку)<input value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="name" className={`${input} mt-1`} /></label>
          <label className="text-[13px] font-semibold text-[#2d2a5c]">РНОКПП або ЄДРПОУ<input value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" className={`${input} mt-1`} /></label>
          <label className="text-[13px] font-semibold text-[#2d2a5c]">IBAN<input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} placeholder="UA00 0000 0000 0000 0000 0000 0000 0" className={`${input} mt-1`} /></label>
          <label className="text-[13px] font-semibold text-[#2d2a5c]">Банк<input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Наприклад, monobank" className={`${input} mt-1`} /></label>
          {error && <p role="alert" className="text-[13px] text-rose-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60">{saving ? "Надсилаємо…" : "Надіслати на перевірку"}</button>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} className="min-h-[46px] rounded-xl px-4 text-[14px] font-semibold text-black/55 hover:text-black">Скасувати</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-[#f1eeff] px-4 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]">{verified || pending ? "Змінити рахунок" : "Вказати рахунок"}</button>
      )}
      {saved && <p role="status" className="mt-2 text-[13px] text-emerald-700">Надіслано на перевірку.</p>}
    </section>
  );
}

function SplitTile({ icon, title, text, you, accent }: { icon: IconName; title: string; text: string; you: number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${accent ? "bg-emerald-50/60 ring-emerald-100" : "bg-[#faf9ff] ring-[#efeafd]"}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-emerald-100 text-emerald-700" : "bg-[#ece9fe] text-[#6d5bd0]"}`}><Icon name={icon} size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-[#12172b]">{title}</div>
          <div className="mt-0.5 text-[13px] text-black/55">{text}</div>
        </div>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white ring-1 ring-black/5" aria-hidden="true">
        <div className={accent ? "bg-[#22a35a]" : "bg-[#7c5cf0]"} style={{ width: `${you}%` }} />
        <div className="flex-1 bg-[#d9d4f5]" />
      </div>
      <div className="mt-2 flex justify-between text-[13px]">
        <span className="font-bold text-[#12172b]">Вам {you}%</span>
        <span className="text-black/55">Sensoria {Math.round((100 - you) * 100) / 100}%</span>
      </div>
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
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[14px] text-black/60">{label}</dt>
        <dd className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${value === "Уточнюється" ? "bg-amber-50 text-amber-800" : "bg-[#f1eeff] text-[#5b4bd0]"}`}>{value}</dd>
      </div>
      {note && <p className="mt-1 text-[12px] leading-snug text-black/50">{note}</p>}
    </div>
  );
}

function Mini({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#efeafd]">
      <div className="text-[12px] text-black/55">{label}</div>
      <div className={`font-bold ${danger ? "text-rose-700" : "text-[#12172b]"}`}>{value}</div>
      {hint && <div className="text-[11px] text-black/45">{hint}</div>}
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
