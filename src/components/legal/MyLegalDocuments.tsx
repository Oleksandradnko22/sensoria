// «Документи і згоди» in the participant's «Профіль» and the author's «Налаштування» (docs/legal/access-to-documents.md,
// Д4–Д5): every document the person accepted, which edition and when; for the author — that the offer was signed with
// a code from the email. The documents open in a new tab, so the person can read and save them at any time.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Icon } from "../ui/Icon";
import Switch from "../ui/Switch";
import { HEALTH_CONSENT_NEEDED, onHealthConsent, revokeHealthConsent } from "../../lib/healthConsent";
import { downloadAsJson, exportMyData } from "../../lib/dataExport";
import { AUTHOR_IPK_TEMPLATE, DPS_NON_MONETARY_NOTE } from "../../data/ipkTemplate";
import { fetchMonoConnection } from "../../lib/finance";
import type { LegalSection } from "./LegalLayout";
import { DOC_EDITIONS } from "../../data/legalOperator";

// the full text of each document, loaded only when its PDF is asked for
type Source = { title: string; edition: string; effectiveDate?: string; load: () => Promise<{ SECTIONS: LegalSection[] }> };
const SOURCES: Record<string, Source> = {
  participant_agreement: { title: "Угода учасника", edition: DOC_EDITIONS.participant_agreement.edition, effectiveDate: DOC_EDITIONS.participant_agreement.effectiveDate, load: () => import("../../pages/ParticipantAgreementPage") },
  author_agreement: { title: "Публічний договір про надання послуг технічного характеру (оферта для авторів)", edition: DOC_EDITIONS.author_agreement.edition, effectiveDate: DOC_EDITIONS.author_agreement.effectiveDate, load: () => import("../../pages/AuthorAgreementPage") },
  terms: { title: "Умови використання", edition: DOC_EDITIONS.terms.edition, effectiveDate: DOC_EDITIONS.terms.effectiveDate, load: () => import("../../pages/TermsPage") },
  refunds: { title: "Правила повернення коштів", edition: DOC_EDITIONS.refunds.edition, effectiveDate: DOC_EDITIONS.refunds.effectiveDate, load: () => import("../../pages/RefundsPage") },
  privacy: { title: "Політика конфіденційності", edition: DOC_EDITIONS.privacy.edition, effectiveDate: DOC_EDITIONS.privacy.effectiveDate, load: () => import("../../pages/PrivacyPage") },
};
const FILE: Record<string, string> = {
  participant_agreement: "ugoda-uchasnyka", author_agreement: "oferta-dlia-avtoriv", terms: "umovy-vykorystannia", refunds: "pravyla-povernennia", privacy: "polityka-konfidentsiinosti",
};

type Row = { document: string; version: string; accepted_at: string; otp_verified_at: string | null; withdrawn_at: string | null };

const DOCS: Record<"participant" | "author", { doc: string; href: string; label: string }[]> = {
  participant: [
    { doc: "participant_agreement", href: "/participant-agreement", label: "Угода учасника" },
    { doc: "terms", href: "/terms", label: "Умови використання" },
    { doc: "refunds", href: "/refunds", label: "Правила повернення коштів" },
    { doc: "privacy", href: "/privacy", label: "Політика конфіденційності" },
  ],
  author: [
    { doc: "author_agreement", href: "/author-agreement", label: "Договір з автором (оферта)" },
    { doc: "terms", href: "/terms", label: "Умови використання" },
    { doc: "privacy", href: "/privacy", label: "Політика конфіденційності" },
  ],
};

const OPTIONAL: { doc: string; label: string; where: string }[] = [
  { doc: "health_data", label: "Обробка даних про емоційний стан", where: "Тест, щоденник настрою, нотатки у вправах і рекомендації" },
  { doc: "marketing_email", label: "Листи про нові матеріали", where: "Змінити можна в «Сповіщеннях» вище" },
];

