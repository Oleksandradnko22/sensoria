// One "Поскаржитися" dialog for everything reportable (author, post, review,
// program/guide/meditation). The caller supplies the reasons and the submit
// call; this owns only the form state.
import { useRef, useState } from "react";
import { useModal } from "./author/public/useModal.ts";

export type ReportReasonOption = { value: string; label: string };

export default function ReportDialog({
  title,
  doneText,
  reasons,
  onSubmit,
  onClose,
}: {
  title: string;
  doneText: string;
  reasons: ReportReasonOption[];
  onSubmit: (reason: string, details: string) => Promise<void>;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModal(root, onClose);

  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason, details);
      setDone(true);
    } catch {
      setError("Не вдалося надіслати скаргу. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-[20px] bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <div className="text-[16px] font-semibold mb-1">{doneText}</div>
            <p className="text-[14px] text-black/60">Людина, на яку ви скаржитесь, не побачить, що це були ви.</p>
            <div className="flex justify-end mt-5">
              <button
                data-autofocus
                onClick={onClose}
                className="min-h-[44px] px-5 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition"
              >
                Закрити
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[16px] font-semibold mb-4">{title}</div>
            <div role="radiogroup" aria-label="Причина скарги" className="flex flex-col gap-2 mb-4">
              {reasons.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-2.5 px-3.5 min-h-[44px] rounded-xl border text-[14px] cursor-pointer transition ${
                    reason === r.value ? "border-black/30 bg-black/[0.03]" : "border-black/10 hover:bg-black/[0.02]"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-black"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {reason && (
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                placeholder="Що саме не так (необов'язково)"
                aria-label="Деталі скарги"
                rows={3}
                className="w-full mb-4 px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] resize-none focus:outline-none focus:border-black/30"
              />
            )}
            {error && <div className="text-[14px] text-rose-700 mb-3">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-lg border border-black/10 text-[14px] text-black/70 hover:bg-black/5 transition"
              >
                Скасувати
              </button>
              <button
                onClick={send}
                disabled={!reason || busy}
                className="min-h-[44px] px-4 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "Надсилаємо…" : "Надіслати скаргу"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
