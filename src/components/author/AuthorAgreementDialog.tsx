import { useState } from "react";
import { LEGAL } from "../../data/legalOperator";

type Props = {
  onAccept: () => Promise<void>;
  onCancel: () => void;
};

// Shown once before an author's first publish / send to moderation.
export default function AuthorAgreementDialog({ onAccept, onCancel }: Props) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти згоду. Спробуйте ще раз.");
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="author-agreement-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="author-agreement-title" className="text-[18px] font-semibold text-black/85">
          Договір з автором
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-black/60">
          Перед першою публікацією потрібно прийняти договір з автором
          (редакція {LEGAL.edition}). Він визначає права на контент, виплати, повернення коштів і
          порядок припинення співпраці.
        </p>
        <label className="mt-4 flex items-start gap-3 text-[14px] leading-relaxed text-black/75 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 cursor-pointer"
          />
          <span>
            Я прочитав(-ла) і приймаю{" "}
            <a
              href="/author-agreement"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-blue-600"
            >
              Договір з автором
            </a>
          </span>
        </label>
        {error && <div className="mt-3 text-[13px] text-red-500">{error}</div>}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={accept}
            disabled={!checked || busy}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Зберігаємо…" : "Прийняти й продовжити"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-5 py-3 rounded-xl text-[14px] font-medium text-black/45 hover:text-black/70 transition"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
