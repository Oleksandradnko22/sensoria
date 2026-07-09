type ProgramCard = {
  id: string;
  title: string;
  author: string;
};

type Props = {
  stateTitle: string;
  reason: string;

  programTitle: string;
  programAuthor: string;

  relatedPrograms: ProgramCard[];

  onStartProgram: () => void;

  onSelectProgram: (
    id: string
  ) => void;

  onViewAllPrograms: () => void;
};

export default function RecommendationPage({
  stateTitle,
  reason,
  programTitle,
  programAuthor,

  relatedPrograms,

  onStartProgram,
  onSelectProgram,
  onViewAllPrograms,
}: Props) {

  return (
    <div
      className="
        min-h-screen
        px-6
        py-20
        text-white
      "
    >
      <div className="max-w-4xl mx-auto">

        {/* HEADER */}

        <div className="text-center mb-12">

          <div
  className="
    rounded-[32px]

    bg-gradient-to-r
    from-emerald-500
    to-teal-500

    p-10

    mb-8
  "
>

  <div className="text-sm uppercase opacity-80 mb-3">
    Рекомендований маршрут
  </div>

  <h2 className="text-4xl font-bold mb-4">
    {programTitle}
  </h2>

  <div
    className="
      inline-flex
      items-center
      gap-2

      px-4
      py-2

      rounded-full

      bg-white/10

      mb-8
    "
  >
    ⏱ 14 днів
  </div>

  <div className="space-y-4">

    <div className="rounded-xl bg-white/10 p-4">
      ✓ Допоможе знизити внутрішнє напруження
    </div>

    <div className="rounded-xl bg-white/10 p-4">
      ✓ Сформує нові звички відновлення
    </div>

    <div className="rounded-xl bg-white/10 p-4">
      ✓ Дає практичні інструменти на кожен день
    </div>

  </div>

</div>

          <div className="text-white/60 mb-3">
  Персональний план
</div>

<h1 className="text-5xl font-bold mb-5">
  Ваш персональний план готовий
</h1>

<p className="text-white/75 text-lg max-w-2xl mx-auto">
  На основі ваших відповідей ми сформували перший маршрут відновлення.
</p>

        </div>

        {/* CTA */}

        <div className="text-center">

          <button
            onClick={onStartProgram}
            className="
              px-10
              py-4

              rounded-2xl

              bg-white
              text-black

              font-semibold
              text-lg

              hover:scale-[1.03]
              transition
            "
          >
            Почати програму →
          </button>

        </div>

        <div className="mt-6">

           {/* OTHER PROGRAMS */}

<div
  className="
    rounded-3xl
    bg-white/10
    backdrop-blur-2xl
    border border-white/20
    p-8
    mb-8
  "
>
  <h2
    className="
      text-2xl
      font-semibold
      mb-6
    "
  >
    Інші програми для вас
  </h2>

  <div className="space-y-4">

    {relatedPrograms.map(
      (program) => (
        <button
          key={program.id}

          onClick={() =>
            onSelectProgram(
              program.id
            )
          }

          className="
            w-full

            text-left

            p-5

            rounded-2xl

            bg-white/5

            border
            border-white/10

            hover:bg-white/10

            transition
          "
        >
          <div
            className="
              text-lg
              font-semibold
              mb-1
            "
          >
            {program.title}
          </div>

          <div
            className="
              text-white/60
            "
          >
            {program.author}
          </div>
        </button>
      )
    )}

  </div>

</div>

  <button
    onClick={onViewAllPrograms}
    className="
      text-white/70

      hover:text-white

      transition
    "
  >
    Переглянути всі програми →
  </button>

</div>

      </div>
    </div>
  );
}