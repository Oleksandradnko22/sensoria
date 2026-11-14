import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import HeroArt from "./programDetail/HeroArt";
import { categoryLabels } from "../data/categoryLabels";
import { getGuideSource, guideCardMeta, type Guide } from "../data/guides";
import { getGuideOutline, resolveGuidePdf } from "../data/guidePdf";
import { guideTypeInfo } from "../data/guideTypes";
import { heroVisualForTags } from "../utils/heroVisual";
import { interactiveSummary } from "../utils/guideDetail";
import { isSensoriaAuthor } from "../utils/contentLabels";
import { formatPrice, isFreePrice } from "../utils/price";
import { requestOpenCart, useCart } from "../lib/cartStore";
import { useOwnedKeys } from "../lib/useOwnedKeys";
import { useOpenAuthorProfile } from "../context/AuthorProfileContext";
import { fetchGuideAuthorId } from "../lib/contentAuthors";
import ProgramAuthorTab from "./programDetail/ProgramAuthorTab";
import GuideAuthorCard from "./guideDetail/GuideAuthorCard";
import GuideReviews from "./guideDetail/GuideReviews";
import { DEMO_GUIDE_PREFIX, demoGuideAuthor, demoGuideCriteria, demoGuideReviews } from "../data/guidesDemo";

import MaterialStories from "./feed/MaterialStories";
type Props = {
  guide: Guide;
  onClose: () => void;
  // the signed-in participant, so a guide already in their cabinet is not offered for the cart again
  userId?: string | null;
  isParticipant?: boolean;
};

type TabId = "inside" | "author" | "reviews";
const TABS: { id: TabId; label: string }[] = [
  { id: "inside", label: "Що всередині" },
  { id: "author", label: "Автор" },
  { id: "reviews", label: "Відгуки" },
];

// The guides' own colour: the same teal as the guides catalog, so the page feels like its continuation.
const HERO_BG = "linear-gradient(115deg,#005f66 0%,#008f94 48%,#12c3ad 100%)";
const CARD = "rounded-[24px] bg-white p-5 text-slate-900 shadow-[0_18px_40px_-22px_rgba(0,70,70,0.45)] sm:p-7";
const CTA =
  "inline-flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-gradient-to-r from-[#00776f] to-[#008a80] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,140,130,0.7)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f] focus-visible:ring-offset-2";

function MetaIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-white/90">
      <path d={d} />
    </svg>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#00867f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

