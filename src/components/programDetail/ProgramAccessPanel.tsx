import { useId } from "react";
import ContentReportButton from "../ContentReportButton";
import { AUTHOR_LEFT_NOTICE } from "../../lib/authorStatus";
import { formatPrice, isFreePrice } from "../../utils/price";
import { MAX_BENEFITS } from "../../utils/programBenefits";
import type { AccessCta } from "../../utils/programDetail";
import type { Program } from "../../data/programs";
import type { Profile } from "../../lib/auth";

type Props = {
  program: Program;
  cta: AccessCta;
  onStart: () => void;
  session?: Profile | null;
  onRequireLogin: () => void;
  authorLeft: boolean;
  // Still finding out whether the viewer already has this program: show a calm placeholder, not a guess.
  loading?: boolean;
  inCart?: boolean;
  onAddToCart?: () => void;
  onRemoveFromCart?: () => void;
  onOpenCart?: () => void;
};

// Abstract wave decoration. Purely visual and independent of the benefit text:
// it sits behind the text in the bottom strip of a tile and never changes.
export function BenefitWaves() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-x-0 bottom-0 h-[58px] w-full sm:h-[62px]">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ddd6fb" />
          <stop offset=".55" stopColor="#cbbffa" />
          <stop offset="1" stopColor="#b9cffa" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bcd3fa" />
          <stop offset=".6" stopColor="#d4c9fb" />
          <stop offset="1" stopColor="#e7e0fd" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a9c7f8" />
          <stop offset="1" stopColor="#c9baf8" />
        </linearGradient>
      </defs>
      <path d="M0 46C45 22 95 24 150 46S250 70 300 14V80H0z" fill={`url(#${id}a)`} opacity=".85" />
      <path d="M0 40C40 30 70 30 110 44S190 62 300 34" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
      <path d="M0 62C60 46 120 52 175 62S260 60 300 50V80H0z" fill={`url(#${id}b)`} opacity=".9" />
      <path d="M0 72C70 64 140 74 210 72S270 66 300 70V80H0z" fill={`url(#${id}c)`} opacity=".8" />
    </svg>
  );
}

// Benefits (author-written, up to three) + price + the one real call-to-action,
// as a single surface. The benefits area only exists when there are benefits.
export default function ProgramAccessPanel({ program, cta, onStart, session, onRequireLogin, authorLeft, loading, inCart, onAddToCart, onRemoveFromCart, onOpenCart }: Props) {
  const free = isFreePrice(program.price);
  const isOwner = !!program.authorId && session?.id === program.authorId;
  const actionable = cta.kind === "start" || cta.kind === "continue" || cta.kind === "review";
  const cart = cta.kind === "cart";
  const benefits = (program.benefits ?? []).slice(0, MAX_BENEFITS);
  const hasBenefits = benefits.length > 0;

  const ctaClass =
    "inline-flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-gradient-to-r from-[#0057ff] to-[#7b2cff] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,87,255,0.6)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";

  return (
    <>
      <section
        aria-label="Переваги та доступ до програми"
        className={`grid overflow-hidden rounded-[34px] bg-[#fdfdff] text-slate-900 shadow-[0_20px_50px_-28px_rgba(30,41,99,0.45)] ${hasBenefits ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
      >
        {hasBenefits && (
          <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-4 sm:p-6 lg:self-center">
            {benefits.map((b) => (
              <li key={b} className="relative flex min-w-0 overflow-hidden rounded-[22px] bg-gradient-to-b from-[#f6f7ff] to-[#edf0ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9)]">
                <div className="relative z-10 flex min-w-0 items-start gap-3 px-4 pb-[52px] pt-4 sm:gap-3.5 sm:px-5 sm:pb-[58px] sm:pt-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9e6fc]">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5b3df5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  <span className="line-clamp-3 min-w-0 break-words pt-0.5 text-[16px] font-semibold leading-snug text-[#1d1a3b]">{b}</span>
                </div>
                <BenefitWaves />
              </li>
            ))}
          </ul>
        )}

        <div
          className={`flex flex-col justify-center gap-4 p-5 sm:p-7 ${
            hasBenefits ? "border-t border-slate-200/70 lg:border-l lg:border-t-0" : "lg:flex-row lg:items-center lg:justify-between"
          }`}
        >
          <div>
            <div className="text-[14px] font-medium text-slate-500">Вартість</div>
            <div className={`mt-0.5 text-[38px] font-bold leading-tight ${free ? "text-emerald-600" : "text-slate-900"}`}>{formatPrice(program.price)}</div>
            {!!program.giftCount && (
              <div className="mt-2 inline-flex max-w-[320px] items-start gap-2 rounded-xl border border-[#c4b5fd] bg-[#f5f3ff] px-3 py-2 text-[13px] leading-snug text-[#5b21b6]">
                <span>Автор дарує {program.giftCount === 1 ? "матеріал" : `${program.giftCount} матеріали`}, які окремо платні. Вони входять у вартість програми.</span>
              </div>
            )}
          </div>

          {loading ? (
            <div role="status" aria-label="Перевіряємо ваш доступ до програми" className="min-h-[60px] w-full animate-pulse rounded-[20px] bg-slate-100 lg:max-w-[340px]" />
          ) : actionable ? (
            <button type="button" onClick={onStart} className={`${ctaClass} lg:max-w-[340px]`}>
              {cta.kind !== "review" && (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              )}
              {cta.label}
              {cta.kind !== "review" ? " →" : ""}
            </button>
          ) : cart ? (
            <div className="w-full lg:max-w-[340px]">
              {inCart ? (
                <>
                  <button type="button" onClick={onOpenCart} className={ctaClass}>
                    Перейти до кошика →
                  </button>
                  <p role="status" className="mt-2 flex items-center justify-between gap-3 text-[13px] leading-relaxed text-slate-500">
                    <span>Програму додано в кошик.</span>
                    <button type="button" onClick={onRemoveFromCart} className="min-h-[44px] shrink-0 rounded-lg px-2 underline underline-offset-2 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
                      Прибрати
                    </button>
                  </p>
                </>
              ) : (
                <button type="button" onClick={onAddToCart} className={ctaClass}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
                    <circle cx="9" cy="19.5" r="1.4" />
                    <circle cx="17" cy="19.5" r="1.4" />
                  </svg>
                  {cta.label}
                </button>
              )}
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-slate-500 lg:max-w-[340px]">{cta.note}</p>
          )}
        </div>

        {/* about the materials themselves (not the author), so it belongs to the program card */}
        <div className="col-span-full flex items-start gap-2.5 border-t border-slate-200/70 bg-[#f7f8ff] px-5 py-3.5 text-[13px] leading-relaxed text-slate-600 sm:px-7">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <p>Матеріали мають освітній характер і не замінюють консультацію психолога, психотерапевта чи лікаря.</p>
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-2 text-[13px] text-slate-500">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {authorLeft && !!program.authorId && !isOwner && <span role="status">{AUTHOR_LEFT_NOTICE}</span>}
        </div>
        {!isOwner && <ContentReportButton kind="program" contentId={String(program.id)} title={program.title} viewerId={session?.id} onRequireLogin={onRequireLogin} />}
      </div>
    </>
  );
}
