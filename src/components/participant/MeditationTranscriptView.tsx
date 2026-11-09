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
    <details className="group w-full max-w-[560px] mx-auto text-left rounded-2xl border border-black/[0.07] bg-white/70 px-5 py-3">
      <summary className="cursor-pointer select-none text-[13.5px] font-medium text-black/65 hover:text-black/85 transition">
        Текст практики
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-[14.5px] leading-relaxed text-black/70">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </details>
  );
}
