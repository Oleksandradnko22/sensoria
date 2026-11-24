import { Icon } from "../components/ui/Icon";

// «Для авторів»: who we are looking for and the way in; the application itself is AuthorApplyPage (/author-signup).
// Layout: hero → what an author gets (white cards 2×2) → three steps in a row → what to know → the closing call.

const PERKS: { icon: "program" | "card" | "chart" | "compass"; title: string; text: string }[] = [
  { icon: "program", title: "Ваші програми, гайди й медитації", text: "Редактор уроків, студія медитацій і конструктор обкладинок — усе в одному кабінеті." },
  { icon: "card", title: "Оплата одразу на ваш ФОП", text: "monobank ділить оплату в момент покупки: Sensoria не тримає ваших коштів." },
  { icon: "compass", title: "Учасники приходять за запитом", text: "Короткий тест підбирає матеріали під стан людини, тож ваші програми бачать ті, кому вони потрібні." },
  { icon: "chart", title: "Аналітика й спілкування", text: "Прогрес учасників, відгуки, повідомлення й спільнота — у кабінеті автора." },
];

const STEPS: [string, string][] = [
  ["Заповніть анкету", "Про вас, ваші матеріали й акаунт — 3–4 хвилини."],
  ["Підпишіть договір", "Підтвердьте пошту й підпишіть договір з автором кодом з листа."],
  ["Отримайте доступ", "Ми розглянемо анкету й відкриємо ваш кабінет."],
];

const FACTS: [string, string][] = [
  ["Тариф платформи", "30% з продажу в каталозі, 15% — якщо покупець прийшов за вашим посиланням чи промокодом."],
  ["Без ФОП можна почати", "Готувати матеріали в кабінеті можна одразу. Продавати — лише як ФОП з рахунком у monobank і касою ПРРО (наприклад, Checkbox): так вимагає банк."],
  ["Ваші матеріали — ваші", "Платформа отримує лише невиключну ліцензію на показ і продаж, права на матеріали лишаються за вами."],
];

export default function ForAuthorsPage({ onApply }: { onApply: () => void }) {
  const primary = "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white px-8 text-[17px] font-bold text-[#1e2a78] shadow-[0_14px_40px_rgba(10,20,90,0.35)] transition hover:-translate-y-0.5";
  return (
    <main className="wide-col mx-auto w-full max-w-[1160px] px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
      {/* hero, with the Sensoria rings behind it */}
      <section className="relative text-center">
        <svg aria-hidden="true" viewBox="0 0 400 400" className="pointer-events-none absolute left-1/2 top-1/2 -z-0 w-[min(900px,140vw)] -translate-x-1/2 -translate-y-1/2 opacity-[0.10]" fill="none" stroke="white">
          <circle cx="200" cy="200" r="90" strokeWidth="0.7" />
          <circle cx="200" cy="200" r="140" strokeWidth="0.7" />
          <circle cx="200" cy="200" r="190" strokeWidth="0.7" />
        </svg>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-semibold text-white/90 ring-1 ring-white/20">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gradient-to-r from-[#a8e8ff] to-[#e4ddff]" />
            Відкрито набір перших авторів
          </span>
          <h1 className="mx-auto mt-5 max-w-[16ch] text-[34px] font-bold leading-[1.1] text-white sm:text-[48px] lg:text-[58px]">
            Станьте автором <span className="bg-gradient-to-r from-[#e4ddff] to-[#a8e8ff] bg-clip-text text-transparent">Sensoria</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[40em] text-[16px] leading-relaxed text-white/80 sm:text-[18px]">
            Створюйте психологічні програми, гайди й медитації та діліться ними з людьми, яким вони потрібні. Перші автори готують свої матеріали ще до відкриття платформи.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" onClick={onApply} className={`${primary} w-full sm:w-auto`}>
              Заповнити анкету
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </section>

      {/* what an author gets */}
      <section aria-labelledby="perks" className="mt-16 sm:mt-20">
        <h2 id="perks" className="text-center text-[26px] font-bold text-white sm:text-[32px]">Що ви отримуєте</h2>
        <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:gap-5">
          {PERKS.map((p) => (
            <li key={p.title} className="flex gap-4 rounded-[24px] bg-white p-5 shadow-[0_18px_44px_-22px_rgba(10,20,90,0.6)] sm:p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_10px_22px_-8px_rgba(76,80,230,0.7)]">
                <Icon name={p.icon} size={20} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold leading-snug text-[#12172b]">{p.title}</span>
                <span className="mt-1.5 block text-[15px] leading-relaxed text-[#5b6280]">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* three steps */}
      <section aria-labelledby="steps" className="mt-16 rounded-[28px] bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur sm:mt-20 sm:p-10">
        <h2 id="steps" className="text-center text-[26px] font-bold text-white sm:text-[32px]">Як стати автором</h2>
        <ol className="relative mt-8 grid gap-6 md:grid-cols-3 md:gap-8">
          <span aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-6 hidden h-px bg-gradient-to-r from-white/10 via-white/40 to-white/10 md:block" />
          {STEPS.map(([t, d], i) => (
            <li key={t} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[18px] font-bold text-[#3b55e0] shadow-[0_10px_26px_-8px_rgba(10,20,90,0.6)]">{i + 1}</span>
              <span className="md:mt-1">
                <span className="block text-[17px] font-semibold text-white">{t}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-white/75">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* what to know */}
      <section aria-labelledby="facts" className="mt-16 sm:mt-20">
        <h2 id="facts" className="text-center text-[26px] font-bold text-white sm:text-[32px]">Що варто знати</h2>
        <dl className="mt-7 grid gap-4 md:grid-cols-3">
          {FACTS.map(([t, d]) => (
            <div key={t} className="rounded-[24px] bg-white/10 p-5 ring-1 ring-white/15 sm:p-6">
              <dt className="text-[16px] font-semibold text-white">{t}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-white/75">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-center text-[14px] text-white/70">
          Повні умови —{" "}
          <a href="/author-agreement" target="_blank" rel="noopener" className="font-semibold text-white underline underline-offset-4">Договір з автором</a>.
        </p>
      </section>

      {/* closing call */}
      <section className="mt-16 rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:mt-20 sm:px-10 sm:py-12">
        <h2 className="text-[26px] font-bold text-[#12172b] sm:text-[32px]">Готові почати?</h2>
        <p className="mx-auto mt-3 max-w-[32em] text-[16px] leading-relaxed text-[#5b6280]">Заповніть анкету — це займе кілька хвилин. Ми напишемо вам, щойно кабінет буде відкрито.</p>
        <button type="button" onClick={onApply} className="mt-7 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-10 text-[17px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(76,80,230,0.7)] transition hover:-translate-y-0.5 sm:w-auto">
          Заповнити анкету автора
        </button>
      </section>
    </main>
  );
}
