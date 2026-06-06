import type { Program } from "../App";

type Props = {
  program: Program;
  onBack: () => void;
};

export default function ProgramPage({ program, onBack }: Props) {
  return (
    <div className="min-h-screen bg-[#f5f7ff] text-black">

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0057ff] via-[#2563ff] to-[#7b2cff] text-white">

        <div className="max-w-[1400px] mx-auto px-6 pt-10 pb-14">

          {/* BACK */}
          <button
            onClick={onBack}
            className="
              mb-8
              text-sm
              text-white/70
              hover:text-white
              transition
            "
          >
            ← Назад
          </button>

          {/* TAG */}
          <div
            className="
              inline-flex
              items-center
              px-4 py-1.5
              rounded-full
              bg-white/15
              border border-white/20
              text-sm
              mb-6
            "
          >
            {Number(program.price) === 0
              ? "Безкоштовно"
              : "Нова програма"}
          </div>

          {/* TITLE */}
          <h1
            className="
              text-5xl
              font-bold
              leading-tight
              max-w-[900px]
              mb-5
            "
          >
            {program.title}
          </h1>

          {/* SUBTITLE */}
          <p
            className="
              text-white/80
              text-xl
              leading-relaxed
              max-w-[760px]
              mb-8
            "
          >
            Практична програма для покращення емоційного стану,
            стабілізації та внутрішнього балансу.
          </p>

          {/* AUTHOR */}
          <div className="flex flex-wrap items-center gap-8">

            <div className="flex items-center gap-4">
              <div
                className="
                  w-14 h-14
                  rounded-full
                  bg-white/20
                  border border-white/20
                "
              />

              <div>
                <div className="font-semibold text-lg">
                  {program.author}
                </div>

                <div className="text-white/70 text-sm">
                  Автор програми
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-lg">
              ⭐ <span className="font-semibold">4.9</span>
              <span className="text-white/70 text-base">
                (89 відгуків)
              </span>
            </div>

          </div>

        </div>
      </section>

      {/* CONTENT */}
      <section className="max-w-[1400px] mx-auto px-6 py-10">

        <div className="grid grid-cols-12 gap-8">

          {/* LEFT */}
          <div className="col-span-8 flex flex-col gap-8">

            {/* STATS */}
            <div
              className="
                grid grid-cols-4 gap-5
              "
            >

              {[
                {
                  title: "18",
                  subtitle: "Уроків",
                },
                {
                  title: "5 тижнів",
                  subtitle: "Тривалість",
                },
                {
                  title: "89+",
                  subtitle: "Студентів",
                },
                {
                  title: "Середній",
                  subtitle: "Рівень",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="
                    rounded-3xl
                    bg-white
                    border border-[#e9edff]
                    p-6
                    shadow-[0_4px_20px_rgba(0,0,0,0.03)]
                  "
                >
                  <div className="text-3xl font-bold mb-2">
                    {item.title}
                  </div>

                  <div className="text-gray-500 text-sm">
                    {item.subtitle}
                  </div>
                </div>
              ))}

            </div>

            {/* VIDEO */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
                shadow-[0_4px_30px_rgba(0,0,0,0.04)]
              "
            >

              <div className="mb-6">
                <h2 className="text-3xl font-bold mb-3">
                  Від автора
                </h2>

                <p className="text-gray-500 leading-relaxed">
                  Коротке знайомство з автором програми та пояснення,
                  як саме цей курс допоможе вам у повсякденному житті.
                </p>
              </div>

              {/* VIDEO BOX */}
              <div
                className="
                  relative
                  h-[420px]
                  rounded-[28px]
                  overflow-hidden

                  bg-gradient-to-br
                  from-[#eef2ff]
                  to-[#f5e9ff]

                  flex items-center justify-center
                "
              >

                <button
                  className="
                    w-24 h-24
                    rounded-full
                    bg-white

                    flex items-center justify-center

                    shadow-[0_10px_30px_rgba(0,0,0,0.08)]

                    hover:scale-105
                    transition
                  "
                >
                  <div className="text-4xl text-[#7b2cff] ml-1">
                    ▶
                  </div>
                </button>

              </div>

            </div>

            {/* RESULTS */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
              "
            >

              <h2 className="text-3xl font-bold mb-8">
                Що ви отримаєте
              </h2>

              <div className="flex flex-col gap-5">

                {[
                  "Практичні техніки стабілізації",
                  "Покращення емоційного стану",
                  "Інструменти для щоденного використання",
                  "Відчуття внутрішнього балансу",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-4"
                  >
                    <div
                      className="
                        w-7 h-7
                        rounded-full
                        bg-green-100
                        flex items-center justify-center
                        text-green-600
                        mt-0.5
                      "
                    >
                      ✓
                    </div>

                    <div className="text-lg">
                      {item}
                    </div>
                  </div>
                ))}

              </div>

            </div>

            {/* FOR WHO */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
              "
            >

              <h2 className="text-3xl font-bold mb-8">
                Для кого цей курс
              </h2>

              <div className="grid gap-5">

                {[
                  "Для людей із високим рівнем стресу",
                  "Для тих, хто хоче стабілізувати стан",
                  "Для покращення емоційного балансу",
                  "Для особистісного розвитку",
                ].map((item) => (
                  <div
                    key={item}
                    className="
                      flex items-center gap-4
                      rounded-2xl
                      bg-[#f8f9ff]
                      px-5 py-4
                    "
                  >
                    <div
                      className="
                        w-6 h-6
                        rounded-fullbg-[#7b2cff]
                        text-white
                        flex items-center justify-center
                        text-sm
                      "
                    >
                      ✓
                    </div>

                    <div className="text-lg">
                      {item}
                    </div>
                  </div>
                ))}

              </div>

            </div>

            {/* PROGRAM */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
              "
            >

              <h2 className="text-3xl font-bold mb-8">
                Програма курсу
              </h2>

              <div className="flex flex-col gap-5">

                {[
                  {
                    title: "Природа стресу",
                    time: "40 хв",
                  },
                  {
                    title: "Розпізнавання стресорів",
                    time: "45 хв",
                  },
                  {
                    title: "Техніки релаксації",
                    time: "50 хв",
                  },
                  {
                    title: "Тайм-менеджмент",
                    time: "55 хв",
                  },
                ].map((module, index) => (
                  <div
                    key={module.title}
                    className="
                      rounded-3xl
                      border border-[#ecefff]
                      p-6
                    "
                  >

                    <div className="flex justify-between items-center">

                      <div className="flex items-center gap-5">

                        <div
                          className="
                            w-11 h-11
                            rounded-full
                            bg-[#f3ebff]
                            text-[#7b2cff]
                            font-bold

                            flex items-center justify-center
                          "
                        >
                          {index + 1}
                        </div>

                        <div>
                          <div className="text-xl font-semibold">
                            {module.title}
                          </div>

                          <div className="text-gray-500 text-sm mt-1">
                            4 уроки
                          </div>
                        </div>

                      </div>

                      <div className="text-gray-500">
                        {module.time}
                      </div>

                    </div>

                  </div>
                ))}

              </div>

            </div>

            {/* AUTHOR */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
              "
            >

              <h2 className="text-3xl font-bold mb-8">
                Про автора
              </h2>

              <div className="flex gap-6">

                <div
                  className="
                    w-28 h-28
                    rounded-full
                    bg-gradient-to-br
                    from-[#dbeafe]
                    to-[#ede9fe]
                    shrink-0
                  "
                />

                <div>

                  <div className="text-3xl font-bold mb-3">
                    {program.author}
                  </div>

                  <p className="text-gray-600 leading-relaxed text-lg mb-5">
                    Сертифікований спеціаліст із багаторічним
                    досвідом роботи у сфері емоційного здоров’я
                    та психологічної підтримки.
                  </p>

                  <div className="flex flex-wrap gap-6 text-gray-500">

                    <div>⭐ 4.9 рейтинг</div>

                    <div>👥 500+ студентів</div>
                    <div>📚 5 курсів</div>

                  </div>

                </div>

              </div>

            </div>

            {/* REVIEWS */}
            <div
              className="
                rounded-[32px]
                bg-white
                border border-[#e9edff]
                p-8
              "
            >

              <h2 className="text-3xl font-bold mb-8">
                Відгуки студентів
              </h2>

              <div className="flex flex-col gap-6">

                {[
                  {
                    name: "Ірина",
                    text: "Програма допомогла мені стабілізувати емоційний стан та повернути внутрішній баланс.",
                  },
                  {
                    name: "Дмитро",
                    text: "Дуже практичний курс. Багато інструментів, які реально працюють.",
                  },
                  {
                    name: "Вікторія",
                    text: "Нарешті знайшла курс без води та з нормальною структурою.",
                  },
                ].map((review) => (
                  <div
                    key={review.name}
                    className="
                      rounded-3xl
                      bg-[#fafbff]
                      border border-[#edf0ff]
                      p-6
                    "
                  >

                    <div className="flex items-center justify-between mb-4">

                      <div className="font-semibold text-lg">
                        {review.name}
                      </div>

                      <div className="text-yellow-500">
                        ★★★★★
                      </div>

                    </div>

                    <p className="text-gray-600 leading-relaxed">
                      {review.text}
                    </p>

                  </div>
                ))}

              </div>

            </div>

          </div>

          {/* RIGHT */}
          <div className="col-span-4">

            <div
              className="
                sticky top-8

                rounded-[32px]
                bg-white

                border border-[#e9edff]

                p-8

                shadow-[0_10px_40px_rgba(0,0,0,0.05)]
              "
            >

              <div className="text-gray-500 mb-3">
                Ціна курсу
              </div>

              <div className="text-5xl font-bold mb-3">
                {Number(program.price) === 0
                  ? "Безкоштовно"
                  : `${program.price}₴`}
              </div>

              <div className="text-gray-500 mb-8">
                Одноразовий платіж · Безстроковий доступ
              </div>

              {/* BUY */}
              <button
                className="
                  w-full
                  py-4
                  rounded-2xl

                  bg-gradient-to-r
                  from-[#0057ff]
                  to-[#7b2cff]

                  text-white
                  font-semibold
                  text-lg

                  hover:opacity-90
                  transition
                "
              >
                Придбати курс
              </button>

              {/* CART */}
              <button
                className="
                  w-full
                  py-4
                  rounded-2xl

                  border border-[#dbe2ff]

                  text-[#0057ff]
                  font-semibold
                  text-lg

                  mt-4

                  hover:bg-[#f5f8ff]
                  transition
                "
              >
                Додати до кошика
              </button>

              {/* FEATURES */}
              <div className="mt-10">

                <div className="font-semibold text-lg mb-5">
                  Що ви отримуєте:
                </div>

                <div className="flex flex-col gap-4 text-gray-600">

                  <div>✓ 18 відеоуроків</div>
                  <div>✓ Додаткові матеріали</div><div>✓ Сертифікат</div>
                  <div>✓ Безстроковий доступ</div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* FOOTER */}
      <footer
        className="
          mt-20
          border-t border-[#e5e9ff]
          bg-white
        "
      >

        <div
          className="
            max-w-[1400px]
            mx-auto
            px-6
            py-10

            flex
            items-center
            justify-between
          "
        >

          <div>

            <div className="text-2xl font-bold mb-2">
              SENSORIA
            </div>

            <div className="text-gray-500">
              Платформа ментального розвитку
            </div>

          </div>

          <div className="text-gray-400 text-sm">
            © 2026 Sensoria. All rights reserved.
          </div>

        </div>

      </footer>

    </div>
  );
}