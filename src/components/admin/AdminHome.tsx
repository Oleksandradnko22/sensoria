import { useEffect, useState } from "react";
import { fetchAuthorApplications, fetchPendingAuthors } from "../../lib/admin";
import AdminNotes from "./AdminNotes";

// «Головна» of the admin panel: what needs the owner today, in plain words, each with one button — and a short map
// «якщо треба…» so she always knows where to go. Counts come from the dashboard (already loaded) and the author lists.
export type HomeGo = "stats" | "authorApps" | "verification" | "tickets" | "contentReports" | "refunds" | "users" | "materials" | "finance" | "announcements";

type Props = {
  name: string;
  counts: { tickets: number; verification: number; reports: number; refunds: number };
  onGo: (t: HomeGo) => void;
};

export default function AdminHome({ name, counts, onGo }: Props) {
  const [authors, setAuthors] = useState<number | null>(null);
  useEffect(() => {
    Promise.all([fetchPendingAuthors().catch(() => []), fetchAuthorApplications().catch(() => [])])
      .then(([p, a]) => setAuthors(p.length + a.filter((x) => x.status === "new").length));
  }, []);

  const todo: { n: number; title: string; why: string; button: string; go: HomeGo }[] = [
    { n: authors ?? 0, title: "Нові автори чекають схвалення", why: "Людина заповнила анкету й підписала договір. Перегляньте анкету й натисніть «Схвалити» — автору прийде лист, і кабінет відкриється.", button: "Переглянути анкети", go: "authorApps" },
    { n: counts.refunds, title: "Запити на повернення коштів", why: "Покупець просить повернути гроші. Відповісти треба якнайшвидше — строки встановлені правилами повернення.", button: "Відкрити запити", go: "refunds" },
    { n: counts.tickets, title: "Нові листи в підтримку", why: "Хтось написав через форму на сайті. Прочитайте й дайте відповідь.", button: "Відкрити листи", go: "tickets" },
    { n: counts.reports, title: "Скарги", why: "Хтось поскаржився на матеріал, публікацію чи коментар. Подивіться й вирішіть: лишити чи приховати.", button: "Відкрити скарги", go: "contentReports" },
    { n: counts.verification, title: "Документи авторів на перевірці", why: "Автор надіслав документи, щоб отримати позначку «перевірений». Звірте й підтвердьте.", button: "Перевірити", go: "verification" },
  ];
  const open = todo.filter((t) => t.n > 0);

  const map: { want: string; why: string; go: HomeGo; where: string }[] = [
    { want: "Схвалити нового автора", why: "Прочитати анкету й відкрити автору кабінет", go: "authorApps", where: "Автори" },
    { want: "Надати статус «Фахівець»", why: "Переглянути диплом чи сертифікат автора", go: "verification", where: "Автори" },
    { want: "Знайти людину", why: "Учасника чи автора — за ім'ям або поштою; тут же заблокувати", go: "users", where: "Люди" },
    { want: "Перевірити чи приховати матеріал", why: "Програму, гайд або медитацію", go: "materials", where: "Матеріали" },
    { want: "Відповісти на лист у підтримку", why: "Або розглянути скаргу чи повернення коштів", go: "tickets", where: "Звернення" },
    { want: "Подивитися гроші", why: "Скільки заплатили покупці й скільки тарифу отримала Sensoria", go: "finance", where: "Гроші" },
    { want: "Написати оголошення", why: "Для всіх авторів і учасників", go: "announcements", where: "Спільнота" },
    { want: "Подивитися статистику", why: "Відвідування, реєстрації, продажі", go: "stats", where: "Аналітика" },
  ];

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-[26px] font-bold text-[#12172b] sm:text-[30px]">Вітаємо, {name.split(/\s+/)[0]}!</h1>
        <p className="mt-1 text-[15px] text-[#5a6080]">Тут зібрано все, що потребує вашої уваги сьогодні. Почніть згори — найважливіше першим.</p>
      </header>

      <section aria-labelledby="home-todo">
        <h2 id="home-todo" className="text-[18px] font-semibold text-[#12172b]">Що зробити сьогодні</h2>
        {authors === null ? (
          <p className="mt-3 text-[14px] text-black/50">Збираємо справи…</p>
        ) : open.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-white p-6 ring-1 ring-[#e6e3fb]">
            <div className="text-[17px] font-semibold text-[#12172b]">Усе зроблено</div>
            <p className="mt-1 text-[14px] text-[#5a6080]">Нових справ немає. Коли з'явиться нова анкета, лист чи скарга — вони будуть тут, а на пошту прийде сповіщення.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {open.map((t) => (
              <div key={t.go} className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-[#e6e3fb]">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-amber-400 px-2 text-[15px] font-bold text-black">{t.n}</span>
                  <div className="text-[16px] font-semibold leading-snug text-[#12172b]">{t.title}</div>
                </div>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#5a6080]">{t.why}</p>
                <button type="button" onClick={() => onGo(t.go)} className="mt-4 min-h-[44px] self-start rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white">{t.button} →</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminNotes />

      <section aria-labelledby="home-map">
        <h2 id="home-map" className="text-[18px] font-semibold text-[#12172b]">Швидкі дії</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {map.map((m) => (
            <button key={m.want} type="button" onClick={() => onGo(m.go)} className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-[#e6e3fb] transition hover:ring-[#b9b2f3]">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-[#12172b]">{m.want}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#5a6080]">{m.why}</span>
              </span>
              <span className="shrink-0 rounded-full bg-[#eef0fd] px-3 py-1 text-[13px] font-semibold text-[#4338ca]">{m.where} →</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
