import { useState } from "react";

import { emotionalStates } from "../data/states";
import funnelStore from "../store/funnelStore";

type Props = {
  onContinue: () => void;
};

export default function StateSelectionPage({
  onContinue,
}: Props) {
  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const handleContinue = () => {
    const selectedState =
      emotionalStates.find(
        (state) => state.id === selectedId
      );

    if (!selectedState) return;

    funnelStore.setSelectedState({
      id: selectedState.id,
      title: selectedState.title,
      description: selectedState.description,
    });

    onContinue();
  };

  return (
    <div
      className="
        min-h-screen
        px-6
        py-20

        flex
        items-center
        justify-center
      "
    >
      <div className="max-w-5xl w-full">

        {/* HEADER */}

        <div className="text-center mb-12">

          <h1
            className="
              text-4xl
              md:text-5xl
              font-bold
              text-white
              mb-5
            "
          >
            Що турбує вас найбільше зараз?
          </h1>

          <p
            className="
              text-white/70
              text-lg
              max-w-2xl
              mx-auto
              leading-relaxed
            "
          >
            Оберіть стан, який найбільш точно
            описує ваше самопочуття зараз.
          </p>

          <p
            className="
              mt-4
              text-white/50
              text-sm
            "
          >
            Якщо підходить кілька варіантів,
            оберіть той, який турбує вас
            найбільше саме зараз.
          </p>

        </div>

        {/* GRID */}

        <div
          className="
            grid
            md:grid-cols-2
            lg:grid-cols-3
            gap-6
          "
        >

          {emotionalStates.map((state) => {
            const selected =
              selectedId === state.id;

            return (
              <button
                key={state.id}
                onClick={() =>
                  setSelectedId(state.id)
                }
                className={`
                  text-left

                  rounded-3xl
                  p-6

                  backdrop-blur-2xl

                  transition-all
                  duration-200

                  border

                  ${
                    selected
                      ? `
                        bg-white/20
                        border-white/50
                        scale-[1.02]
                      `
                      : `
                        bg-white/10
                        border-white/10
                        hover:bg-white/15
                      `
                  }
                `}
              >
                <div className="text-4xl mb-4">
                  {state.icon}
                </div>

                <h2
                  className="
                    text-xl
                    font-semibold
                    text-white
                    mb-3
                  "
                >
                  {state.title}
                </h2>

                <p
                  className="
                    text-white/70
                    leading-relaxed
                    text-sm
                  "
                >
                  {state.description}
                </p>

              </button>
            );
          })}

        </div>

        {/* CTA */}

        {selectedId && (
          <div className="mt-12 text-center">

            <button
              onClick={handleContinue}
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
              Продовжити →
            </button>

          </div>
        )}
        </div>
    </div>
  );
}