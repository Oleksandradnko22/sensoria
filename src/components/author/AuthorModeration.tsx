import AuthorVerification from "./AuthorVerification";

// What actually happens (matches Умови використання and Договір з автором):
// Sensoria does not moderate or review materials before publication. The author
// publishes on their own and is responsible for the content; Sensoria handles
// complaints afterwards.
const STEPS = [
  {
    title: "Ви публікуєте самостійно",
    text: "Sensoria не перевіряє й не погоджує матеріали перед публікацією. Ви відповідаєте за зміст, законність, достовірність і безпечність своїх матеріалів.",
  },
  {
    title: "Теми підвищеного ризику — лише для Фахівців",
    text: "Для таких тем діє технічне обмеження допуску до публікації. Це не оцінка вашого матеріалу.",
  },
  {
    title: "Скарги розглядаються вручну",
    text: "Якщо на матеріал поскаржилися, менеджер може попросити пояснення, призупинити продаж для нових покупців або зняти матеріал. Ті, хто вже купив, зберігають доступ, якщо немає законних підстав його обмежити.",
  },
];

const GUIDELINES = [
  "Назва, опис і зміст відповідають одне одному.",
  "Немає обіцянок гарантованого результату чи «вилікування».",
  "Вказано, що матеріал не замінює консультацію психолога, психотерапевта чи лікаря.",
  "Додано, куди звернутися при гострому чи кризовому стані (наприклад, 112).",
  "Ваш статус і освіта вказані достовірно. Без статусу «Фахівець» не публікуються теми підвищеного ризику.",
];

export default function AuthorModeration(_props: { content?: unknown }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Модерація</h1>
        <p className="text-black/50 mt-1">
          Правила публікації, підтвердження особи та перегляд документів про освіту.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* MAIN COLUMN */}
        <div className="flex flex-col gap-8">
          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-4">Як це працює</h2>
            <div className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <div key={s.title} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#eef2ff] flex items-center justify-center text-[13px] font-semibold text-[#4338ca] shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium">{s.title}</div>
                    <div className="text-[13px] text-black/60 mt-0.5">{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-1">Автор і Фахівець</h2>
            <p className="text-[13px] text-black/60 leading-relaxed">
              Усі автори публікують власні освітні матеріали. Статус «Фахівець» отримує автор, документи якого про
              освіту Sensoria переглянула: він показується в профілі й на матеріалах та відкриває теми підвищеного
              ризику (травма, суїцидальні думки, розлади харчової поведінки, залежності, діагнози й лікування).
              Перегляд документів не є перевіркою ваших матеріалів. Досвід ви вказуєте самі, і він показується як «вказано автором».
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-1">Перед публікацією</h2>
            <p className="text-[13px] text-black/60 mb-4">
              Пам'ятка для вас, а не автоматична перевірка: за ці пункти відповідаєте ви.
            </p>
            <ul className="flex flex-col gap-2">
              {GUIDELINES.map((g) => (
                <li key={g} className="flex gap-3 text-[14px] text-black/80">
                  <span aria-hidden className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black/30 shrink-0" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="lg:sticky lg:top-6 flex flex-col gap-6">
          <AuthorVerification />
          <AuthorVerification kind="education" />
        </div>
      </div>
    </div>
  );
}