const date = (iso: string) => new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function MyLegalDocuments({ role, className }: { role: "participant" | "author"; className: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const downloadPdf = async (doc: string) => {
    const src = SOURCES[doc];
    if (!src || pdfBusy) return;
    setPdfBusy(doc);
    setPdfError(null);
    try {
      const [{ SECTIONS }, { downloadLegalPdf }] = await Promise.all([src.load(), import("../../lib/legalPdf")]);
      const r = latest(doc);
      await downloadLegalPdf({
        title: src.title,
        sections: SECTIONS,
        edition: r?.version ?? src.edition,
        effectiveDate: src.effectiveDate,
        acceptance: r ? { acceptedAt: r.accepted_at, version: r.version, otpVerifiedAt: r.otp_verified_at } : null,
        fileName: `sensoria-${FILE[doc] ?? doc}.pdf`,
      });
    } catch {
      setPdfError("Не вдалося створити PDF. Спробуйте ще раз.");
    } finally {
      setPdfBusy(null);
    }
  };

  const [reload, setReload] = useState(0);
  // the consent window (HealthConsentPrompt) or a withdrawal changed the consents: read them again
  useEffect(() => onHealthConsent(() => setReload((n) => n + 1)), []);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [healthBusy, setHealthBusy] = useState<null | "copy" | "revoke">(null);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const copyData = async () => {
    setHealthBusy("copy");
    setHealthMsg(null);
    try {
      const { data } = await supabase!.auth.getUser();
      if (data.user) downloadAsJson(`sensoria-data-${data.user.id}.json`, await exportMyData(data.user.id));
    } catch {
      setHealthMsg("Не вдалося підготувати копію. Спробуйте ще раз.");
    } finally {
      setHealthBusy(null);
    }
  };
  const revoke = async () => {
    setHealthBusy("revoke");
    setHealthMsg(null);
    try {
      await revokeHealthConsent();
      setConfirmRevoke(false);
      setHealthMsg("Згоду відкликано, ваші відповіді, нотатки й результати тесту видалено.");
    } catch (e) {
      setHealthMsg(e instanceof Error ? e.message : "Не вдалося відкликати згоду.");
    } finally {
      setHealthBusy(null);
    }
  };

  useEffect(() => {
    if (!supabase) return setRows([]);
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return setRows([]);
      const { data: r } = await supabase!
        .from("legal_consents")
        .select("document, version, accepted_at, otp_verified_at, withdrawn_at")
        .eq("user_id", data.user.id)
        .order("accepted_at", { ascending: false });
      setRows((r as Row[] | null) ?? []);
    });
  }, [reload]);

  // the author's name comes from the bank connection; the full tax code is never shown in the cabinet, so it is left to fill in
  const downloadIpk = async () => {
    const conn = await fetchMonoConnection().catch(() => null);
    const text = conn?.legalName ? AUTHOR_IPK_TEMPLATE.replace("[ФОП / ТОВ «…»]", conn.legalName) : AUTHOR_IPK_TEMPLATE;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sensoria-zapyt-ipk-avtora.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const latest = (doc: string) => (rows ?? []).find((r) => r.document === doc && !r.withdrawn_at);

  return (
    <section className={className} aria-labelledby="legal-docs-h">
      <div className="mb-4 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name="note" size={20} /></span>
        <div>
          <h2 id="legal-docs-h" className="text-[18px] font-bold text-[#12172b]">Документи і згоди</h2>
          <p className="text-[14px] text-black/55">Договори, які ви прийняли. Відкрийте, щоб перечитати або зберегти.</p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {DOCS[role].map((d) => {
          const r = latest(d.doc);
          return (
            <li key={d.doc} className="flex h-full flex-col gap-3 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efecfb]">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-[#12172b]">{d.label}</div>
                  <div className="mt-0.5 text-[13px] text-black/55">
                    {rows === null
                      ? "Завантажуємо…"
                      : r
                        ? `Прийнято ${date(r.accepted_at)} · редакція ${r.version}`
                        : "Ще не прийнято"}
                  </div>
                  {d.doc === "author_agreement" && r?.otp_verified_at && (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4338ca]">
                      <Icon name="check" size={13} /> Підписано кодом з листа {date(r.otp_verified_at)}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={d.href}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-[38px] items-center rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                  >
                    Відкрити
                  </a>
                  <button
                    type="button"
                    onClick={() => void downloadPdf(d.doc)}
                    disabled={pdfBusy !== null}
                    className="inline-flex min-h-[38px] items-center rounded-xl bg-[#eef0fd] px-3.5 text-[13px] font-semibold text-[#4338ca] hover:bg-[#e4e7fc] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                  >
                    {pdfBusy === d.doc ? "Готуємо PDF…" : "Завантажити PDF"}
                  </button>
                </div>
            </li>
          );
        })}
      </ul>
      {pdfError && <p role="alert" className="mt-3 text-[13px] text-red-700">{pdfError}</p>}

      {role === "author" && (
        <div className="mt-4 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efecfb]">
          <div className="text-[15px] font-semibold text-[#12172b]">Шаблон запиту на індивідуальну податкову консультацію (ІПК)</div>
          <p className="mt-1 text-[13px] leading-relaxed text-black/60">{DPS_NON_MONETARY_NOTE}</p>
          <button
            type="button"
            onClick={() => void downloadIpk()}
            className="mt-3 inline-flex min-h-[38px] items-center rounded-xl bg-[#eef0fd] px-3.5 text-[13px] font-semibold text-[#4338ca] hover:bg-[#e4e7fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
          >
            Завантажити шаблон ІПК
          </button>
          <p className="mt-2 text-[12px] text-black/45">Подається через Електронний кабінет платника з вашим КЕП. Sensoria не надає податкових консультацій.</p>
        </div>
      )}

      {role === "participant" && (
        <ul className="mt-4 flex flex-col divide-y divide-[#f1eefb] rounded-2xl ring-1 ring-[#efecfb]">
          {OPTIONAL.map((o) => {
            const r = latest(o.doc);
            return (
              <li key={o.doc} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[#12172b]">{o.label}</div>
                  <div className="text-[12px] text-black/50">{o.where}</div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${r ? "bg-[#eef0fd] text-[#4338ca]" : "bg-black/[0.04] text-black/55"}`}>
                  {rows === null ? "…" : r ? `Згоду надано ${date(r.accepted_at)}` : "Згоди немає"}
                </span>
                {o.doc === "health_data" && rows !== null && (
                  <Switch
                    touch
                    label={o.label}
                    on={!!r}
                    disabled={healthBusy !== null}
                    onClick={() => (r ? setConfirmRevoke(true) : window.dispatchEvent(new Event(HEALTH_CONSENT_NEEDED)))}
                  />
                )}
                {o.doc === "health_data" && confirmRevoke && (
                  <div role="alertdialog" aria-label="Відкликати згоду" className="basis-full rounded-xl bg-rose-50/60 p-3.5 ring-1 ring-rose-100">
                    <p className="text-[13px] leading-relaxed text-[#12172b]">Ваші відповіді, нотатки й результати тесту буде видалено. Спершу завантажити копію?</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyData()} disabled={healthBusy !== null} className="min-h-[38px] rounded-xl bg-white px-3.5 text-[13px] font-semibold text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff] disabled:opacity-60">
                        {healthBusy === "copy" ? "Готуємо…" : "Завантажити копію"}
                      </button>
                      <button type="button" onClick={() => void revoke()} disabled={healthBusy !== null} className="min-h-[38px] rounded-xl bg-rose-600 px-3.5 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                        {healthBusy === "revoke" ? "Видаляємо…" : "Відкликати й видалити"}
                      </button>
                      <button type="button" onClick={() => setConfirmRevoke(false)} disabled={healthBusy !== null} className="min-h-[38px] rounded-xl px-3 text-[13px] font-semibold text-black/60 hover:bg-black/[0.04]">
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {healthMsg && <p role="status" className="mt-3 text-[13px] text-[#4338ca]">{healthMsg}</p>}
    </section>
  );
}
