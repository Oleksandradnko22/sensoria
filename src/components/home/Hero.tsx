// Home hero: message + the two CTAs on the left, a testimonial card (real
// reviews, see HeroTestimonial) and — only when verified — platform numbers on
// the right. Primary CTA opens the existing emotional-state flow, the
// secondary one the existing author sign-in.
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import ScrollHintArrow from "../ScrollHintArrow";
import HeroTestimonial from "./HeroTestimonial";
import { fetchLandingData, type LandingData } from "../../lib/landing";

// Only what the platform really does: the author badge, the test, moderation.
const BENEFITS: { icon: IconName; title: string }[] = [
  { icon: "shield", title: "Перевірені автори" },
  { icon: "compass", title: "Персональні рекомендації" },
  { icon: "lock", title: "Безпечна спільнота" },
];

const STAT_ICONS: Record<string, IconName> = { participants: "heart", materials: "guide", rating: "star" };

export default function Hero({ onOpenTest, onBecomeAuthor }: { onOpenTest: () => void; onBecomeAuthor: () => void }) {
  const [data, setData] = useState<LandingData | null>(null);
  const [realCard, setRealCard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLandingData().then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = data?.stats ?? [];

  return (
    <section aria-labelledby="hero-title" className="relative">
      <div className="page-container relative pt-28 pb-16 lg:pt-32 lg:pb-28 lg:min-h-[min(100vh,900px)] flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-24 items-center w-full">
          {/* LEFT — reading order: headline → one sentence → ONE main action → quiet extras */}
          <div className="flex flex-col min-w-0">
            <h1 id="hero-title" className="fluid-h1 font-bold max-w-[16ch]">
              Простір для розвитку, підтримки та глибоких змін
            </h1>

            <p className="fluid-lead text-white/90 max-w-[30em] mt-5 lg:mt-6">
              Проходьте психологічні програми, відкривайте практичні інструменти та рухайтесь до внутрішнього балансу у власному темпі.
            </p>

            <div className="mt-9 lg:mt-12 flex flex-wrap items-center gap-x-4 gap-y-3">
              {/* the one dominant action on the page */}
              <button
                onClick={onOpenTest}
                className="cta-primary inline-flex items-center gap-2.5 min-h-[56px] px-7 min-[400px]:px-9 rounded-2xl bg-white text-[#1e2a78] text-[16px] sm:text-[17px] font-bold shadow-[0_14px_40px_rgba(10,20,90,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563eb]"
              >
                Пройти тест <span aria-hidden="true" className="cta-arrow">→</span>
              </button>
              {/* clearly secondary: no fill, no border; the underline draws in on hover */}
              <button
                onClick={onBecomeAuthor}
                className="cta-ghost min-h-[48px] px-4 rounded-xl text-white/90 text-[15px] sm:text-[16px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Стати автором <span aria-hidden="true" className="cta-arrow">→</span>
              </button>
            </div>

            <ul className="mt-7 lg:mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
              {BENEFITS.map((b) => (
                <li key={b.title} className="flex items-center gap-2.5 t-small font-semibold text-white whitespace-nowrap">
                  <span aria-hidden="true" className="shrink-0 text-white/75">
                    <Icon name={b.icon} size={18} />
                  </span>
                  {b.title}
                </li>
              ))}
            </ul>
          </div>

          {/* RIGHT */}
          <div className={`min-w-0 w-full max-w-[600px] lg:ml-auto flex-col gap-4 ${realCard ? "flex" : "hidden sm:flex"}`}>
            <HeroTestimonial testimonials={data?.testimonials ?? []} onRealChange={setRealCard} />

            {stats.length > 0 && (
              <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
                {stats.map((s) => (
                  <li key={s.key} className="rounded-2xl border border-white/20 bg-white/10 px-3 sm:px-4 py-3 flex items-center gap-3 min-w-0">
                    <span aria-hidden="true" className="hidden sm:flex shrink-0 w-9 h-9 rounded-full bg-white/15 items-center justify-center">
                      <Icon name={STAT_ICONS[s.key] ?? "star"} size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block t-stat leading-none">{s.value}</span>
                      <span className="block t-caption text-white/85 mt-1">{s.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ScrollHintArrow />
      </div>

      {/* quiet organic edge into the next section */}
      <svg
        aria-hidden="true"
        className="absolute -bottom-[clamp(60px,9vw,150px)] left-0 w-full h-[clamp(100px,15vw,240px)] pointer-events-none"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
      >
        <defs><linearGradient id="hero-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0.2" stopColor="#fff" stopOpacity="0.08" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
        <path d="M0 64 C240 20 480 20 720 52 C960 84 1200 84 1440 40 L1440 240 L0 240 Z" fill="url(#hero-edge)" />
      </svg>
    </section>
  );
}
