// Reads a paid PDF inside Sensoria (2026-10-06): pages are rendered to
// canvases (lib/pdfRender.ts) and shown one under another — so the browser's
// own PDF toolbar, with its raw "download" button, is never on screen. Viewing
// carries NO watermark (Sasha: watermarks are for downloaded copies only);
// "Завантажити" goes through the protected download (lib/protectedDownload.ts),
// which is where the marks are applied.
//
// If the file cannot be rendered by the browser (host without CORS, a
// corrupted file) the viewer falls back to the browser's own PDF frame so the
// person can still read it; the download stays protected-only either way.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logContentAccess } from "../../lib/accessLog";
import { createPortal } from "react-dom";
import { useSession } from "../../context/SessionContext";
import { downloadProtectedPdf, renderPdfView } from "../../lib/protectedDownload";
import { JOURNAL_MISSING_NOTICE, type PdfMarkKind } from "../../lib/pdfMarkIssue";
import { ArrowLeftIcon, DownloadIcon } from "./GuideIcons";
import ContentShield from "./ContentShield";

type Props = {
  title: string;
  url: string;
  contentId: string;
  kind: PdfMarkKind;
  onClose: () => void;
  // Extra toolbar controls (e.g. the guide's "mark as completed").
  extraActions?: ReactNode;
};

const TOOLBAR_BUTTON =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-medium text-black/60 hover:text-black hover:bg-black/[0.05] transition disabled:opacity-50";

export default function ProtectedPdfViewer({ title, url, contentId, kind, onClose, extraActions }: Props) {
  const session = useSession();
  const viewer = session?.profile;
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logContentAccess(contentId, "open");
  }, [contentId]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    renderPdfView(url)
      .then((canvases) => {
        if (cancelled || !host.current) return;
        canvases.forEach((c) => {
          c.style.width = "100%";
          c.style.height = "auto";
          c.style.display = "block";
          c.style.marginBottom = "12px";
          c.style.borderRadius = "10px";
          c.style.background = "#fff";
          c.draggable = false;
        });
        host.current.replaceChildren(...canvases);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("fallback");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, contentId, viewer?.id]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const { recorded } = await downloadProtectedPdf({ kind, contentId, title, url, viewer });
      if (!recorded) setError(JOURNAL_MISSING_NOTICE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити захищений PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10100] flex flex-col bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
      <ContentShield />
      <div className="shrink-0 bg-white/90 backdrop-blur-md border-b border-black/5 px-4 md:px-8 py-2.5 flex items-center gap-3">
        <button onClick={onClose} className={`${TOOLBAR_BUTTON} -ml-2 shrink-0`}>
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Назад</span>
        </button>
        <div className="flex-1 min-w-0 text-[13.5px] font-semibold text-black/75 truncate">{title}</div>
        <div className="flex items-center gap-1 shrink-0">
          {extraActions}
          <button onClick={download} disabled={downloading} className={TOOLBAR_BUTTON} aria-label="Завантажити PDF">
            <DownloadIcon />
            <span className="hidden md:inline">{downloading ? "Готуємо…" : "Завантажити"}</span>
          </button>
        </div>
      </div>
      {error && <div className="shrink-0 bg-red-50 text-red-600 text-[12.5px] px-4 md:px-8 py-2">{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto px-0 md:px-5 py-0 md:py-5">
        {state === "loading" && <div className="text-center text-white/80 text-[14px] pt-24">Готуємо захищений перегляд…</div>}
        {/* Always mounted so the canvases have somewhere to go. */}
        <div ref={host} className={`max-w-[900px] mx-auto ${state === "ready" ? "" : "hidden"}`} />
        {state === "fallback" && (
          <iframe
            src={url}
            title={title}
            className="w-full h-full min-h-[70vh] bg-white md:rounded-[20px] md:shadow-[0_24px_60px_rgba(10,10,40,0.35)]"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
