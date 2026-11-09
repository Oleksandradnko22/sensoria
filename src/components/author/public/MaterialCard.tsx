// ONE material card for the author's "Матеріали" tab. Shared architecture
// (visual → type · metadata → title → description → price + CTA) with a
// per-type visual identity supplied by MaterialVisual. The whole card is one
// target (stretched button), the price comes from utils/price only.
import { formatPrice, isFreePrice } from "../../../utils/price";
import { POST_KIND_LABEL } from "../../../utils/authorPosts";
import type { Access } from "../../../lib/ownedContent";
import type { AuthorContentItem } from "../../../utils/authorProfileView";
import MaterialVisual from "./MaterialVisual";

type Props = {
  item: AuthorContentItem;
  access?: Access;
  featured?: boolean;
  // average + count of reviews about THIS material; undefined = no reviews, nothing is shown
  rating?: { average: number; count: number };
  onOpen: (kind: AuthorContentItem["kind"], id: string) => void;
};

// Real state only: not in the cabinet → "Відкрити"; in the cabinet →
// "Почати"; already used → "Продовжити" (meditation: "Повторити").
export function ctaLabel(kind: AuthorContentItem["kind"], access?: Access): string {
  if (access === "started") return kind === "meditation" ? "Повторити" : "Продовжити";
  if (access === "owned") return "Почати";
  return "Відкрити";
}

export default function MaterialCard({ item, access, featured = false, rating, onOpen }: Props) {
  const free = isFreePrice(item.price);
  const meta = item.detail ? `${POST_KIND_LABEL[item.kind]} · ${item.detail}` : POST_KIND_LABEL[item.kind];
  const cta = ctaLabel(item.kind, access);
  return (
    <article
      className={`group relative flex flex-col sm:flex-row gap-3 sm:gap-5 rounded-2xl border p-3 sm:p-3.5 transition-[transform,border-color] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-[#4338ca]/35 focus-within:border-[#4338ca]/45 ${
        featured ? "bg-[#fdfcff] border-[#4338ca]/25" : "bg-white border-black/[0.08]"
      }`}
    >
      <MaterialVisual
        item={item}
        frame="wide"
        className="w-full aspect-[16/9] sm:aspect-auto sm:w-[30%] sm:shrink-0 sm:min-h-[168px]"
      />
      <div className="min-w-0 flex-1 flex flex-col py-0.5 sm:py-1.5 sm:pr-2">
        <div className="text-[12px] text-black/55">
          {featured && (
            <>
              <span className="font-semibold uppercase tracking-[0.1em] text-[#4338ca]">Рекомендує автор</span>
              <span aria-hidden> · </span>
            </>
          )}
          {meta}
          {rating && rating.count > 0 && (
            <>
              <span aria-hidden> · </span>
              <span aria-label={`Оцінка матеріалу ${rating.average.toFixed(1)} з 5, відгуків: ${rating.count}`}>
                <span aria-hidden className="text-amber-500">★</span> {rating.average.toFixed(1)} ({rating.count})
              </span>
            </>
          )}
        </div>
        <h3 className="text-[16px] font-semibold leading-snug text-black/90 mt-1 break-words line-clamp-2 min-h-[2.75rem]">
          {item.title}
        </h3>
        <p className="text-[14px] leading-relaxed text-black/65 mt-1.5 line-clamp-3 break-words min-h-[4.0625rem]">{item.description}</p>
        <div className="mt-auto pt-3 flex items-center justify-between gap-3">
          {access ? (
            // Already the participant's: no price, a quiet state instead.
            <span className="text-[14px] font-medium text-[#4338ca]/80">У вашому кабінеті</span>
          ) : (
            <span className={`text-[14px] font-semibold ${free ? "text-emerald-700" : "text-black/80"}`}>{formatPrice(item.price)}</span>
          )}
          <button
            onClick={() => onOpen(item.kind, item.id)}
            aria-label={`${cta}: ${item.title}`}
            className="text-[14px] font-medium text-[#4338ca] inline-flex items-center gap-1 min-h-[44px] after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:underline underline-offset-4 group-hover:underline"
          >
            {cta}
            <span aria-hidden className="transition-transform duration-200 motion-safe:group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
