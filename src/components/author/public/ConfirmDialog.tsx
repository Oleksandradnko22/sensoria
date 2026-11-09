// Small confirmation dialog in the site's own style (instead of the browser's window.confirm):
// focus trap, Esc / backdrop cancel, focus returns to the button that opened it.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./useModal";

type Props = {
  title: string;
  text?: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  /** Ask for a short reason (kept in the admin audit log); confirm stays disabled until it is filled. */
  askReason?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ title, text, confirmLabel, busy = false, danger = true, askReason = false, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useModal(root, onCancel);
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={text ? "confirm-text" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <h3 id="confirm-title" className="text-[16px] font-semibold text-black/90">{title}</h3>
        {text && <p id="confirm-text" className="mt-1.5 text-[14px] leading-relaxed text-black/60">{text}</p>}
        {askReason && (
          <label className="mt-4 block text-[13px] text-black/70">
            Причина (потрапить у журнал дій)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-xl border border-black/[0.12] px-3 py-2 text-[14px] focus:outline-none focus:border-black/40 resize-none"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button data-autofocus onClick={onCancel} className="min-h-[44px] px-4 rounded-xl border border-black/[0.12] text-[14px] text-black/70 hover:bg-black/[0.04]">
            Скасувати
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || (askReason && reason.trim().length < 3)}
            className={`min-h-[44px] px-5 rounded-xl text-[14px] font-medium text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-black hover:bg-black/90"}`}
          >
            {busy ? "Зачекайте…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
