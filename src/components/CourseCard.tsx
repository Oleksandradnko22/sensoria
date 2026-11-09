import { coverImageStyle, coverUrlForFrame } from "../utils/coverFocus";
import CardAccent from "./CardAccent";
import ProgramCover from "./ProgramCover";
import { formatPrice, isFreePrice } from "../utils/price";
import type { Program } from "../data/programs";

type CourseCardProps = {
  program: Program;
  onClick: () => void;
  // Opt-in, richer hover treatment (see below).
  premiumHover?: boolean;
};

export default function CourseCard({
  program,
  onClick,
  // Opt-in, richer hover treatment used by the home page's carousel
  // (ProgramsSection). Off by default so every other place this card
  // renders (catalog grid, etc.) keeps its original, unchanged hover.
  premiumHover = false,
}: CourseCardProps) {

  const isRecommended = program.recommended;

  const isFree = isFreePrice(program.price);

  // Real program data (src/data/programs.ts) has no `meta` field — this
  // used to call `.split("•")` on `undefined` and crash the whole
  // catalog grid the moment it rendered anything real. Fall back to
  // deriving the same "duration • price" shape from fields that do
  // exist; `meta` stays supported for anything that does set it.
  const metaParts = program.meta
    ? program.meta.split("•")
    : [
        program.duration ?? "",
        formatPrice(program.price),
      ];

  const isNew = (() => {
    if (!program.createdAt) return false;

    const created = new Date(program.createdAt);
    const now = new Date();

    const diff =
      now.getTime() - created.getTime();

    const days =
      diff / (1000 * 60 * 60 * 24);

    return days <= 30;
  })();

  return (
    <div
      onClick={onClick}
      className={`
        group
        relative
        w-full
        ${premiumHover ? "h-full flex flex-col" : ""}
        rounded-2xl
        overflow-hidden

        bg-white
        text-black

        cursor-pointer

        ${
          premiumHover
            ? // Rest and hover both use exactly two shadow layers, kept in
              // the same order/shape so the browser actually interpolates
              // each layer smoothly during the transition — mismatched
              // layer counts (e.g. 2 layers at rest, 1 on hover) can't be
              // animated per-layer and cause a hard shadow to flash/snap
              // in instead of fading, which is what still read as a crisp
              // line. Neither layer uses a tight spread anymore — both are
              // large-blur/soft, just at two different sizes, so there's
              // no defined edge at any point in the animation.
              // Hover leans on lift + light, not size: scale stays barely
              // perceptible (1.004) so the card never visually crowds its
              // neighbors — enter is quick (280ms), the return to rest is
              // slightly slower (330ms) for a calmer, more premium settle.
              //
              // Against this section's saturated blue/purple background, a
              // shadow needs LOW opacity to actually read as a soft fade —
              // at ~0.25+ opacity, even a huge blur still looks like a
              // solid, sharply-bounded shape (most of a blurred shadow's
              // area stays near-full-strength; only the outer sliver
              // fades), which is exactly the "hard line" that kept showing
              // up. Dropping opacity further (0.06 / 0.12) while keeping
              // the blur large is what actually makes it dissolve.
              "shadow-[0_2px_6px_-2px_rgba(0,0,0,0.08),0_8px_16px_-8px_rgba(0,0,0,0.1)] transition-all duration-[330ms] ease-out hover:duration-[280ms] hover:scale-[1.015] hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.12),0_24px_40px_-14px_rgba(0,0,0,0.22)]"
            : "shadow-xl hover:scale-[1.02] transition duration-300"
        }
      `}
    >

      {/* TOP */}
      <div
        className={`
          relative
          ${premiumHover ? "h-[clamp(140px,12vw,170px)]" : "h-[140px]"}

          bg-gradient-to-br
          from-[#dbeafe]
          to-[#ede9fe]
        `}
      >
        {/* Home carousel only: the program's real cover when it has one,
            otherwise topic art. Catalog cards keep their plain header. */}
        {premiumHover &&
          (program.coverUrl ? (
            <img src={coverUrlForFrame(program.coverUrl, program.coverFocus, "wide")} alt="" loading="lazy" style={coverImageStyle(program.coverFocus, "wide")} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <ProgramCover tags={program.tags} />
          ))}

        {/* Subtle preview "brighten" on hover — premium carousel only. */}
        {premiumHover && (
          <div
            className="
              absolute inset-0
              bg-white/0
              group-hover:bg-white/10
              transition-colors duration-300 ease-out
              pointer-events-none
            "
          />
        )}

        {/* TAGS */}
        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">

          {isRecommended && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-blue-500
                backdrop-blur-sm
                text-white
                text-[12px]
                font-medium
              "
            >
              Рекомендовано
            </div>
          )}

          {isNew && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-purple-500
                backdrop-blur-sm
                text-white
                text-[12px]
                font-medium
              "
            >
              Новий
            </div>
          )}

          {isFree && (
            <div
              className="
                px-3 py-1
                rounded-full
                bg-emerald-500
                backdrop-blur-sm
                text-white
                text-[12px]
                font-medium
              "
            >
              Безкоштовно
            </div>
          )}

        </div>

        {/* Emotional-topic accent — quietly signals what this course is
            about before the title is even read. See CardAccent.tsx. */}
        <CardAccent tags={program.tags} />
      </div>

      {/* CONTENT */}
      {premiumHover ? (
        <div className="p-5 flex flex-col flex-1 gap-2.5">
          <h3 className="text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] font-semibold leading-snug text-[#0f172a] line-clamp-2 sm:min-h-[2.75em]">
            {program.title}
          </h3>
          <p className="text-[13px] text-gray-600 truncate">{program.author}</p>
          {program.description && (
            <p className="text-[14px] text-gray-600 leading-relaxed line-clamp-3">{program.description}</p>
          )}
          <div className="mt-auto pt-2 flex items-center justify-between gap-3 text-[13px] text-gray-600">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {program.duration && (
                <>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="shrink-0">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span className="truncate">{program.duration}</span>
                </>
              )}
            </span>
            {!isFree && <span className="text-[16px] font-semibold text-[#0f172a] whitespace-nowrap">{formatPrice(program.price)}</span>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium group-hover:from-blue-600 group-hover:to-purple-600 group-hover:shadow-lg transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
          >
            Детальніше →
          </button>
        </div>
      ) : (
        <>
      <div className="p-5 flex flex-col gap-3">

        <h3
          className="
            text-[clamp(1rem,0.95rem+0.25vw,1.125rem)]
            font-semibold
            leading-snug
          "
        >
          {program.title}
        </h3>

        <p
          className="
            text-[12px]
            text-gray-500
          "
        >
          {program.author}
        </p>

        <p
          className="
            text-[14px]
            text-gray-600
            leading-relaxed
          "
        >
          Короткий курс, який допоможе
          стабілізувати стан, краще
          зрозуміти себе та повернути
          внутрішній баланс.
        </p>

        <div
          className="
            flex justify-between
            text-[12px]
            text-gray-400
          "
        >
          <span>
            {metaParts[0]}
          </span>

          <span>
            {metaParts[1]}
          </span>
        </div>

        <div
          className="
            text-[16px]
            font-semibold
            mt-1
          "
        >
          {formatPrice(program.price)}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={`
            mt-2
            w-full
            py-2.5
            rounded-xl

            bg-gradient-to-r
            from-blue-500
            to-purple-500

            text-white
            text-[14px]
            font-medium

            ${
              premiumHover
                ? "group-hover:from-blue-600 group-hover:to-purple-600 group-hover:shadow-lg transition-all duration-300 ease-out"
                : "hover:opacity-90 transition"
            }
          `}
        >
          Детальніше →
        </button>

      </div>

        </>
      )}

    </div>
  );
}