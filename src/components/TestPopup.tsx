import { useEffect, useState } from "react";

export default function TestPopup({ onopentest }: any) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let visibleTime = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  const handleScroll = () => {
    const el = document.getElementById("programs");
    if (!el) return;

    const rect = el.getBoundingClientRect();

    const isVisible =
      rect.top < window.innerHeight - 150 && rect.bottom > 150;

    if (isVisible) {
      if (!interval) {
        interval = setInterval(() => {
          visibleTime += 100;
        }, 100);
      }

      if (visibleTime > 1800) {
        window.removeEventListener("scroll", handleScroll);

        if (interval) clearInterval(interval);

        timeout = setTimeout(() => {
          setOpen(true);
        }, 1200);
      }
    } else {
      if (interval) clearInterval(interval);
      interval = null;
      visibleTime = 0;
    }
  };

  window.addEventListener("scroll", handleScroll);

  return () => {
    window.removeEventListener("scroll", handleScroll);
    if (interval) clearInterval(interval);
    if (timeout) clearTimeout(timeout);
  };
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
        <div className="fixed bottom-10 right-10 z-50">
          <div
            className="w-[320px] rounded-2xl p-5 text-white shadow-2xl animate-[fadeIn_0.3s_ease]"
            style={{
              background:
                "linear-gradient(135deg, #1e40ff 0%, #7c3aed 100%)",
            }}
          >
            <button
              onClick={close}
              className="absolute top-2 right-3 text-white/60 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-sm font-semibold mb-1">
              Підібрати програму?
            </h3>

            <p className="text-white/70 text-xs mb-4">
              Пройдіть тест і ми підберемо програму саме для вас
            </p>

            <button 
              onClick={onopentest}
              className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:scale-[1.03] transition"
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 transition"
          style={{
            background:
              "linear-gradient(135deg, #1e40ff, #7c3aed)",
          }}
        >
          <span className="absolute inset-0 rounded-full animate-ping bg-white/20"></span>
          <span className="relative z-10 text-xl">🧠</span>
        </button>
      )}

      {/* animation */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </>
  );
}