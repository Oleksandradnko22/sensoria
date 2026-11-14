// Admin → Фінанси: the platform's money in one place. Reads for everyone with
// access, every change only for the owner, each with a reason that goes to the
// (immutable) finance audit log. The ledger itself can never be edited here:
// a mistake is fixed by a new compensating operation.
import { useCallback, useEffect, useState } from "react";
import { callFinance } from "../../lib/finance";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { STATUS_LABEL, TYPE_LABEL, uahFromKop } from "../../utils/financeView";

import BrandSelect from "../ui/BrandSelect";
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Overview = {
  mode: string;
  settings: Record<string, number>;
  totals: Record<string, number>;
  mismatches: Row[];
  authorsWithDebt: number;
  authorsSuspended: number;
  pendingPayouts: number;
  pendingBankAccounts: number;
  testPayments: number;
  role: "owner" | "support";
};

type Pending = {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  run: (reason: string) => Promise<unknown>;
};

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("uk-UA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const k = (v: unknown) => uahFromKop(Number(v ?? 0));

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white px-4 py-3">
      <div className="text-[12px] text-black/45">{label}</div>
      <div className={`text-[18px] font-semibold mt-0.5 ${tone === "bad" ? "text-rose-600" : ""}`}>{value}</div>
    </div>
  );
}

