import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Icon } from "../components/ui/Icon";
import { isValidEmail } from "../utils/emailFormat";

// «Для авторів»: the invitation to join and the application form. An application goes to
// author_applications (insert only, nobody can read it from the browser); the owner sees it in the admin panel and
// sends the invitation from there.

const TOPICS = ["Тривога", "Стрес", "Вигорання", "Самооцінка", "Стосунки", "Мотивація", "Інше"];

const PERKS: { icon: "program" | "card" | "chart" | "compass"; title: string; text: string }[] = [
  { icon: "program", title: "Ваші програми, гайди й медитації", text: "Редактор уроків, студія медитацій, конструктор обкладинок — усе в одному кабінеті." },
  { icon: "card", title: "Оплата одразу на ваш ФОП", text: "monobank ділить оплату в момент покупки: Sensoria не тримає ваших коштів. Тариф — 30% з каталогу, 15% за вашим посиланням чи промокодом." },
  { icon: "compass", title: "Учасники приходять за запитом", text: "Короткий тест підбирає матеріали під стан людини, тож ваші програми бачать ті, кому вони потрібні." },
  { icon: "chart", title: "Аналітика й спілкування", text: "Прогрес учасників, відгуки, повідомлення й спільнота — у кабінеті автора." },
];


export default function ForAuthorsPage({ onRegister }: { onRegister: () => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", profession: "", plan: "", links: "", trap: "" });
  const [topics, setTopics] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const problem =
    f.name.trim().length < 3 ? "Вкажіть ім'я та прізвище." :
    !isValidEmail(f.email) ? "Перевірте email: латиницею, наприклад name@example.com" :
    f.profession.trim().length < 3 ? "Напишіть, хто ви за фахом." :
    f.plan.trim().length < 10 ? "Коротко опишіть, що плануєте створити." :
    !consent ? "Підтвердьте згоду на обробку даних для розгляду заявки." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.trap) return; // a bot filled the hidden field
    if (problem) return setError(problem);
    if (!supabase) return setError("Форма тимчасово недоступна. Напишіть нам на пошту зі сторінки «Контакти».");
    setError(null);
    setState("sending");
    const { error: err } = await supabase.from("author_applications").insert({
      name: f.name.trim().slice(0, 120), email: f.email.trim().toLowerCase().slice(0, 160), phone: f.phone.trim().slice(0, 30) || null,
      profession: f.profession.trim().slice(0, 300), topics, plan: f.plan.trim().slice(0, 2000), links: f.links.trim().slice(0, 500) || null,
    });
    if (err) {
      setState("idle");
      return setError(/duplicate|unique/i.test(err.message) ? "Заявку з цією поштою вже отримано — ми напишемо вам." : "Не вдалося надіслати. Спробуйте ще раз або напишіть нам зі сторінки «Контакти».");
    }
    setState("sent");
  };

  const input = "w-full rounded-2xl border border-[#d9d4f5] bg-[#faf9ff] px-4 py-3.5 text-[15px] text-[#12172b] placeholder:text-[#9aa1c0] focus:border-[#5b3df5] focus:bg-white focus:outline-none";
  const label = "mb-1.5 block text-[14px] font-semibold text-[#2d2a5c]";

  return (
    <main className="wide-col mx-auto w-full max-w-[1160px] px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      {/* hero */}
      <section className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-semibold text-white/90 ring-1 ring-white/20">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gradient-to-r from-[#a8e8ff] to-[#e4ddff]" />
          Відкрито набір перших авторів
        </span>
        <h1 className="mx-auto mt-5 max-w-[18ch] text-[32px] font-bold leading-tight text-white sm:text-[46px] lg:text-[54px]">Станьте автором Sensoria</h1>
        <p className="mx-auto mt-4 max-w-[42em] text-[16px] leading-relaxed text-white/80 sm:text-[18px]">
          Створюйте психологічні програми, гайди й медитації та діліться ними з людьми, яким вони потрібні. Перші автори отримують доступ до платформи ще до запуску.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#apply" className="inline-flex min-h-[56px] items-center rounded-2xl bg-white px-8 text-[17px] font-bold text-[#1e2a78] shadow-[0_14px_40px_rgba(10,20,90,0.35)] transition hover:-translate-y-0.5">Подати заявку</a>
          <button type="button" onClick={onRegister} className="inline-flex min-h-[56px] items-center rounded-2xl px-5 text-[15px] font-semibold text-white/90 ring-1 ring-white/30 transition hover:bg-white/10">Маю запрошення — увійти</button>
        </div>
      </section>

      <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-10">
        {/* what an author gets */}
        <section aria-labelledby="perks" className="lg:sticky lg:top-24">
          <h2 id="perks" className="text-[24px] font-bold text-white sm:text-[28px]">Що ви отримуєте</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-3.5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_8px_20px_-8px_rgba(76,80,230,0.8)]">
                  <Icon name={p.icon} size={18} />
                </span>
                <span>
                  <span className="block text-[16px] font-semibold text-white">{p.title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-white/75">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-white/65">
            Готувати матеріали в кабінеті можна вже зараз, ФОП для цього не потрібен. Продавати — лише як ФОП з рахунком у monobank і касою ПРРО (наприклад, Checkbox): так вимагає банк. У кабінеті є покрокова інструкція.
          </p>
        </section>

        {/* application */}
        <section id="apply" aria-labelledby="apply-title" className="scroll-mt-24 rounded-[28px] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:p-8">
          {state === "sent" ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white"><Icon name="check" size={26} /></span>
              <h2 className="mt-4 text-[24px] font-bold text-[#12172b]">Заявку отримано</h2>
              <p className="mx-auto mt-2 max-w-[30em] text-[15px] leading-relaxed text-[#5b6280]">Дякуємо! Ми розглянемо її та надішлемо запрошення на пошту {f.email.trim()}. Перевірте й теку «Спам».</p>
            </div>
          ) : (
            <form noValidate onSubmit={submit}>
              <h2 id="apply-title" className="text-[24px] font-bold text-[#12172b]">Заявка автора</h2>
              <p className="mt-1.5 text-[14px] text-[#5b6280]">Займе 2 хвилини. Після розгляду ми надішлемо запрошення на пошту.</p>
              <div className="mt-6 grid gap-4">
                <label className={label}>Ім'я та прізвище<input value={f.name} onChange={set("name")} autoComplete="name" className={`${input} mt-1.5`} /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={label}>Email<input type="email" value={f.email} onChange={set("email")} autoComplete="email" placeholder="name@example.com" className={`${input} mt-1.5`} /></label>
                  <label className={label}>Телефон <span className="font-normal text-[#9aa1c0]">(необов'язково)</span><input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" className={`${input} mt-1.5`} /></label>
                </div>
                <label className={label}>Хто ви за фахом<input value={f.profession} onChange={set("profession")} placeholder="Психолог, психотерапевт, коуч, викладач практик…" className={`${input} mt-1.5`} /></label>
                <fieldset>
                  <legend className={label}>Напрями <span className="font-normal text-[#9aa1c0]">(можна кілька)</span></legend>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {TOPICS.map((x) => {
                      const on = topics.includes(x);
                      return (
                        <button key={x} type="button" aria-pressed={on} onClick={() => setTopics(on ? topics.filter((y) => y !== x) : [...topics, x])}
                          className={`min-h-[40px] rounded-full px-4 text-[14px] font-semibold transition ${on ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white" : "bg-[#f1eeff] text-[#4338ca] hover:bg-[#e7e1ff]"}`}>
                          {x}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className={label}>Що плануєте створити<textarea value={f.plan} onChange={set("plan")} rows={4} placeholder="Наприклад: 4-тижнева програма про вигорання для освітян, кілька медитацій для сну" className={`${input} mt-1.5 resize-y`} /></label>
                <label className={label}>Посилання на соцмережі чи сайт <span className="font-normal text-[#9aa1c0]">(необов'язково)</span><input value={f.links} onChange={set("links")} placeholder="Instagram, Threads, сайт" className={`${input} mt-1.5`} /></label>
                {/* hidden from people: bots fill it */}
                <input tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.trap} onChange={set("trap")} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
                <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#4338ca]" />
                  <span className="text-[14px] leading-relaxed text-[#2d2a5c]">
                    Погоджуюся, що Sensoria обробляє ці дані, щоб розглянути заявку й зв'язатися зі мною, відповідно до{" "}
                    <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Політики конфіденційності</a>.
                  </span>
                </label>
              </div>
              {error && <p role="alert" className="mt-4 text-[14px] text-rose-700">{error}</p>}
              <button type="submit" disabled={state === "sending"} className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-[17px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(76,80,230,0.7)] transition hover:-translate-y-0.5 disabled:opacity-60">
                {state === "sending" ? "Надсилаємо…" : "Надіслати заявку"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
