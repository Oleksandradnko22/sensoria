// Program card of the home carousel («Популярні програми»). A white card with the cover framed inside it
// (a frame authors set in the cover editor: 16:9 «Сторінка автора, головна» on a narrow card, 3:1 «Картка в
// каталозі» on a wide one, so the cover never takes half the card),
// the topic on the cover, then title → short description → author and length → price and the action.
// The whole card opens the program; the button is the same action for keyboard and screen readers.
import { coverImageStyle, coverUrlForFrame } from "../../utils/coverFocus";
import ProgramCover from "../ProgramCover";
import { getContentAccent } from "../../data/contentAccents";
import { categoryLabels, currentTopic } from "../../data/categoryLabels";
import { formatPrice, isFreePrice } from "../../utils/price";
import type { Program } from "../../data/programs";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "S";
}

export default function HomeProgramCard({ program, onOpen, wide = false }: { program: Program; onOpen: () => void; wide?: boolean }) {
  const frame = wide ? "card" : "wide";
  const free = isFreePrice(program.price);
  const topicId = program.tags.map(currentTopic).find((t): t is string => !!t);
  const topic = topicId ? (categoryLabels as Record<string, string>)[topicId] : null;
  const accent = getContentAccent(program.tags);
  const TopicIcon = accent.Icon;

  return (
    <article
      onClick={onOpen}
      className="group relative w-full h-full flex flex-col rounded-[26px] bg-white p-2 cursor-pointer shadow-[0_1px_2px_rgba(15,23,90,0.08),0_14px_34px_-18px_rgba(15,23,90,0.55)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(15,23,90,0.08),0_26px_48px_-20px_rgba(15,23,90,0.6)] active:translate-y-0 active:duration-150"
    >
      {/* cover, framed inside the card */}
      <div className={`relative ${wide ? "aspect-[3/1]" : "aspect-video"} rounded-[20px] overflow-hidden bg-gradient-to-br from-[#e8edff] to-[#efe9ff]`}>
        <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]">
          {program.coverUrl ? (
            <img
              src={coverUrlForFrame(program.coverUrl, program.coverFocus, frame)}
              alt=""
              loading="lazy"
              style={coverImageStyle(program.coverFocus, frame)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <ProgramCover tags={program.tags} />
          )}
        </div>
        {topic && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[12px] font-semibold text-[#2b2f6b] shadow-[0_2px_8px_rgba(15,23,90,0.10)]">
            <TopicIcon className={`w-3.5 h-3.5 ${accent.iconColor}`} />
            {topic}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 px-3 pt-4 pb-2">
        <h3 className="text-[17px] font-semibold leading-snug text-[#0f172a] line-clamp-2 sm:min-h-[2.75em]">{program.title}</h3>
        {program.description && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#5b6280] line-clamp-2">{program.description}</p>
        )}

        <div className="mt-4 flex items-center gap-2 min-w-0 text-[13px] text-[#5b6280]">
          <span aria-hidden="true" className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white text-[10px] font-bold flex items-center justify-center">
            {initials(program.author)}
          </span>
          <span className="truncate">{program.author}</span>
          {program.duration && (
            <>
              <span aria-hidden="true" className="text-[#c3c7dc]">·</span>
              <span className="whitespace-nowrap">{program.duration}</span>
            </>
          )}
        </div>

        <div className="mt-auto pt-4">
          <div className="pt-3 border-t border-[#eef0fa] flex items-center justify-between gap-3">
            <span className={`whitespace-nowrap ${free ? "text-[14px] sm:text-[15px] font-semibold text-[#137a48]" : "text-[17px] sm:text-[18px] font-bold text-[#0f172a]"}`}>
              {free ? "Безкоштовно" : formatPrice(program.price)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              aria-label={`Детальніше: ${program.title}`}
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 h-10 pl-3.5 pr-2.5 sm:pl-4 sm:pr-3 rounded-full bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] sm:text-[14px] font-semibold shadow-[0_6px_16px_-4px_rgba(76,80,230,0.55)] transition-shadow duration-300 group-hover:shadow-[0_10px_22px_-6px_rgba(76,80,230,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
            >
              Детальніше
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
