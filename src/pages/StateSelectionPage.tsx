import { useState } from "react";

import { emotionalStates } from "../data/states";
import funnelStore from "../store/funnelStore";
import { track } from "../services/analytics";
import { stateAccentColors } from "../data/stateAccentColors";
import type { PrimaryStateId } from "../store/funnelStore";
import logo from "../assets/logo.png";

type Props = {
  onContinue: () => void;
  /** The logo: back to the home page (the funnel has no header of its own). */
  onExit?: () => void;
};

const MAX_PICKS = 2;

// The first step of the test: one or two states. Phones get compact rows (all six fit on one screen) and the
// «Продовжити» button stays pinned at the bottom; from 768 px — the grid of larger cards with the button below.
export default function StateSelectionPage({ onContinue, onExit }: Props) {
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const count = selectedStates.length;

  const toggle = (id: string) =>
    setSelectedStates((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, id];
    });

  const proceed = () => {
    const state = emotionalStates.find((item) => item.id === selectedStates[0]);
    if (!state) return;
    funnelStore.setSelectedState({ id: state.id, title: state.title, description: state.description });
    // the second pick (the toggle caps at 2) is carried through as `secondaryState`, cleared to null when only one
    // state is picked so a stale value can't survive into a later run
    const second = selectedStates[1] ? emotionalStates.find((item) => item.id === selectedStates[1]) ?? null : null;
    funnelStore.setSecondaryState(second ? { id: second.id, title: second.title, description: second.description } : null);
    track("state_selected", state.id);
    onContinue();
  };

  return (
    <div className="funnel-page state-page flex flex-col px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-12 lg:pb-6">
      {/* top bar: the way back home and where the person is in the test */}
      <div className="state-bar mx-auto flex w-full max-w-[1040px] items-center justify-between gap-3">
        <a
          href="/"
          onClick={(e) => {
            if (!onExit) return;
            e.preventDefault();
            onExit();
          }}
          aria-label="Sensoria — на головну"
          className="tb-logo inline-flex items-center gap-1 rounded-full bg-white/10 py-1.5 pl-2.5 pr-4 text-white sm:gap-1.5 sm:py-2 sm:pl-3 sm:pr-5 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <img src={logo} alt="" className="tb-logo-img h-7 w-7 object-contain brightness-0 invert sm:h-9 sm:w-9" />
          <span className="tb-logo-text text-[14px] font-semibold tracking-wide sm:text-[16px]">SENSORIA</span>
        </a>
        <span className="tb-chip rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white/85 ring-1 ring-white/15 sm:px-5 sm:py-2.5 sm:text-[16px]">
          Крок 1 · Ваш стан
        </span>
      </div>

      <div className="state-inner mx-auto w-full max-w-[1040px] pt-8 sm:my-auto sm:pt-12 sm:pb-4 lg:pt-6 lg:pb-0">
        <div className="mb-6 text-center sm:mb-10 lg:mb-8">
          <h1 className="mb-3 text-[28px] font-bold leading-tight text-white min-[380px]:text-[30px] sm:mb-5 sm:text-[44px] lg:text-[52px]">
            Що турбує вас найбільше зараз?
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-white/80 sm:text-lg">
            Оберіть один або два стани, які найкраще описують ваше самопочуття.
          </p>
        </div>

        <div className="state-grid grid gap-2.5 sm:grid-cols-2 sm:gap-4 md:gap-6 lg:grid-cols-3" role="group" aria-label="Стани">
          {emotionalStates.map((state) => {
            const selected = selectedStates.includes(state.id);
            const full = !selected && count >= MAX_PICKS;
            return (
              <button
                key={state.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(state.id)}
                className={`state-card group relative flex items-center gap-4 overflow-hidden rounded-[22px] py-3.5 pl-4 pr-3.5 text-left backdrop-blur-xl transition-[background-color,border-color,transform,box-shadow,opacity] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:min-h-[176px] lg:min-h-[150px] md:rounded-[30px] md:p-6 md:pl-7 ${
                  selected
                    ? "border-2 border-white/80 bg-white/[0.18] shadow-[0_18px_50px_-20px_rgba(8,12,60,0.6)]"
                    : `border border-white/10 bg-white/[0.08] ${full ? "opacity-55" : "md:hover:-translate-y-1 md:hover:border-white/25 md:hover:bg-white/[0.12] md:hover:shadow-[0_20px_60px_-24px_rgba(8,12,60,0.6)]"}`
                }`}
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                <span className="state-body relative flex min-w-0 flex-1 items-center gap-4">
                <span aria-hidden="true" className={`state-accent relative h-10 w-[4px] shrink-0 rounded-full md:h-[72px] md:w-[5px] ${stateAccentColors[state.id as PrimaryStateId].dot}`} />
                <span className="relative min-w-0 flex-1">
                  <span className="block text-[17px] font-bold leading-tight text-white md:mb-3 md:text-[22px]">{state.title}</span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-white/75 md:max-w-[280px] md:text-[15px] md:leading-relaxed md:text-white/80">{state.description}</span>
                </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full transition-all md:absolute md:right-5 md:top-5 ${
                    selected ? "bg-white text-[#2b3fd0] shadow-lg" : "ring-1 ring-inset ring-white/45"
                  }`}
                >
                  {selected && (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* phones: a floating white bar at the bottom (as «З чого почати?» on the home page) (status + action), always in reach; from 640 px — below the grid */}
        <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:static sm:mt-10 sm:p-0 md:mt-12 lg:mt-8">
          <div className="mx-auto flex max-w-[460px] items-center gap-3 rounded-[22px] bg-white p-2 pl-4 shadow-[0_18px_44px_-12px_rgba(8,12,60,0.55)] sm:flex-col sm:gap-2 sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none sm:ring-0 sm:backdrop-blur-none">
            <div aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none">
              <span aria-hidden="true" className="flex gap-1 sm:hidden">
                {Array.from({ length: MAX_PICKS }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full transition-colors ${i < count ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0]" : "bg-[#dfe3f3]"}`} />
                ))}
              </span>
              <span className="truncate text-[14px] font-semibold text-[#1e2a78] sm:hidden">
                {count === 0 ? "Оберіть стан" : `Обрано ${count} з ${MAX_PICKS}`}
              </span>
              <span className="hidden text-[13px] font-medium text-white/80 sm:inline">
                {count === 0 ? "Оберіть хоча б один стан" : count === 1 ? "Обрано 1 · можна додати ще один" : "Обрано 2 з 2"}
              </span>
            </div>
            <button
              type="button"
              disabled={count === 0}
              onClick={proceed}
              className={`inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-[18px] px-5 text-[15px] font-bold transition-all sm:h-auto sm:min-h-[54px] sm:gap-2 sm:rounded-2xl sm:px-10 sm:text-[16px] md:min-w-[280px] md:text-lg ${
                count > 0
                  ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_8px_20px_-6px_rgba(76,80,230,0.6)] active:scale-[0.98] sm:bg-none sm:bg-white sm:text-[#1e2a78] sm:shadow-[0_14px_40px_rgba(10,20,90,0.35)] sm:hover:-translate-y-0.5"
                  : "cursor-not-allowed bg-[#eef0f8] text-[#9aa1c0] sm:bg-white/15 sm:text-white/50"
              }`}
            >
              Продовжити
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