export default function AdminFinance() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [authors, setAuthors] = useState<Row[]>([]);
  const [queue, setQueue] = useState<Row[]>([]);
  const [banks, setBanks] = useState<Row[]>([]);
  const [feePaid, setFeePaid] = useState({ amount: "", surplus: false });
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [confirmForm, setConfirmForm] = useState({ purchaseId: "", reference: "" });
  const [repay, setRepay] = useState({ amount: "", source: "cash" });
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string> | null>(null);

  const owner = ov?.role === "owner";

  const load = useCallback(async () => {
    try {
      setError(null);
      const [o, a, q] = await Promise.all([
        callFinance<Overview>({ action: "overview" }),
        callFinance<{ authors: Row[] }>({ action: "authors" }),
        callFinance<{ payouts: Row[] }>({ action: "payoutQueue" }),
      ]);
      setOv(o);
      setAuthors(a.authors);
      setQueue(q.payouts);
      if (o.role === "owner") {
        const b = await callFinance<{ accounts: Row[] }>({ action: "bankAccounts" }).catch(() => ({ accounts: [] as Row[] }));
        setBanks(b.accounts);
      }
      setForm({
        authorPercent: String(o.settings.authorBps / 100),
        referralPercent: String(o.settings.referralCommissionBps / 100),
        holdDays: String(o.settings.holdDays),
        reservePercent: String(o.settings.reserveBps / 100),
        reserveDays: String(o.settings.reserveDays),
        inactivityDays: String(o.settings.inactivityDays),
        warningGraceDays: String(o.settings.warningGraceDays),
        minPayoutUah: String(o.settings.minPayoutKop / 100),
        bankFeePercent: String(o.settings.bankFeeBps / 100),
        bankFeeFixedUah: String(o.settings.bankFeeFixedKop / 100),
        autoPayout: String(o.settings.autoPayout),
        splitAtSource: String(o.settings.splitAtSource),
        sensoriaIban: "",
        sensoriaHolder: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити фінанси.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openAuthor = async (id: string) => {
    try {
      setDetail(await callFinance<Row>({ action: "author", authorId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка.");
    }
  };
  const refreshAll = async (authorId?: string) => {
    await load();
    if (authorId) await openAuthor(authorId);
  };

  const ask = (p: Pending) => setPending(p);
  const runPending = async (reason?: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run(reason ?? "");
      setPending(null);
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Дію не виконано.");
    } finally {
      setBusy(false);
    }
  };

  const authorId = detail?.profile?.id as string | undefined;
  const acc = detail?.account as Row | undefined;
  const key = () => crypto.randomUUID();

  const statusBtn = (statusAction: string, label: string, danger = false) => (
    <button
      key={statusAction}
      disabled={!owner}
      onClick={() => ask({
        title: label, confirmLabel: label, danger,
        text: "Продажі нових покупців і статус зміняться. Придбані матеріали залишаються доступними покупцям.",
        run: async (reason) => { await callFinance({ action: "setStatus", authorId, statusAction, reason, requestKey: key() }); setInfo("Готово."); await refreshAll(authorId); },
      })}
      className={`px-3 py-2 rounded-lg text-[13px] border ${danger ? "border-rose-200 text-rose-700 bg-rose-50" : "border-black/10 bg-white"} disabled:opacity-40`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold">Фінанси</h2>
        <p className="text-black/55 text-[14px] mt-1">
          Журнал операцій не редагується: помилки виправляються новими операціями. Кожна дія потребує причини й потрапляє в журнал аудиту.
        </p>
      </div>

      {ov?.mode === "test" && (
        <div className="rounded-xl bg-amber-50 text-amber-900 border border-amber-100 px-4 py-3 text-[13px]">
          Тестовий режим: реальні гроші не рухаються. Платежі підтверджує адміністратор вручну ({ov.testPayments} тестових платежів у журналі).
        </div>
      )}
      {error && <div className="rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-[13px]">{error}</div>}
      {info && <div className="rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3 text-[13px]">{info}</div>}

      {ov && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Загальний оборот" value={k(ov.totals.turnover_kop)} />
            <Stat label="Нараховано авторам (нетто)" value={k(ov.totals.earned_kop)} />
            <Stat label="Комісія Sensoria" value={k(ov.totals.sensoria_revenue_kop)} />
            <Stat label="Виплачено авторам" value={k(ov.totals.paid_out_kop)} />
            <Stat label="Повернено покупцям" value={k(ov.totals.refunded_kop)} />
            <Stat label="Резерви" value={k(ov.totals.author_reserved_kop)} />
            <Stat label="Заборгованість авторів" value={k(ov.totals.author_debt_kop)} tone={Number(ov.totals.author_debt_kop) > 0 ? "bad" : undefined} />
            <Stat label="Очікують на виплату" value={`${ov.pendingPayouts}`} />
            <Stat label="Авторів із боргом" value={`${ov.authorsWithDebt}`} />
            <Stat label="Авторів із призупиненими продажами" value={`${ov.authorsSuspended}`} />
            <Stat label="Утримується (14 днів)" value={k(ov.totals.author_pending_kop)} />
            <Stat label="Комісія банку до розрахунку за випискою" value={k(ov.totals.bank_fee_owed_kop)} />
            <Stat label="Рахунків авторів на перевірці" value={`${ov.pendingBankAccounts}`} />
            <Stat label="Доступно авторам" value={k(ov.totals.author_available_kop)} />
          </div>
          <div className={`rounded-xl px-4 py-3 text-[13px] ${Number(ov.totals.gap_kop) === 0 && ov.mismatches.length === 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {Number(ov.totals.gap_kop) === 0 && ov.mismatches.length === 0
              ? "Звірка: журнал збалансований, баланси авторів збігаються з журналом."
              : `Розбіжність! Різниця журналу: ${k(ov.totals.gap_kop)}, неузгоджених балансів: ${ov.mismatches.length}. Не проводьте виплат, поки не з'ясовано причину.`}
          </div>
        </>
      )}

      {/* BANK ACCOUNTS TO VERIFY */}
      {owner && (
        <section className="rounded-2xl bg-white border border-black/5 p-5">
          <h3 className="text-[16px] font-semibold mb-1">Банківські рахунки авторів на перевірці ({banks.length})</h3>
          <p className="text-[13px] text-black/50 mb-3">
            Підтверджуйте лише якщо власник рахунку збігається з автором: звірте ПІБ і РНОКПП із документами автора. Виплати йдуть тільки на підтверджений рахунок.
          </p>
          {banks.length === 0 ? (
            <div className="text-[13px] text-black/45">Нових рахунків немає.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {banks.map((b) => (
                <div key={b.id} className="border border-black/5 rounded-xl px-4 py-3 text-[13px] flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[240px]">
                    <div className="font-medium">{b.authorName} <span className="text-black/40 font-normal">{b.authorEmail}</span></div>
                    <div className="mt-1">Власник рахунку: <b>{b.holder_name}</b> · РНОКПП/ЄДРПОУ: {b.tax_id}</div>
                    <div className="text-black/55 font-mono text-[12px]">{b.iban} · {b.bank_name || "банк не вказано"}</div>
                    <div className={b.holderMatches ? "text-emerald-700" : "text-amber-700"}>
                      {b.holderMatches ? "Ім'я власника схоже на ім'я автора в профілі." : "Ім'я власника НЕ схоже на ім'я автора в профілі: перевірте особливо уважно."}
                    </div>
                  </div>
                  <button onClick={() => ask({
                    title: "Підтвердити рахунок?", confirmLabel: "Підтвердити", danger: false,
                    text: "Вкажіть, що саме ви звірили (документ, збіг ПІБ і РНОКПП). Попередній підтверджений рахунок буде замінено.",
                    run: async (reason) => { await callFinance({ action: "verifyBankAccount", accountId: b.id, approve: true, reason }); setInfo("Рахунок підтверджено."); await load(); },
                  })} className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white">Підтвердити</button>
                  <button onClick={() => ask({
                    title: "Відхилити рахунок?", confirmLabel: "Відхилити", danger: true, text: "Причину побачить автор.",
                    run: async (reason) => { await callFinance({ action: "verifyBankAccount", accountId: b.id, approve: false, reason }); await load(); },
                  })} className="px-3 py-2 rounded-lg border border-black/10">Відхилити</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PAYOUT QUEUE */}
      <section className="rounded-2xl bg-white border border-black/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-[16px] font-semibold">Виплати до виконання ({queue.length})</h3>
          {owner && queue.length > 0 && (
            <button
              onClick={async () => {
                try {
                  const r = await callFinance<{ csv: string; count: number }>({ action: "payoutRegistry" });
                  const blob = new Blob(["\ufeff" + r.csv], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `sensoria-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                } catch (e) { setError(e instanceof Error ? e.message : "Помилка."); }
              }}
              className="px-3 py-2 rounded-lg border border-black/10 text-[13px]"
            >
              Завантажити реєстр для банку (CSV)
            </button>
          )}
        </div>
        {queue.length === 0 ? (
          <div className="text-[13px] text-black/45">Запитів немає.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {queue.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 text-[13px] border border-black/5 rounded-xl px-4 py-3">
                <div className="min-w-[200px]">
                  <div className="font-semibold">{k(p.amount_kop)}{p.is_auto ? " · авто" : ""}</div>
                  <div className="text-black/45">{p.destination} · {dt(p.requested_at)}</div>
                  {owner && p.destination_holder && <div className="text-black/45">{p.destination_holder}</div>}
                </div>
                <button onClick={() => openAuthor(p.author_id)} className="text-black/55 underline">автор</button>
                <input
                  value={refs[p.id] ?? ""} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })}
                  placeholder="Номер платежу в банку" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-black/10"
                />
                <button
                  disabled={!owner || !(refs[p.id] ?? "").trim()}
                  onClick={async () => {
                    try { await callFinance({ action: "payoutConfirm", payoutId: p.id, reference: refs[p.id], reason: "Виплату виконано" }); setInfo("Виплату підтверджено."); await refreshAll(authorId); } catch (e) { setError(e instanceof Error ? e.message : "Помилка."); }
                  }}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white disabled:opacity-30"
                >
                  Підтвердити виконання
                </button>
                <button
                  disabled={!owner}
                  onClick={() => ask({ title: "Виплату не виконано?", text: "Кошти повернуться на доступний баланс автора.", confirmLabel: "Не виконано", run: async (reason) => { await callFinance({ action: "payoutFail", payoutId: p.id, reason }); await refreshAll(authorId); } })}
                  className="px-3 py-2 rounded-lg border border-black/10 disabled:opacity-30"
                >
                  Не виконано
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AUTHORS */}
      <section className="rounded-2xl bg-white border border-black/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-black/5 text-[16px] font-semibold">Фінансові акаунти авторів</div>
        {authors.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-black/45">Фінансових акаунтів ще немає: вони з'являються після першого входу автора в розділ «Фінанси».</div>
        ) : (
          authors.map((a) => (
            <button key={a.author_id} onClick={() => openAuthor(a.author_id)} className="w-full text-left grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-black/5 last:border-0 text-[13px] hover:bg-black/[0.02]">
              <div><div className="font-medium">{a.name}</div><div className="text-black/40">{a.email}</div></div>
              <div>{STATUS_LABEL[a.account_status] ?? a.account_status}</div>
              <div>Борг: <span className={Number(a.debt_kop) > 0 ? "text-rose-600 font-medium" : ""}>{k(a.debt_kop)}</span></div>
              <div>Доступно: {k(a.available_kop)}</div>
              <div>Очікує: {k(a.pending_kop)}</div>
            </button>
          ))
        )}
      </section>

      {/* AUTHOR DETAIL */}
      {detail && acc && authorId && (
        <section className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[18px] font-semibold">{detail.profile?.name ?? "Автор"}</h3>
              <div className="text-[13px] text-black/45">{detail.profile?.email} · {STATUS_LABEL[acc.account_status] ?? acc.account_status}{acc.sales_suspended ? " · продажі призупинено" : ""}</div>
            </div>
            <button onClick={() => setDetail(null)} className="text-[13px] text-black/45">Закрити</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Очікує" value={k(acc.pending_kop)} />
            <Stat label="Доступно" value={k(acc.available_kop)} />
            <Stat label="Резерв" value={k(acc.reserved_kop)} />
            <Stat label="Борг" value={k(acc.debt_kop)} tone={Number(acc.debt_kop) > 0 ? "bad" : undefined} />
            <Stat label="Зароблено" value={k(acc.lifetime_earnings_kop)} />
            <Stat label="Виплачено" value={k(acc.total_paid_out_kop)} />
            <Stat label="Повернення за рахунок автора" value={k(acc.total_refunded_kop)} />
            <Stat label="Остання активність" value={dt(acc.last_meaningful_activity_at)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {statusBtn("suspend_sales", "Призупинити продажі", true)}
            {statusBtn("restore_sales", "Відновити продажі")}
            {statusBtn("start_collection", "Почати стягнення боргу", true)}
            {statusBtn("request_closure", "Запит на припинення співпраці")}
            {statusBtn("close", "Завершити співпрацю", true)}
          </div>

          {Number(acc.debt_kop) > 0 && (
            <div className="rounded-xl border border-black/5 p-4">
              <div className="text-[14px] font-medium mb-2">Зафіксувати погашення боргу</div>
              <div className="flex flex-wrap gap-2 items-center text-[13px]">
                <input value={repay.amount} onChange={(e) => setRepay({ ...repay, amount: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="Сума, ₴" className="w-32 px-3 py-2 rounded-lg border border-black/10" />
                <BrandSelect value={repay.source} onChange={(e) => setRepay({ ...repay, source: e.target.value })} className="px-3 py-2 rounded-lg border border-black/10">
                  <option value="cash">Автор переказав кошти</option>
                  <option value="available">Зарахувати з доступного балансу</option>
                </BrandSelect>
                <button
                  disabled={!owner || !repay.amount}
                  onClick={() => ask({
                    title: "Погасити борг?", confirmLabel: "Зафіксувати", danger: false,
                    text: "Вкажіть причину й підстави (номер платежу, документ).",
                    run: async (reason) => {
                      await callFinance({ action: "repayDebt", authorId, amountKop: Math.round(Number(repay.amount.replace(",", ".")) * 100), source: repay.source, reason, requestKey: key() });
                      setRepay({ amount: "", source: "cash" }); setInfo("Погашення зафіксовано."); await refreshAll(authorId);
                    },
                  })}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white disabled:opacity-30"
                >
                  Зафіксувати
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                {(detail.debts as Row[]).map((d) => (
                  <div key={d.id} className="text-black/65">{d.status === "open" ? "Відкрито" : "Погашено"}: {k(d.outstanding_kop)} з {k(d.original_kop)} · {d.reason}</div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[14px] font-medium mb-2">Платежі та повернення</div>
            {(detail.payments as Row[]).length === 0 ? <div className="text-[13px] text-black/45">Платежів немає.</div> : (
              <div className="flex flex-col gap-2">
                {(detail.payments as Row[]).map((p) => {
                  const left = Number(p.amount_kop) - Number(p.refunded_kop);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 text-[13px] border border-black/5 rounded-xl px-4 py-2.5">
                      <div className="min-w-[200px]">
                        <div className="font-medium">{k(p.amount_kop)} <span className="text-black/40">(автор {k(p.author_kop)} / Sensoria {k(p.sensoria_kop)})</span></div>
                        <div className="text-black/40">{dt(p.confirmed_at)} · {p.mode === "test" ? "тест" : "реальний"} · повернено {k(p.refunded_kop)}{p.disputed ? " · спір" : ""}</div>
                      </div>
                      {left > 0 && (
                        <>
                          <button disabled={!owner} onClick={() => ask({
                            title: `Повернути ${k(left)} покупцю?`, confirmLabel: "Повернути повністю", danger: true,
                            text: "Покупець отримає повну суму. Частка автора спише його кошти або створить борг.",
                            run: async (reason) => { await callFinance({ action: "refund", paymentId: p.id, kind: "full", reason, requestKey: key() }); setInfo("Повернення оформлено."); await refreshAll(authorId); },
                          })} className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 disabled:opacity-30">Повне повернення</button>
                          <input value={partial[p.id] ?? ""} onChange={(e) => setPartial({ ...partial, [p.id]: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="Частково, ₴" className="w-28 px-2 py-1.5 rounded-lg border border-black/10" />
                          <button disabled={!owner || !partial[p.id]} onClick={() => ask({
                            title: "Часткове повернення", confirmLabel: "Повернути", danger: true,
                            run: async (reason) => { await callFinance({ action: "refund", paymentId: p.id, kind: "partial", amountKop: Math.round(Number(partial[p.id].replace(",", ".")) * 100), reason, requestKey: key() }); setPartial({ ...partial, [p.id]: "" }); await refreshAll(authorId); },
                          })} className="px-3 py-1.5 rounded-lg border border-black/10 disabled:opacity-30">Повернути частину</button>
                          <button disabled={!owner} onClick={() => ask({
                            title: p.disputed ? "Закрити спір?" : "Позначити платіж спірним?", confirmLabel: "Підтвердити", danger: false,
                            text: p.disputed ? undefined : "Спірні кошти не стають доступними автору, поки спір відкритий.",
                            run: async (reason) => { await callFinance({ action: "markDisputed", paymentId: p.id, disputed: !p.disputed, reason }); await refreshAll(authorId); },
                          })} className="px-3 py-1.5 rounded-lg border border-black/10 disabled:opacity-30">{p.disputed ? "Закрити спір" : "Спір"}</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="text-[14px] font-medium mb-2">Журнал операцій автора (останні)</div>
            <div className="max-h-[320px] overflow-auto border border-black/5 rounded-xl">
              {(detail.ledger as Row[]).map((l) => (
                <div key={l.id} className="grid grid-cols-[1.4fr_1fr_1fr_2fr] gap-2 px-3 py-1.5 border-b border-black/5 last:border-0 text-[12px]">
                  <div>{TYPE_LABEL[l.type] ?? l.type}</div>
                  <div className="text-black/50">{l.account}</div>
                  <div className={Number(l.delta_kop) < 0 ? "text-rose-600" : ""}>{Number(l.delta_kop) > 0 ? "+" : ""}{k(l.delta_kop)}</div>
                  <div className="text-black/40">{dt(l.created_at)}{l.reason ? ` · ${l.reason}` : ""}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 text-[12px] text-black/60">
            <div><div className="font-medium text-black/80 mb-1">Історія статусів</div>{(detail.statusLog as Row[]).map((s) => <div key={s.id}>{dt(s.created_at)}: {STATUS_LABEL[s.from_status] ?? s.from_status} → {STATUS_LABEL[s.to_status] ?? s.to_status}</div>)}</div>
            <div><div className="font-medium text-black/80 mb-1">Сповіщення</div>{(detail.notifications as Row[]).map((n) => <div key={n.id}>{dt(n.created_at)}: {n.event_type} ({n.delivery_status})</div>)}</div>
            <div><div className="font-medium text-black/80 mb-1">Активність</div>{(detail.activity as Row[]).map((a) => <div key={a.id}>{dt(a.created_at)}: {a.activity_type}</div>)}</div>
          </div>
        </section>
      )}

      {/* TEST PAYMENT */}
      {owner && ov?.mode === "test" && (
        <section className="rounded-2xl bg-white border border-black/5 p-5">
          <h3 className="text-[16px] font-semibold mb-1">Підтвердити оплату (тестовий режим)</h3>
          <p className="text-[13px] text-black/50 mb-3">До підтвердження покупка не створює жодних нарахувань. У реальному режимі це робитиме банківський шар.</p>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <input value={confirmForm.purchaseId} onChange={(e) => setConfirmForm({ ...confirmForm, purchaseId: e.target.value })} placeholder="ID покупки" className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border border-black/10" />
            <input value={confirmForm.reference} onChange={(e) => setConfirmForm({ ...confirmForm, reference: e.target.value })} placeholder="Позначка (TEST-1)" className="w-44 px-3 py-2 rounded-lg border border-black/10" />
            <button
              disabled={!confirmForm.purchaseId.trim()}
              onClick={async () => {
                try { await callFinance({ action: "confirmPayment", purchaseId: confirmForm.purchaseId.trim(), reference: confirmForm.reference || "TEST" }); setInfo("Оплату підтверджено, нарахування створено."); setConfirmForm({ purchaseId: "", reference: "" }); await refreshAll(authorId); } catch (e) { setError(e instanceof Error ? e.message : "Помилка."); }
              }}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white disabled:opacity-30"
            >
              Підтвердити
            </button>
          </div>
        </section>
      )}

      {/* BANK FEE SETTLEMENT */}
      {owner && ov && (
        <section className="rounded-2xl bg-white border border-black/5 p-5">
          <h3 className="text-[16px] font-semibold mb-1">Комісії банку за випискою</h3>
          <p className="text-[13px] text-black/50 mb-3">
            З покупців зібрано й ще не розраховано з банком: <b>{k(ov.totals.bank_fee_owed_kop)}</b>. Введіть, що банк реально списав за випискою. Нестача — витрата Sensoria і ніколи не стягується з автора.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <input value={feePaid.amount} onChange={(e) => setFeePaid({ ...feePaid, amount: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="Списано банком, ₴" className="w-44 px-3 py-2 rounded-lg border border-black/10" />
            <label className="flex items-center gap-2"><input type="checkbox" checked={feePaid.surplus} onChange={(e) => setFeePaid({ ...feePaid, surplus: e.target.checked })} /> залишок зібраної комісії зарахувати Sensoria</label>
            <button
              disabled={!feePaid.amount}
              onClick={() => ask({
                title: "Зафіксувати комісію банку?", confirmLabel: "Зафіксувати", danger: false, text: "Вкажіть період виписки.",
                run: async (reason) => { await callFinance({ action: "bankFeeSettle", paidKop: Math.round(Number(feePaid.amount.replace(",", ".")) * 100), moveSurplus: feePaid.surplus, reason, requestKey: key() }); setFeePaid({ amount: "", surplus: false }); setInfo("Зафіксовано."); await load(); },
              })}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white disabled:opacity-30"
            >
              Зафіксувати
            </button>
          </div>
        </section>
      )}

      {/* SETTINGS */}
      {ov && form && (
        <section className="rounded-2xl bg-white border border-black/5 p-5">
          <h3 className="text-[16px] font-semibold mb-1">Параметри</h3>
          <p className="text-[13px] text-black/50 mb-3">Зміна не зачіпає вже здійснені покупки: кожна зберігає ставки, за якими була оплачена. Резерв і його строк визначте після юридичного та фінансового погодження.</p>
          <div className="grid sm:grid-cols-3 gap-3 text-[13px]">
            {([
              ["authorPercent", "Частка автора (каталог), %"], ["referralPercent", "Комісія за реферальним посиланням, %"], ["holdDays", "Підтвердження, днів"], ["reservePercent", "Резерв, %"],
              ["reserveDays", "Строк резерву, днів"], ["inactivityDays", "Неактивність, днів"], ["warningGraceDays", "Після попередження, днів"], ["minPayoutUah", "Мінімальна виплата, ₴"],
              ["bankFeePercent", "Комісія банку, % (за рахунок Sensoria)"], ["bankFeeFixedUah", "Комісія банку фіксована, ₴"], ["sensoriaIban", "IBAN рахунку Sensoria"], ["sensoriaHolder", "Власник рахунку Sensoria"],
            ] as const).map(([f, label]) => (
              <label key={f} className="flex flex-col gap-1">
                <span className="text-black/50">{label}</span>
                <input value={form[f]} disabled={!owner} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="px-3 py-2 rounded-lg border border-black/10 disabled:bg-black/[0.03]" />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] mt-3">
            <input type="checkbox" disabled={!owner} checked={form.splitAtSource === "1"} onChange={(e) => setForm({ ...form, splitAtSource: e.target.checked ? "1" : "0" })} />
            Розподіл при оплаті (як на Prom): комісія на рахунок Sensoria, решта одразу на рахунок автора; без утримання й виплат
          </label>
          <label className="flex items-center gap-2 text-[13px] mt-3">
            <input type="checkbox" disabled={!owner} checked={form.autoPayout === "1"} onChange={(e) => setForm({ ...form, autoPayout: e.target.checked ? "1" : "0" })} />
            Автороздача (запасний режим з утриманням): після періоду підтвердження частка автора автоматично йде на підтверджений рахунок (без мінімуму й ручних запитів)
          </label>
          <div className="text-[12px] text-black/45 mt-2">Комісія Sensoria рахується як решта до 100 %: {Math.round((100 - Number(form.authorPercent || 0)) * 100) / 100} %.</div>
          <button
            disabled={!owner}
            onClick={() => ask({
              title: "Змінити параметри?", confirmLabel: "Зберегти", danger: false, text: "Нові значення діятимуть лише для майбутніх покупок і розрахунків.",
              run: async (reason) => {
                const authorBps = Math.round(Number(form.authorPercent) * 100);
                await callFinance({ action: "setSettings", reason, settings: {
                  authorBps, commissionBps: 10000 - authorBps, referralCommissionBps: Math.round(Number(form.referralPercent) * 100), holdDays: Number(form.holdDays), reserveBps: Math.round(Number(form.reservePercent) * 100),
                  reserveDays: Number(form.reserveDays), inactivityDays: Number(form.inactivityDays), warningGraceDays: Number(form.warningGraceDays),
                  minPayoutKop: Math.round(Number(form.minPayoutUah) * 100),
                  bankFeeBps: Math.round(Number(form.bankFeePercent) * 100), bankFeeFixedKop: Math.round(Number(form.bankFeeFixedUah) * 100),
                  autoPayout: Number(form.autoPayout), splitAtSource: Number(form.splitAtSource),
                }, ...(form.sensoriaIban ? { sensoriaIban: form.sensoriaIban, sensoriaHolder: form.sensoriaHolder } : {}) });
                setInfo("Параметри збережено."); await load();
              },
            })}
            className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] disabled:opacity-30"
          >
            Зберегти параметри
          </button>
        </section>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title} text={pending.text} confirmLabel={pending.confirmLabel} danger={pending.danger ?? true}
          askReason busy={busy} onConfirm={runPending} onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
