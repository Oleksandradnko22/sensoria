import { useState } from "react";

// «Як це працює» on top of Адмінка → Автори: the whole road of an author in plain words — from the application to the
// «Підтверджений автор» tick and the «Фахівець» status — and where in the panel each step is done.
const STEPS: { title: string; text: string; where: string }[] = [
  { title: "Анкета", text: "Людина заповнює анкету на sensoria.courses/for-authors і створює акаунт. Вам приходить лист «Нова анкета автора».", where: "Нічого робити не треба" },
  { title: "Договір", text: "Автор підтверджує пошту й підписує договір кодом з листа. Після цього йому приходить запрошення до Telegram-спільноти авторів.", where: "Нічого робити не треба" },
  { title: "Схвалення", text: "Ви читаєте анкету (освіта, досвід, плани) і натискаєте «Схвалити». Автору приходить лист, кабінет відкривається — він може створювати матеріали.", where: "Автори → Анкети й схвалення" },
  { title: "Диплом (за бажанням автора)", text: "У своєму кабінеті, розділ «Модерація», автор може надіслати документи: диплом, додаток до диплома чи сертифікат — щоб отримати статус «Фахівець». Особу окремо перевіряти не треба: це робить monobank, коли автор підключає ФОП.", where: "Автори → Статус «Фахівець»" },
  { title: "Перевірка", text: "Відкрийте документ: ім'я збігається з акаунтом, видно заклад, спеціальність і дату. Натисніть «Документи переглянуто — надати «Фахівець»» або «Відхилити» з причиною. Після рішення файли видаляються самі.", where: "Автори → Статус «Фахівець»" },
];

export default function AuthorsGuide() {
  const [open, setOpen] = useState(true);
  return (
    <section className="mb-6 rounded-2xl bg-white p-5 ring-1 ring-[#e6e3fb]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-[17px] font-semibold text-[#12172b]">Як це працює: шлях автора від анкети до статусу «Фахівець»</span>
        <span className="text-[14px] text-[#4338ca]">{open ? "Згорнути" : "Показати"}</span>
      </button>
      {open && (
        <>
          <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl bg-[#f5f4ff] p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-[#4338ca] ring-1 ring-[#dcd8fa]">{i + 1}</span>
                <div className="mt-2 text-[15px] font-semibold text-[#12172b]">{s.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5a6080]">{s.text}</p>
                <p className="mt-2 text-[12px] font-semibold text-[#4338ca]">{s.where}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-2 text-[14px] leading-relaxed text-[#2d2a5c] md:grid-cols-2">
            <p><b>Без статусу «Фахівець»</b> автор так само працює й публікує матеріали — статус лише показує покупцям, що освіту переглянуто.</p>
            <p><b>Документи прийшли поштою?</b> Відкрийте <b>Люди</b>, знайдіть автора й натисніть «Надати статус «Фахівець»» — вкажіть, що саме переглянули.</p>
          </div>
        </>
      )}
    </section>
  );
}
