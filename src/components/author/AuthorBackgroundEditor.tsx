// Author cabinet: manage the structured professional background shown on
// the public «Про автора» tab — education / training / certificates (with an
// optional document image) and work experience. Each record is saved on its
// own and stays PRIVATE until the author turns "Показувати публічно" on.
import { useEffect, useState } from "react";
import { backgroundMissing } from "../../utils/authorFacts";
import {
  DEGREE_LABEL,
  isDegreeLevel,
  type DegreeLevel,
  CREDENTIAL_KIND_LABEL,
  periodLabel,
  sortCredentials,
  sortExperience,
  validateCredentialImage,
  validateCredentialInput,
  validateExperienceInput,
  CREDENTIAL_LIMITS,
  credentialErrors,
  credentialIssue,
  experienceErrors,
  experienceIssue,
  EXPERIENCE_AREAS_MAX,
  EXPERIENCE_AREAS_MIN,
  EXPERIENCE_AREA_MIN,
  EXPERIENCE_AREA_MAX,
  EXPERIENCE_LIMITS,
  EXPERIENCE_TEXT_HINT,
  EXPERIENCE_TEXT_MIN,
  EXPERIENCE_TEXT_MAX,
  composeExperienceText,
  parseExperienceText,
  type AuthorCase,
  type AuthorCredential,
  type AuthorExperience,
  type CredentialKind,
} from "../../utils/authorCredentials";
import { CASE_LIMITS, EMPTY_CASE_DETAILS, validateCase, type CaseDetails } from "../../utils/authorCases";
import { categoryLabels } from "../../data/categoryLabels";
import { fetchAuthorContent } from "../../lib/authorPublic";
import type { AuthorContentItem } from "../../utils/authorProfileView";
import BrandSelect from "../ui/BrandSelect";
import {
  deleteCase,
  saveCase,
  saveCaseOrder,
  setCasePublic,
  deleteCredential,
  deleteExperience,
  fetchOwnBackground,
  saveCredential,
  saveExperience,
  setCredentialPublic,
  setExperiencePublic,
} from "../../lib/authorCredentials";

const input = "w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 bg-white";
const label = "text-[13px] font-medium text-black/50 mb-1.5";
const btn = "px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[13px] font-medium transition disabled:opacity-50";
const num = (v: string) => (v.trim() === "" ? null : Number(v));

type CredDraft = { id?: string; kind: CredentialKind; degree: DegreeLevel | null; title: string; issuer: string; year: string; description: string; imageUrl: string | null; isPublic: boolean };
type ExpDraft = { id?: string; organization: string; role: string; description: string; areas: string; start: string; end: string; isCurrent: boolean; isPublic: boolean };

const emptyCred: CredDraft = { kind: "education", degree: null, title: "", issuer: "", year: "", description: "", imageUrl: null, isPublic: false };
type CaseDraft = { id?: string; title: string; situation: string; approach: string; link: string; isPublic: boolean; details: CaseDetails; tagsText: string };
const emptyCase: CaseDraft = { title: "", situation: "", approach: "", link: "", isPublic: false, details: { ...EMPTY_CASE_DETAILS, tags: [] }, tagsText: "" };
const tagsOf = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);
// live counter «84 / 120»; below the minimum (and not empty-optional) it also shows the minimum
const Count = ({ n, max, min = 0, optional = false }: { n: number; max: number; min?: number; optional?: boolean }) => {
  const low = min > 0 && n < min && !(optional && n === 0);
  const over = n > max;
  return (
    <div className={`text-right text-[12px] mt-0.5 ${low || over ? "text-amber-600" : "text-black/40"}`}>
      {low ? `мін. ${min} · ` : ""}{n} / {max}
    </div>
  );
};
// validation message next to its field (shown after the first save attempt)
const FieldErr = ({ msg, show }: { msg?: string; show: boolean }) => (show && msg ? <p role="alert" className="text-[12px] text-red-500 mt-1">{msg}</p> : null);
// a stored record that no longer meets the rules: hidden from visitors until fixed
const Attention = ({ issue }: { issue: string | null }) =>
  issue ? <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800">Потребує уваги: {issue} Запис не показується на сторінці, доки його не виправлено.</p> : null;
const areasOf = (t: string) => t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const emptyExp: ExpDraft = { organization: "", role: "", description: "", areas: "", start: "", end: "", isCurrent: false, isPublic: false };

function PublicToggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-black/65 cursor-pointer">
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#4338ca]" />
      Показувати публічно
    </label>
  );
}

export default function AuthorBackgroundEditor({ authorId }: { authorId: string }) {
  const [creds, setCreds] = useState<AuthorCredential[]>([]);
  const [exps, setExps] = useState<AuthorExperience[]>([]);
  const [cases, setCases] = useState<AuthorCase[]>([]);
  const [myContent, setMyContent] = useState<AuthorContentItem[]>([]);
  const [kd, setKd] = useState<CaseDraft | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cd, setCd] = useState<CredDraft | null>(null);
  const [cFile, setCFile] = useState<File | null>(null);
  const [kFiles, setKFiles] = useState<File[]>([]);
  const [ed, setEd] = useState<ExpDraft | null>(null);
  const [showErr, setShowErr] = useState(false);

  useEffect(() => {
    let off = false;
    fetchOwnBackground(authorId).then((r) => {
      if (off) return;
      setCreds(r.credentials);
      setExps(r.experience);
      setCases(r.cases);
      setAvailable(r.available);
      setLoading(false);
    });
    fetchAuthorContent(authorId).then((c) => !off && setMyContent(c)).catch(() => {});
    return () => {
      off = true;
    };
  }, [authorId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти.");
    } finally {
      setBusy(false);
    }
  };

  const cErr = cd ? credentialErrors({ kind: cd.kind, title: cd.title, issuer: cd.issuer, description: cd.description, year: num(cd.year), hasDocument: !!cFile || !!cd.imageUrl }) : {};
  const eErr = ed ? experienceErrors({ organization: ed.organization, role: ed.role, startYear: num(ed.start), endYear: num(ed.end), isCurrent: ed.isCurrent, description: ed.description, areas: areasOf(ed.areas) }) : {};

  const submitCred = () =>
    cd &&
    run(async () => {
      setShowErr(true);
      const year = num(cd.year);
      const v = validateCredentialInput({ kind: cd.kind, title: cd.title, issuer: cd.issuer, description: cd.description, year, hasDocument: !!cFile || !!cd.imageUrl });
      if (!v.ok) throw new Error(v.error);
      if (cFile) {
        const iv = validateCredentialImage(cFile);
        if (!iv.ok) throw new Error(iv.error);
      }
      const saved = await saveCredential(authorId, { id: cd.id, kind: cd.kind, degree: cd.kind === "education" ? cd.degree : null, title: cd.title, issuer: cd.issuer, year, description: cd.description, imageUrl: cd.imageUrl, isPublic: cd.isPublic }, cFile);
      setCreds((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]));
      setCd(null);
      setCFile(null);
      setShowErr(false);
    });

  const submitExp = () =>
    ed &&
    run(async () => {
      setShowErr(true);
      const startYear = num(ed.start);
      const endYear = num(ed.end);
      const v = validateExperienceInput({ organization: ed.organization, role: ed.role, startYear, endYear, isCurrent: ed.isCurrent, description: ed.description, areas: areasOf(ed.areas) });
      if (!v.ok) throw new Error(v.error);
      const saved = await saveExperience(authorId, { id: ed.id, organization: ed.organization, role: ed.role, description: composeExperienceText(ed.description, areasOf(ed.areas)), startYear, endYear, isCurrent: ed.isCurrent, isPublic: ed.isPublic });
      setExps((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]));
      setEd(null);
      setShowErr(false);
    });

  const submitCase = () =>
    kd &&
    run(async () => {
      const details = { ...kd.details, tags: tagsOf(kd.tagsText) };
      const v2 = validateCase({ title: kd.title, situation: kd.situation, approach: kd.approach, details });
      if (!v2.ok) throw new Error(v2.error);
      const [kind, ...idParts] = kd.link.split(":");
      const contentId = kd.link ? idParts.join(":") : null;
      const saved = await saveCase(authorId, {
        id: kd.id,
        title: kd.title,
        situation: kd.situation,
        approach: kd.approach,
        contentKind: contentId ? (kind as AuthorCase["contentKind"]) : null,
        contentId,
        details,
        isPublic: kd.isPublic,
      }, kFiles);
      setCases((l) => (l.some((x) => x.id === saved.id) ? l.map((x) => (x.id === saved.id ? saved : x)) : [...l, saved]));
      setKd(null);
      setKFiles([]);
    });

  if (loading) return null;

  return (
    <section className="flex flex-col gap-8 max-w-[680px]" aria-label="Освіта та досвід">
      <div>
        <h2 className="text-[20px] font-semibold">Освіта, сертифікати, кейси та досвід</h2>
        <p className="text-black/50 text-[14px] mt-1">
          Це з’явиться на вкладці «Про автора». Кожен запис приватний, доки ви не ввімкнете «Показувати публічно». Sensoria не перевіряє окремі документи, тому
          учасники бачать, що це вказали ви.
        </p>
      </div>
      {(() => {
        const missing = backgroundMissing({ credentials: creds.filter((c) => c.isPublic), experience: exps.filter((x) => x.isPublic), year: new Date().getFullYear() });
        return missing.length === 0 ? (
          <p className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Блок «Професійний бекграунд» показується на вашому профілі.</p>
        ) : (
          <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Блок «Професійний бекграунд» (освіта · досвід · сертифікати) показується лише з усіма трьома колонками. Додайте й увімкніть «Показувати публічно»: {missing.join("; ")}.
          </p>
        );
      })()}
      {!available && (
        <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Щоб зберігати освіту й досвід, потрібно оновити базу даних (файл author-credentials-migration.sql).
        </p>
      )}
      {error && <p role="alert" className="text-[13px] text-red-500">{error}</p>}

      {/* EDUCATION */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">Освіта та сертифікати</h3>
        {sortCredentials(creds).map((c) => (
          <div key={c.id} className="flex items-start gap-3 rounded-xl border border-black/10 bg-white p-3">
            {c.imageUrl ? <img src={c.imageUrl} alt="" className="w-14 h-14 rounded-lg object-contain bg-[#f6f5fb] border border-black/5 shrink-0" /> : <div className="w-14 h-14 rounded-lg bg-[#f6f5fb] border border-black/5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-black/45">{[c.degree ? DEGREE_LABEL[c.degree] : CREDENTIAL_KIND_LABEL[c.kind], c.year].filter(Boolean).join(" · ")}</div>
              <div className="text-[14px] font-semibold break-words">{c.title}</div>
              {c.issuer && <div className="text-[13px] text-black/55 break-words">{c.issuer}</div>}
              <Attention issue={credentialIssue(c)} />
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <PublicToggle
                  on={c.isPublic}
                  disabled={busy}
                  onChange={(v) =>
                    run(async () => {
                      await setCredentialPublic(c.id, v);
                      setCreds((l) => l.map((x) => (x.id === c.id ? { ...x, isPublic: v } : x)));
                    })
                  }
                />
                <button className="text-[13px] text-[#4338ca] hover:underline" onClick={() => { setCFile(null); setCd({ id: c.id, kind: c.kind, degree: c.degree, title: c.title, issuer: c.issuer, year: c.year?.toString() ?? "", description: c.description, imageUrl: c.imageUrl, isPublic: c.isPublic }); }}>
                  Редагувати
                </button>
                <button
                  className="text-[13px] text-red-500 hover:underline"
                  onClick={() => window.confirm("Видалити цей запис?") && run(async () => { await deleteCredential(authorId, c); setCreds((l) => l.filter((x) => x.id !== c.id)); })}
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>
        ))}
        {cd ? (
          <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>

                <div className={label}>Тип</div>
                <BrandSelect value={cd.kind} onChange={(e) => setCd({ ...cd, kind: e.target.value as CredentialKind })} className={input}>
                  {(Object.keys(CREDENTIAL_KIND_LABEL) as CredentialKind[]).map((k) => (
                    <option key={k} value={k}>{CREDENTIAL_KIND_LABEL[k]}</option>
                  ))}
                </BrandSelect>
              </div>
              <div>

                <div className={label}>Рік (обов’язково, чотири цифри)</div>
                <input inputMode="numeric" value={cd.year} onChange={(e) => setCd({ ...cd, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={input} />
                <FieldErr msg={cErr.year} show={showErr} />
              </div>
            </div>
            {cd.kind === "education" && (
              <div>

                <div className={label}>Рівень освіти (покажемо в блоці «Професійний бекграунд»)</div>
                <BrandSelect value={cd.degree ?? ""} onChange={(e) => setCd({ ...cd, degree: isDegreeLevel(e.target.value) ? e.target.value : null })} className={input}>
                  <option value="">Не вказувати</option>
                  {(Object.keys(DEGREE_LABEL) as DegreeLevel[]).map((k) => (
                    <option key={k} value={k}>{DEGREE_LABEL[k]}</option>
                  ))}
                </BrandSelect>
              </div>
            )}
            <div>

              <div className={label}>{cd.kind === "education" ? "Кваліфікація або спеціальність (обов’язково)" : "Назва (обов’язково)"}</div>
              <input value={cd.title} maxLength={CREDENTIAL_LIMITS[cd.kind].title.max} onChange={(e) => setCd({ ...cd, title: e.target.value })} className={input} placeholder={cd.kind === "education" ? "Наприклад: Магістр психології" : cd.kind === "training" ? "Наприклад: Навички емоційної регуляції" : "Наприклад: Практики уважності (MBSR)"} /><Count n={cd.title.length} max={CREDENTIAL_LIMITS[cd.kind].title.max} min={CREDENTIAL_LIMITS[cd.kind].title.min} /><FieldErr msg={cErr.title} show={showErr} />
            </div>
            <div>

              <div className={label}>{cd.kind === "education" ? "Заклад (обов’язково)" : "Організація, що видала (обов’язково)"}</div>
              <input value={cd.issuer} maxLength={CREDENTIAL_LIMITS[cd.kind].issuer.max} onChange={(e) => setCd({ ...cd, issuer: e.target.value })} className={input} /><Count n={cd.issuer.length} max={CREDENTIAL_LIMITS[cd.kind].issuer.max} min={CREDENTIAL_LIMITS[cd.kind].issuer.min} /><FieldErr msg={cErr.issuer} show={showErr} />
            </div>
            <div>

              <div className={label}>{cd.kind === "education" ? "Опис або спеціалізація" : "Опис"} (обов’язково, від {CREDENTIAL_LIMITS[cd.kind].description.min} до {CREDENTIAL_LIMITS[cd.kind].description.max} символів)</div>
              <textarea value={cd.description} maxLength={CREDENTIAL_LIMITS[cd.kind].description.max} rows={2} onChange={(e) => setCd({ ...cd, description: e.target.value })} className={`${input} resize-none`} /><Count n={cd.description.length} max={CREDENTIAL_LIMITS[cd.kind].description.max} min={CREDENTIAL_LIMITS[cd.kind].description.min} /><FieldErr msg={cErr.description} show={showErr} />
            </div>
            <div>
              <div className={label}>Зображення документа (обов’язково; JPG, PNG, WebP, до 5 МБ)</div>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
              <FieldErr msg={cErr.document} show={showErr} />
              <p className="text-[12px] text-black/40 mt-1.5">Приховайте на документі номери, адресу та інші особисті дані — файл побачать усі, кому ви дозволите.</p>
            </div>
            <PublicToggle on={cd.isPublic} onChange={(v) => setCd({ ...cd, isPublic: v })} />
            <div className="flex gap-2">
              <button disabled={busy} onClick={submitCred} className="px-4 py-2 rounded-xl bg-[#4338ca] text-white text-[13px] font-medium disabled:opacity-50">{busy ? "Зберігаємо…" : "Зберегти"}</button>
              <button disabled={busy} onClick={() => { setCd(null); setCFile(null); setShowErr(false); }} className={btn}>Скасувати</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCd({ ...emptyCred })} disabled={!available} className={`${btn} self-start`}>+ Додати освіту або сертифікат</button>
        )}
      </div>

      {/* CASES */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">Кейси</h3>
        <p className="text-[13px] text-black/50">
          Узагальнена історія: з яким запитом приходять і що допомагає. Без імен і деталей, за якими можна впізнати людину, і без обіцянок результату. За бажанням
          прив’яжіть до свого матеріалу.
        </p>
        {cases.map((c, ci) => (
          <div key={c.id} className="rounded-xl border border-black/10 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[14px] font-semibold break-words min-w-0">{c.title}</div>
              {cases.length > 1 && (
                <div className="flex gap-1 shrink-0" role="group" aria-label="Порядок кейсу">
                  {([-1, 1] as const).map((d) => (
                    <button
                      key={d}
                      disabled={busy || ci + d < 0 || ci + d >= cases.length}
                      aria-label={d < 0 ? "Підняти вище" : "Опустити нижче"}
                      onClick={() =>
                        run(async () => {
                          const l = [...cases];
                          [l[ci], l[ci + d]] = [l[ci + d], l[ci]];
                          setCases(await saveCaseOrder(l));
                        })
                      }
                      className="w-8 h-8 rounded-lg bg-black/5 hover:bg-black/10 disabled:opacity-30 text-[14px]"
                    >
                      {d < 0 ? "↑" : "↓"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <PublicToggle
                on={c.isPublic}
                disabled={busy}
                onChange={(v) =>
                  run(async () => {
                    await setCasePublic(c.id, v);
                    setCases((l) => l.map((x) => (x.id === c.id ? { ...x, isPublic: v } : x)));
                  })
                }
              />
              <button className="text-[13px] text-[#4338ca] hover:underline" onClick={() => { setKFiles([]); setKd({ id: c.id, title: c.title, situation: c.situation, approach: c.approach, link: c.contentKind && c.contentId ? `${c.contentKind}:${c.contentId}` : "", isPublic: c.isPublic, details: c.details, tagsText: c.details.tags.join(", ") }); }}>
                Редагувати
              </button>
              <button className="text-[13px] text-red-500 hover:underline" onClick={() => window.confirm("Видалити цей кейс?") && run(async () => { await deleteCase(c.id, authorId); setCases((l) => l.filter((x) => x.id !== c.id)); })}>
                Видалити
              </button>
            </div>
          </div>
        ))}
        {kd ? (
          <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col gap-3">
            <div>

              <div className={label}>Назва</div>
              <input value={kd.title} maxLength={160} onChange={(e) => setKd({ ...kd, title: e.target.value })} className={input} placeholder="Наприклад: Постійна напруга після роботи" />
            </div>
            <p className="text-[12px] leading-relaxed text-black/50 rounded-lg bg-black/[0.03] p-3">
              Пишіть знеособлено: без імен, місць роботи, міст, дат, телефонів, пошти й посилань. Змініть деталі, за якими людину можна впізнати. Кейс — це приклад
              підходу, а не обіцянка результату.
            </p>
            <div>

              <div className={label}>Тема (необов’язково)</div>
              <BrandSelect value={kd.details.topic} onChange={(e) => setKd({ ...kd, details: { ...kd.details, topic: e.target.value } })} className={input}>
                <option value="">Без теми</option>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </BrandSelect>
            </div>
            <div>

              <div className={label}>Короткий опис для картки (необов’язково)</div>
              <textarea value={kd.details.summary} maxLength={CASE_LIMITS.summary} rows={2} onChange={(e) => setKd({ ...kd, details: { ...kd.details, summary: e.target.value } })} className={`${input} resize-none`} />
              <Count n={kd.details.summary.trim().length} max={CASE_LIMITS.summary} optional />
            </div>
            <p className="text-[13px] font-medium text-black/60">
              Розділи кейсу. Оберіть, які з них заповнити: можна всі, можна кілька, але щонайменше {CASE_LIMITS.section.min}. Кожен заповнений розділ — від {CASE_LIMITS.sectionChars} символів.
            </p>
            {([
              ["context", "Контекст", CASE_LIMITS.context],
              ["situation", "Запит", CASE_LIMITS.situation],
              ["focus", "Фокус роботи", CASE_LIMITS.focus],
              ["process", "Як відбувалася робота", CASE_LIMITS.process],
              ["changes", "Що змінилося", CASE_LIMITS.changes],
              ["approach", "Що допомогло", CASE_LIMITS.approach],
              ["useful", "Що може бути корисним іншим", CASE_LIMITS.useful],
            ] as const).map(([k, t, max]) => {
              const val = k === "situation" || k === "approach" ? kd[k] : kd.details[k];
              const set = (v: string) => setKd(k === "situation" || k === "approach" ? { ...kd, [k]: v } : { ...kd, details: { ...kd.details, [k]: v } });
              return (
                <div key={k}>
                  <div className={label}>{t} (необов’язково)</div>
                  <textarea value={val} maxLength={max} rows={3} onChange={(e) => set(e.target.value)} className={`${input} resize-none`} />
                  <Count n={val.trim().length} max={max} min={CASE_LIMITS.sectionChars} optional />
                </div>
              );
            })}
            <div>
              <div className={label}>Скриншоти анонімних відгуків (необов’язково; до {CASE_LIMITS.reviews}; JPG, PNG, WebP, до 5 МБ кожен)</div>
              <div className="flex flex-wrap gap-3 mb-2">
                {kd.details.reviewImages.map((u) => (
                  <div key={u} className="flex flex-col items-start gap-1">
                    <img src={u} alt="" className="w-20 h-20 rounded-lg object-contain bg-[#f6f5fb] border border-black/5" />
                    <button type="button" className="text-[12px] text-red-500 hover:underline" onClick={() => setKd({ ...kd, details: { ...kd.details, reviewImages: kd.details.reviewImages.filter((x) => x !== u) } })}>Прибрати</button>
                  </div>
                ))}
                {kFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex flex-col items-start gap-1">
                    <div className="w-20 h-20 rounded-lg bg-[#f6f5fb] border border-black/5 text-[12px] text-black/50 p-1 break-all overflow-hidden">{f.name}</div>
                    <button type="button" className="text-[12px] text-red-500 hover:underline" onClick={() => setKFiles(kFiles.filter((_, j) => j !== i))}>Прибрати</button>
                  </div>
                ))}
              </div>
              {kd.details.reviewImages.length + kFiles.length < CASE_LIMITS.reviews && (
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { const add = Array.from(e.target.files ?? []); setKFiles([...kFiles, ...add].slice(0, CASE_LIMITS.reviews - kd.details.reviewImages.length)); e.target.value = ""; }} className="text-[13px]" />
              )}
              <p className="text-[12px] text-black/40 mt-1.5">Закрийте на скриншоті імена, нікнейми, фото, номери та інші дані, за якими можна впізнати людину.</p>
            </div>
            <div>

              <div className={label}>Теги через кому (до {CASE_LIMITS.tags.items}, необов’язково)</div>
              <input value={kd.tagsText} onChange={(e) => setKd({ ...kd, tagsText: e.target.value })} className={input} placeholder="Наприклад: робота, відновлення" />
            </div>
            <div>

              <div className={label}>Матеріал, який підходить (необов’язково)</div>
              <BrandSelect value={kd.link} onChange={(e) => setKd({ ...kd, link: e.target.value })} className={input}>
                <option value="">Без матеріалу</option>
                {myContent.map((c) => (
                  <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.title}</option>
                ))}
              </BrandSelect>
            </div>
            <PublicToggle on={kd.isPublic} onChange={(v) => setKd({ ...kd, isPublic: v })} />
            <div className="flex gap-2">
              <button disabled={busy} onClick={submitCase} className="px-4 py-2 rounded-xl bg-[#4338ca] text-white text-[13px] font-medium disabled:opacity-50">{busy ? "Зберігаємо…" : "Зберегти"}</button>
              <button disabled={busy} onClick={() => { setKd(null); setKFiles([]); }} className={btn}>Скасувати</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setKFiles([]); setKd({ ...emptyCase }); }} disabled={!available} className={`${btn} self-start`}>+ Додати кейс</button>
        )}
      </div>

      {/* EXPERIENCE */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">Професійний досвід</h3>
        {sortExperience(exps).map((e) => (
          <div key={e.id} className="rounded-xl border border-black/10 bg-white p-3">
            <div className="text-[12px] text-black/45">{periodLabel(e)}</div>
            <div className="text-[14px] font-semibold break-words">{e.role || e.organization}</div>
            {e.role && <div className="text-[13px] text-black/55 break-words">{e.organization}</div>}
            <Attention issue={experienceIssue(e)} />
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <PublicToggle
                on={e.isPublic}
                disabled={busy}
                onChange={(v) =>
                  run(async () => {
                    await setExperiencePublic(e.id, v);
                    setExps((l) => l.map((x) => (x.id === e.id ? { ...x, isPublic: v } : x)));
                  })
                }
              />
              <button className="text-[13px] text-[#4338ca] hover:underline" onClick={() => setEd({ id: e.id, organization: e.organization, role: e.role, description: parseExperienceText(e.description).text, areas: parseExperienceText(e.description).areas.join("\n"), start: e.startYear?.toString() ?? "", end: e.endYear?.toString() ?? "", isCurrent: e.isCurrent, isPublic: e.isPublic })}>
                Редагувати
              </button>
              <button className="text-[13px] text-red-500 hover:underline" onClick={() => window.confirm("Видалити цей запис?") && run(async () => { await deleteExperience(e.id); setExps((l) => l.filter((x) => x.id !== e.id)); })}>
                Видалити
              </button>
            </div>
          </div>
        ))}
        {ed ? (
          <div className="rounded-xl border border-black/10 bg-white p-4 flex flex-col gap-3">
            <div>

              <div className={label}>Організація або місце роботи (обов’язково)</div>
              <input value={ed.organization} maxLength={EXPERIENCE_LIMITS.organization.max} onChange={(e) => setEd({ ...ed, organization: e.target.value })} className={input} /><Count n={ed.organization.length} max={EXPERIENCE_LIMITS.organization.max} min={EXPERIENCE_LIMITS.organization.min} /><FieldErr msg={eErr.organization} show={showErr} />
            </div>
            <div>

              <div className={label}>Посада (обов’язково)</div>
              <input value={ed.role} maxLength={EXPERIENCE_LIMITS.role.max} onChange={(e) => setEd({ ...ed, role: e.target.value })} className={input} /><Count n={ed.role.length} max={EXPERIENCE_LIMITS.role.max} min={EXPERIENCE_LIMITS.role.min} /><FieldErr msg={eErr.role} show={showErr} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>

                <div className={label}>Рік початку (обов’язково)</div>
                <input inputMode="numeric" value={ed.start} onChange={(e) => setEd({ ...ed, start: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={input} />
                <FieldErr msg={eErr.start} show={showErr} />
              </div>
              <div>

                <div className={label}>Рік завершення (або «Працюю тут зараз»)</div>
                <input inputMode="numeric" value={ed.isCurrent ? "" : ed.end} disabled={ed.isCurrent} onChange={(e) => setEd({ ...ed, end: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={`${input} disabled:opacity-50`} />
                <FieldErr msg={eErr.end} show={showErr} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-black/65 cursor-pointer">
              <input type="checkbox" checked={ed.isCurrent} onChange={(e) => setEd({ ...ed, isCurrent: e.target.checked })} className="w-4 h-4 accent-[#4338ca]" />
              Працюю тут зараз
            </label>
            <div>
              <div className={label}>Що ви робили (обов’язково, від {EXPERIENCE_TEXT_MIN} до {EXPERIENCE_TEXT_MAX} символів)</div>
              <textarea value={ed.description} maxLength={EXPERIENCE_TEXT_MAX} rows={4} onChange={(e) => setEd({ ...ed, description: e.target.value })} className={`${input} resize-none`} />
              <Count n={ed.description.length} max={EXPERIENCE_TEXT_MAX} min={EXPERIENCE_TEXT_MIN} /><FieldErr msg={eErr.description} show={showErr} />
              <div className="text-[12px] text-black/40">Зручно писати {EXPERIENCE_TEXT_HINT[0]}–{EXPERIENCE_TEXT_HINT[1]} символів; {EXPERIENCE_TEXT_MAX} — жорсткий ліміт, а не мета.</div>
            </div>
            <div>
              <div className={label}>Основні напрями роботи (обов’язково: від {EXPERIENCE_AREAS_MIN} до {EXPERIENCE_AREAS_MAX}, кожен з нового рядка, від {EXPERIENCE_AREA_MIN} до {EXPERIENCE_AREA_MAX} символів)</div>
              <textarea value={ed.areas} rows={4} onChange={(e) => setEd({ ...ed, areas: e.target.value })} className={`${input} resize-none`} placeholder={"Індивідуальні консультації\nГрупові практики"} />
              <div className={`text-right text-[12px] mt-0.5 ${areasOf(ed.areas).length < EXPERIENCE_AREAS_MIN ? "text-amber-600" : "text-black/40"}`}>{areasOf(ed.areas).length} / {EXPERIENCE_AREAS_MAX} · мін. {EXPERIENCE_AREAS_MIN}</div>
              <FieldErr msg={eErr.areas} show={showErr} />
            </div>
            <PublicToggle on={ed.isPublic} onChange={(v) => setEd({ ...ed, isPublic: v })} />
            <div className="flex gap-2">
              <button disabled={busy} onClick={submitExp} className="px-4 py-2 rounded-xl bg-[#4338ca] text-white text-[13px] font-medium disabled:opacity-50">{busy ? "Зберігаємо…" : "Зберегти"}</button>
              <button disabled={busy} onClick={() => { setEd(null); setShowErr(false); }} className={btn}>Скасувати</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEd({ ...emptyExp })} disabled={!available} className={`${btn} self-start`}>+ Додати місце роботи</button>
        )}
      </div>
    </section>
  );
}
