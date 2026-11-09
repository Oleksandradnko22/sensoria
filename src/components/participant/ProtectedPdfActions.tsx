// "Відкрити" + "Завантажити" for a PDF attached to a paid program
// (2026-10-06) — replaces the plain <a href download> links, which handed out
// the raw, unmarked file. Open goes to the shielded in-app viewer; download
// goes through the protected pipeline (watermarked, flattened, logged).
import { useState } from "react";
import { useSession } from "../../context/SessionContext";
import { downloadProtectedPdf } from "../../lib/protectedDownload";
import { JOURNAL_MISSING_NOTICE } from "../../lib/pdfMarkIssue";
import ProtectedPdfViewer from "./ProtectedPdfViewer";

type Props = {
  title: string;
  url: string;
  // The program (or other paid content) the file belongs to — used for the
  // issuance log.
  contentId: string;
  // "inline": text links in a lesson's materials card; "button": the
  // black button in the program report's materials list.
  variant: "inline" | "button";
  showOpen?: boolean;
};

export default function ProtectedPdfActions({ title, url, contentId, variant, showOpen = true }: Props) {
  const session = useSession();
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { recorded } = await downloadProtectedPdf({
        kind: "program_material",
        contentId,
        title,
        url,
        viewer: session?.profile,
      });
      if (!recorded) setError(JOURNAL_MISSING_NOTICE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити захищений PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {variant === "inline" ? (
        <div className="flex items-center gap-3 shrink-0 text-[12.5px] font-medium">
          {showOpen && (
            <button onClick={() => setViewing(true)} className="text-blue-600/80 hover:text-blue-700 transition">
              Відкрити →
            </button>
          )}
          <button onClick={download} disabled={busy} className="text-black/40 hover:text-black/60 transition disabled:opacity-50">
            {busy ? "Готуємо…" : "Завантажити"}
          </button>
        </div>
      ) : (
        <button
          onClick={download}
          disabled={busy}
          className="px-3.5 py-1.5 rounded-lg bg-black text-white text-[12px] font-medium hover:opacity-90 transition shrink-0 disabled:opacity-50"
        >
          {busy ? "Готуємо…" : "Завантажити"}
        </button>
      )}
      {error && <span className="basis-full text-[11.5px] text-red-500">{error}</span>}
      {viewing && (
        <ProtectedPdfViewer
          title={title}
          url={url}
          contentId={contentId}
          kind="program_material"
          onClose={() => setViewing(false)}
        />
      )}
    </>
  );
}
