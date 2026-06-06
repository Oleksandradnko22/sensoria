type Props = {
  stateTitle: string;
  reason: string;
  programTitle: string;
  programAuthor: string;
  onStartProgram: () => void;
};

export default function RecommendationPage({
  stateTitle,
  reason,
  programTitle,
  programAuthor,
  onStartProgram,
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

          <div className="text-white/60 mb-3">
            Персональна рекомендація
          </div>

          <h1 className="text-5xl font-bold mb-5">
            Ми підібрали програму саме для вас
          </h1>

          <p className="text-white/75 text-lg max-w-2xl mx-auto">
            На основі вашого поточного стану
            та результатів оцінки.
          </p>

        </div>

        {/* STATE */}

        <div
          className="
            rounded-3xl
            bg-white/10
            backdrop-blur-2xl
            border border-white/20
            p-8
            mb-6
          "
        >
          <div className="text-white/60 mb-2">
            Ваш поточний стан
          </div>

          <div className="text-3xl font-bold">
            {stateTitle}
          </div>
        </div>

        {/* WHY */}

        <div
          className="
            rounded-3xl
            bg-white/10
            backdrop-blur-2xl
            border border-white/20
            p-8
            mb-6
          "
        >
          <h2 className="text-2xl font-semibold mb-4">
            Чому це важливо зараз
          </h2>

          <p className="text-white/75 leading-relaxed">
            {reason}
          </p>
        </div>

        {/* PROGRAM */}

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
            Рекомендована програма
          </div>

          <h2 className="text-4xl font-bold mb-4">
            {programTitle}
          </h2>

          <div className="text-white/90 mb-8">
            Автор: {programAuthor}
          </div>

          <div className="space-y-4">

            <div className="rounded-xl bg-white/10 p-4">
              Допоможе знизити внутрішнє
              напруження та відновити ресурс.
            </div>

            <div className="rounded-xl bg-white/10 p-4">
              Побудована навколо вашого
              актуального запиту.
            </div>

            <div className="rounded-xl bg-white/10 p-4">
              Дає практичні інструменти для
              щоденного використання.
            </div>

          </div>

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

      </div>
    </div>
  );
}