// Small confirmation / form dialogs of the lesson screen, extracted from
// ProgramExperience.tsx unchanged in behaviour (2026-10-06). Each is purely
// presentational: the lesson screen owns the state and passes values and
// callbacks. Added: dialog semantics (role/aria-modal/label) and Escape to close.
import { useEffect, type ReactNode } from "react";

function Overlay({ label, onClose, width, children }: { label: string; onClose: () => void; width: number; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[10050] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full rounded-[20px] bg-white p-6"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// "НЕ ЗОВСІМ" follow-up — asks what specifically didn't work before the
// negative signal is saved, so the author can read a real reason, not just a
// bare thumbs-down. The reason is optional.
export function NotHelpfulDialog({
  reason,
  warning,
  onReasonChange,
  onCancel,
  onSubmit,
}: {
  reason: string;
  warning: string | null;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Overlay label="Що саме не сподобалось?" onClose={onCancel} width={420}>
      <div className="text-[15px] font-semibold mb-1">Що саме не сподобалось?</div>
      <p className="text-[13px] text-black/50 mb-4">Необов'язково, але це допоможе автору покращити матеріал.</p>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Напишіть, що саме не спрацювало..."
        rows={3}
        aria-label="Що саме не спрацювало"
        className="w-full rounded-xl border border-black/10 p-3.5 text-[13px] resize-none focus:outline-none focus:border-black/25 transition"
      />
      {warning && <div className="text-[12px] text-rose-600 mt-2">{warning}</div>}
      <div className="flex gap-2 justify-end mt-4">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-black/10 text-[13px] text-black/60 hover:bg-black/5 transition"
        >
          Скасувати
        </button>
        <button
          onClick={onSubmit}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition"
        >
          Надіслати
        </button>
      </div>
    </Overlay>
  );
}

export function DeleteCommentDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Overlay label="Видалити коментар?" onClose={onCancel} width={380}>
      <div className="text-[15px] font-semibold mb-1">Видалити коментар?</div>
      <p className="text-[13px] text-black/50 mb-5">Цю дію не можна буде скасувати.</p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-black/10 text-[13px] text-black/60 hover:bg-black/5 transition"
        >
          Скасувати
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white text-[13px] font-medium hover:opacity-90 transition"
        >
          Видалити
        </button>
      </div>
    </Overlay>
  );
}

export function ReportCommentDialog({
  reasons,
  reason,
  submitted,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  reasons: string[];
  reason: string | null;
  submitted: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Overlay label="Поскаржитися на коментар" onClose={onClose} width={420}>
      {submitted ? (
        <>
          <div className="text-[15px] font-semibold mb-1">Дякуємо. Ми перевіримо повідомлення.</div>
          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition"
            >
              Закрити
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-[15px] font-semibold mb-4">Поскаржитися на коментар</div>
          <div role="radiogroup" aria-label="Причина скарги" className="flex flex-col gap-2 mb-5">
            {reasons.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] cursor-pointer transition ${
                  reason === r ? "border-black/30 bg-black/[0.03]" : "border-black/10 hover:bg-black/[0.02]"
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === r}
                  onChange={() => onReasonChange(r)}
                  className="accent-black"
                />
                {r}
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-black/10 text-[13px] text-black/60 hover:bg-black/5 transition"
            >
              Скасувати
            </button>
            <button
              onClick={onSubmit}
              disabled={!reason}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Надіслати скаргу
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}
