import { useState } from "react";

// «Як це працює» on top of an admin section: the steps in plain words and where each is done. Folded or open is
// remembered per section in this browser (a convenience only).
export type GuideStep = { title: string; text: string; where?: string };

export default function SectionGuide({ id, title, steps, notes }: { id: string; title: string; steps: GuideStep[]; notes?: string[] }) {
  const key = `sensoria:admin-guide:${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== "0"; } catch { return true; } });
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* private mode */ } };
  return (
    <section className="mb-6 rounded-2xl bg-white p-5 ring-1 ring-[#e6e3fb]">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[17px] font-semibold text-[#12172b]">Як це працює: {title}</span>
        <span className="shrink-0 text-[14px] text-[#4338ca]">{open ? "Згорнути" : "Показати"}</span>
      </button>
      {open && (
        <>
          <ol className={`mt-4 grid gap-3 md:grid-cols-2 ${steps.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl bg-[#f5f4ff] p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[#4338ca] ring-1 ring-[#dcd8fa]">{i + 1}</span>
                <div className="mt-2 text-[15px] font-semibold text-[#12172b]">{s.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5a6080]">{s.text}</p>
                {s.where && <p className="mt-2 text-[12px] font-semibold text-[#4338ca]">{s.where}</p>}
              </li>
            ))}
          </ol>
          {notes && notes.length > 0 && (
            <ul className="mt-4 grid gap-2 text-[14px] leading-relaxed text-[#2d2a5c] md:grid-cols-2">
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export const GUIDES: Record<string, { title: string; steps: GuideStep[]; notes?: string[] }> = {
  requests: {
    title: "листи, скарги й повернення коштів",
    steps: [
      { title: "Лист у підтримку", text: "Людина пише через «Повідомити про проблему» на сайті. Вам приходить сповіщення на пошту.", where: "Звернення → Листи в підтримку" },
      { title: "Відповідь", text: "Прочитайте лист, напишіть відповідь і позначте «Розглянуто». Людина побачить відповідь у своєму кабінеті, розділ «Ваші звернення».", where: "Звернення → Листи в підтримку" },
      { title: "Скарга", text: "Хтось скаржиться на матеріал, публікацію чи коментар. Відкрийте, подивіться і вирішіть: лишити як є або приховати.", where: "Звернення → Скарги" },
      { title: "Повернення коштів", text: "Покупець просить повернути гроші. Ви схвалюєте або відхиляєте з причиною. Після схвалення саме повернення проводиться в розділі «Гроші» — покупцю прийде лист автоматично. Строк видно біля кожного запиту.", where: "Звернення → Повернення коштів, потім Гроші" },
    ],
    notes: [
      "Цифра біля розділу в меню — скільки справ чекає на вас.",
      "Термінові скарги (наприклад, про загрозу життю) приходять на пошту з позначкою «ТЕРМІНОВО» — їх відкривайте першими.",
    ],
  },
  people: {
    title: "учасники й автори",
    steps: [
      { title: "Знайти людину", text: "Введіть ім'я або email у пошук. Фільтри зверху: лише учасники, лише автори, заблоковані.", where: "Люди → Усі люди" },
      { title: "Подивитися акаунт", text: "Натисніть на людину: скарги на неї, заявки на перевірку документів, блокування й усі дії адміністраторів з цим акаунтом.", where: "Люди → Усі люди" },
      { title: "Статус «Фахівець»", text: "Статус «Фахівець» можна надати або зняти тут, якщо диплом прийшов поштою, — вкажіть, що саме переглянули.", where: "Люди → Усі люди" },
      { title: "Блокування", text: "Порушника можна заблокувати в чатах (не може писати) або повністю (не може увійти). Причину обов'язково запишіть — її видно в журналі дій.", where: "Люди → Усі люди / Порушення" },
    ],
    notes: ["Блокування діє одразу: людину виводить з усіх пристроїв. Розблокувати можна тут же."],
  },
  materials: {
    title: "програми, гайди й медитації",
    steps: [
      { title: "Автор публікує", text: "Більшість матеріалів з'являються в каталозі одразу. На перевірку потрапляють лише ті, що мають чутливі теми, — тоді вам приходить лист «Матеріал надіслано на модерацію»." },
      { title: "Перевірка", text: "Знайдіть матеріал зі статусом «На модерації» й відкрийте: чи немає небезпечних порад, обіцянок вилікувати, чужих текстів чи фото.", where: "Матеріали" },
      { title: "Рішення", text: "«Схвалити й опублікувати» — матеріал з'явиться в каталозі. Або «Повернути автору в чернетки» з поясненням, що виправити.", where: "Матеріали" },
      { title: "Вже опубліковане", text: "Якщо є порушення: «Призупинити продаж» (нові покупки неможливі, хто купив — зберігає доступ) або повністю обмежити доступ.", where: "Матеріали" },
    ],
  },
  money: {
    title: "оплати, тариф і акти",
    steps: [
      { title: "Оплата", text: "Покупець платить карткою на сторінці monobank. Гроші йдуть одразу на рахунок автора." },
      { title: "Тариф Sensoria", text: "У день зарахування оплати банк перераховує з рахунку автора на рахунок Sensoria тариф: 30% (або 15%, якщо покупець прийшов за посиланням автора)." },
      { title: "Повернення", text: "Схвалене повернення проводиться тут. Тариф за повернене замовлення Sensoria повертає автору." },
      { title: "Акти", text: "До 5-го числа кожного місяця автору формується акт за минулий місяць. Тут видно всі акти й суми." },
    ],
    notes: [
      "«Книга обліку доходів» — ваш дохід по днях для податкової: переносьте ці суми в Електронний кабінет.",
      "«Звірка тарифу за днями» — перевірка, що банк перерахував вам усі тарифи за кожен день. Зелене — усе гаразд.",
      "«Підключення авторів до monobank» — коли банк підключив ФОП автора, натисніть «Прив'язати»: після цього автор може продавати платні матеріали.",
      "«Тариф до повернення авторам» — якщо гроші покупцю повернули не в день оплати, тариф треба повернути автору протягом 5 робочих днів.",
    ],
  },
};
