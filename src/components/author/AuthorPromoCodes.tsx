// «Промокоди» in the author's «Просування» (offer Б33): the discount is on the author — Sensoria's tariff is 15 % of the
// price WITHOUT the discount; at most 50 %, at most 5 codes at a time. The server checks every code and computes the price.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { PROMO_REASONS, promoCodes as DEMO_PROMOS } from "../../data/authorDashboard";
import { DEFAULT_SETTINGS, MAX_PROMO_PERCENT, promoQuote } from "../../utils/financeEngine";
import { createPromoCode, fetchMyPaidMaterials, fetchMyPromoCodes, setPromoActive, type AuthorPromo, type PaidMaterial } from "../../lib/promoCodes";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import BrandSelect from "../ui/BrandSelect";

const DURATIONS: { days: string; label: string }[] = [
  { days: "", label: "Без строку" },
  { days: "7", label: "7 днів" },
  { days: "14", label: "14 днів" },
  { days: "30", label: "30 днів" },
  { days: "90", label: "3 місяці" },
];

const uah = (kop: number) => `${(kop / 100).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
const input = "min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[15px] text-[#12172b] ring-1 ring-[#e3def9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]";
const label = "text-[13px] font-semibold text-black/60";

export default function AuthorPromoCodes({ authorId }: { authorId: string }) {
  const [codes, setCodes] = useState<AuthorPromo[] | null>(null);
  const [materials, setMaterials] = useState<PaidMaterial[]>([]);
  const [form, setForm] = useState({ code: "", percent: 10, contentId: "", maxUses: 100, expiresAt: "", reason: PROMO_REASONS[0] as string });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    void fetchMyPromoCodes().then(setCodes);
    void fetchMyPaidMaterials(authorId).then(setMaterials);
  };
  useEffect(load, [authorId]);

  const ready = codes !== null;
  const demo = ready && codes.length === 0 && SHOW_AUTHOR_DEMO;
  const activeCount = (codes ?? []).filter((c) => c.active).length;

  // the worked example on the author's own price (or 1000 ₴)
  const example = useMemo(() => {
    const m = materials.find((x) => x.id === form.contentId) ?? materials[0];
    const list = m?.priceKop ?? 100000;
    try {
      return { list, ...promoQuote(list, Math.min(MAX_PROMO_PERCENT, Math.max(1, Math.round(form.percent))), DEFAULT_SETTINGS) };
    } catch {
      return null;
    }
  }, [materials, form.contentId, form.percent]);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!/^[A-Za-z0-9]{3,20}$/.test(form.code)) return setError("Код — 3–20 латинських літер або цифр.");
    if (!Number.isInteger(form.percent) || form.percent < 1 || form.percent > MAX_PROMO_PERCENT) return setError(`Знижка — від 1 до ${MAX_PROMO_PERCENT}%.`);
    if (!Number.isInteger(form.maxUses) || form.maxUses < 1 || form.maxUses > 10000) return setError("Кількість використань — від 1 до 10 000.");
    setBusy(true);
    try {
      await createPromoCode(authorId, {
        code: form.code,
        discountPercent: form.percent,
        contentId: form.contentId || null,
        maxUses: form.maxUses,
        expiresAt: form.expiresAt ? new Date(Date.now() + Number(form.expiresAt) * 86_400_000).toISOString() : null,
        reason: form.reason,
      });
      setForm((f) => ({ ...f, code: "" }));
      setNotice("Промокод створено. Поділіться ним зі своєю аудиторією.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося створити промокод.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: AuthorPromo) => {
    setError(null);
    try {
      await setPromoActive(c.id, !c.active);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося змінити промокод.");
    }
  };

  const titleOf = (id: string | null) => (id ? materials.find((m) => m.id === id)?.title ?? "Один матеріал" : "Усі ваші матеріали");
  const list: AuthorPromo[] = demo
    ? DEMO_PROMOS.map((p, i) => ({ id: `demo-${i}`, code: p.code, discountPercent: p.discountPercent, contentId: null, maxUses: p.maxUses, uses: p.uses, active: p.active, expiresAt: p.expiresAt, reason: p.reason }))
    : codes ?? [];

  return (
    <section aria-labelledby="promo-h" className="rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="promo-h" className="text-[18px] font-bold text-[#12172b]">Промокоди</h2>
          <p className="mt-1 max-w-[680px] text-[14px] leading-relaxed text-black/55">
            Покупка з вашим промокодом рахується як покупка за вашим посиланням: тариф Sensoria — 15% від ціни <b className="text-[#12172b]">без знижки</b>. Знижку ви надаєте за свій рахунок, не більше {MAX_PROMO_PERCENT}%. Промокод діє на матеріали від 100 ₴.
          </p>
        </div>
        {ready && !demo && <span className="shrink-0 rounded-full bg-[#eef0fd] px-3 py-1 text-[12px] font-semibold text-[#4338ca]">Активних: {activeCount} з 5</span>}
      </div>

      {!ready ? (
        <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-5 text-center text-[14px] text-black/55">Промокоди скоро запрацюють.</p>
      ) : (
        <>
          {/* create */}
          <form
            className="mt-5 grid gap-3 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efecfb] sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="grid gap-1.5">
              <span className={label}>Код</span>
              <input className={`${input} uppercase tracking-wide`} value={form.code} maxLength={20} placeholder="STRESS20" onChange={(e) => setForm({ ...form, code: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })} />
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Знижка, %</span>
              <input className={input} type="number" min={1} max={MAX_PROMO_PERCENT} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} />
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Матеріал</span>
              <BrandSelect className={input} aria-label="Матеріал" value={form.contentId} onChange={(e) => setForm({ ...form, contentId: e.target.value })}>
                <option value="">Усі мої платні матеріали</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </BrandSelect>
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Скільки разів можна використати</span>
              <input className={input} type="number" min={1} max={10000} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} />
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Діє</span>
              <BrandSelect className={input} aria-label="Діє" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}>
                {DURATIONS.map((d) => <option key={d.days} value={d.days}>{d.label}</option>)}
              </BrandSelect>
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Для чого</span>
              <BrandSelect className={input} aria-label="Для чого" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {PROMO_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </BrandSelect>
            </label>

            {example && (
              <p className="sm:col-span-2 lg:col-span-3 rounded-xl bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-black/60 ring-1 ring-[#ece8fb]">
                Приклад: ціна {uah(example.list)}, знижка {form.percent}% — покупець платить <b className="text-[#12172b]">{uah(example.amountKop)}</b>, Sensoria — {uah(example.sensoriaKop)}, вам — <b className="text-[#4338ca]">{uah(example.authorKop)}</b> (до комісії банку). Суму до сплати банк може зменшити на кілька копійок, щоб тариф Sensoria був рівно 15%.
              </p>
            )}
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || activeCount >= 5} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white disabled:opacity-50">
                {busy ? "Створюємо…" : "Створити промокод"}
              </button>
              {activeCount >= 5 && <span className="text-[13px] text-black/55">Щоб створити новий, вимкніть один з активних.</span>}
            </div>
            {error && <p role="alert" className="sm:col-span-2 lg:col-span-3 text-[13px] text-red-700">{error}</p>}
            {notice && <p role="status" className="sm:col-span-2 lg:col-span-3 text-[13px] text-emerald-800">{notice}</p>}
          </form>

          {/* list */}
          {list.length > 0 && (
            <ul className="mt-4 flex flex-col divide-y divide-[#f1eefb]">
              {demo && <li className="pb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-black/40">Приклад</li>}
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1eeff] text-[#5b3df5]"><Icon name="sparkle" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <code className="text-[15px] font-bold tracking-wide text-[#12172b]">{c.code}</code>
                      <span className="text-[14px] font-semibold text-[#4338ca]">−{c.discountPercent}%</span>
                      {!c.active && <span className="text-[12px] text-black/45">вимкнено</span>}
                    </div>
                    <div className="text-[12px] text-black/50">
                      {titleOf(c.contentId)} · використано {c.uses} з {c.maxUses}
                      {c.expiresAt ? ` · до ${new Date(c.expiresAt).toLocaleDateString("uk-UA")}` : ""} · {c.reason}
                    </div>
                  </div>
                  {!demo && (
                    <button type="button" onClick={() => void toggle(c)} className="min-h-[40px] rounded-xl bg-[#f1eeff] px-3.5 text-[13px] font-semibold text-[#4338ca] hover:bg-[#e7e1ff]">
                      {c.active ? "Вимкнути" : "Увімкнути"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
