// A calm confirmation window (replaces the browser's window.confirm): a title, a few lines, two buttons.
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./public/useModal";

type Props = {
  title: string;
  lines: string[];
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ title, lines, confirmLabel, cancelLabel = "Скасувати", onConfirm, onCancel }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, onCancel);
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-2xl bg-white p-6 text-black shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <h3 id="confirm-title" className="text-[17px] font-semibold text-black/90">{title}</h3>
        <div id="confirm-text" className="mt-2 flex flex-col gap-2 text-[14px] leading-relaxed text-black/65">
          {lines.map((l) => <p key={l}>{l}</p>)}
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button data-autofocus onClick={onConfirm} className="min-h-[46px] flex-1 rounded-xl bg-[#5b3df5] px-5 text-[14px] font-medium text-white transition hover:bg-[#4a2fd0]">
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="min-h-[46px] flex-1 rounded-xl border border-black/[0.12] px-5 text-[14px] font-medium text-black/70 transition hover:bg-black/5">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
