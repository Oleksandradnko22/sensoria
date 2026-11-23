import { Icon } from "./ui/Icon";
import { useEffect, useState } from "react";

type Props = {
  onOpenTest: () => void;
};

// Was `{ onopentest }: any` — App.tsx has always passed `onOpenTest`
// (camelCase), so the lowercase prop here was always `undefined`. The
// popup's "Пройти тест →" button silently did nothing when clicked
// (React just no-ops an undefined onClick, no console warning), and
// `: any` on the props hid the mismatch from tsc.
export default function TestPopup({ onOpenTest }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Appears after the person has spent 10s on this screen — a plain
  // timeout from mount, no scroll listener involved.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOpen(true);
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  const close = () => {
    setOpen(false);
    setMinimized(true);
  };

  const reopen = () => {
    setOpen(true);
    setMinimized(false);
  };

  return (
    <>
      {/* POPUP — a calm white card: icon, one line of why, one short action. On phones it is a single
          compact row above the bottom edge (and above the iPhone home bar). */}
      {open && (
        <div
          role="region"
          aria-label="Підбір програми"
          className="fixed left-3 right-3 bottom-[max(12px,env(safe-area-inset-bottom))] sm:left-auto sm:right-8 sm:bottom-8 z-50 min-[1700px]:[zoom:var(--page-zoom)]"
        >
          <div className="relative sm:w-[360px] flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-md border border-[#dfe3fb] text-[#0f172a] p-3 sm:p-4 pr-8 sm:pr-10 shadow-[0_18px_50px_-12px_rgba(15,23,90,0.45)] animate-[fadeIn_0.6s_ease-out] motion-reduce:animate-none">
            <span aria-hidden="true" className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white flex items-center justify-center">
              <Icon name="compass" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] sm:text-[15px] font-semibold leading-snug">З чого почати?</span>
              <span className="block max-[359px]:hidden text-[12px] sm:text-[13px] text-[#5b6280] leading-snug mt-0.5">Тест підбере програму для вас</span>
            </span>
            <button
              onClick={onOpenTest}
              className="shrink-0 h-9 px-3.5 rounded-full bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-semibold whitespace-nowrap shadow-[0_6px_16px_-4px_rgba(76,80,230,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
            >
              Пройти тест
            </button>
            <button
              onClick={close}
              aria-label="Закрити"
              className="absolute top-0 right-0 w-9 h-9 flex items-center justify-center rounded-tr-2xl text-[#8a90ad] hover:text-[#0f172a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* FLOATING BUTTON — after closing: a small quiet circle, no pulsing */}
      {minimized && (
        <button
          onClick={reopen}
          aria-label="Підібрати програму: пройти тест"
          className="fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] sm:right-8 sm:bottom-8 z-50 min-[1700px]:[zoom:var(--page-zoom)] w-12 h-12 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] ring-4 ring-white/40 shadow-[0_10px_28px_-8px_rgba(15,23,90,0.55)] hover:scale-105 transition focus:outline-none focus-visible:ring-white"
        >
          <Icon name="compass" size={20} />
        </button>
      )}

      {/* animation */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </>
  );
}
