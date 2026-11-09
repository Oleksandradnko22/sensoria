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
      {/* POPUP */}
      {open && (
        <div role="region" aria-label="Підбір програми" className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-10 sm:right-10 z-50">
          <div
            className="w-full sm:w-[320px] rounded-2xl p-4 sm:p-5 text-white shadow-2xl animate-[fadeIn_0.6s_ease-out] motion-reduce:animate-none"
            style={{
              background:
                "linear-gradient(135deg, #1e40ff 0%, #7c3aed 100%)",
            }}
          >
            <button
              onClick={close}
              aria-label="Закрити"
              className="absolute top-1 right-1 min-h-[44px] min-w-[44px] text-white/80 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-[16px] font-semibold mb-2 sm:mb-1 pr-10">
              Підібрати програму?
            </h3>

            <p className="hidden sm:block text-white/90 text-[14px] mb-4">
              Пройдіть тест і ми підберемо програму саме для вас
            </p>

            <button
              onClick={onOpenTest}
              className="w-full min-h-[44px] rounded-lg bg-white text-black text-[14px] font-medium hover:scale-[1.03] transition"
            >
              Пройти тест →
            </button>
          </div>
        </div>
      )}

      {/* FLOATING BUTTON */}
      {minimized && (
        <button
          onClick={reopen}
          aria-label="Підібрати програму: пройти тест"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 transition"
          style={{
            background:
              "linear-gradient(135deg, #1e40ff, #7c3aed)",
          }}
        >
          <span className="absolute inset-0 rounded-full animate-ping motion-reduce:hidden bg-white/20"></span>
          <span className="relative z-10"><Icon name="brain" size={22} /></span>
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