import { coverImageStyle, coverUrlForFrame } from "../../utils/coverFocus";
import ProgramCover from "../ProgramCover";
import { getContentAccent } from "../../data/contentAccents";
import { categoryLabelForTags } from "../../utils/catalogFilters";
import { isAiProgram, isSensoriaAuthor } from "../../utils/contentLabels";
import { formatPrice, isFreePrice } from "../../utils/price";
import { pathForPage } from "../../utils/routes";
import { prefetchAuthorProfile } from "../../lib/authorPublic";
import type { Program } from "../../data/programs";

type Props = {
  program: Program;
  onOpen: () => void;
  // undefined = no bookmark (e.g. authors can't save); otherwise the real saved state.
  saved?: boolean;
  onToggleSaved?: () => void;
};

// One card of the programs catalog. Only real program data is shown: a missing
// field is simply not rendered. The home carousel keeps using CourseCard.
export default function CatalogProgramCard({ program, onOpen, saved, onToggleSaved }: Props) {
  const free = isFreePrice(program.price);
  const label = categoryLabelForTags(program.tags);
  const bySensoria = isSensoriaAuthor(program.author);
  const ai = isAiProgram(program.tags);
  const accent = getContentAccent(program.tags);
  const AccentIcon = accent.Icon;
  // Start loading the author's data while the pointer is over the card: the «Автор» tab is then instant.
  const warmAuthor = () => {
    if (program.authorId) prefetchAuthorProfile(program.authorId).catch(() => undefined);
  };

  return (
    <article
      onClick={onOpen}
      onPointerEnter={warmAuthor}
      onFocus={warmAuthor}
      className="group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[22px] bg-white text-[#0f172a] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-14px_rgba(15,23,42,0.45)]"
    >
      {/* COVER */}
      <div className="relative h-[130px] shrink-0 overflow-hidden sm:h-[140px]">
        {program.coverUrl ? (
          <img
            src={coverUrlForFrame(program.coverUrl, program.coverFocus, "card")}
            alt=""
            loading="lazy"
            decoding="async"
            width={400}
            height={160}
            style={coverImageStyle(program.coverFocus, "card")}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]">
            <ProgramCover tags={program.tags} seed={program.id} />
          </div>
        )}

        {(free || bySensoria || ai || !!program.giftCount) && (
          <div className="absolute left-3 top-3 right-14 flex flex-wrap gap-1.5">
            {free && <span className="rounded-full bg-emerald-500 px-3 py-1 text-[12px] font-semibold text-white shadow-sm">Безкоштовно</span>}
            {bySensoria && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#4338ca] px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <path d="M12 2c.6 4 2.6 6 6.5 6.5-3.9.5-5.9 2.5-6.5 6.5-.6-4-2.6-6-6.5-6.5C9.4 8 11.4 6 12 2z" />
                </svg>
                Sensoria
              </span>
            )}
            {!!program.giftCount && (
              <span className="rounded-full bg-[#6d28d9] px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm" title="Автор дарує матеріал, який окремо платний: він входить у вартість програми">
                + Подарунок
              </span>
            )}
            {ai && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-bold tracking-wide text-violet-700 shadow-sm" title="Під час створення використано ШІ">
                AI
              </span>
            )}
          </div>
        )}

        {onToggleSaved && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved();
            }}
            aria-label={saved ? "Прибрати із збережених" : "Зберегти програму"}
            aria-pressed={saved}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#4338ca] shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" />
            </svg>
          </button>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {label && (
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${accent.bg} ${accent.iconColor}`}>
            <AccentIcon className="h-3.5 w-3.5" />
            {label}
          </span>
        )}

        {/* a real link (right address, opens in a new tab on Ctrl/Cmd-click); a plain click stays in the app */}
        <h2 className="line-clamp-2 text-[18px] font-semibold leading-snug">
          <a
            href={pathForPage("program-detail", program.id)}
            onClick={(e) => {
              e.stopPropagation();
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onOpen();
            }}
            className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
          >
            {program.title}
          </a>
        </h2>

        {program.author && <p className="truncate text-[13px] text-slate-500">{program.author}</p>}

        {program.description && <p className="line-clamp-3 text-[14px] leading-relaxed text-slate-600">{program.description}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-[13px] text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {program.duration && (
              <>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M12 3l9 5-9 5-9-5 9-5z" />
                  <path d="M3 13l9 5 9-5" />
                </svg>
                <span className="truncate">{program.duration}</span>
              </>
            )}
          </span>
        </div>

        <div className="text-[18px] font-semibold">{formatPrice(program.price)}</div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-[14px] font-medium text-white transition hover:from-blue-600 hover:to-purple-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
        >
          Детальніше →
        </button>
      </div>
    </article>
  );
}