// The guide's page: hero, the one panel with what you get and how to get it, then the tabs.
// Everything shown comes from the guide's own data; nothing is invented.
export default function GuidesPreviewModal({ guide, onClose, userId, isParticipant = false }: Props) {
  const openAuthorProfile = useOpenAuthorProfile();
  const cartApi = useCart();
  const guideRef = { kind: "guide" as const, id: guide.id };
  const inCart = cartApi.has(guideRef);
  const ownedKeys = useOwnedKeys(userId, isParticipant);
  const inCabinet = ownedKeys.has(`guide:${guide.id}`);
  const dialogRef = useRef<HTMLDivElement>(null);
  const free = isFreePrice(guide.price);
  // the five preview guides (development build only) carry sample author and reviews
  const demoGuide = import.meta.env.DEV && guide.id.startsWith(DEMO_GUIDE_PREFIX);
  const backRef = useRef<HTMLButtonElement>(null);
  // the parent passes a fresh function on every render; the effect below must not restart because of that
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Catalog guides only have an author account through guide_authors.
  const [authorId, setAuthorId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchGuideAuthorId(guide.id)
      .then((id) => {
        if (!cancelled) setAuthorId(id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guide.id]);

  // Like a page: the catalog behind does not scroll, Escape closes, focus starts on «back» and returns.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !dialogRef.current) return;
      // keep Tab inside the page: the catalog behind is not reachable while it is open
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  const visual = heroVisualForTags(guide.tags);
  const typeInfo = guide.guideType ? guideTypeInfo[guide.guideType] : null;
  const structured = getGuideSource(guide) === "sensoria_structured";
  const tagLabels = guide.tags.filter((t) => t in categoryLabels).map((t) => categoryLabels[t as keyof typeof categoryLabels]);
  const size = guideCardMeta(guide)[0];
  const outline = useMemo(() => getGuideOutline(guide), [guide]);
  const previewPages = resolveGuidePdf(guide).previewPages;
  const interactive = useMemo(() => interactiveSummary(guide.guideContent), [guide.guideContent]);
  const outcomes = (guide.outcomes ?? []).slice(0, 3);
  const bySensoria = isSensoriaAuthor(guide.author);
  const formatLabel = structured ? "Онлайн + PDF для друку" : "PDF";

  const [tab, setTab] = useState<TabId>("inside");
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`gd-tab-${next.id}`)?.focus();
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={guide.title} className="fixed inset-0 z-[999] overflow-y-auto bg-[#eefaf8]">
      {/* HERO */}
      <section className="relative isolate overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pb-28 lg:px-8 lg:pb-32">
          <div aria-hidden="true" className="pointer-events-none absolute right-8 top-[72px] hidden aspect-square w-[280px] lg:block xl:right-12 xl:w-[320px]">
            <HeroArt visual={visual} />
          </div>

          <div className="mb-8 flex items-center justify-between gap-4">
            <nav aria-label="Навігація" className="min-w-0 text-[14px] text-white/85">
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <button ref={backRef} type="button" onClick={onClose} className="-my-3 rounded py-3 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Каталог гайдів
                  </button>
                </li>
                <li aria-hidden="true">→</li>
                <li aria-current="page" className="min-w-0 max-w-full truncate font-medium text-white">
                  {guide.title}
                </li>
              </ol>
            </nav>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[18px] text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ✕
            </button>
          </div>

          <header className="max-w-[640px]">
            <div className="flex flex-wrap items-center gap-2">
              {typeInfo && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">
                  <Icon name={typeInfo.icon} size={14} />
                  {typeInfo.label}
                </span>
              )}
              {tagLabels.length > 0 && <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">{tagLabels.join(" • ")}</span>}
              {free && <span className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Безкоштовно</span>}
              {bySensoria && <span className="rounded-full bg-[#4338ca] px-3.5 py-1.5 text-[13px] font-semibold text-white">Sensoria</span>}
            </div>

            <h1 className="mt-5 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[46px] lg:text-[54px]">{guide.title}</h1>
            {guide.description && <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-white/90 sm:text-[18px]">{guide.description}</p>}

            <dl className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4 text-[15px]">
              <div className="flex items-center gap-2.5">
                <MetaIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-4 3.6-6 8-6s8 2 8 6" />
                <div>
                  <dt className="text-[12px] leading-none text-white/70">Автор</dt>
                  <dd className="mt-1 font-medium leading-none">
                    {authorId ? (
                      <button type="button" onClick={() => openAuthorProfile(authorId)} className="-my-3 rounded py-3 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                        {guide.author}
                      </button>
                    ) : (
                      guide.author
                    )}
                  </dd>
                </div>
              </div>
              {size && (
                <div className="flex items-center gap-2.5">
                  <MetaIcon d="M7 3h7l5 5v13H7zM14 3v5h5" />
                  <dt className="sr-only">Обсяг</dt>
                  <dd className="font-medium">{size}</dd>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <MetaIcon d="M4 5h16v11H4zM8 20h8M12 16v4" />
                <dt className="sr-only">Формат</dt>
                <dd className="font-medium">{formatLabel}</dd>
              </div>
            </dl>
          </header>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8">
        {/* WHAT YOU GET + ACCESS — one panel overlapping the hero's lower edge */}
        <div className="relative z-10 -mt-16 sm:-mt-20">
          <section
            aria-label="Що ви отримаєте і як отримати гайд"
            className={`grid overflow-hidden rounded-[34px] bg-white text-slate-900 shadow-[0_20px_50px_-28px_rgba(0,70,70,0.5)] ${outcomes.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
          >
            {outcomes.length > 0 && (
              <div className="p-4 sm:p-6 lg:self-center">
                <h2 className="px-1 pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Після гайду у вас буде</h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-4">
                  {outcomes.map((o) => (
                    <li key={o} className="flex min-w-0 items-start gap-3 rounded-[22px] bg-gradient-to-b from-[#effcf9] to-[#dff7f2] px-4 py-4 sm:px-5 sm:py-5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c9f1ea]">
                        <Check />
                      </span>
                      <span className="min-w-0 break-words pt-0.5 text-[15px] font-semibold leading-snug text-[#0b3b38]">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={`flex flex-col justify-center gap-4 p-5 sm:p-7 ${outcomes.length > 0 ? "border-t border-slate-200/70 lg:border-l lg:border-t-0" : "lg:flex-row lg:items-center lg:justify-between"}`}>
              <div>
                <div className="text-[14px] font-medium text-slate-500">Вартість</div>
                <div className={`mt-0.5 text-[38px] font-bold leading-tight ${free ? "text-emerald-600" : "text-slate-900"}`}>{formatPrice(guide.price)}</div>
              </div>

              <div className="w-full lg:max-w-[340px]">
                {inCabinet ? (
                  <p role="status" className="flex items-center gap-2.5 rounded-[20px] bg-[#e6faf6] px-5 py-4 text-[15px] font-semibold text-[#0b5a55]">
                    <Check />
                    Гайд уже у вашому кабінеті
                  </p>
                ) : inCart ? (
                  <>
                    <button type="button" onClick={requestOpenCart} className={CTA}>
                      Перейти до кошика →
                    </button>
                    <p role="status" className="mt-2 flex items-center justify-between gap-3 text-[13px] leading-relaxed text-slate-500">
                      <span>Гайд додано в кошик.</span>
                      <button type="button" onClick={() => cartApi.remove(guideRef)} className="min-h-[44px] shrink-0 rounded-lg px-2 underline underline-offset-2 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f]">
                        Прибрати
                      </button>
                    </p>
                  </>
                ) : (
                  // one button for every guide, free or paid: what happens next is decided in the cart
                  <button type="button" onClick={() => cartApi.add(guideRef)} className={CTA}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
                      <circle cx="9" cy="19.5" r="1.4" />
                      <circle cx="17" cy="19.5" r="1.4" />
                    </svg>
                    Додати в кошик
                  </button>
                )}
              </div>
            </div>

            <div className="col-span-full flex items-start gap-2.5 border-t border-slate-200/70 bg-[#f4fbfa] px-5 py-3.5 text-[13px] leading-relaxed text-slate-600 sm:px-7">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00867f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <p>Матеріали мають освітній характер і не замінюють консультацію психолога, психотерапевта чи лікаря.</p>
            </div>
          </section>
        </div>

        {/* TABS */}
        <div role="tablist" aria-label="Розділи сторінки" className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`gd-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={tab === t.id ? `gd-panel-${t.id}` : undefined}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px min-h-[48px] shrink-0 border-b-2 px-4 text-[15px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f] sm:px-5 ${
                tab === t.id ? "border-[#00a89a] text-[#006b65]" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {tab === "inside" && (
            <section role="tabpanel" id="gd-panel-inside" aria-labelledby="gd-tab-inside" className="flex flex-col gap-6">
              {/* «Цей гайд для вас, якщо…» — the situation it is meant for */}
              {guide.relevantIf && guide.relevantIf.length > 0 && (
                <div className="rounded-[24px] bg-gradient-to-br from-[#e6faf6] to-[#d4f3ee] p-5 text-slate-900 sm:p-7">
                  <h2 className="text-[20px] font-semibold text-[#0b3b38]">Цей гайд для вас, якщо ви зараз…</h2>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {guide.relevantIf.map((r) => (
                      <li key={r} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#134e4a]">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80">
                          <Check />
                        </span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* the structure: authored outline, or the headings of the guide */}
              <div className={CARD}>
                <h2 className="text-[22px] font-semibold">Зміст гайду</h2>
                {outline.length === 0 ? (
                  <p className="mt-4 text-[14px] text-slate-500">Автор ще не додав опис змісту.</p>
                ) : (
                  <ol className="mt-5 flex flex-col gap-3">
                    {outline.map((item, i) => (
                      <li key={`${i}-${item.title}`} className="flex items-start gap-4 rounded-[18px] bg-slate-50 px-4 py-4 sm:px-5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d4f3ee] text-[15px] font-semibold text-[#006b65]">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-[16px] font-semibold leading-snug">{item.title}</div>
                          {item.summary && <p className="mt-1 text-[14px] leading-relaxed text-slate-600">{item.summary}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* what you can do inside, counted from the real blocks */}
              {interactive.length > 0 && (
                <div className={CARD}>
                  <h2 className="text-[22px] font-semibold">Що можна робити всередині</h2>
                  <p className="mt-2 text-[14px] text-slate-500">Це не лише текст: гайд містить вправи, які ви виконуєте просто в ньому.</p>
                  <ul className="mt-4 flex flex-wrap gap-2.5">
                    {interactive.map((x) => (
                      <li key={x.type} className="rounded-full bg-[#e6faf6] px-4 py-2 text-[14px] font-medium text-[#0b5a55]">
                        {x.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* real page previews of an uploaded PDF, when the author provided them */}
              {previewPages.length > 0 && (
                <div className={CARD}>
                  <h2 className="text-[22px] font-semibold">Сторінки гайду</h2>
                  <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {previewPages.map((p) => (
                      <li key={p.imageUrl}>
                        <img src={p.imageUrl} alt={p.label ?? "Сторінка гайду"} loading="lazy" decoding="async" className="w-full rounded-xl border border-slate-200" />
                        {p.label && <div className="mt-1.5 text-[13px] text-slate-500">{p.label}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {tab === "author" && (
            <section role="tabpanel" id="gd-panel-author" aria-labelledby="gd-tab-author" className={CARD}>
              {demoGuide ? (
                <GuideAuthorCard {...demoGuideAuthor} verified onOpenProfile={() => {}} onAsk={() => {}} demo />
              ) : authorId ? (
                // a real author account: the same «Про автора» as on the program page
                <ProgramAuthorTab program={{ authorId, author: guide.author }} onOpenProfile={() => openAuthorProfile(authorId)} />
              ) : (
                <GuideAuthorCard name={guide.author} role={bySensoria ? "Команда Sensoria" : "Автор гайду"} />
              )}
            </section>
          )}

          {tab === "reviews" && (
            <section role="tabpanel" id="gd-panel-reviews" aria-labelledby="gd-tab-reviews" className={CARD}>
              {demoGuide ? (
                <GuideReviews reviews={demoGuideReviews} criteria={demoGuideCriteria} demo />
              ) : (
                <>
                  <MaterialStories contentId={guide.id} />
                  <h2 className="text-[22px] font-semibold">Відгуки</h2>
                  <div className="mt-4 flex items-start gap-3 rounded-[18px] bg-slate-50 p-5 text-slate-600">
                    <Icon name="star" size={20} />
                    <p className="text-[15px] leading-relaxed">Відгуків про цей гайд поки немає. Вони з’являться, коли перші читачі поділяться враженнями.</p>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
