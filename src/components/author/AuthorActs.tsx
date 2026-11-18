// «Фінанси → Податки й документи»: the author's tax system (offer Б41) and the monthly acts of Sensoria's services
// (Б38; form — accountant-dps-review-2026-11-18.md, В7). The act is accepted by the author or silently after 5 working
// days. Sensoria signs every act with КЕП (id.gov.ua) before it shows here; a ТОВ or an author on the general system signs
// it too and uploads their signed copy — no signing widget, just the file.
import { useEffect, useState } from "react";
import BrandSelect from "../ui/BrandSelect";
import { Icon } from "../ui/Icon";
import { actFileUrl, decideAct, fetchMyActs, fetchTaxProfile, saveTaxProfile, uploadSignedAct, type ServiceAct, type TaxSystem } from "../../lib/finance";
import { TAX_LABEL, actMonth as monthName } from "../../lib/actPdf";

const TAX = (Object.keys(TAX_LABEL) as TaxSystem[]).map((id) => ({ id, label: TAX_LABEL[id] }));
const needsKep = (t: TaxSystem | null) => t === "fop_general" || t === "tov3" || t === "tov_general";
const uah = (kop: number) => (kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<ServiceAct["status"], string> = {
  draft: "Готується", issued: "Очікує вашої відповіді", accepted: "Прийнято", accepted_silent: "Прийнято (мовчазно)", objected: "Заперечення надіслано", signed: "Підписано КЕП",
};

export default function AuthorActs({ card }: { card: string }) {
  const [tax, setTax] = useState<TaxSystem | "">("");
  const [vat, setVat] = useState(false);
  const [taxSaved, setTaxSaved] = useState<string | null>(null);
  const [acts, setActs] = useState<ServiceAct[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [objecting, setObjecting] = useState<string | null>(null);
  const [objection, setObjection] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void fetchTaxProfile().then((r) => { setTax(r.taxSystem ?? ""); setVat(r.vatPayer); }).catch(() => {});
    void fetchMyActs().then((r) => setActs(r.acts)).catch(() => setActs([]));
  };
  useEffect(load, []);

  const saveTax = async (next: TaxSystem | "", nextVat: boolean) => {
    setTax(next);
    setVat(nextVat);
    if (!next) return;
    setTaxSaved(null);
    try {
      await saveTaxProfile({ taxSystem: next, vatPayer: nextVat });
      setTaxSaved("Збережено");
    } catch (e) {
      setTaxSaved(e instanceof Error ? e.message : "Не вдалося зберегти.");
    }
  };

  const decide = async (a: ServiceAct, decision: "accept" | "object") => {
    setBusy(a.id);
    setError(null);
    try {
      await decideAct(a.id, decision, decision === "object" ? objection : undefined);
      setObjecting(null);
      setObjection("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати.");
    } finally {
      setBusy(null);
    }
  };

  const pdf = async (a: ServiceAct) => {
    setBusy(`pdf:${a.id}`);
    try {
      const { downloadActPdf } = await import("../../lib/actPdf");
      await downloadActPdf(a);
    } catch {
      setError("Не вдалося створити PDF. Спробуйте ще раз.");
    } finally {
      setBusy(null);
    }
  };

  const signed = async (a: ServiceAct, which: "operator" | "author") => {
    setBusy(`${which}:${a.id}`);
    setError(null);
    try {
      const { url } = await actFileUrl(a.id, which);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося відкрити файл.");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (a: ServiceAct, file: File | undefined) => {
    if (!file) return;
    setBusy(`up:${a.id}`);
    setError(null);
    try {
      await uploadSignedAct("author", a.id, file);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Файл не завантажився.");
    } finally {
      setBusy(null);
    }
  };

  const input = "min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[14px] ring-1 ring-[#e3def9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]";

  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-acts">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="note" size={20} /></span>
        <div>
          <h2 id="fin-acts" className="text-[20px] font-bold text-[#12172b]">Акти про надання послуг</h2>
          <p className="text-[13px] text-black/55">Щомісяця до 5-го числа — акт за попередній місяць із реєстром замовлень.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-black/60">Ваша система оподаткування</span>
          <BrandSelect className={input} aria-label="Система оподаткування" value={tax} onChange={(e) => void saveTax(e.target.value as TaxSystem, vat)}>
            <option value="">Оберіть</option>
            {TAX.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </BrandSelect>
        </label>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[14px] text-[#12172b]">
          <input type="checkbox" checked={vat} disabled={!tax} onChange={(e) => void saveTax(tax, e.target.checked)} className="h-[18px] w-[18px] accent-[#4338ca]" />
          Платник ПДВ
        </label>
        <p className="text-[12px] text-black/50 sm:col-span-2">
          Потрібно для документів Платформи; про зміну повідомте протягом 5 робочих днів. {taxSaved && <span className="font-semibold text-[#4338ca]">{taxSaved}</span>}
        </p>
        {needsKep(tax || null) && (
          <p className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Для вашої системи оподаткування акт потрібно підписати КЕП: завантажте підписаний файл від Sensoria, підпишіть його своїм КЕП на id.gov.ua і завантажте сюди кнопкою «Завантажити підписаний акт».
          </p>
        )}
      </div>

      {acts === null ? (
        <p className="mt-4 text-[14px] text-black/50">Завантажуємо…</p>
      ) : acts.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-5 text-center text-[14px] text-black/55">Перший акт з’явиться на початку місяця, наступного за місяцем першого продажу.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-[#f1eefb]">
          {acts.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-[15px] font-semibold text-[#12172b]">Акт № {a.number} · {monthName(a.period)}</div>
                  <div className="text-[13px] text-black/55">Послуги {uah(a.data.servicesKop)} ₴ · повернено тариф {uah(a.data.returnedKop)} ₴ · {STATUS[a.status]}</div>
                </div>
                <button type="button" onClick={() => void pdf(a)} disabled={busy !== null} className="min-h-[38px] rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff] disabled:opacity-60">
                  {busy === `pdf:${a.id}` ? "Готуємо…" : "Завантажити PDF"}
                </button>
                {a.operator_signed_at && (
                  <button type="button" onClick={() => void signed(a, "operator")} disabled={busy !== null} className="min-h-[38px] rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff] disabled:opacity-60">
                    {busy === `operator:${a.id}` ? "Відкриваємо…" : "Підписаний КЕП Sensoria"}
                  </button>
                )}
                {needsKep(tax || null) && a.status !== "objected" && (a.author_signed_at ? (
                  <button type="button" onClick={() => void signed(a, "author")} disabled={busy !== null} className="min-h-[38px] rounded-xl px-3 text-[13px] font-semibold text-[#4338ca] hover:bg-[#eef0fd] disabled:opacity-60">Ваш підписаний примірник</button>
                ) : (
                  <label className={`inline-flex min-h-[38px] cursor-pointer items-center rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff] ${busy !== null ? "pointer-events-none opacity-60" : ""}`}>
                    {busy === `up:${a.id}` ? "Завантажуємо…" : "Завантажити підписаний акт"}
                    <input type="file" accept=".p7s,.asice,.asics,.pdf" className="sr-only" onChange={(e) => { void upload(a, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                ))}
                {a.status === "issued" && (
                  <>
                    <button type="button" onClick={() => void decide(a, "accept")} disabled={busy !== null} className="min-h-[38px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-3.5 text-[13px] font-semibold text-white disabled:opacity-60">Прийняти</button>
                    <button type="button" onClick={() => setObjecting(objecting === a.id ? null : a.id)} className="min-h-[38px] rounded-xl px-3 text-[13px] font-semibold text-black/60 hover:bg-black/[0.04]">Заперечення</button>
                  </>
                )}
              </div>
              {a.status === "issued" && <p className="mt-1 text-[12px] text-black/45">Без відповіді до {new Date(a.accept_until).toLocaleDateString("uk-UA")} акт вважається прийнятим.</p>}
              {objecting === a.id && (
                <div className="mt-2 grid gap-2">
                  <textarea value={objection} onChange={(e) => setObjection(e.target.value)} rows={3} placeholder="Що саме в акті неправильно" className="w-full rounded-xl bg-white p-3 text-[14px] ring-1 ring-[#e3def9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]" />
                  <button type="button" onClick={() => void decide(a, "object")} disabled={busy !== null || objection.trim().length < 10} className="justify-self-start min-h-[38px] rounded-xl bg-rose-600 px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">Надіслати заперечення</button>
                </div>
              )}
              {a.objection && <p className="mt-1 text-[12px] text-black/55">Ваше заперечення: {a.objection}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-red-700">{error}</p>}
    </section>
  );
}
