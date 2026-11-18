// Admin → Фінанси → «Акти до підпису КЕП» (offer Б38). Once a month: download each act's PDF, sign it on id.gov.ua with
// Sensoria's КЕП, upload the signed file. Only then is the act placed in the author's cabinet and the 5 working days start.
import { useEffect, useState } from "react";
import { callFinance, uploadSignedAct, type ServiceAct } from "../../lib/finance";
import { actMonth } from "../../lib/actPdf";
import BrandSelect from "../ui/BrandSelect";

type AdminAct = ServiceAct & { author_id: string; authorName: string };
const STATUS: Record<ServiceAct["status"], string> = {
  draft: "Чекає підпису Sensoria", issued: "Розміщено, чекає відповіді", accepted: "Прийнято", accepted_silent: "Прийнято мовчазно", objected: "Заперечення", signed: "Підписано автором",
};
const uah = (kop: number) => `${(kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
const lastMonths = () => {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= 12; i += 1) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};

export default function AdminActs() {
  const [period, setPeriod] = useState("");
  const [acts, setActs] = useState<AdminAct[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = (p = period) => {
    void callFinance<{ acts: AdminAct[] }>({ action: "actsToSign", period: p || undefined }).then((r) => setActs(r.acts)).catch(() => setActs([]));
  };
  useEffect(() => load(""), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pdf = async (a: AdminAct) => {
    setBusy(`pdf:${a.id}`);
    try {
      const { downloadActPdf } = await import("../../lib/actPdf");
      await downloadActPdf(a);
    } catch {
      setMsg({ ok: false, text: "Не вдалося створити PDF." });
    } finally {
      setBusy(null);
    }
  };
  const upload = async (a: AdminAct, file: File | undefined) => {
    if (!file) return;
    setBusy(`up:${a.id}`);
    setMsg(null);
    try {
      await uploadSignedAct("operator", a.id, file);
      setMsg({ ok: true, text: `Акт ${a.number} підписано й розміщено автору.` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Файл не завантажився." });
    } finally {
      setBusy(null);
    }
  };

  if (!period && acts.length === 0) {
    return (
      <section className="rounded-2xl bg-white border border-black/5 p-5 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-[16px] font-semibold">Акти авторам</h3>
          <p className="text-[13px] text-black/50">Актів до підпису немає. Нові з’являються 1–5 числа за попередній місяць.</p>
        </div>
        <BrandSelect className="px-3 py-2 rounded-lg border border-black/10 text-[13px]" aria-label="Місяць актів" value={period} onChange={(e) => { setPeriod(e.target.value); load(e.target.value); }}>
          <option value="">Переглянути місяць</option>
          {lastMonths().map((m) => <option key={m} value={m}>{actMonth(m)}</option>)}
        </BrandSelect>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white border border-amber-100 p-5">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="flex-1 min-w-[220px]">
          <h3 className="text-[16px] font-semibold">{period ? `Акти за ${actMonth(period)} (${acts.length})` : `Акти до підпису КЕП (${acts.length})`}</h3>
          <p className="text-[13px] text-black/50">Завантажте PDF, підпишіть його КЕП Sensoria на id.gov.ua і завантажте підписаний файл (.p7s, .asice або .pdf). Після цього акт з’явиться в кабінеті автора, і почнуться 5 робочих днів на заперечення.</p>
        </div>
        <BrandSelect className="px-3 py-2 rounded-lg border border-black/10 text-[13px]" aria-label="Місяць актів" value={period} onChange={(e) => { setPeriod(e.target.value); load(e.target.value); }}>
          <option value="">До підпису</option>
          {lastMonths().map((m) => <option key={m} value={m}>{actMonth(m)}</option>)}
        </BrandSelect>
      </div>
      {msg && <div className={`mb-3 text-[13px] ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</div>}
      {acts.length === 0 ? (
        <p className="text-[13px] text-black/50">Актів за цей місяць немає.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {acts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 px-4 py-3 text-[13px]">
              <div className="min-w-[220px] flex-1">
                <div className="font-medium">{a.data.customer?.legalName ?? a.authorName} · № {a.number} · {actMonth(a.period)}</div>
                <div className="text-black/50">
                  Послуги {uah(a.data.servicesKop)} · повернено тариф {uah(a.data.returnedKop)} · {STATUS[a.status]}
                  {a.status === "issued" && ` до ${a.accept_until}`}{a.objection ? ` · «${a.objection}»` : ""}
                </div>
              </div>
              <button onClick={() => void pdf(a)} disabled={busy !== null} className="px-3 py-1.5 rounded-lg border border-black/10 disabled:opacity-40">{busy === `pdf:${a.id}` ? "Готуємо…" : "PDF"}</button>
              <label className={`px-3 py-1.5 rounded-lg border border-[#d9d4f7] bg-[#eef0fd] text-[#4338ca] cursor-pointer ${busy !== null ? "pointer-events-none opacity-40" : ""}`}>
                {busy === `up:${a.id}` ? "Завантажуємо…" : a.operator_signed_at ? "Замінити підписаний" : "Завантажити підписаний"}
                <input type="file" accept=".p7s,.asice,.asics,.pdf" className="sr-only" onChange={(e) => { void upload(a, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
