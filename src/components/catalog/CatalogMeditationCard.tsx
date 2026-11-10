import Icon from "../ui/Icon";
import { getContentAccent } from "../../data/contentAccents";
import { categoryLabelForTags } from "../../utils/catalogFilters";
import type { Meditation } from "../../data/meditations";
import { formatPrice, isFreePrice } from "../../utils/price";

type Props = {
  meditation: Meditation;
  onOpen: () => void;
  // undefined = no bookmark (e.g. authors can't save); otherwise the real saved state.
  saved?: boolean;
  onToggleSaved?: () => void;
  // briefly true for the card a search result pointed at
  highlighted?: boolean;
};

// Equalizer bars: the card's own picture, so a meditation reads as sound at a glance.
const BARS = [28, 46, 64, 38, 80, 52, 70, 34, 58, 42, 24];

// One card of the meditations catalog. Only real data is shown: a missing field is simply not rendered.
// Same structure as the guide and program cards, in the meditations' own rose colour.
export default function CatalogMeditationCard({ meditation, onOpen, saved, onToggleSaved, highlighted = false }: Props) {
  const label = categoryLabelForTags(meditation.tags);
  const accent = getContentAccent(meditation.tags);
  const AccentIcon = accent.Icon;
  const price = meditation.price ?? "0";
  const free = isFreePrice(price);

  return (
    <article
      id={`meditation-${meditation.id}`}
      onClick={onOpen}
      className={`group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-[22px] bg-white text-[#0f172a] shadow-[0_10px_30px_-12px_rgba(50,20,120,0.4)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-14px_rgba(50,20,120,0.5)] ${highlighted ? "ring-4 ring-white" : ""}`}
    >
      {/* COVER */}
      <div className="relative h-[130px] shrink-0 overflow-hidden bg-gradient-to-br from-[#ece6ff] via-[#ddd2ff] to-[#cbbcff] sm:h-[140px]">
        {meditation.coverUrl && <img src={meditation.coverUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        {!meditation.coverUrl && <div aria-hidden="true" className="absolute inset-x-4 bottom-0 flex h-[72px] items-end justify-between gap-1.5 opacity-80 transition-transform duration-500 group-hover:scale-y-110 [transform-origin:bottom]">
          {BARS.map((h, i) => (
            <span key={i} className="w-full rounded-t-full bg-white/80" style={{ height: `${h}%` }} />
          ))}
        </div>}
        <div aria-hidden="true" className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#6431e6] shadow-md">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </div>

        <div className="absolute left-3 top-3 right-16 flex flex-wrap gap-1.5">
          {free && <span className="rounded-full bg-emerald-700 px-3 py-1 text-[12px] font-semibold text-white shadow-sm">Безкоштовно</span>}
        </div>

        {onToggleSaved && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved();
            }}
            aria-label={saved ? "Прибрати із збережених" : "Зберегти медитацію"}
            aria-pressed={saved}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#6431e6] shadow-sm transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6431e6]"
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

        <h2 className="line-clamp-2 text-[18px] font-semibold leading-snug">{meditation.title}</h2>
        <p className="truncate text-[13px] text-slate-500">{meditation.author || "Sensoria"}</p>
        {meditation.description && <p className="line-clamp-3 text-[14px] leading-relaxed text-slate-600">{meditation.description}</p>}

        <div className="mt-auto flex items-center gap-1.5 pt-2 text-[13px] text-slate-500">
          <Icon name="clock" size={15} />
          <span className="truncate">{meditation.duration}</span>
        </div>

        <div className="text-[18px] font-semibold">{formatPrice(price)}</div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-[#5232f4] to-[#774eff] text-[14px] font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#582edd] focus-visible:ring-offset-2"
        >
          Відкрити практику →
        </button>
      </div>
    </article>
  );
}
