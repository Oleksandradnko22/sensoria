import { useState } from "react";

import { emotionalStates } from "../data/states";
import funnelStore from "../store/funnelStore";
import { track } from "../services/analytics";
import { stateAccentColors } from "../data/stateAccentColors";
import type { PrimaryStateId } from "../store/funnelStore";

type Props = {
  onContinue: () => void;
};

export default function StateSelectionPage({
  onContinue,
}: Props) {

  const [selectedStates, setSelectedStates] =
  useState<string[]>([]);

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

  <div className="text-center mb-10">

  <h1
    className="
      text-4xl
text-[52px]
      font-bold
      text-white
      mb-5
    "
  >
    Що турбує вас найбільше зараз?
  </h1>

  <p
    className="
      text-white/80
text-lg
      max-w-xl
      mx-auto
    "
  >
    Оберіть стан, який найбільше описує ваше самопочуття.
  </p>

</div>

{/* GRID */}

<div
  className="
    grid
    md:grid-cols-2
    lg:grid-cols-3
    gap-7
  "
>
  {emotionalStates.map((state) => {
    const selected =
  selectedStates.includes(state.id);
  

    return (
      <button
        key={state.id}
        onClick={() => {
  setSelectedStates((prev) => {

    if (prev.includes(state.id)) {
      return prev.filter(
        (id) => id !== state.id
      );
    }

    if (prev.length >= 2) {
      return prev;
    }

    return [...prev, state.id];
  });
}}


  
        className={`
relative

min-h-[180px]

rounded-[32px]

p-6

flex
flex-col
justify-between

text-left

bg-white/[0.08]

backdrop-blur-3xl

transition-all
duration-300

  ${
  selected
    ? `
      bg-white/15
      border-2 border-white/70
    `
    : `
     border border-transparent

      hover:bg-white/8
      hover:border-white/20

      hover:scale-[1.03]
      hover:shadow-[0_20px_80px_rgba(0,0,0,0.25)]
      hover:-translate-y-2
    `
}
        `}
      >

        <div
  className={`
    absolute
    top-5
    right-5

    w-7
h-7

    rounded-full

    flex
    items-center
    justify-center

    transition-all

    ${
      selected
        ? "bg-white text-black shadow-lg"
        : "border border-white/40"
    }
  `}
>
  {selected ? "✓" : ""}
</div>



        <div
  className="
    absolute
    inset-0

    rounded-[32px]

    bg-gradient-to-b
    from-white/10
    to-transparent

    pointer-events-none
  "
/>

       <div
  className={`
    absolute

    left-6
    top-1/2

    -translate-y-1/2

    h-[85px]
    w-[5px]

    rounded-full

    ${stateAccentColors[state.id as PrimaryStateId].dot}
  `}
 />
<div
  className="
    pl-7

    h-full

    flex
    flex-col
    justify-center
  "
>

<h2
          className="
text-[22px]
font-bold
leading-tight
text-white
mb-4
"
        >
          {state.title}
        </h2>

        <p
          className="
text-white/80
text-[15px]
leading-relaxed
max-w-[280px]
"
        >
          {state.description}
        </p>

        </div>
        
      </button>
    );
  })}
</div>

<div className="flex justify-center mt-12">

  <button
    disabled={selectedStates.length === 0}
    onClick={() => {

  const state = emotionalStates.find(
    (item) => item.id === selectedStates[0]
  );

   if (!state) return;

  funnelStore.setSelectedState({
    id: state.id,
    title: state.title,
    description: state.description,
  });

  // Selecting a second state was already possible here (the toggle
  // above caps at 2) but the second pick used to go nowhere — only
  // selectedStates[0] ever reached the store. It's now carried through
  // as `secondaryState`, cleared to null when only one state is picked
  // so a stale value can't survive into a later run.
  const secondaryStateData = selectedStates[1]
    ? emotionalStates.find(
        (item) => item.id === selectedStates[1]
      ) ?? null
    : null;

  funnelStore.setSecondaryState(
    secondaryStateData
      ? {
          id: secondaryStateData.id,
          title: secondaryStateData.title,
          description: secondaryStateData.description,
        }
      : null
  );

  track("state_selected", state.id);

  onContinue();

}}
    className={`
      px-12
      py-4
      rounded-2xl
      font-semibold
      text-lg
      transition-all

      ${
        selectedStates.length > 0
          ? "bg-white text-black hover:scale-[1.03]"
          : "bg-white/10 text-white/40 cursor-not-allowed"
      }
    `}
  >
    Продовжити →
  </button>

</div>
</div>
</div>
);
}