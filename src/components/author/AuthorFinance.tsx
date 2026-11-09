import { useEffect, useMemo, useState } from "react";
import { useSession } from "../../context/SessionContext";
import {
  fetchMyFinance,
  markFinanceNotificationsRead,
  requestPayout,
  saveBankAccount,
  touchFinanceActivity,
  type MyFinance,
} from "../../lib/finance";
import { STATUS_LABEL, historyRows, statusExplanation, uahFromKop } from "../../utils/financeView";

const PAYOUT_STATUS: Record<string, string> = {
  requested: "Очікує виконання",
  processing: "Виконується",
  paid: "Виплачено",
  failed: "Не виконано",
  cancelled: "Скасовано",
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) : "";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("uk-UA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TONE = {
  info: "bg-sky-50 text-sky-900 border-sky-100",
  warn: "bg-amber-50 text-amber-900 border-amber-100",
  danger: "bg-rose-50 text-rose-900 border-rose-100",
};

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-black/5 p-5">
      <div className="text-[13px] text-black/45">{label}</div>
      <div className="text-[24px] font-bold mt-1.5">{value}</div>
      {hint && <div className="text-[12px] text-black/40 mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

export default function AuthorFinance() {
  const session = useSession();
  const [data, setData] = useState<MyFinance | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [taxId, setTaxId] = useState("");
  const [editingBank, setEditingBank] = useState(false);
  const [savingRequisites, setSavingRequisites] = useState(false);
  const [requisitesSaved, setRequisitesSaved] = useState(false);
  const [requisitesError, setRequisitesError] = useState<string | null>(null);

  const [showPayout, setShowPayout] = useState(false);
  const [amount, setAmount] = useState("");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutInfo, setPayoutInfo] = useState<string | null>(null);

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

  const profileId = session?.profile.id;
  useEffect(() => {
    if (!profileId) return;
    touchFinanceActivity("view_finance");
    void reload();
  }, [profileId]);

  const history = useMemo(() => (data ? historyRows(data.ledger) : []), [data]);
  const acc = data?.account;
  const terms = data?.terms;
  const minKop = terms?.minPayoutKop ?? 50000;
  const banner = acc ? statusExplanation(acc.status, acc.debtKop) : null;
  const unread = data?.notifications.filter((n) => !n.readAt).length ?? 0;
  const totalKop = acc ? acc.pendingKop + acc.availableKop + acc.reservedKop : 0;
  const verifiedBank = data?.bankAccounts.find((b) => b.status === "verified") ?? null;
  const pendingBank = data?.bankAccounts.find((b) => b.status === "pending") ?? null;
  const lastRejected = !pendingBank && !verifiedBank ? data?.bankAccounts.find((b) => b.status === "rejected") ?? null : null;
  const canWithdraw = !!acc && acc.debtKop === 0 && acc.availableKop >= minKop && !!verifiedBank && acc.status !== "CLOSED";

  const saveRequisites = async () => {
    setSavingRequisites(true);
    setRequisitesError(null);
    try {
      await saveBankAccount({ iban, bankName, holderName: holder, taxId });
      setRequisitesSaved(true);
      setEditingBank(false);
      setTimeout(() => setRequisitesSaved(false), 3500);
      await reload();
    } catch (e) {
      setRequisitesError(e instanceof Error ? e.message : "Не вдалося зберегти.");
    } finally {
      setSavingRequisites(false);
    }
  };

  const parsed = Number(amount.replace(",", "."));
  const kop = Math.round(parsed * 100);

  const submitPayout = async () => {
    if (!Number.isFinite(parsed) || parsed <= 0) return setPayoutError("Вкажіть коректну суму.");
    if (kop < minKop) return setPayoutError(`Мінімальна сума виплати — ${uahFromKop(minKop)}.`);
    if (acc && kop > acc.availableKop) return setPayoutError(`Сума не може перевищувати доступний баланс — ${uahFromKop(acc.availableKop)}.`);
    setPayoutBusy(true);
    setPayoutError(null);
    try {
      await requestPayout(kop);
      setShowPayout(false);
      setPayoutInfo("Запит на виплату створено. Sensoria виконає його й підтвердить у цьому розділі.");
      await reload();
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : "Не вдалося створити запит.");
    } finally {
      setPayoutBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Фінанси</h1>
        <p className="text-black/50 mt-1">Баланс, заборгованість, виплати та історія операцій.</p>
      </div>

      {ready && loadError && <div className="text-[13px] text-rose-700 bg-rose-50 rounded-xl px-4 py-3">{loadError}</div>}
      {ready && !loadError && data === null && (
        <div className="text-[13px] text-amber-800 bg-amber-50 rounded-xl px-4 py-3">Фінансовий модуль ще не підключено до бази даних.</div>
      )}
      {terms?.mode === "test" && (
        <div className="text-[12px] text-black/55 bg-black/[0.04] rounded-xl px-4 py-3">
          Тестовий режим: реальні гроші поки не рухаються, суми нижче показують, як працюватиме система.
        </div>
      )}
      {banner && <div className={`rounded-2xl border px-5 py-4 text-[14px] leading-relaxed ${TONE[banner.tone]}`}>{banner.text}</div>}
      {payoutInfo && <div className="text-[13px] text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">{payoutInfo}</div>}

      {acc && (
        <>
          {/* BALANCES */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card label="Загальний баланс" value={uahFromKop(totalKop)} hint="Доступні + очікують підтвердження + у резерві" />
            <Card label="Доступно до виплати" value={uahFromKop(acc.availableKop)} />
            <Card
              label="Очікує підтвердження"
              value={uahFromKop(acc.pendingKop)}
              hint={acc.pendingKop > 0 && data?.nextReleaseAt ? `Найближче надходження ${fmtDate(data.nextReleaseAt)}` : terms ? `Кошти за покупку стають доступними через ${terms.holdDays} днів` : undefined}
            />
            <Card
              label="У резерві"
              value={uahFromKop(acc.reservedKop)}
              hint={acc.reservedKop > 0 && data?.nextReserveReleaseAt ? `Резерв на повернення, звільнення ${fmtDate(data.nextReserveReleaseAt)}` : "Резерв на можливі повернення"}
            />
            <Card label="Заборгованість" value={uahFromKop(acc.debtKop)} hint={acc.debtKop > 0 ? "Не помилка: пояснення нижче" : "Немає"} />
            <Card label="Зароблено за весь час" value={uahFromKop(acc.lifetimeEarningsKop)} hint="Ваша частка, за вирахуванням повернень" />
            <Card label="Виплачено" value={uahFromKop(acc.totalPaidOutKop)} hint={acc.inFlightKop > 0 ? `У черзі на виплату: ${uahFromKop(acc.inFlightKop)}` : undefined} />
            <Card label="Повернення за ваш рахунок" value={uahFromKop(acc.totalRefundedKop)} hint="Ваша частка у поверненнях покупцям" />
          </div>

          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
            <div className="flex flex-col gap-6">
              {/* DEBT */}
              {(acc.debtKop > 0 || (data?.debts.length ?? 0) > 0) && (
                <div className="rounded-2xl bg-white border border-black/5 p-6">
                  <h2 className="text-[17px] font-semibold mb-1">Заборгованість</h2>
                  <p className="text-[13px] text-black/55 leading-relaxed mb-4">
                    Борг виникає, коли покупцеві повертають гроші, а ваша частка вже виплачена. Нові нарахування за продажі автоматично його погашають; продажі при цьому не зупиняються, поки ви на зв'язку.
                  </p>
                  <div className="flex flex-col gap-3">
                    {data!.debts.map((d) => (
                      <div key={d.id} className="rounded-xl border border-black/5 px-4 py-3 text-[13px]">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">{d.status === "open" ? "Залишок" : "Погашено"}: {uahFromKop(d.outstandingKop)} з {uahFromKop(d.originalKop)}</span>
                          <span className="text-black/40">{fmtDate(d.createdAt)}</span>
                        </div>
                        <div className="text-black/55 mt-1">{d.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SALES */}
              <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-black/5">
                  <h2 className="text-[17px] font-semibold">Продажі та надходження</h2>
                </div>
                {(data?.sales.length ?? 0) === 0 ? (
                  <div className="px-6 py-8 text-[14px] text-black/45">Підтверджених продажів поки немає.</div>
                ) : (
                  data!.sales.slice(0, 40).map((sale) => {
                    const fully = sale.refundedKop >= sale.priceKop;
                    const status = fully
                      ? "Повернено покупцю"
                      : sale.refundedKop > 0
                        ? `Частково повернено (${uahFromKop(sale.refundedKop)})`
                        : sale.pendingKop > 0
                          ? `Очікує підтвердження до ${fmtDate(sale.holdUntil)}${sale.disputed ? " · спір" : ""}`
                          : "Нараховано на баланс";
                    return (
                      <div key={sale.id} className="grid grid-cols-[1fr_auto] gap-4 px-6 py-3.5 border-b border-black/5 last:border-0 text-[13px]">
                        <div>
                          <div className="font-medium">{sale.title}</div>
                          <div className="text-black/40 mt-0.5">{fmtDateTime(sale.confirmedAt)} · ціна {uahFromKop(sale.priceKop)} · {status}</div>
                        </div>
                        <div className={`font-semibold whitespace-nowrap ${fully ? "text-black/35 line-through" : "text-emerald-600"}`}>
                          +{uahFromKop(sale.authorKop - sale.authorRefundedKop)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* HISTORY */}
              <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-black/5">
                  <h2 className="text-[17px] font-semibold">Історія операцій</h2>
                </div>
                {history.length === 0 ? (
                  <div className="px-6 py-8 text-[14px] text-black/45">Операцій поки немає: вони з'являться після першої підтвердженої покупки.</div>
                ) : (
                  history.slice(0, 60).map((h) => (
                    <div key={h.key} className="grid grid-cols-[1fr_auto] gap-4 px-6 py-3.5 border-b border-black/5 last:border-0 text-[13px]">
                      <div>
                        <div className="font-medium">{h.label}</div>
                        <div className="text-black/40 mt-0.5">{fmtDateTime(h.date)}{h.note ? ` · ${h.note}` : ""}</div>
                      </div>
                      {h.amountKop != null && (
                        <div className={`font-semibold whitespace-nowrap ${h.amountKop < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {h.amountKop > 0 ? "+" : "−"}{uahFromKop(Math.abs(h.amountKop))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* NOTIFICATIONS */}
              <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold">Сповіщення{unread > 0 ? ` (${unread})` : ""}</h2>
                  {unread > 0 && (
                    <button onClick={() => markFinanceNotificationsRead().then(reload)} className="text-[12px] text-black/50 hover:text-black/80">
                      Позначити прочитаними
                    </button>
                  )}
                </div>
                {(data?.notifications.length ?? 0) === 0 ? (
                  <div className="px-6 py-6 text-[14px] text-black/45">Фінансових сповіщень немає.</div>
                ) : (
                  data!.notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className={`px-6 py-3.5 border-b border-black/5 last:border-0 text-[13px] whitespace-pre-line leading-relaxed ${n.readAt ? "text-black/50" : "text-black/80"}`}>
                      {n.message}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* PAYOUTS */}
              <div className="rounded-2xl bg-white border border-black/5 p-6">
                <h2 className="text-[17px] font-semibold mb-4">Виплати</h2>
                <div className="flex flex-col gap-2.5 text-[14px]">
                  {terms && (
                    <>
                      <div className="flex justify-between"><span className="text-black/45">Комісія Sensoria</span><span className="font-medium">{terms.commissionBps / 100}% каталог · {terms.referralCommissionBps / 100}% за вашим посиланням</span></div>
                      <div className="flex justify-between"><span className="text-black/45">Підтвердження покупки</span><span className="font-medium">{terms.holdDays} днів</span></div>
                      {terms.autoPayout ? (
                        <div className="flex justify-between gap-4"><span className="text-black/45">Виплата</span><span className="font-medium text-right">автоматично на підтверджений рахунок</span></div>
                      ) : (
                        <div className="flex justify-between"><span className="text-black/45">Мінімальна виплата</span><span className="font-medium">{uahFromKop(terms.minPayoutKop)}</span></div>
                      )}
                    </>
                  )}
                </div>
                {terms?.splitAtSource ? (
                  <div className="text-[12px] text-black/45 mt-4 leading-snug">
                    Оплата розподіляється в момент покупки: решта після комісії (30% для покупців із каталогу, 15% за вашим реферальним посиланням) надходить одразу на ваш підтверджений банківський рахунок (ФОП). Виплат і запитів немає.
                    {!verifiedBank && " Щоб отримувати кошти, вкажіть рахунок і дочекайтесь підтвердження: до цього продажі не можуть бути оплачені."}
                    {acc.debtKop > 0 && " Поки є заборгованість, її частину буде утримано із вашої частки в нових продажах."}
                  </div>
                ) : terms?.autoPayout ? (
                  <div className="text-[12px] text-black/45 mt-4 leading-snug">
                    Після періоду підтвердження ({terms.holdDays} днів) 75% від ціни автоматично надходять на ваш підтверджений банківський рахунок. 
                    {!verifiedBank && " Щоб виплати пішли, вкажіть рахунок і дочекайтесь підтвердження: до цього кошти залишаються на вашому балансі."}
                    {acc.debtKop > 0 && " Поки є заборгованість, нові надходження спершу погашають її."}
                  </div>
                ) : (
                <>
                <button
                  onClick={() => { setAmount(String(acc.availableKop / 100)); setPayoutError(null); setShowPayout(true); }}
                  disabled={!canWithdraw}
                  className="w-full mt-5 py-3 rounded-xl bg-black text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Запросити виплату
                </button>
                {!canWithdraw && (
                  <div className="text-[12px] text-black/40 mt-2 leading-snug">
                    {acc.debtKop > 0
                      ? "Виплата недоступна, поки є заборгованість."
                      : !verifiedBank
                        ? "Виплати надходять лише на підтверджений банківський рахунок."
                        : `Доступно від ${uahFromKop(minKop)} на балансі.`}
                  </div>
                )}
                </>
                )}

                {(data?.payouts.length ?? 0) > 0 && (
                  <div className="mt-5 pt-4 border-t border-black/5 flex flex-col gap-2.5">
                    {data!.payouts.slice(0, 8).map((p) => (
                      <div key={p.id} className="flex justify-between gap-3 text-[13px]">
                        <div>
                          <div className="font-medium">{uahFromKop(p.amountKop)}</div>
                          <div className="text-black/40">{fmtDate(p.requestedAt)} · {p.destination}</div>
                        </div>
                        <div className="text-black/60 text-right">{PAYOUT_STATUS[p.status] ?? p.status}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* BANK ACCOUNT */}
                <div className="mt-6 pt-5 border-t border-black/5">
                  <div className="text-[13px] font-medium text-black/70 mb-1">Банківський рахунок для виплат</div>
                  <p className="text-[12px] text-black/45 leading-relaxed mb-3">
                    Ваша частка надходить лише на цей рахунок, і лише після підтвердження: власником має бути ви (ПІБ і РНОКПП як у банку). Номер картки Sensoria не приймає й не зберігає.
                  </p>
                  {verifiedBank && !editingBank && (
                    <div className="rounded-xl bg-emerald-50 text-emerald-900 px-4 py-3 text-[13px] leading-relaxed">
                      Підтверджено: {verifiedBank.bankName || "Банк"} · IBAN ••••{verifiedBank.ibanLast4}
                      <div className="text-emerald-800/70">{verifiedBank.holderName}</div>
                    </div>
                  )}
                  {pendingBank && !editingBank && (
                    <div className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-[13px] leading-relaxed mt-2">
                      На перевірці: IBAN ••••{pendingBank.ibanLast4}, {pendingBank.holderName}. Поки перевірка триває, виплати йдуть на попередній підтверджений рахунок (якщо він є).
                    </div>
                  )}
                  {lastRejected && !editingBank && (
                    <div className="rounded-xl bg-rose-50 text-rose-900 px-4 py-3 text-[13px] leading-relaxed">
                      Рахунок ••••{lastRejected.ibanLast4} не підтверджено{lastRejected.rejectReason ? `: ${lastRejected.rejectReason}` : ""}. Вкажіть рахунок ще раз.
                    </div>
                  )}
                  {!editingBank ? (
                    <button
                      onClick={() => { setEditingBank(true); setRequisitesError(null); }}
                      className="mt-3 py-2.5 px-4 rounded-xl border border-black/10 text-[13px] font-medium hover:bg-black/5 transition"
                    >
                      {verifiedBank || pendingBank ? "Змінити рахунок" : "Вказати рахунок"}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="ПІБ власника рахунку (як у банку)" className="w-full px-3 py-2 rounded-lg border border-black/10 text-[13px] focus:outline-none focus:border-black/30" />
                      <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="РНОКПП (10 цифр) або ЄДРПОУ" inputMode="numeric" className="w-full px-3 py-2 rounded-lg border border-black/10 text-[13px] focus:outline-none focus:border-black/30" />
                      <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IBAN (UA…)" className="w-full px-3 py-2 rounded-lg border border-black/10 text-[13px] focus:outline-none focus:border-black/30" />
                      <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Банк" className="w-full px-3 py-2 rounded-lg border border-black/10 text-[13px] focus:outline-none focus:border-black/30" />
                      <div className="flex items-center gap-3 mt-1">
                        <button onClick={saveRequisites} disabled={savingRequisites} className="py-2.5 px-4 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50">
                          {savingRequisites ? "Зберігаємо…" : "Надіслати на перевірку"}
                        </button>
                        <button onClick={() => setEditingBank(false)} className="text-[13px] text-black/45">Скасувати</button>
                      </div>
                    </div>
                  )}
                  {requisitesSaved && <div className="text-[12px] text-emerald-600 mt-2">Надіслано на перевірку ✓</div>}
                  {requisitesError && <div className="text-[12px] text-red-500 mt-2">{requisitesError}</div>}
                  <p className="text-[11px] text-black/35 leading-relaxed mt-3">
                    Sensoria не несе відповідальності за податкові зобов'язання автора: ця відповідальність лежить на авторі.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-black/5 p-6">
                <h2 className="text-[15px] font-semibold mb-1">Статус фінансового акаунта</h2>
                <div className="text-[14px] text-black/70">{STATUS_LABEL[acc.status] ?? acc.status}</div>
                {acc.salesSuspended && <div className="text-[12px] text-rose-600 mt-1">Нові продажі призупинено.</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {showPayout && acc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowPayout(false)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[18px] font-semibold">Запит на виплату</h2>
            <p className="text-[13px] text-black/45 mt-1 mb-5">
              Кошти підуть на вказані реквізити. Комісію платіжного сервісу, якщо вона є, буде вирахувано із суми, що надійде вам.
            </p>
            <div className="text-[13px] font-medium text-black/50 mb-1.5">Сума</div>
            <div className="relative">
              <input
                value={amount}
                onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setPayoutError(null); }}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-black/40">₴</span>
            </div>
            <div className="text-[12px] text-black/40 mt-1.5">Доступно: {uahFromKop(acc.availableKop)}, мінімум {uahFromKop(minKop)}</div>
            {payoutError && <div className="text-[12px] text-red-500 mt-3">{payoutError}</div>}
            <div className="flex items-center gap-3 mt-5">
              <button onClick={submitPayout} disabled={payoutBusy} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40">
                {payoutBusy ? "Надсилаємо…" : "Запросити"}
              </button>
              <button onClick={() => setShowPayout(false)} className="px-5 py-3 rounded-xl text-[14px] font-medium text-black/45 hover:text-black/70 transition">
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <h2 className="text-[17px] font-semibold mb-2">Податкові документи</h2>
        <p className="text-[14px] text-black/60 leading-relaxed">Акти та звіти про дохід з'являться тут після першої виплати.</p>
      </div>
    </div>
  );
}
