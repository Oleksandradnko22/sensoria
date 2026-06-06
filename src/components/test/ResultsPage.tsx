import { getArchetype } from "./testUtils";
import { profiles } from "./profiles";
import { getPercentages } from "./testUtils";
import { motion } from "framer-motion";
import type { Archetype } from "./archetypes";
import { programs } from "../../data/programs";
import { meditations } from "../../data/meditations";
import { guides } from "../../data/guides";

import { getRecommendations }
from "./recommendationEngine";
import { getPrimaryCategory, getSecondaryCategories } from "./resultAnalysis";

type Props = {
  topCategories: string[];

  results: Record<string, number>;

  onHome: () => void;
};

export default function ResultsPage({
  topCategories,
  results,
  onHome,
}: Props) {
  const archetype: Archetype = getArchetype(results);

  const percentages =
  getPercentages(results);

const primaryCategory =
  getPrimaryCategory(results);

const SecondaryCategories =
  getSecondaryCategories(results);

const recommendedPrograms =
  getRecommendations(
    topCategories,
    programs
  ).slice(0, 3);

const recommendedMeditations =
  getRecommendations(
    topCategories,
    meditations
  ).slice(0, 3);

const recommendedGuides =
  getRecommendations(
    topCategories,
    guides
  ).slice(0, 3);

  <div
  className="
    mb-14
    rounded-3xl
    p-8

    bg-white/10
    border border-white/20
  "
>

  <div className="text-white/60 mb-2">
    Основний фокус
  </div>

  <div className="text-3xl font-bold mb-4">
    {
      profiles[
        primaryCategory as keyof typeof profiles
      ]?.title
    }
  </div>

  <p className="text-white/70">
    Саме цей напрямок зараз має
    найбільший вплив на ваш стан.
  </p>

</div>

  return (
    <motion.div
  initial={{
    opacity: 0,
  }}

  animate={{
    opacity: 1,
  }}

  transition={{
    duration: 0.6,
  }}

  className="min-h-screen px-6 py-20 text-white"
>
      <div className="max-w-5xl mx-auto">

        {/* HEADER */}
        <div className="text-center mb-16">

          <h1 className="text-5xl font-bold mb-6">
            Ваш поточний стан та рекомендації
          </h1>

          <p className="text-white/70 text-lg max-w-2xl mx-auto leading-relaxed">
            На основі ваших відповідей ми визначили ключові напрямки,
            які зараз найбільше впливають на ваш емоційний стан.
          </p>

        </div>

        {/* ARCHETYPE */}
<div
  className="
    mb-14
    rounded-[32px]
    p-10

    bg-gradient-to-br
    from-white/15
    to-white/5

    backdrop-blur-2xl

    border border-white/20

    text-center
  "
>

  <div className="text-6xl mb-6">
    {archetype.emoji}
  </div>

  <div className="text-white/60 mb-3">
    Ваш емоційний архетип
  </div>

  <h2 className="text-4xl font-bold mb-6">
    {archetype.title}
  </h2>

  <p className="text-white/75 leading-relaxed max-w-2xl mx-auto mb-8">
    {archetype.description}
  </p>

  <div className="flex flex-wrap justify-center gap-3">

    {archetype.traits.map((trait, i) => (
      <div
        key={i}
        className="
          px-4 py-2
          rounded-full

          bg-white/10
          border border-white/10

          text-sm
        "
      >
        {trait}
      </div>
    ))}

  </div>

  {/* INSIGHTS */}

<div className="grid md:grid-cols-2 gap-6 mb-14">

  {/* STRENGTHS */}
  <div
    className="
      rounded-3xl
      bg-white/10
      backdrop-blur-2xl
      border border-white/20
      p-8
    "
  >
    <h3 className="text-2xl font-semibold mb-6">
      💚 Ваші сильні сторони
    </h3>

    <div className="flex flex-col gap-4">

      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        Усвідомленість свого стану
      </div>

      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        Бажання розвиватися та покращувати якість життя
      </div>

      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        Готовність працювати над собою
      </div>

    </div>
  </div>

  {/* ATTENTION */}
  <div
    className="
      rounded-3xl
      bg-white/10
      backdrop-blur-2xl
      border border-white/20
      p-8
    "
  >
    <h3 className="text-2xl font-semibold mb-6">
      🎯 На що варто звернути увагу
    </h3>

    <div className="flex flex-col gap-4">

      {topCategories.map((category, index) => {

        const profile =
          profiles[
            category as keyof typeof profiles
          ];

        return (
          <div
            key={index}
            className="
              p-4
              rounded-xl
              bg-white/5
              border border-white/10
            "
          >
            {profile.title}
          </div>
        );
      })}

    </div>

  </div>

</div>

</div>

        {/* CARDS */}
        <div className="grid md:grid-cols-3 gap-6">

          {topCategories.map((category: string, i: number) => {
            const profile =
              profiles[category as keyof typeof profiles];

            return (
             <motion.div
  initial={{
    opacity: 0,
    y: 30,
  }}

  animate={{
    opacity: 1,
    y: 0,
  }}

  transition={{
    delay: i * 0.12,
    duration: 0.45,
  }}
                key={i}
                className="
                  rounded-3xl
                  bg-white/10
                  backdrop-blur-2xl
                  border border-white/20
                  p-8
                "
              >
                <div className="text-4xl mb-5">
                  {profile.emoji}
                </div>

                <h2 className="text-2xl font-semibold mb-4">
                  {profile.title}
                </h2>

                <p className="text-white/70 leading-relaxed mb-6">
                  {profile.description}
                </p>

                <div className="space-y-4 mb-6">

  <div>
    <div className="flex justify-between text-sm mb-2">
      <span>Рівень впливу</span>

      <span>
        {percentages[category]}%
      </span>
    </div>

    <div className="h-2 rounded-full bg-white/10 overflow-hidden">

      <div
        className="
          h-full
          rounded-full

          bg-gradient-to-r
          from-blue-400
          to-purple-400
        "
        style={{
          width: `${percentages[category]}%`,
        }}
      />

    </div>
  </div>

</div>

                <div className="flex flex-col gap-3">

                  {profile.recommendations.map((item, idx) => (
                    <div
                      key={idx}
                      className="
                        px-4 py-3
                        rounded-xl
                        bg-white/5
                        border border-white/10
                        text-sm
                      "
                    >
                      {item}
                    </div>
                  ))}

                </div>
              </motion.div>
            );
          })}

        </div>

        {/* RECOMMENDATION */}

<div
  className="
    mb-14
    rounded-[32px]
    p-10

    bg-gradient-to-r
    from-emerald-500
    to-teal-500

    text-white
  "
>

  <div className="text-sm uppercase tracking-wider opacity-80 mb-3">
    Персональна рекомендація
  </div>

  <h2 className="text-4xl font-bold mb-4">
    Почніть із програми
    "{profiles[topCategories[0] as keyof typeof profiles]?.recommendations?.[0]}"
  </h2>

  <p className="text-white/90 max-w-2xl leading-relaxed mb-8">
    Саме цей напрямок зараз може дати найбільший ефект для покращення вашого емоційного стану.
  </p>

  <button
    className="
      px-8 py-4
      rounded-2xl

      bg-white
      text-black

      font-semibold

      hover:scale-[1.03]
      transition
    "
  >
    Переглянути програму →
  </button>

</div>

{/* PERSONAL PLAN */}

<div className="mt-16 mb-16">

  <h2 className="text-4xl font-bold mb-10 text-center">
    Ваш персональний план підтримки
  </h2>

  <div className="grid lg:grid-cols-3 gap-6">

    {/* PROGRAMS */}

    <div
      className="
        rounded-3xl
        bg-white/10
        backdrop-blur-2xl
        border border-white/20
        p-8
      "
    >

      <h3 className="text-2xl font-semibold mb-6">
        📚 Програми
      </h3>

      <div className="flex flex-col gap-4">

        {recommendedPrograms.map(
          (program, index) => (

            <div
              key={index}
              className="
                p-4
                rounded-xl
                bg-white/5
                border border-white/10
              "
            >
              <div className="font-medium">
                {program.title}
              </div>

              <div className="text-sm text-white/60 mt-1">
                {program.author}
              </div>
            </div>

          )
        )}

      </div>

    </div>

    {/* MEDITATIONS */}

    <div
      className="
        rounded-3xl
        bg-white/10
        backdrop-blur-2xl
        border border-white/20
        p-8
      "
    >

      <h3 className="text-2xl font-semibold mb-6">
        🧘 Медитації
      </h3>

      <div className="flex flex-col gap-4">

        {recommendedMeditations.map(
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
              <div className="font-medium">
                {item.title}
              </div>

              <div className="text-sm text-white/60 mt-1">
                {item.duration}
              </div>
            </div>

          )
        )}

      </div>

    </div>

    {/* GUIDES */}

    <div
      className="
        rounded-3xl
        bg-white/10
        backdrop-blur-2xl
        border border-white/20
        p-8
      "
    >

      <h3 className="text-2xl font-semibold mb-6">
        📖 Гайди
      </h3>

      <div className="flex flex-col gap-4">

        {recommendedGuides.map(
          (guide, index) => (

            <div
              key={index}
              className="
                p-4
                rounded-xl
                bg-white/5
                border border-white/10
              "
            >
              {guide.title}
            </div>

          )
        )}

      </div>

    </div>

  </div>

</div>

        {/* CTA */}
        <div
          className="
            mt-16
            rounded-3xl
            p-10
            bg-gradient-to-r from-blue-500 to-purple-500
            text-center
          "
        >
          <h2 className="text-3xl font-bold mb-4">
            Напрямки, які можуть бути корисними саме зараз
          </h2>

          <p className="text-white/80 mb-8">
            Ми підібрали напрямки, які можуть бути найбільш корисними саме зараз.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">

            <button
              className="
                px-8 py-4
                rounded-2xl
                bg-white text-black
                font-semibold
              "
            >
              Переглянути програми
            </button>

           <button
  onClick={onHome}
  className="
    px-8 py-4
    rounded-2xl
    border border-white/30

    hover:bg-white/10
    transition
  "
>
  Повернутись на головну
</button>

          </div>

        </div>

      </div>

    </motion.div>
  );
}