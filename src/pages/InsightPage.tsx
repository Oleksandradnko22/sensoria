import { profiles } from "../components/test/profiles";

type Props = {
  primaryCategory: string;
  onContinue: () => void;
};

export default function InsightPage({
  primaryCategory,
  onContinue,
}: Props) {
  const profile =
    profiles[
      primaryCategory as keyof typeof profiles
    ];

  if (!profile) {
    return null;
  }

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

        {/* RESULT */}

        <div
          className="
            rounded-[32px]
            bg-white/10
            backdrop-blur-2xl
            border border-white/20
            p-10
            mb-8
          "
        >
          <div className="text-6xl mb-6">
            {profile.emoji}
          </div>

          <div className="text-white/60 mb-3">
            Ваш поточний стан
          </div>

          <h1 className="text-4xl font-bold mb-6">
            {profile.title}
          </h1>

          <p className="text-white/80 text-lg leading-relaxed">
            {profile.description}
          </p>
        </div>

        {/* WHAT HAPPENS */}

        <div
          className="
            rounded-3xl
            bg-white/10
            border border-white/20
            p-8
            mb-6
          "
        >
          <h2 className="text-2xl font-semibold mb-4">
            Що може відбуватися зараз
          </h2>

          <p className="text-white/75 leading-relaxed">
            Подібний стан часто формується
            поступово через накопичення
            навантаження, постійний стрес,
            внутрішній тиск або тривале
            ігнорування власних потреб.
          </p>
        </div>

        {/* NORMALIZATION */}

        <div
          className="
            rounded-3xl
            bg-white/10
            border border-white/20
            p-8
            mb-6
          "
        >
          <h2 className="text-2xl font-semibold mb-4">
            Це нормально
          </h2>

          <p className="text-white/75 leading-relaxed">
            Багато людей стикаються з
            подібними переживаннями в різні
            періоди життя. Це не визначає
            вас як людину і не говорить про
            вашу цінність чи можливості.
          </p>
        </div>

        {/* DIRECTION */}

        <div
          className="
            rounded-3xl
            bg-white/10
            border border-white/20
            p-8
            mb-10
          "
        >
          <h2 className="text-2xl font-semibold mb-4">
            На чому варто сфокусуватись
          </h2>

          <div className="flex flex-col gap-3">

            {profile.recommendations.map(
              (item, index) => (
                <div
                  key={index}
                  className="
                    p-4
                    rounded-xl
                    bg-white/5
                    border border-white/10
                  "
                >
                  {item}
                </div>
              )
            )}

          </div>

        </div>

        {/* CTA */}

        <div className="text-center">

          <button
            onClick={onContinue}
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
            Отримати персональний план →
          </button>

        </div>

      </div>
    </div>
  );
}