import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import HeroArt from "./programDetail/HeroArt";
import { coverImageStyle, coverUrlForFrame } from "../utils/coverFocus";
import GuideAuthorCard from "./guideDetail/GuideAuthorCard";
import { categoryLabels } from "../data/categoryLabels";
import type { Meditation } from "../data/meditations";
import { heroVisualForTags } from "../utils/heroVisual";
import { requestOpenCart, useCart } from "../lib/cartStore";
import { formatPrice, isFreePrice } from "../utils/price";
import { useOwnedKeys } from "../lib/useOwnedKeys";
import { useOpenAuthorProfile } from "../context/AuthorProfileContext";

type Props = {
  meditation: Meditation;
  onClose: () => void;
  // the signed-in participant, so a meditation already in their cabinet is not offered for the cart again
  userId?: string | null;
  isParticipant?: boolean;
  onStart?: () => void;
  // when opened from an author's profile: who made it (otherwise «Sensoria»)
  authorId?: string | null;
  authorName?: string | null;
  // a development-only preview card: it has no audio and cannot be added anywhere
  demo?: boolean;
};

type TabId = "about" | "author" | "reviews";
const TABS: { id: TabId; label: string }[] = [
  { id: "about", label: "Про практику" },
  { id: "author", label: "Автор" },
  { id: "reviews", label: "Відгуки" },
];

// The meditations' own colour: neon violet, the continuation of the meditations catalog.
const HERO_BG = "linear-gradient(115deg,#412cf2 0%,#7351fe 52%,#af86ff 100%)";
const CARD = "rounded-[24px] bg-white p-5 text-slate-900 shadow-[0_18px_40px_-22px_rgba(50,20,120,0.45)] sm:p-7";
const CTA =
  "inline-flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-gradient-to-r from-[#5232f4] to-[#774eff] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(90,50,210,0.7)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#582edd] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const Check = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#582edd" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function MetaIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-white/90">
      <path d={d} />
    </svg>
  );
}

