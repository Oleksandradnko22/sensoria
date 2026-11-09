// Asked when the author leaves the content editor with unsaved work: save it as a draft, throw it away, or stay.
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./public/useModal";

type Props = {
  noun: string; // "програма" | "медитація" | "гайд"
  published: boolean; // editing something already live: "save changes" instead of "save draft"
  busy: boolean;
  canSave?: boolean; // false while there is no title yet: a draft needs a name
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
};

export default function LeaveEditorDialog({ noun, published, busy, canSave = true, error, onSave, onDiscard, onStay }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, busy ? () => {} : onStay);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onStay}>
      <div
        ref={root}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        aria-describedby="leave-text"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl bg-white p-6 text-black shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <h3 id="leave-title" className="text-[17px] font-semibold text-black/90">
          {published ? "Зберегти зміни?" : "Зберегти чернетку?"}
        </h3>
        <p id="leave-text" className="mt-1.5 text-[14px] leading-relaxed text-black/60">
          {published
            ? `У цій ${noun === "програма" ? "програмі" : noun === "медитація" ? "медитації" : "гайді"} є незбережені зміни. Якщо не зберегти, вони зникнуть.`
            : `Ви почали створювати ${noun === "програма" ? "програму" : noun === "медитація" ? "медитацію" : "гайд"}. Якщо не зберегти, усе, що ви ввели, зникне безповоротно.`}
        </p>
        {!canSave && <p className="mt-3 text-[13px] text-black/60">Щоб зберегти чернетку, спершу вкажіть назву.</p>}
        {error && <p role="alert" className="mt-3 text-[13px] text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <button data-autofocus onClick={onSave} disabled={busy || !canSave} className="min-h-[46px] rounded-xl bg-[#2b2a5a] px-5 text-[14px] font-medium text-white transition hover:bg-[#23224b] disabled:opacity-60">
            {busy ? "Зберігаємо…" : published ? "Зберегти зміни" : "Зберегти чернетку"}
          </button>
          <button onClick={onDiscard} disabled={busy} className="min-h-[46px] rounded-xl border border-black/[0.12] px-5 text-[14px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">
            Не зберігати
          </button>
          <button onClick={onStay} disabled={busy} className="min-h-[44px] rounded-xl px-5 text-[14px] text-black/60 transition hover:text-black disabled:opacity-60">
            Продовжити редагування
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
