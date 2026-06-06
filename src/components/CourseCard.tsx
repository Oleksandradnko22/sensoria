export default function CourseCard({
  program,
  onClick,
}: any) {

  const isRecommended = program.recommended;

  const isFree =
    program.price === "0";

  const isNew = (() => {
    if (!program.createdAt) return false;

    const created = new Date(program.createdAt);
    const now = new Date();

    const diff =
      now.getTime() - created.getTime();

    const days =
      diff / (1000 * 60 * 60 * 24);

    return days <= 30;
  })();

  return (
    <div
      onClick={onClick}
      className="
        group
        relative
        w-full
        rounded-2xl
        overflow-hidden

        bg-white
        text-black

        shadow-xl
        hover:scale-[1.02]
        transition
        duration-300

        cursor-pointer
      "
    >

      {/* TOP */}
      <div
        className="
          relative
          h-[140px]

          bg-gradient-to-br
          from-[#dbeafe]
          to-[#ede9fe]
        "
      >

        {/* TAGS */}
        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">

          {isRecommended && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-blue-500
                backdrop-blur-sm
                text-white
                text-[11px]
                font-medium
              "
            >
              Рекомендовано
            </div>
          )}

          {isNew && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-purple-500
                backdrop-blur-sm
                text-white
                text-[11px]
                font-medium
              "
            >
              Новий
            </div>
          )}

          {isFree && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-emerald-500
                backdrop-blur-sm
                text-white
                text-[11px]
                font-medium
              "
            >
              Безкоштовно
            </div>
          )}

        </div>
      </div>

      {/* CONTENT */}
      <div className="p-5 flex flex-col gap-3">

        <h3
          className="
            text-[16px]
            font-semibold
            leading-snug
          "
        >
          {program.title}
        </h3>

        <p
          className="
            text-[12px]
            text-gray-500
          "
        >
          {program.author}
        </p>

        <p
          className="
            text-[13px]
            text-gray-600
            leading-relaxed
          "
        >
          Короткий курс, який допоможе
          стабілізувати стан, краще
          зрозуміти себе та повернути
          внутрішній баланс.
        </p>

        <div
          className="
            flex justify-between
            text-[12px]
            text-gray-400
          "
        >
          <span>
            {program.meta.split("•")[0]}
          </span>

          <span>
            {program.meta.split("•")[1]}
          </span>
        </div>

        <div
          className="
            text-[15px]
            font-semibold
            mt-1
          "
        >
          {isFree
            ? "Безкоштовно"
            : `${program.price} грн`}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="
            mt-2
            w-full
            py-2.5
            rounded-xl

            bg-gradient-to-r
            from-blue-500
            to-purple-500

            text-white
            text-[13px]
            font-medium

            hover:opacity-90
            transition
          "
        >
          Детальніше →
        </button>

      </div>

    </div>
  );
}