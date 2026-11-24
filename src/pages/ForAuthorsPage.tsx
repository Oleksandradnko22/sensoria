import { Icon } from "../components/ui/Icon";

// «Для авторів»: who we are looking for and the way in; the application itself is AuthorApplyPage (/author-signup).

const PERKS: { icon: "program" | "card" | "chart" | "compass"; title: string; text: string }[] = [
  { icon: "program", title: "Ваші програми, гайди й медитації", text: "Редактор уроків, студія медитацій, конструктор обкладинок — усе в одному кабінеті." },
  { icon: "card", title: "Оплата одразу на ваш ФОП", text: "monobank ділить оплату в момент покупки: Sensoria не тримає ваших коштів. Тариф — 30% з каталогу, 15% за вашим посиланням чи промокодом." },
  { icon: "compass", title: "Учасники приходять за запитом", text: "Короткий тест підбирає матеріали під стан людини, тож ваші програми бачать ті, кому вони потрібні." },
  { icon: "chart", title: "Аналітика й спілкування", text: "Прогрес учасників, відгуки, повідомлення й спільнота — у кабінеті автора." },
];


export default function ForAuthorsPage({ onRegister, onApply }: { onRegister: () => void; onApply: () => void }) {
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
          <button type="button" onClick={onApply} className="inline-flex min-h-[56px] items-center rounded-2xl bg-white px-8 text-[17px] font-bold text-[#1e2a78] shadow-[0_14px_40px_rgba(10,20,90,0.35)] transition hover:-translate-y-0.5">Заповнити анкету автора</button>
          <button type="button" onClick={onRegister} className="inline-flex min-h-[56px] items-center rounded-2xl px-5 text-[15px] font-semibold text-white/90 ring-1 ring-white/30 transition hover:bg-white/10">Маю акаунт — увійти</button>
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

        {/* the application is a separate three-step form (/author-signup) */}
        <section aria-labelledby="apply-title" className="rounded-[28px] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:p-8">
          <h2 id="apply-title" className="text-[24px] font-bold text-[#12172b]">Як стати автором</h2>
          <ol className="mt-5 space-y-4">
            {[
              ["Заповніть анкету", "3 кроки: про вас, ваші матеріали, акаунт. Займе 3–4 хвилини."],
              ["Підтвердьте пошту й підпишіть договір", "Договір з автором підписується кодом, який прийде на пошту."],
              ["Ми відкриємо кабінет", "Розглянемо анкету й надішлемо лист, щойно кабінет буде доступний."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-[14px] font-bold text-white">{i + 1}</span>
                <span>
                  <span className="block text-[16px] font-semibold text-[#12172b]">{t}</span>
                  <span className="mt-0.5 block text-[14px] leading-relaxed text-[#5b6280]">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={onApply} className="mt-7 inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-[17px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(76,80,230,0.7)] transition hover:-translate-y-0.5">Заповнити анкету автора</button>
        </section>
      </div>
    </main>
  );
}
