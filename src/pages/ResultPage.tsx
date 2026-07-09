import { motion } from "framer-motion";

import funnelStore from "../store/funnelStore";
import { stateProfiles } from "../data/stateProfiles";

type Props = {
  onContinue: () => void;
};

export default function ResultPage({
  onContinue,
}: Props) {

  const insight = funnelStore.insight;

  if (!insight) return null;

  const profile =
    stateProfiles[
      insight.primaryCategory as keyof typeof stateProfiles
    ][insight.intensity];

  const progress =
    insight.intensity === "low"
      ? 25
      : insight.intensity === "moderate"
      ? 50
      : insight.intensity === "high"
      ? 75
      : 100;
return (

    <div
      className="
        min-h-screen

        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]

        px-6
        py-20
      "
    >

      <div
        className="
          w-full
          max-w-[920px]
          mx-auto
        "
      >

        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={{
    duration: 0.6,
  }}
  className="
    text-center
    mb-20
  "
>

  <p
    className="
      uppercase

      tracking-[0.35em]

      text-white/50

      text-sm

      mb-5
    "
  >
    Ваш персональний результат
  </p>

  <h1
    className="
      text-white

      text-[56px]

      leading-[1.1]

      font-bold

      mb-8
    "
  >
    {profile.title}
  </h1>

  <div
    className="
      inline-flex

      items-center

      gap-3

      rounded-full

      bg-white/10

      backdrop-blur-xl

      border border-white/10

      px-6
      py-3
    "
  >

    <div
      className="
        w-2.5
        h-2.5

        rounded-full

        bg-cyan-400
      "
    />

    <span
      className="
        text-white/80

        text-sm
      "
    >
      Ваш результат сформовано на основі ваших відповідей
    </span>

  </div>

</motion.section>

        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={{
    delay: 0.15,
    duration: 0.6,
  }}
  className="
    rounded-[36px]

    bg-white/10

    backdrop-blur-2xl

    border border-white/10

    p-8

    mb-16
  "
>

  <h2
    className="
      text-white

      text-3xl

      font-bold

      mb-8
    "
  >
    Аналіз результату
  </h2>

  <div className="flex justify-between mb-4">

    <span className="text-white/60">
      Поточний стан
    </span>

    <span className="text-white font-semibold">
      {profile.title}
    </span>

  </div>

  <div
    className="
      h-3

      rounded-full

      bg-white/10

      overflow-hidden
    "
  >

    <motion.div
      initial={{
        width: 0,
      }}
      animate={{
        width: `${progress}%`,
      }}
      transition={{
        delay: 0.4,
        duration: 1,
      }}
      className="
        h-full

        rounded-full

        bg-gradient-to-r
        from-cyan-400
        via-blue-400
        to-purple-400
      "
    />

  </div>

  <div
    className="
      flex
      justify-between

      mt-3

      text-sm

      text-white/40
    "
  >

    <span>Легкий</span>
    <span>Помірний</span>
    <span>Високий</span>
    <span>Критичний</span>

  </div>

  <div
    className="
      h-px

      bg-white/10

      my-8
    "
  />

  <div
    className="
      flex

      items-center

      justify-between

      gap-6

      flex-wrap
    "
  >

    <div>

      <div className="text-white/45 text-sm mb-1">
        Рівень навантаження
      </div>

      <div className="text-white text-lg font-semibold">
        {profile.title}
      </div>

    </div>

    <div>

      <div className="text-white/45 text-sm mb-1">
        Потенціал відновлення
      </div>

      <div className="text-cyan-300 font-semibold">
        Високий
      </div>

    </div>

    <div>

      <div className="text-white/45 text-sm mb-1">
        Наступний крок
      </div>

      <div className="text-white font-semibold">
        Персональний план
      </div>

    </div>

  </div>

</motion.section>

        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={{
    delay: 0.3,
    duration: 0.6,
  }}
  className="mb-16"
>

  <h2
    className="
      text-white
      text-3xl
      font-bold
      mb-8
    "
  >
    Ваші відповіді показують
  </h2>

  <div className="space-y-5">

    {/* Card 1 */}

    <div
      className="
        rounded-[30px]

        bg-white/8

        border border-white/10

        backdrop-blur-xl

        px-8
        py-7

        flex
        gap-6
        items-start

        transition-all
        duration-300

        hover:bg-white/10
      "
    >

      <div
        className="
          w-14
          h-14

          rounded-2xl

          bg-cyan-400/10

          flex
          items-center
          justify-center

          text-2xl

          shrink-0
        "
      >
        🧠
      </div>

      <div>

        <h3
          className="
            text-white
            text-xl
            font-semibold
            mb-2
          "
        >
          Що відбувається
        </h3>

        <p
          className="
            text-white/70
            leading-8
          "
        >
          {profile.whatHappens}
        </p>

      </div>

    </div>

    {/* Card 2 */}

    <div
      className="
        rounded-[30px]

        bg-white/8

        border border-white/10

        backdrop-blur-xl

        px-8
        py-7

        flex
        gap-6
        items-start

        transition-all
        duration-300

        hover:bg-white/10
      "
    >

      <div
        className="
          w-14
          h-14

          rounded-2xl

          bg-blue-400/10

          flex
          items-center
          justify-center

          text-2xl

          shrink-0
        "
      >
        💙
      </div>

      <div>

        <h3
          className="
            text-white
            text-xl
            font-semibold
            mb-2
          "
        >
          Чому це нормально
        </h3>

        <p
          className="
            text-white/70
            leading-8
          "
        >
          {profile.normalization}
        </p>

      </div>

    </div>

    {/* Card 3 */}

    <div
      className="
        rounded-[30px]

        bg-white/8

        border border-white/10

        backdrop-blur-xl

        px-8
        py-7

        flex
        gap-6
        items-start

        transition-all
        duration-300

        hover:bg-white/10
      "
    >

      <div
        className="
          w-14
          h-14

          rounded-2xl

          bg-emerald-400/10

          flex
          items-center
          justify-center

          text-2xl

          shrink-0
        "
      >
        🌱
      </div>

      <div>

        <h3
          className="
            text-white
            text-xl
            font-semibold
            mb-2
          "
        >
          Ваш потенціал
        </h3>

        <p
          className="
            text-white/70
            leading-8
          "
        >
          Попри поточні труднощі, у вас є хороший потенціал для поступового покращення стану. Найкращий час почати зміни — саме зараз.
        </p>

      </div>

    </div>

  </div>

</motion.section>

        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={{
    delay: 0.4,
    duration: 0.6,
  }}
  className="mb-16"
>

  <div
    className="
      rounded-[36px]

      bg-gradient-to-br
      from-cyan-400/10
      to-purple-400/10

      border border-white/10

      backdrop-blur-2xl

      p-10
    "
  >

    <div
      className="
        flex
        items-center
        gap-4

        mb-6
      "
    >

      <div
        className="
          w-14
          h-14

          rounded-2xl

          bg-cyan-400/15

          flex
          items-center
          justify-center

          text-3xl

          shrink-0
        "
      >
        💡
      </div>

      <div>

        <div
          className="
            text-white/50

            uppercase

            tracking-[0.25em]

            text-xs

            mb-1
          "
        >
          Ваш головний інсайт
        </div>

        <h2
          className="
            text-white

            text-3xl

            font-bold
          "
        >
          Ваш стан можна покращити
        </h2>

      </div>

    </div>

    <p
      className="
        text-white/80

        text-lg

        leading-8

        mb-6
      "
    >
      Ваші відповіді показують, що зараз найбільше емоційне навантаження пов'язане саме з цією сферою. Це не означає, що ситуація є незмінною — швидше за все, внутрішній ресурс тривалий час витрачався швидше, ніж встигав відновлюватися.
    </p>

    <div
      className="
        rounded-2xl

        bg-white/5

        border border-white/10

        px-5
        py-4
      "
    >

      <p
        className="
          text-white/70

          leading-7
        "
      >
        Саме тому ми рекомендуємо почати з персонального плану, який створений спеціально для вашого поточного стану.
      </p>

    </div>

  </div>

</motion.section>

        <motion.section
  initial={{
    opacity: 0,
    y: 30,
  }}
  animate={{
    opacity: 1,
    y: 0,
  }}
  transition={{
    delay: 0.45,
    duration: 0.6,
  }}
  className="
    rounded-[36px]

    bg-white/10

    backdrop-blur-2xl

    border border-white/10

    p-10

    text-center
  "
>

  <div
    className="
      w-20
      h-20

      mx-auto
      mb-6

      rounded-full

      bg-gradient-to-br
      from-cyan-400/20
      to-purple-400/20

      flex
      items-center
      justify-center

      text-4xl
    "
  >
    ✨
  </div>

  <h2
    className="
      text-white

      text-3xl

      font-bold

      mb-4
    "
  >
    Ваш персональний план готовий
  </h2>

  <p
    className="
      max-w-xl

      mx-auto

      text-white/70

      text-lg

      leading-8

      mb-10
    "
  >
    Ви вже зробили найважливіший крок — зрозуміли свій поточний стан. Тепер перейдемо до персонального плану, який допоможе поступово покращити самопочуття.
  </p>

  <button
    onClick={onContinue}
    className="
      max-w-[420px]

      w-full

      mx-auto

      h-14

      rounded-full

      bg-white

      text-black

      font-semibold

      text-lg

      shadow-xl
      shadow-black/20

      transition-all
      duration-300

      hover:-translate-y-1
      hover:shadow-2xl

      active:translate-y-0
    "
  >
    Створити персональний план
  </button>

</motion.section>

      </div>

    </div>

  );
}