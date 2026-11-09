import ProgramCover from "../ProgramCover";
import Icon from "../ui/Icon";
import { getContentAccent } from "../../data/contentAccents";
import { guideCardMeta, type Guide } from "../../data/guides";
import { guideTypeInfo } from "../../data/guideTypes";
import { categoryLabelForTags } from "../../utils/catalogFilters";
import { isSensoriaAuthor } from "../../utils/contentLabels";
import { formatPrice, isFreePrice } from "../../utils/price";

type Props = {
  guide: Guide;
  onOpen: () => void;
  // undefined = no bookmark (e.g. authors can't save); otherwise the real saved state.
  saved?: boolean;
  onToggleSaved?: () => void;
};

// One card of the guides catalog. Only real guide data is shown: a missing field is simply not
// rendered. Same structure as the programs catalog card, so both catalogs read the same way.
export default function CatalogGuideCard({ guide, onOpen, saved, onToggleSaved }: Props) {
  const free = isFreePrice(guide.price);
  const label = categoryLabelForTags(guide.tags);
  const accent = getContentAccent(guide.tags);
  const AccentIcon = accent.Icon;
  const meta = guideCardMeta(guide);
  const cover = guide.pdf?.coverImageUrl;
  const sos = guide.guideType === "sos";

  return (
    <article
      onClick={onOpen}
      className="group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[22px] bg-white text-[#0f172a] shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-14px_rgba(15,23,42,0.45)]"
    >
      {/* COVER */}
      <div className="relative h-[130px] shrink-0 overflow-hidden sm:h-[140px]">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" width={400} height={160} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]">
            <ProgramCover tags={guide.tags} seed={guide.id} />
          </div>
        )}

        <div className="absolute left-3 top-3 right-14 flex flex-wrap gap-1.5">
          {sos && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#b85c6e] px-3 py-1 text-[12px] font-semibold text-white shadow-sm">
              <Icon name={guideTypeInfo.sos.icon} size={12} /> SOS
            </span>
          )}
          {guide.tag === "Популярний" && <span className="rounded-full bg-purple-500 px-3 py-1 text-[12px] font-semibold text-white shadow-sm">Популярний</span>}
          {free && <span className="rounded-full bg-emerald-700 px-3 py-1 text-[12px] font-semibold text-white shadow-sm">Безкоштовно</span>}
          {isSensoriaAuthor(guide.author) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#4338ca] px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                <path d="M12 2c.6 4 2.6 6 6.5 6.5-3.9.5-5.9 2.5-6.5 6.5-.6-4-2.6-6-6.5-6.5C9.4 8 11.4 6 12 2z" />
              </svg>
              Sensoria
            </span>
          )}
        </div>

        {onToggleSaved && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved();
            }}
            aria-label={saved ? "Прибрати із збережених" : "Зберегти гайд"}
            aria-pressed={saved}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[#00968c] shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00968c]"
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

        <h2 className="line-clamp-2 text-[18px] font-semibold leading-snug">{guide.title}</h2>

        {guide.author && <p className="truncate text-[13px] text-slate-500">{guide.author}</p>}

        {guide.description && <p className="line-clamp-3 text-[14px] leading-relaxed text-slate-600">{guide.description}</p>}

        {meta.length > 0 && (
          <div className="mt-auto flex items-center gap-1.5 pt-2 text-[13px] text-slate-500">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5" />
            </svg>
            <span className="truncate">{meta.join(" · ")}</span>
          </div>
        )}

        <div className={`text-[18px] font-semibold ${meta.length > 0 ? "" : "mt-auto pt-2"}`}>{formatPrice(guide.price)}</div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-[#00776f] to-[#008a80] text-[14px] font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00968c] focus-visible:ring-offset-2"
        >
          {free ? "Відкрити гайд →" : "Детальніше →"}
        </button>
      </div>
    </article>
  );
}
