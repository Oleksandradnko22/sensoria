import { useEffect, useState } from "react";
import type { Program } from "../App";

type Props = {
    program: Program;
    onClose: () => void;
};

export default function ProgramPreviewModal({
    program,
    onClose,
}: Props) {

const [openedLesson, setOpenedLesson] = useState<number | null>(null);

useEffect(() => {
    document.body.style.overflow = "hidden";

    return () => {
        document.body.style.overflow = "auto";
    };
}, []);

    return (
        <div 
        onClick={onClose}
        className="
          fixed inset-0 z-[9999]

            bg-black/60 
            backdrop-blur-sm

            flex items-center justify-center
            p-4
            ">

            {/* MODAL */}
            <div
            onClick={(e) => e.stopPropagation()}
                className="
          relative
          w-full
          max-w-[1080px]
          max-h-[92vh]
          overflow-y-auto

          rounded-[28px]
          bg-[#f6f8ff]

          shadow-[0_20px_80px_rgba(0,0,0,0.25)]
        "
            >

                {/* CLOSE */}
                <button
                    onClick={onClose}
                    className="
            absolute
            top-5 right-5
            z-20

            w-10 h-10
            rounded-full

            bg-white/80
            hover:bg-white

            text-black/70
            text-lg

            transition
          "
                >
                    ✕
                </button>

                {/* HERO */}
                <div
                    className="
            relative
            overflow-hidden

            rounded-t-[28px]

            bg-gradient-to-r
            from-[#0057ff]
            via-[#245dff]
            to-[#7b2cff]

            px-10
            py-10
          "
                >

                    <div className="grid lg:grid-cols-[1.2fr_420px] gap-8 items-start">

                        {/* LEFT */}
                        <div className="pl-6 lg:pl-8">

                            {/* TAG */}
                            {program.tag && (
                                <div
                                    className="
                    inline-flex
                    px-4 py-1.5
                    rounded-full
                    bg-white/15
                    backdrop-blur-sm

                    text-white
                    text-[13px]
                    font-medium

                    mb-5
                  "
                                >
                                    {program.tag}
                                </div>
                            )}

                            {/* TITLE */}
                            <h1
                                className="
                  text-[34px]
                  leading-[1.15]
                  font-bold
                  text-white

                  max-w-[none]
                "
                            >
                                {program.title}
                            </h1>

                            {/* DESCRIPTION */}
                            <p
                                className="
                  mt-4
                  text-white/80
                  text-[16px]
                  leading-relaxed
                  max-w-[none]
                "
                            >
                                Практична програма для покращення емоційного стану,
                                стабілізації психіки та формування внутрішнього балансу.
                            </p>

                            {/* META */}
                            <div className="flex flex-wrap gap-6 mt-7">

                                <div>
                                    <div className="text-white/50 text-[12px]">
                                        Автор
                                    </div>

                                    <div className="text-white font-medium mt-1">
                                        {program.author}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-white/50 text-[12px]">
                                        Рейтинг
                                    </div>

                                    <div className="text-white font-medium mt-1">
                                        ⭐ 4.9
                                    </div>
                                </div>

                                <div>
                                    <div className="text-white/50 text-[12px]">
                                        Студенти
                                    </div>

                                    <div className="text-white font-medium mt-1">
                                        540+
                                    </div>
                                </div>

                            </div>
                        </div>
                        </div>

                        {/* CONTENT */}
                        <div
                            className="
        grid 
        lg:grid-cols-[1fr_320px] 
        gap-6 
        p-6
        
        text-black/80">

                            {/* LEFT SIDE */}
                            <div className="flex flex-col gap-6">

                                {/* BENEFITS */}
                                <div className="grid md:grid-cols-2 gap-4">

                                    {[
                                        "🧠 Краще розуміння себе",
                                        "⚡ Менше внутрішньої напруги",
                                        "🌙 Стабільніший емоційний стан",
                                        "💬 Практичні техніки щодня",
                                    ].map((item) => (
                                        <div
                                            key={item}
                                            className="
                    bg-white/80
                    backdrop-blur-sm

                    rounded-[22px]

                    p-5

                    border border-white

                    text-[15px]
                    font-medium
                    text-black/80
                  "
                                        >
                                            {item}
                                        </div>
                                    ))}

                                </div>

                                {/* AUTHOR VIDEO */}
                                <div
                                    className="
    bg-white
    rounded-[28px]
    p-6

    border border-[#eef2ff]

    shadow-[0_10px_40px_rgba(0,0,0,0.04)]
  "
                                >

                                    <div className="flex items-center justify-between mb-5">

                                        <div>
                                            <h3 className="text-[24px] font-semibold text-black">
                                                Знайомство з автором
                                            </h3>

                                            <p className="text-[14px] text-black/50 mt-1">
                                                Коротке відео про автора та програму
                                            </p>
                                        </div>

                                        <div
                                            className="
        px-3 py-1.5
        rounded-full
        bg-[#f3f6ff]

        text-[13px]
        text-[#4f46e5]
        font-medium
      "
                                        >
                                            2 хв
                                        </div>

                                    </div>

                                    <div
                                        className="
      relative
      aspect-video

      rounded-[24px]

      bg-gradient-to-br
      from-[#eef2ff]
      to-[#f8faff]

      overflow-hidden

      flex items-center justify-center
    "
                                    >

                                        <button
                                            className="
        w-20 h-20
        rounded-full

        bg-white

        flex items-center justify-center

        text-[30px]
        text-[#5b3df5]

        shadow-2xl

        hover:scale-105
        transition
      "
                                        >
                                            ▶
                                        </button>

                                    </div>

                                </div>

                                {/* WHO IS THIS FOR */}
                                <div
                                    className="
                bg-white/80
                backdrop-blur-sm

                rounded-[24px]
                p-6
              "
                                >

                                    <h3 className="text-[22px] font-semibold mb-5">
                                        Для кого ця програма
                                    </h3>

                                    <div className="flex flex-wrap gap-3">

                                        {[
                                            "Стрес",
                                            "Тривожність",
                                            "Емоційне вигорання",
                                            "Самооцінка",
                                            "Ментальний баланс",
                                            "Початківці",
                                        ].map((item) => (
                                            <div
                                                key={item}
                                                className="
                      px-4 py-2
                      rounded-full

                      bg-[#eef2ff]

                      text-[14px]
                      text-[#4338ca]
                      font-medium
                    "
                                            >
                                                {item}
                                            </div>
                                        ))}

                                    </div>

                                </div>

                                {/* PROGRAM */}
<div
  className="
    bg-white/80
    backdrop-blur-sm

    rounded-[24px]
    p-6
  "
>

  <h3 className="text-[22px] font-semibold mb-5">
    Програма курсу
  </h3>

  <div className="flex flex-col gap-4">

    {[
      {
        title: "Природа стресу",
        lessons: "4 уроки • 40 хв",
        description:
          "Ви зрозумієте як працює стрес та чому тіло реагує саме так.",
      },

      {
        title: "Техніки стабілізації",
        lessons: "5 уроків • 55 хв",
        description:
          "Практичні вправи для швидкого зниження напруги та тривоги.",
      },

      {
        title: "Робота з емоціями",
        lessons: "6 уроків • 1 год 10 хв",
        description:
          "Навчитесь екологічно проживати емоції та краще розуміти себе.",
      },

    ].map((item, index) => (

      <div
        key={item.title}
        onClick={() =>
          setOpenedLesson(
            openedLesson === index
              ? null
              : index
          )
        }
        className="
          rounded-[20px]
          border border-[#eef2ff]

          p-5

          hover:bg-[#f8faff]
          transition

          cursor-pointer
        "
      >

        <div className="flex items-start justify-between">

          <div className="flex gap-4">

            <div
              className="
                w-8 h-8
                rounded-full

                bg-[#eef2ff]

                flex items-center justify-center

                text-[#4338ca]
                text-[13px]
                font-semibold
              "
            >
              {index + 1}
            </div>

            <div>

              <div className="font-semibold text-[16px]">
                {item.title}
              </div>

              <div className="text-[13px] text-black/50 mt-1">
                {item.lessons}
              </div>

            </div>

          </div>

          <div className="text-black/30 text-xl">
            {openedLesson === index ? "−" : "+"}
          </div>

        </div>

        {openedLesson === index && (
          <div
            className="
              mt-4
              text-[14px]
              leading-relaxed
              text-black/60
              pl-12
              pr-4
            "
          >
            {item.description}
          </div>
        )}

      </div>

    ))}

  </div>

</div>

                                {/* REVIEWS */}
                                <div
                                    className="
                bg-white/80
                backdrop-blur-sm

                rounded-[24px]
                p-6
              "
                                >

                                    <div className="flex items-center justify-between mb-5">

                                        <h3 className="text-[22px] font-semibold">
                                            Відгуки
                                        </h3>

                                        <div className="text-[15px] font-medium">
                                            ⭐ 4.9
                                        </div>

                                    </div>

            
                                    <div className="grid md:grid-cols-2 gap-4">

                                        {[
                                            "Дуже практичний курс та сильний автор.",
                                            "Після програми стало значно легше справлятися зі стресом.",
                                        ].map((review) => (
                                            <div
                                                key={review}
                                                className="
                      rounded-[20px]
                      bg-[#f8faff]

                      p-5
                    "
                                            >

                                                <div className="text-[14px] leading-relaxed text-black/70">
                                                    {review}
                                                </div>

                                                <div className="mt-4 text-[13px] text-black/40">
                                                    ⭐⭐⭐⭐⭐
                                                </div>

                                            </div>
                                        ))}

                                    </div>

                                </div>

                            </div>

                            {/* SIDEBAR */}
                            <div>

                                <div
                                    className="
                sticky top-6

                bg-white/90
                backdrop-blur-sm

                rounded-[26px]

                p-6

                border border-white
              "
                                >

                                    <div className="text-black/40 text-[13px] mb-2">
                                        Вартість
                                    </div>

                                    <div className="text-[36px] font-bold">
                                        {Number(program.price) === 0
                                            ? "Безкоштовно"
                                            : `${program.price}₴`}
                                    </div>

                                    <div className="text-[13px] text-black/40 mt-2">
                                        Безстроковий доступ
                                    </div>

                                    {/* BUTTONS */}
                                    <div className="flex flex-col gap-3 mt-6">

                                        <button
                                            className="
                    w-full
                    py-3.5
                    rounded-[18px]

                    bg-gradient-to-r
                    from-[#0057ff]
                    to-[#7b2cff]

                    text-white
                    font-medium

                    hover:opacity-90
                    transition
                  "
                                        >
                                            Придбати курс
                                        </button>

                                        <button
                                            className="
                    w-full
                    py-3.5
                    rounded-[18px]

                    border border-[#dbe4ff]

                    bg-white

                    text-black/70
                    font-medium

                    hover:bg-[#f8faff]
                    transition
                  "
                                        >
                                            Додати в кошик
                                        </button>

                                    </div>

                                    {/* INCLUDED */}
                                    <div className="mt-7 flex flex-col gap-4">

                                        {[
                                            "18 відеоуроків",
                                            "Практичні завдання",
                                            "PDF матеріали",
                                            "Сертифікат",
                                            "Оновлення програми",
                                        ].map((item) => (
                                            <div
                                                key={item}
                                                className="
                      flex items-center gap-3

                      text-[14px]
                      text-black/70
                    "
                                            >
                                                <div className="text-green-500">
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