// The meditation's page: hero, one panel with what you get and how to get it, then the tabs.
// Everything shown comes from the meditation's own data; nothing is invented.
export default function MeditationDetailModal({ meditation, onClose, userId, isParticipant = false, onStart, authorId, authorName, demo = false }: Props) {
  const openAuthorProfile = useOpenAuthorProfile();
  const author = authorName || meditation.author || "Sensoria";
  const price = meditation.price ?? "0";
  const free = isFreePrice(price);
  const cartApi = useCart();
  const ref = { kind: "meditation" as const, id: meditation.id };
  const inCart = cartApi.has(ref);
  const ownedKeys = useOwnedKeys(userId, isParticipant);
  const inCabinet = ownedKeys.has(`meditation:${meditation.id}`);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Like a page: the catalog behind does not scroll, Escape closes, Tab stays inside, focus returns.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !dialogRef.current) return;
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

  const [tab, setTab] = useState<TabId>("about");
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`md-tab-${next.id}`)?.focus();
  };

  const visual = heroVisualForTags(meditation.tags);
  const topics = meditation.tags.filter((t) => t in categoryLabels).map((t) => categoryLabels[t as keyof typeof categoryLabels]);
  // always exactly four: what the practice is, what you can set, and the last one depends on the download choice
  const facts = [
    { title: `Аудіопрактика ${meditation.durationMinutes} хв`, hint: "Одна сесія: сядьте зручно й увімкніть звук." },
    { title: "Фоновий звук на вибір", hint: meditation.hasEmbeddedMusic ? "Дощ, природа чи море: музика вже є в записі." : "Дощ, природа, море чи музика: ви обираєте самі." },
    { title: "Свій баланс звуку", hint: "Гучність голосу й фону регулюється окремо." },
    meditation.offlineDownloadEnabled
      ? { title: "Можна завантажити", hint: "Слухайте без інтернету, коли потрібно." }
      : { title: "Продовжите будь-коли", hint: "Зупиніться, коли потрібно: запис пам’ятає, де ви закінчили." },
  ];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={meditation.title} className="fixed inset-0 z-[999] overflow-y-auto bg-[#f4f0ff]">
      {/* HERO */}
      <section className="relative isolate overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pb-28 lg:px-8 lg:pb-32">
          <div aria-hidden="true" className="pointer-events-none absolute right-8 top-[72px] hidden aspect-square w-[280px] lg:block xl:right-12 xl:w-[320px]">
            {meditation.coverUrl ? (
              <img
                src={coverUrlForFrame(meditation.coverUrl, meditation.coverFocus, "square")}
                alt=""
                style={coverImageStyle(meditation.coverFocus, "square")}
                className="h-[86%] w-full rounded-[28px] object-cover shadow-[0_24px_60px_-20px_rgba(20,10,80,0.6)] ring-1 ring-white/30"
              />
            ) : (
              <HeroArt visual={visual} />
            )}
          </div>

          <div className="mb-8 flex items-center justify-between gap-4">
            <nav aria-label="Навігація" className="min-w-0 text-[14px] text-white/90">
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <button ref={backRef} type="button" onClick={onClose} className="-my-3 rounded py-3 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Каталог медитацій
                  </button>
                </li>
                <li aria-hidden="true">→</li>
                <li aria-current="page" className="min-w-0 max-w-full truncate font-medium text-white">
                  {meditation.title}
                </li>
              </ol>
            </nav>
            <button type="button" onClick={onClose} aria-label="Закрити" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-[18px] text-white transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              ✕
            </button>
          </div>

          <header className="max-w-[640px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">
                <Icon name="headphones" size={14} />
                Медитація
              </span>
              {topics.length > 0 && <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">{topics.join(" • ")}</span>}
              {free && <span className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white">Безкоштовно</span>}
              <span className="rounded-full bg-[#382bd7] px-3.5 py-1.5 text-[13px] font-semibold text-white">{author}</span>
            </div>

            <h1 className="mt-5 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[46px] lg:text-[54px]">{meditation.title}</h1>
            {meditation.description && <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-white sm:text-[18px]">{meditation.description}</p>}

            <dl className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4 text-[15px]">
              <div className="flex items-center gap-2.5">
                <MetaIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-4 3.6-6 8-6s8 2 8 6" />
                <div>
                  <dt className="text-[12px] leading-none text-white/80">Автор</dt>
                  <dd className="mt-1 font-medium leading-none">
                    {authorId ? (
                      <button type="button" onClick={() => openAuthorProfile(authorId)} className="-my-3 rounded py-3 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                        {author}
                      </button>
                    ) : (
                      author
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <MetaIcon d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                <dt className="sr-only">Тривалість</dt>
                <dd className="font-medium">{meditation.duration}</dd>
              </div>
            </dl>
          </header>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8">
        {/* WHAT YOU GET + ACCESS: one panel overlapping the hero's lower edge */}
        <div className="relative z-10 -mt-16 sm:-mt-20">
          <section aria-label="Що ви отримаєте і як отримати практику" className="grid overflow-hidden rounded-[34px] bg-white text-slate-900 shadow-[0_20px_50px_-28px_rgba(50,20,120,0.5)] lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-4 sm:p-6 lg:self-center">
              <h2 className="px-1 pb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Що ви отримаєте</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {facts.map((f) => (
                  <li key={f.title} className="flex min-w-0 items-start gap-3 rounded-[22px] bg-gradient-to-b from-[#f5f1ff] to-[#e9e1ff] px-4 py-4 sm:px-5 sm:py-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ddd1ff]">
                      <Check />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-[15px] font-semibold leading-snug text-[#2a1372]">{f.title}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-[#513b96]">{f.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col justify-center gap-4 border-t border-slate-200/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
              <div>
                <div className="text-[14px] font-medium text-slate-500">Вартість</div>
                <div className={`mt-0.5 text-[38px] font-bold leading-tight ${free ? "text-emerald-700" : "text-[#0f172a]"}`}>{formatPrice(price)}</div>
              </div>

              <div className="w-full">
                {demo ? (
                  <>
                    <button type="button" disabled className={CTA}>
                      Додати в кошик
                    </button>
                    <p role="note" className="mt-2 text-[13px] leading-relaxed text-slate-500">Демо-картка для перегляду вигляду: у неї ще немає аудіо.</p>
                  </>
                ) : inCabinet ? (
                  <>
                    <p role="status" className="flex items-center gap-2.5 rounded-[20px] bg-[#f1ecff] px-5 py-4 text-[15px] font-semibold text-[#441fbc]">
                      <Check />
                      Практика вже у вашому кабінеті
                    </p>
                    {onStart && (
                      <button type="button" onClick={onStart} className={`${CTA} mt-3`}>
                        Почати практику →
                      </button>
                    )}
                  </>
                ) : inCart ? (
                  <>
                    <button type="button" onClick={requestOpenCart} className={CTA}>
                      Перейти до кошика →
                    </button>
                    <p role="status" className="mt-2 flex items-center justify-between gap-3 text-[13px] leading-relaxed text-slate-500">
                      <span>Медитацію додано в кошик.</span>
                      <button type="button" onClick={() => cartApi.remove(ref)} className="min-h-[44px] shrink-0 rounded-lg px-2 underline underline-offset-2 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#582edd]">
                        Прибрати
                      </button>
                    </p>
                  </>
                ) : (
                  // one button for every material, free or paid: what happens next is decided in the cart
                  <button type="button" onClick={() => cartApi.add(ref)} className={CTA}>
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

            <div className="col-span-full flex items-start gap-2.5 border-t border-slate-200/70 bg-[#f6f3ff] px-5 py-3.5 text-[13px] leading-relaxed text-slate-600 sm:px-7">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#582edd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              <p>Практика має освітній характер і не замінює консультацію психолога, психотерапевта чи лікаря. Якщо стає гірше, зупиніться.</p>
            </div>
          </section>
        </div>

        {/* TABS */}
        <div role="tablist" aria-label="Розділи сторінки" className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`md-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={tab === t.id ? `md-panel-${t.id}` : undefined}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px min-h-[48px] shrink-0 border-b-2 px-4 text-[15px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#582edd] sm:px-5 ${
                tab === t.id ? "border-[#7641fe] text-[#441fbc]" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-6">
          {tab === "about" && (
            <section role="tabpanel" id="md-panel-about" aria-labelledby="md-tab-about" className="flex flex-col gap-6">
              {meditation.whenToUse.length > 0 && (
                <div className="rounded-[24px] bg-gradient-to-br from-[#efe9ff] to-[#e2d8ff] p-5 text-slate-900 sm:p-7">
                  <h2 className="text-[20px] font-semibold text-[#2a1372]">Ця практика для вас, якщо ви зараз…</h2>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {meditation.whenToUse.map((w) => (
                      <li key={w} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#2a1372]">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80">
                          <Check />
                        </span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={CARD}>
                <h2 className="text-[22px] font-semibold">Як це проходить</h2>
                <ol className="mt-5 flex flex-col gap-3">
                  {[
                    "Оберіть зручне місце й за бажанням фоновий звук.",
                    `Увімкніть запис: він триває ${meditation.durationMinutes} хв.`,
                    "Наприкінці можна відмітити, як ви себе почуваєте.",
                  ].map((step, i) => (
                    <li key={step} className="flex items-center gap-4 rounded-[18px] bg-slate-50 px-4 py-4 sm:px-5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ddd1ff] text-[15px] font-semibold text-[#441fbc]">{i + 1}</span>
                      <p className="text-[15px] leading-snug">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {tab === "author" && (
            <section role="tabpanel" id="md-panel-author" aria-labelledby="md-tab-author" className={CARD}>
              <GuideAuthorCard name={author} role={authorName ? "Автор практики" : "Команда Sensoria"} avatarClass="from-[#5232f4] to-[#774eff]" />
            </section>
          )}

          {tab === "reviews" && (
            <section role="tabpanel" id="md-panel-reviews" aria-labelledby="md-tab-reviews" className={CARD}>
              <h2 className="text-[22px] font-semibold">Відгуки</h2>
              <div className="mt-4 flex items-start gap-3 rounded-[18px] bg-slate-50 p-5 text-slate-600">
                <Icon name="star" size={20} />
                <p className="text-[15px] leading-relaxed">Відгуків про цю практику поки немає. Вони з’являться, коли перші слухачі поділяться враженнями.</p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
