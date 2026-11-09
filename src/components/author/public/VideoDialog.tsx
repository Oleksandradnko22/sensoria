// The author's introduction video in an accessible modal: the real embed
// (autoplay after the visitor's click), Esc / ✕ / backdrop to close, focus is
// moved in and returned to the opener, focus stays inside while open.
import { useRef } from "react";
import { useModal } from "./useModal";
import { createPortal } from "react-dom";

type Props = { embedUrl: string; title: string; caption?: string; sourceUrl: string; sourceName: string; onClose: () => void };

export default function VideoDialog({ embedUrl, title, caption, sourceUrl, sourceName, onClose }: Props) {

  const rootRef = useRef<HTMLDivElement>(null);
  useModal(rootRef, onClose);

  const src = `${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`;
  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-[960px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button data-autofocus onClick={onClose} aria-label="Закрити" className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-[20px] flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-white">
            ✕
          </button>
        </div>
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
          <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 w-full h-full border-0" />
        </div>
        <div className="mt-3 flex items-start justify-between gap-4 text-white/80 text-[14px]">
          <span className="min-w-0 break-words">{caption}</span>
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 underline underline-offset-4 text-white/70 hover:text-white">
            Відкрити на {sourceName}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
