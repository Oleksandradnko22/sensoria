import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { registerAccount, translateAuthError } from "../lib/auth";
import { Icon } from "../components/ui/Icon";
import { isValidEmail } from "../utils/emailFormat";
import { isPasswordValid, PASSWORD_HINT } from "../utils/passwordRules";

// The author application (/author-signup), in three steps like a form: about you → your materials → account and
// documents. It creates the author account and saves the application (author_applications, with_account = true).
// Then: confirm the e-mail → sign the offer with the code from the e-mail (ConsentGate) → «на розгляді» until the owner
// approves the account in the admin panel (author-applications.sql).
const TOPICS = ["Тривога", "Стрес", "Вигорання", "Самооцінка", "Стосунки", "Мотивація", "Інше"];
const FORMATS = [["program", "Програма"], ["guide", "Гайд"], ["meditation", "Медитація"]] as const;
const EXPERIENCE = ["До 1 року", "1–3 роки", "3–5 років", "Понад 5 років"];
const READY = [["yes", "Так, є готові"], ["partly", "Частково"], ["no", "Ні, створю на платформі"]] as const;
const STEPS = ["Про вас", "Ваші матеріали", "Акаунт і документи"];

// One row of the form: on laptops the label (and its hint) sits in a left column and the control on the right, so the
// wide card reads as a tidy table; on phones and tablets they stack.
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-4 first:pt-0 last:pb-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:py-5">
      <div className="lg:pt-3">
        <div className="text-[14px] font-semibold text-[#2d2a5c] lg:text-[15px]">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-[#9aa1c0]">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function AuthorApplyPage() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", email: "", phone: "", profession: "", education: "", experience: "", plan: "", links: "", ready: "", password: "", trap: "" });
  const [topics, setTopics] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (list: string[], v: string, put: (x: string[]) => void) => put(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const problems = [
    f.name.trim().split(/\s+/).length < 2 ? "Вкажіть ім'я та прізвище." :
      !isValidEmail(f.email) ? "Перевірте email: латиницею, наприклад name@example.com" :
      f.profession.trim().length < 3 ? "Напишіть, хто ви за фахом." :
      f.education.trim().length < 5 ? "Коротко опишіть освіту чи кваліфікацію." :
      !f.experience ? "Оберіть досвід роботи." : null,
    formats.length === 0 ? "Оберіть хоча б один формат." :
      topics.length === 0 ? "Оберіть хоча б один напрям." :
      f.plan.trim().length < 10 ? "Коротко опишіть, що плануєте створити." :
      !f.ready ? "Вкажіть, чи є готові матеріали." : null,
    !isPasswordValid(f.password) ? PASSWORD_HINT :
      !agree ? "Підтвердьте, що ознайомилися з документами." : null,
  ];

  const next = () => {
    const p = problems[step];
    if (p) return setError(p);
    setError(null);
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.trap) return; // a bot filled the hidden field
    const p = problems[2];
    if (p) return setError(p);
    if (!supabase) return setError("Анкета тимчасово недоступна. Напишіть нам зі сторінки «Контакти».");
    setError(null);
    setState("sending");
    const email = f.email.trim().toLowerCase();
    try {
      await registerAccount("author", f.name.trim().replace(/\s+/g, " "), email, f.password);
    } catch (err) {
      setState("idle");
      return setError(err instanceof Error ? translateAuthError(err.message) : "Не вдалося створити акаунт.");
    }
    // the application itself (a repeated e-mail keeps the first application)
    await supabase.from("author_applications").insert({
      name: f.name.trim().slice(0, 120), email: email.slice(0, 160), phone: f.phone.trim().slice(0, 30) || null,
      profession: f.profession.trim().slice(0, 300), education: f.education.trim().slice(0, 1000), experience: f.experience,
      formats, topics, plan: f.plan.trim().slice(0, 2000), ready: f.ready, links: f.links.trim().slice(0, 500) || null, with_account: true,
    });
    setState("sent");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const input = "w-full rounded-2xl border border-[#d9d4f5] bg-[#faf9ff] px-4 py-3.5 text-[15px] text-[#12172b] placeholder:text-[#9aa1c0] focus:border-[#5b3df5] focus:bg-white focus:outline-none";
  const chip = (on: boolean) => `min-h-[42px] rounded-full px-4 text-[14px] font-semibold transition ${on ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white" : "bg-[#f1eeff] text-[#4338ca] hover:bg-[#e7e1ff]"}`;

  return (
    <main className="page-container min-h-[100dvh] pb-16 pt-24 sm:pt-28">
      <div className="mx-auto w-full max-w-[720px] sm:max-w-[640px] md:max-w-[700px] lg:max-w-none">
      {state !== "sent" && <div className="text-center text-white">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-semibold text-white/90 ring-1 ring-white/20">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gradient-to-r from-[#a8e8ff] to-[#e4ddff]" />
          Набір перших авторів
        </span>
        <h1 className="mt-4 text-[30px] font-bold leading-tight sm:text-[42px]">Анкета автора Sensoria</h1>
        <p className="mx-auto mt-3 max-w-[34em] text-[15px] leading-relaxed text-white/80 sm:text-[17px]">
          Займе 3–4 хвилини. Після анкети підтвердьте пошту й підпишіть договір кодом з листа — ми розглянемо заявку й відкриємо ваш кабінет.
        </p>
      </div>}

      <section className={`${state === "sent" ? "" : "mt-8 "} rounded-[28px] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:p-8`}>
        {state === "sent" ? (
          <div className="mx-auto max-w-[860px] py-6 text-center sm:py-10">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_12px_30px_-10px_rgba(91,92,240,0.7)]"><Icon name="check" size={28} /></span>
            <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#5b5cf0]">Анкету й договір отримано</p>
            <h2 className="mt-2 text-[26px] font-bold leading-tight text-[#12172b] sm:text-[32px]">Дякуємо, що обрали Sensoria</h2>
            <p className="mx-auto mt-3 max-w-[34em] text-[16px] leading-relaxed text-[#4a5070]">Ми уважно розглянемо вашу анкету. Договір підписано — далі все залежить від нас. Ось що відбуватиметься.</p>
            <ol className="mt-8 grid gap-3 text-left sm:grid-cols-3">
              {[
                ["Розгляд анкети", "Ми ознайомимося з вашою освітою, досвідом і планами щодо матеріалів."],
                ["Лист із рішенням", `Відповідь надійде на ${f.email.trim()}. Перевіряйте також «Спам».`],
                ["Доступ до кабінету", "Після схвалення ви зможете увійти в кабінет автора й почати створювати матеріали."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl bg-[#f5f4ff] p-5 ring-1 ring-[#e6e3fb]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[14px] font-bold text-[#4338ca] ring-1 ring-[#dcd8fa]">{i + 1}</span>
                  <div className="mt-3 text-[16px] font-semibold text-[#12172b]">{t}</div>
                  <div className="mt-1 break-words text-[14px] leading-relaxed text-[#5a6080]">{d}</div>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <form noValidate onSubmit={submit}>
            {/* steps */}
            <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Кроки анкети">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined}>
                  <span className={`block h-1.5 rounded-full ${i <= step ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0]" : "bg-[#ebe8ff]"}`} />
                  <span className={`mt-2 block text-[12px] font-semibold sm:text-[13px] ${i === step ? "text-[#4338ca]" : "text-[#9aa1c0]"}`}>{i + 1}. {s}</span>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div className="divide-y divide-[#eeecfb]">
                <Field label="Ім'я та прізвище"><input value={f.name} onChange={set("name")} autoComplete="name" aria-label="Ім'я та прізвище" className={input} /></Field>
                <Field label="Email"><input type="email" value={f.email} onChange={set("email")} autoComplete="email" aria-label="Email" placeholder="name@example.com" className={input} /></Field>
                <Field label="Телефон" hint="Необов'язково"><input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" aria-label="Телефон" className={input} /></Field>
                <Field label="Хто ви за фахом"><input value={f.profession} onChange={set("profession")} aria-label="Хто ви за фахом" placeholder="Психолог, психотерапевт, коуч, викладач практик…" className={input} /></Field>
                <Field label="Освіта й кваліфікація" hint="Заклад, спеціальність, курси, сертифікати"><textarea value={f.education} onChange={set("education")} rows={3} aria-label="Освіта й кваліфікація" className={`${input} resize-y`} /></Field>
                <Field label="Досвід роботи">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Досвід роботи">
                    {EXPERIENCE.map((x) => <button key={x} type="button" aria-pressed={f.experience === x} onClick={() => setF({ ...f, experience: x })} className={chip(f.experience === x)}>{x}</button>)}
                  </div>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="divide-y divide-[#eeecfb]">
                <Field label="Що плануєте створювати" hint="Можна кілька">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Формати">
                    {FORMATS.map(([v, l]) => <button key={v} type="button" aria-pressed={formats.includes(v)} onClick={() => toggle(formats, v, setFormats)} className={chip(formats.includes(v))}>{l}</button>)}
                  </div>
                </Field>
                <Field label="Напрями" hint="Можна кілька">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Напрями">
                    {TOPICS.map((x) => <button key={x} type="button" aria-pressed={topics.includes(x)} onClick={() => toggle(topics, x, setTopics)} className={chip(topics.includes(x))}>{x}</button>)}
                  </div>
                </Field>
                <Field label="Опишіть ваші плани" hint="Теми, для кого, формат"><textarea value={f.plan} onChange={set("plan")} rows={4} aria-label="Опишіть ваші плани" placeholder="Наприклад: 4-тижнева програма про вигорання для освітян, кілька медитацій для сну" className={`${input} resize-y`} /></Field>
                <Field label="Чи є готові матеріали?">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Готові матеріали">
                    {READY.map(([v, l]) => <button key={v} type="button" aria-pressed={f.ready === v} onClick={() => setF({ ...f, ready: v })} className={chip(f.ready === v)}>{l}</button>)}
                  </div>
                </Field>
                <Field label="Соцмережі чи сайт" hint="Необов'язково"><input value={f.links} onChange={set("links")} aria-label="Соцмережі чи сайт" placeholder="Instagram, Threads, сайт" className={input} /></Field>
              </div>
            )}

            {step === 2 && (
              <div className="divide-y divide-[#eeecfb]">
                <Field label="Ваш акаунт">
                  <p className="rounded-2xl bg-[#f6f4ff] px-4 py-3 text-[14px] leading-relaxed text-[#2d2a5c] lg:text-[15px]">
                    Створюємо акаунт автора з поштою <b className="break-all">{f.email.trim()}</b>. Готувати матеріали можна одразу після відкриття кабінету, ФОП для цього не потрібен. Продавати — лише як ФОП з рахунком у monobank і касою ПРРО.
                  </p>
                </Field>
                <Field label="Пароль" hint={PASSWORD_HINT}>
                  <span className="relative block">
                    <input type={showPass ? "text" : "password"} value={f.password} onChange={set("password")} autoComplete="new-password" aria-label="Пароль" className={`${input} pr-14`} />
                    <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Приховати пароль" : "Показати пароль"} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7190] hover:text-[#12172b]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </span>
                </Field>
                <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.trap} onChange={set("trap")} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
                <Field label="Документи" hint="Договір підпишете кодом з листа">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#4338ca]" />
                    <span className="text-[14px] leading-relaxed text-[#2d2a5c] lg:text-[15px]">
                      Я ознайомився(-лася) з{" "}
                      <a href="/author-agreement" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Договором з автором (офертою)</a>,{" "}
                      <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Умовами використання</a> і{" "}
                      <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Політикою конфіденційності</a> та погоджуюся, що Sensoria обробляє дані анкети, щоб розглянути заявку. Договір підпишу кодом з листа після підтвердження пошти.
                    </span>
                  </label>
                </Field>
              </div>
            )}

            {error && <p role="alert" className="mt-4 text-[14px] text-rose-700">{error}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {step > 0 && (
                <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="min-h-[52px] rounded-2xl px-5 text-[15px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff]">Назад</button>
              )}
              {step < 2 ? (
                <button type="button" onClick={next} className="ml-auto min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[16px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(76,80,230,0.7)] sm:flex-none sm:min-w-[200px]">Далі</button>
              ) : (
                <button type="submit" disabled={state === "sending"} className="ml-auto min-h-[52px] flex-1 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[16px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(76,80,230,0.7)] disabled:opacity-60 sm:flex-none sm:min-w-[240px]">
                  {state === "sending" ? "Надсилаємо…" : "Надіслати анкету"}
                </button>
              )}
            </div>
          </form>
        )}
      </section>
      </div>
    </main>
  );
}
