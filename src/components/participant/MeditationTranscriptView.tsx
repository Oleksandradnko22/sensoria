// "Текст практики": the author-confirmed transcript of the spoken practice.
// Renders nothing unless a CONFIRMED transcript exists (never an automatic
// draft). Collapsed by default; a native <details> keeps it keyboard- and
// screen-reader-friendly.
import type { Meditation } from "../../data/meditations";
import { publicTranscript } from "../../utils/meditationTranscript";

export default function MeditationTranscriptView({ meditation }: { meditation: Meditation }) {
  const paragraphs = publicTranscript(meditation);
  if (!paragraphs) return null;
  return (
    <details open className="group w-full max-w-[560px] mx-auto text-left rounded-2xl border border-[#e3def9] bg-[#faf9ff] px-5 py-4">
      <summary className="flex min-h-[44px] cursor-pointer select-none items-center justify-between gap-3 text-[16px] font-semibold text-[#1d1a3b]">
        Текст практики
        <span className="text-[13px] font-semibold text-[#4a2fd0] group-open:hidden">Показати</span>
        <span className="hidden text-[13px] font-semibold text-[#4a2fd0] group-open:inline">Згорнути</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-[16px] leading-[1.7] text-[#2d2a5c]">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </details>
  );
}
