import { useEffect, useState } from "react";

interface GuidesPreviewModalProps {
  guide: any;
  onClose: () => void;
}

export default function GuidesPreviewModal({
  guide,
  onClose,
}: GuidesPreviewModalProps) {

  useEffect(() => {

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "auto";
    };

  }, []);

  const previewPages = [
  {
    id: 1,
    title: "Техніка стабілізації",
    subtitle: "Швидке заспокоєння",
  },
  {
    id: 2,
    title: "Практика дихання",
    subtitle: "Зменшення тривоги",
  },
  {
    id: 3,
    title: "Чек-лист стану",
    subtitle: "Самодопомога",
  },
];

const [activePage, setActivePage] = useState(1);

  return (

    <div
      className="
        fixed
        inset-0
        z-[999]

        bg-black/60
        backdrop-blur-xl

        overflow-y-auto

        px-6
        py-10
      "
    >

      <div
        className="
          max-w-[1180px]
          mx-auto
        "
      >

        <div
          className="
            relative

            rounded-[42px]

            bg-gradient-to-br
            from-[#0b5d57]
            via-[#0f766e]
            to-[#14b8a6]

            overflow-hidden

            border border-white/10

            shadow-[0_40px_140px_rgba(0,0,0,0.35)]

            p-8
            lg:p-12
          "
        >

            {/* GLOBAL CLOSE */}
<button
  onClick={onClose}
  className="
    absolute

    top-6
    right-6

    z-50

    w-12
    h-12

    rounded-full

    bg-white/10
    hover:bg-white/20

    border border-white/10

    backdrop-blur-xl

    text-white
    text-[18px]

    transition-all
    duration-300

    hover:scale-105
  "
>
  ✕
</button>

          {/* BACKGROUND GLOW */}
          <div
            className="
              absolute
              top-[-180px]
              right-[-180px]

              w-[420px]
              h-[420px]

              rounded-full

              bg-[#6ee7c8]/20

              blur-[140px]
            "
          />

          <div
            className="
              absolute
              bottom-[-180px]
              left-[-180px]

              w-[420px]
              h-[420px]

              rounded-full

              bg-[#99f6e4]/10

              blur-[160px]
            "
          />

          {/* HERO */}
          <div
  className="
    relative
    z-10

    max-w-none
  "
  >


            {/* TAG */}
              <div
                className="
                  inline-flex

                  px-5
                  py-2.5

                  rounded-full

                  bg-white/10

                  border border-white/10

                  text-white/90
                  text-[13px]
                  font-medium

                  backdrop-blur-xl
                "
              >
                {guide.type}
              </div>

              {/* TITLE */}
              <h1
                className="
                  mt-7

                  text-[40px]
                  lg:text-[60px]

                  leading-[0.92]

                  font-bold

                  tracking-[-0.03em]

                  text-white
                "
              >
                {guide.title}
              </h1>

              {/* DESCRIPTION */}
              <p
                className="
                  mt-7

                  max-w-[720px]

                  text-[16px]
                  leading-[1.7]

                  text-white/80
                "
              >
                Практичний PDF-гайд з вправами,
                техніками стабілізації та
                короткими психологічними
                інструментами для підтримки
                ментального стану у повсякденному житті.
              </p>

              {/* BENEFITS */}
              <div
                className="
                  mt-8

                  flex
                  flex-wrap
                  gap-3
                "
              >

                {[
                  "🌿 Менше тривоги",
                  "🧠 Більше контролю",
                  "💨 Швидкі SOS-техніки",
                  "😴 Кращий сон",
                ].map((item) => (

                  <div
                    key={item}
                    className="
                      px-5
                      py-3

                      rounded-2xl

                      bg-white/10

                      border border-white/10

                      text-white/90
                      text-[14px]
                      font-medium
                      "
                  >
                    {item}
                  </div>

                ))}

              </div>

              {/* META */}
              <div
                className="
                  mt-12

                  flex
                  flex-wrap
                  gap-12
                "
              >

                <div>
                  <div className="text-white/50 text-[13px]">
                    Автор
                  </div>

                  <div className="mt-2 text-white font-semibold">
                    {guide.author}
                  </div>
                </div>

                <div>
                  <div className="text-white/50 text-[13px]">
                    Сторінок
                  </div>

                  <div className="mt-2 text-white font-semibold">
                    {guide.pages}+
                  </div>
                </div>

                <div>
                  <div className="text-white/50 text-[13px]">
                    Формат
                  </div>

                  <div className="mt-2 text-white font-semibold">
                    PDF
                  </div>
                </div>

              </div>
</div>

          {/* GRID */}
          <div
            className="
              relative

              grid
              grid-cols-1
              lg:grid-cols-12

              gap-10
            "
          >

            {/* LEFT */}
            <div className="lg:col-span-8">

              {/* INSIDE */}
              <div
                className="
                  mt-10

                  rounded-[32px]

                  bg-white/10

                  border border-white/10

                  backdrop-blur-2xl

                  p-8
                "
              >

                <div
                  className="
                    text-[30px]
                    font-semibold
                    text-white
                  "
                >
                  Що всередині
                </div>

                <div
                  className="
                    mt-7

                    flex
                    flex-wrap
                    gap-3
                  "
                >

                  {[
                    "✓ Практичні вправи",
                    "✓ PDF шаблони",
                    "✓ Чек-листи",
                    "✓ SOS техніки",
                    "✓ Швидкі інструкції",
                    "✓ Практика на щодень",
                  ].map((item) => (

                    <div
                      key={item}
                      className="
                        px-5
                        py-3

                        rounded-2xl

                        bg-white/10

                        border border-white/10

                        text-white/90
                        text-[14px]
                        font-medium
                      "
                    >
                      {item}
                    </div>

                  ))}

                </div>

              </div>

              {/* PDF PREVIEW */}
              <div
                className="
                  mt-10

                  rounded-[32px]

                  bg-white/10

                  border border-white/10

                  backdrop-blur-2xl

                  overflow-hidden

                  shadow-[0_20px_80px_rgba(0,0,0,0.18)]
                "
              >

                

                {/* HEADER */}
                <div
                  className="
                    px-8
                    py-7

                    border-b
                    border-white/10

                    flex
                    items-center
                    justify-between
                  "
                >

                  <div>

                    <div
                      className="
                        text-[30px]
                        font-semibold
                        text-white
                        leading-none
                      "
                    >
                      Що всередині гайду
                    </div>

                    <div
                      className="
                        mt-3

                        text-white/60
                        text-[15px]
                      "
                    >
                    Реальні сторінки, практики та вправи
                    </div>

                  </div>

                  <div
                    className="
                      px-4
                      py-2

                      rounded-full

                      bg-white/10

                      text-white/70
                      text-[13px]

                      border border-white/10
                    "
                  >
                    Live preview
                  </div>

                  <div
  className="
    mt-5

    flex
    gap-2
  "
>

  {previewPages.map((page) => (

    <button
      key={page.id}
      onClick={() => setActivePage(page.id)}
      className={`
        px-4
        py-2

        rounded-xl

        text-[13px]
        font-medium

        transition-all
        duration-300

        ${
          activePage === page.id
            ? "bg-white text-[#0b5d57]"
            : "bg-white/10 text-white/70 hover:bg-white/20"
        }
      `}
    >
      {page.id}
    </button>

  ))}

</div>

                </div>


                {/* PREMIUM PREVIEW */}
                <div
                  className="
                    relative

                    h-[820px]

                    overflow-hidden

                    bg-gradient-to-b
                    from-[#dffcf5]
                    via-[#f5fffc]
                    to-[#ffffff]

                    p-10
                  "
                >

                  {/* GLOW */}
                  <div
                    className="
                      absolute
                      top-[-100px]
                      left-[-100px]

                      w-[320px]
                      h-[320px]

                      rounded-full

                      bg-[#6ee7c8]/30

                      blur-[120px]
                    "
                  />

                  <div
                    className="
                      absolute
                      bottom-[-120px]
                      right-[-100px]

                      w-[340px]
                      h-[340px]

                      rounded-full

                      bg-[#14b8a6]/20

                      blur-[140px]
                    "
                  />

                  {/* CONTENT */}
                  <div
                    className="
                      relative

                      flex
                      items-center
                      justify-center

                      h-full
                    "
                  >

                    {/* BACK PAGE */}
                    <div
                      className="
                        absolute

                        top-[90px]

                        w-[500px]
                        h-[640px]

                        rounded-[38px]

                        bg-white/70

                        border border-white/60

                        rotate-[-8deg]
                        translate-x-[-80px]

                        shadow-[0_40px_100px_rgba(0,0,0,0.08)]

                        backdrop-blur-xl
                      "
                    />

                    {/* MIDDLE PAGE */}
                    <div
                      className="
                        absolute

                        top-[65px]

                        w-[520px]
                        h-[670px]

                        rounded-[38px]

                        bg-white/85

                        border border-white

                        rotate-[6deg]
                        translate-x-[70px]

                        shadow-[0_40px_100px_rgba(0,0,0,0.12)]

                        backdrop-blur-xl
                      "
                    />

                    {/* MAIN PAGE */}
                    <div
                      className="
                        relative

                        w-[560px]
                        h-[720px]

                        rounded-[42px]

                        bg-white

                        border border-white/70

                        overflow-hidden

                        shadow-[0_60px_140px_rgba(0,0,0,0.18)]
                      "
                    >

                      {/* TOP */}
                      <div
                        className="
                          px-10
                          pt-10
                        "
                      >

                        <div
                          className="
                            inline-flex

                            px-4
                            py-2
                            rounded-full

                            bg-[#dcfff6]

                            text-[#0d7a72]
                            text-[13px]
                            font-semibold
                          "
                        >
                          {previewPages.find(p => p.id === activePage)?.title}
                        </div>

                        {activePage === 1 && (

  <div
    className="
      mt-8
      mx-10

      rounded-[28px]

      bg-gradient-to-br
      from-[#dcfff6]
      to-[#f2fffb]

      p-7
    "
  >

    <div
      className="
        text-[#0b5d57]
        font-semibold
        text-[20px]
      "
    >
      Вправа 4–4–4
    </div>

    <div
      className="
        mt-5

        flex
        flex-col
        gap-4
      "
    >

      {[
        "4 секунди — вдих",
        "4 секунди — затримка",
        "4 секунди — видих",
      ].map((item) => (

        <div
          key={item}
          className="
            flex
            items-center
            gap-3

            text-[#255a55]
            text-[15px]
          "
        >

          <div
            className="
              w-2.5
              h-2.5

              rounded-full

              bg-[#14b8a6]
            "
          />

          {item}

        </div>

      ))}

    </div>

  </div>

)}

{activePage === 2 && (

  <div
    className="
      mt-10

      flex
      flex-col
      items-center
      justify-center
    "
  >

    <div
      className="
        w-[220px]
        h-[220px]

        rounded-full

        border-[18px]
        border-[#99f6e4]

        flex
        items-center
        justify-center
      "
    >

      <div
        className="
          w-[120px]
          h-[120px]

          rounded-full

          bg-[#14b8a6]/20
        "
      />

    </div>

    <div
      className="
        mt-8

        text-[#355c58]
        text-[18px]
      "
    >
      Повільне дихання 4-4-4
    </div>

  </div>

)}

{activePage === 3 && (

  <div
    className="
      mt-8

      px-10

      flex
      flex-col
      gap-4
    "
  >

    {[
      "Я пив воду сьогодні",
      "Я зробив паузу",
      "Я дихав повільно",
      "Я не перевантажував себе",
    ].map((item) => (

      <div
        key={item}
        className="
          flex
          items-center
          gap-4

          rounded-2xl

          border border-[#dff4ef]

          p-5
        "
      >

        <div
          className="
            w-5
            h-5

            rounded-md

            border-2
            border-[#14b8a6]
          "
        />

        <div className="text-[#355c58]">
          {item}
        </div>

      </div>

    ))}

  </div>

)}

                        <h2
                          className="
                            mt-6

                            text-[34px]
                            leading-[1.05]

                            font-bold

                            text-[#062b28]
                          "
                        >
                          {previewPages.find(p => p.id === activePage)?.subtitle}
                        </h2>

                        <p
                          className="
                            mt-5

                            text-[16px]
                            leading-relaxed

                            text-[#4d6764]
                          "
                        >
                          Коротка вправа для зменшення
                          тривоги та повернення
                          концентрації у стресовий момент.
                        </p>

                      </div>

                    </div>

                  </div>


                </div>

              </div>

              {/* REVIEWS */}
<div
  className="
    mt-10

    rounded-[32px]

    bg-white/10

    border border-white/10

    backdrop-blur-2xl

    p-8
  "
>

  <div
    className="
      flex
      items-center
      justify-between
    "
  >

    <div>

      <div
        className="
          text-[30px]
          font-semibold
          text-white
        "
      >
        Відгуки
      </div>

      <div
        className="
          mt-2

          text-white/60
          text-[15px]
        "
      >
        Що люди говорять після проходження гайду
      </div>

    </div>

    <div
      className="
        flex
        items-center
        gap-2

        text-[#99f6e4]
      "
    >
      ★★★★★
      <span className="text-white/70 text-[14px]">
        4.9/5
      </span>
    </div>

  </div>

  <div
    className="
      mt-8

      grid
      md:grid-cols-2

      gap-5
    "
  >

    {[
      {
        name: "Марія",
        text: "Вперше за довгий час змогла швидко заспокоїтись під час тривоги.",
      },
      {
        name: "Олена",
        text: "Дуже практичний гайд без зайвої теорії. Все чітко і зрозуміло.",
      },
      {
        name: "Ірина",
        text: "Сподобалось, що всі вправи реально можна використовувати в житті.",
      },
      {
        name: "Катерина",
        text: "Дизайн, подача і практики — все дуже спокійне та комфортне.",
      },
    ].map((review) => (

      <div
        key={review.name}
        className="
          rounded-[28px]

          bg-white/10

          border border-white/10

          p-6
        "
      >

        <div
          className="
            flex
            items-center
            justify-between
          "
        >

          <div className="text-[18px] text-white font-semibold">
            {review.name}
          </div>

          <div className="text-[#99f6e4]">
            ★★★★★
          </div>

        </div>

        <div
          className="
            mt-4

            text-white/75

            leading-relaxed
          "
        >
          {review.text}
        </div>

      </div>

    ))}

  </div>

</div>

            </div>

            

            {/* RIGHT */}
            <div className="lg:col-span-4 relative">

              <div
                className="
                  sticky
                  top-[112px]

                  rounded-[36px]

                  bg-white/95

                  backdrop-blur-2xl

                  p-8

                  shadow-[0_20px_100px_rgba(0,0,0,0.18)]
                "
              >

                {/* PRICE */}
                <div className="text-[14px] text-black/50">
                  Вартість
                </div>

                <div
                  className="
                    mt-3

                    text-[48px]
                    lg:text-[54px]
                    tracking-[-0.04em]
                    leading-none

                    font-semibold

                    text-black
                  "
                >
                  {Number(guide.price) === 0
                    ? "0₴"
                    : `${guide.price}₴`}
                </div>

                <div className="mt-3 text-black/50">
                  Миттєвий доступ після оплати
                </div>

                {/* BUTTONS */}
                {Number(guide.price) === 0 ? (

                  <button
                    className="
                      mt-8

                      w-full
                      py-4

                      rounded-2xl

                      bg-gradient-to-r
                      from-[#14b8a6]
                      to-[#2dd4bf]

                      text-[#062b28]
                      font-semibold

                      hover:scale-[1.02]

                      transition-all
                      duration-300
                    "
                  >
                    Отримати безкоштовно
                  </button>

                ) : (

                  <div className="mt-8 flex flex-col gap-3">

                    <button
                      className="
                        w-full
                        py-4

                        rounded-2xl

                        bg-gradient-to-r
                        from-[#14b8a6]
                        to-[#2dd4bf]
                        text-[#062b28]
                        font-semibold

                        hover:scale-[1.02]

                        transition-all
                        duration-300
                      "
                    >
                      Купити зараз
                    </button>

                    <button
                      className="
                        w-full
                        py-4

                        rounded-2xl

                        bg-black/5
                        hover:bg-black/10

                        text-black/75
                        font-medium

                        transition-all
                        duration-200
                      "
                    >
                      Додати в кошик
                    </button>

                  </div>

                )}

                {/* FEATURES */}
                <div className="mt-8 flex flex-col gap-4">

                  {[
                    "PDF формат",
                    "Миттєвий доступ",
                    "Завантаження назавжди",
                    "Мобільна версія",
                    "Друк доступний",
                  ].map((item) => (

                    <div
                      key={item}
                      className="
                        flex
                        items-center
                        gap-3

                        text-[15px]
                        text-black/75
                      "
                    >
                      <div className="text-[#14b8a6]">
                        ✓
                      </div>

                      {item}
                    </div>

                  ))}

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  );
}