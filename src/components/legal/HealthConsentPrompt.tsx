// The consent window for emotional-state data: opens when the person tries to save a test result, a mood check-in,
// a note or a practice answer without the consent (lib/healthConsent.ts). Nothing pre-ticked, «Не зараз» always works;
// materials stay open without the consent — only the saving of answers waits for it.
import { useEffect, useRef, useState } from "react";
import { HEALTH_CONSENT_NEEDED, HEALTH_ITEM, grantHealthConsent } from "../../lib/healthConsent";
import { HEALTH_HINT } from "../../data/consentTexts";
import { Icon } from "../ui/Icon";

export default function HealthConsentPrompt() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const show = () => {
      setChecked(false);
      setError(null);
      setDone(false);
      setOpen(true);
    };
    window.addEventListener(HEALTH_CONSENT_NEEDED, show);
    return () => window.removeEventListener(HEALTH_CONSENT_NEEDED, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open) return null;

  const give = async () => {
    setBusy(true);
    setError(null);
    try {
      await grantHealthConsent();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти згоду. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[990] flex items-center justify-center bg-[#0f172a]/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="health-consent-title" className="w-full max-w-[560px] rounded-[26px] bg-white p-6 text-[#0f172a] shadow-[0_24px_60px_-30px_rgba(15,23,100,0.6)] sm:p-7">
        <div className="flex items-start gap-3.5">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white"><Icon name="shield" size={20} /></span>
          <div className="min-w-0">
            <h2 id="health-consent-title" ref={titleRef} tabIndex={-1} className="text-[19px] font-bold leading-snug outline-none">
              {done ? "Згоду збережено" : "Збереження ваших відповідей"}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
              {done
                ? "Тепер ваші відповіді, нотатки й відмітки настрою зберігатимуться. Повторіть дію — збережемо її."
                : "Результати тесту, відмітки настрою й нотатки — це дані про ваш емоційний стан. Ми зберігаємо їх лише з вашої окремої згоди."}
            </p>
          </div>
        </div>

        {!done && (
          <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 ring-1 transition-colors ${checked ? "bg-[#eef0fd] ring-[#c9cffa]" : "ring-[#ece9f8] hover:bg-[#fafaff]"}`}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-[3px] h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#4338ca]" />
            <span className="text-[14px] leading-relaxed text-gray-800">
              {HEALTH_ITEM.text}
              <span className="mt-1 block text-[13px] text-gray-500">{HEALTH_HINT}</span>
            </span>
          </label>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] text-red-700">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {done ? (
            <button type="button" onClick={() => setOpen(false)} className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[15px] font-semibold text-white hover:opacity-95">
              Зрозуміло
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="min-h-[46px] rounded-xl px-4 text-[15px] font-semibold text-[#3b27a8] hover:bg-[#f3f4ff]">
                Не зараз
              </button>
              <button type="button" onClick={give} disabled={!checked || busy} className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[15px] font-semibold text-white hover:opacity-95 disabled:opacity-45">
                {busy ? "Зберігаємо…" : "Дати згоду"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
