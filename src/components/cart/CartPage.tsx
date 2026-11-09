import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Footer from "../Footer";
import { useCart } from "../../lib/cartStore";
import { acquireContent } from "../../lib/acquired";
import ProgramCover from "../ProgramCover";
import MaterialVisual from "../author/public/MaterialVisual";
import { materialsReady, useMaterialsVersion } from "../../lib/materialsStore";
import { buildCartCatalog, type CartCatalogItem } from "../../utils/cartCatalog";
import { useCartView } from "../../lib/useCartView";
import { cartKey, cartTotals, materialsWord, type CartKind } from "../../utils/cart";
import { formatPrice, isFreePrice } from "../../utils/price";
import type { Profile } from "../../lib/auth";
import type { Program } from "../../data/programs";

type Props = {
  programs: Program[];
  // false while the real catalog is still loading (a program may just not be here yet)
  programsLoaded: boolean;
  session?: Profile | null;
  onOpenProgram: (id: string) => void;
  onOpenGuide: (id: string) => void;
  onOpenMeditation: (id: string) => void;
  onOpenCatalog: () => void;
  onOpenGuides: () => void;
  onOpenMeditations: () => void;
    // «Перейти до кабінету» after free materials were added
  onOpenCabinet: () => void;
  onRequireLogin: () => void;
};

const BTN =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[16px] bg-gradient-to-r from-[#0057ff] to-[#7b2cff] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,87,255,0.6)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";

// Soft lavender card: a basket with three cards (program, meditation, guide), drawn here from simple
// shapes, calm waves at the bottom and one pill per kind of material.
function EmptyCart({ onOpenCatalog, onOpenMeditations, onOpenGuides }: { onOpenCatalog: () => void; onOpenMeditations: () => void; onOpenGuides: () => void }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const links: { label: string; run: () => void; icon: ReactNode }[] = [
    {
      label: "Переглянути програми",
      run: onOpenCatalog,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#4f46e5" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
          <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
          <path d="M3 12l9 4.5 9-4.5" />
          <path d="M3 16.5L12 21l9-4.5" />
        </svg>
      ),
    },
    {
      label: "Переглянути медитації",
      run: onOpenMeditations,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#4f46e5" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4.5v15l12-7.5z" />
        </svg>
      ),
    },
    {
      label: "Переглянути гайди",
      run: onOpenGuides,
      icon: (
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#4f46e5" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
          <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
          <path d="M12 6.5v13" />
        </svg>
      ),
    },
  ];
  return (
    <section
      aria-label="Кошик порожній"
      className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-[#f7f7ff] to-[#e9e9fd] px-5 pb-14 pt-8 text-center text-slate-900 shadow-[0_20px_50px_-28px_rgba(30,41,99,0.45)] sm:px-10 sm:pb-16 sm:pt-10"
    >
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-x-0 bottom-0 h-[90px] w-full sm:h-[120px]">
        <defs>
          <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d9d6fb" />
            <stop offset=".5" stopColor="#e6e3fd" />
            <stop offset="1" stopColor="#d3dcfb" />
          </linearGradient>
        </defs>
        <path d="M0 70C160 30 300 36 470 70S800 110 1000 60 1150 40 1200 50V120H0z" fill={`url(#${id}w)`} opacity=".7" />
        <path d="M0 96C200 70 380 100 600 96S980 74 1200 96V120H0z" fill={`url(#${id}w)`} opacity=".9" />
      </svg>

      <div className="relative z-10">
        <svg viewBox="0 0 300 220" width="280" height="205" aria-hidden="true" focusable="false" className="mx-auto">
          <defs>
            <linearGradient id={`${id}c1`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d9ccfb" />
              <stop offset="1" stopColor="#b9a6f5" />
            </linearGradient>
            <linearGradient id={`${id}c2`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c9bdf8" />
              <stop offset="1" stopColor="#ece8fe" />
            </linearGradient>
            <linearGradient id={`${id}c3`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d6cdfa" />
              <stop offset="1" stopColor="#c3b6f6" />
            </linearGradient>
            <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d8d4fa" />
              <stop offset="1" stopColor="#a99cf3" />
            </linearGradient>
            <radialGradient id={`${id}s`} cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#7c66f2" stopOpacity=".5" />
              <stop offset="1" stopColor="#7c66f2" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="150" cy="200" rx="105" ry="13" fill={`url(#${id}s)`} />
          {/* program card (left, tilted) */}
          <g transform="rotate(-12 92 100)">
            <rect x="56" y="38" width="74" height="96" rx="14" fill={`url(#${id}c1)`} />
            <path d="M93 62l22 10-22 10-22-10zM71 86l22 10 22-10M71 98l22 10 22-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" opacity=".92" />
            <rect x="72" y="118" width="42" height="5" rx="2.5" fill="#fff" opacity=".7" />
          </g>
          {/* meditation card (middle, tallest) */}
          <rect x="112" y="20" width="76" height="110" rx="14" fill={`url(#${id}c2)`} />
          <path d="M139 40v22l19-11z" fill="#fff" />
          <path d="M122 82v6M128 78v14M134 74v22M140 80v10M146 76v18M152 82v8M158 78v14M164 84v4M170 80v10M176 83v5" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".9" />
          <rect x="128" y="108" width="44" height="5" rx="2.5" fill="#fff" opacity=".7" />
          {/* guide card (right, tilted) */}
          <g transform="rotate(11 208 100)">
            <rect x="172" y="40" width="74" height="96" rx="14" fill={`url(#${id}c3)`} />
            <path d="M209 66c-6-5-15-6-24-4v28c9-2 18-1 24 4 6-5 15-6 24-4V62c-9-2-18-1-24 4zM209 66v28" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" opacity=".92" />
            <rect x="188" y="116" width="42" height="5" rx="2.5" fill="#fff" opacity=".7" />
          </g>
          {/* basket */}
          <rect x="82" y="120" width="136" height="22" rx="11" fill="#e2defb" />
          <path d="M90 142h120l-13 50a12 12 0 0 1-11.6 9H114.6a12 12 0 0 1-11.6-9z" fill={`url(#${id}b)`} />
          {[118, 134, 150, 166, 182].map((x) => (
            <rect key={x} x={x - 4} y="152" width="8" height="34" rx="4" fill="#fff" opacity=".9" />
          ))}
          <path d="M232 36l7-16M243 48l15-9M246 64l17-2" stroke="#8f7af5" strokeWidth="5" strokeLinecap="round" />
        </svg>

        <h2 className="mt-2 text-[22px] font-bold leading-tight sm:text-[38px]">Ваш кошик поки порожній</h2>
        <p className="mx-auto mt-3 max-w-[620px] text-[16px] leading-relaxed text-slate-500 sm:text-[18px]">
          Додавайте програми, медитації та гайди, які хочете придбати, — вони з’являться тут.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-5">
          {links.map((l) => (
            <button
              key={l.label}
              type="button"
              onClick={l.run}
              className="group inline-flex min-h-[56px] items-center justify-between gap-3 rounded-full border border-[#dcd9fb] bg-white/60 px-5 text-[15px] font-semibold text-slate-900 shadow-[0_6px_18px_-12px_rgba(67,56,202,0.5)] backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
            >
              <span className="flex items-center gap-3">
                {l.icon}
                {l.label}
              </span>
              <span aria-hidden="true" className="text-[18px] text-[#4338ca] transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const KIND_LABEL: Record<CartKind, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };

type CatalogItem = CartCatalogItem;

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

function Tile({ item }: { item: CatalogItem }) {
  const box = "relative h-[150px] w-full shrink-0 overflow-hidden rounded-[18px] sm:h-[150px] sm:w-[224px]";
  if (item.kind === "program" && !item.coverUrl) {
    return (
      <div className={box}>
        <ProgramCover tags={item.tags} seed={item.id} />
      </div>
    );
  }
  return <MaterialVisual item={{ id: item.id, kind: item.kind, title: item.title, description: item.description, price: item.price, coverUrl: item.coverUrl ?? null, coverFocus: item.coverFocus }} className={box} frame="cart" />;
}

export default function CartPage({ programs, programsLoaded, session, onOpenProgram, onOpenGuide, onOpenMeditation, onOpenCatalog, onOpenGuides, onOpenMeditations, onOpenCabinet, onRequireLogin }: Props) {
  const userId = session?.id;
  const isParticipant = session?.role === "participant";
  const isGuest = !session; // a signed-in author can fill a cart but has nothing to claim
  const { remove } = useCart();
  const { lines: viewLines, missing, owned: ownedKeys } = useCartView(programs, userId, isParticipant);
  const materialsVersion = useMaterialsVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => buildCartCatalog(programs), [programs, materialsVersion]);
  const lines = useMemo(() => viewLines.map((l) => ({ entry: l.entry, item: catalog.find((c) => cartKey(c) === cartKey(l.entry))! })), [viewLines, catalog]);
  const owned = useMemo(() => new Set(lines.filter((l) => ownedKeys.has(cartKey(l.entry))).map((l) => cartKey(l.entry))), [lines, ownedKeys]);
  const [notice, setNotice] = useState(false);

  // A material that no longer exists is dropped, but only once the real catalog has loaded.
  useEffect(() => {
    if (programsLoaded && materialsReady()) missing.forEach((m) => remove(m));
  }, [programsLoaded, missing, remove, materialsVersion]);

  // Already in the cabinet: no reason to keep it in the cart.
  useEffect(() => {
    if (!isParticipant) return;
    lines.forEach((l) => ownedKeys.has(cartKey(l.entry)) && remove(l.entry));
  }, [lines, ownedKeys, isParticipant, remove]);

  const open = (item: CatalogItem) => (item.kind === "program" ? onOpenProgram(item.id) : item.kind === "guide" ? onOpenGuide(item.id) : onOpenMeditation(item.id));
  const inOrder = lines.filter((l) => !owned.has(cartKey(l.entry)));
  const payable = inOrder.filter((l) => !isFreePrice(l.item.price));
  const free = inOrder.filter((l) => isFreePrice(l.item.price));
  const totals = cartTotals(payable);
  const unpriced = cartTotals(inOrder).unpriced;

  // Free materials go from the cart to the cabinet («Моє навчання»); only free ones are ever sent.
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const claim = async (items: CatalogItem[]) => {
    const toAdd = items.filter((i) => isFreePrice(i.price));
    if (!toAdd.length) return;
    if (!userId || !isParticipant) return onRequireLogin();
    setClaiming(true);
    setClaimError(null);
    // One by one, so a single failure does not block the rest; whatever was added leaves the cart.
    const results = await Promise.allSettled(toAdd.map((i) => acquireContent(userId, [{ kind: i.kind, id: i.id }])));
    const done = toAdd.filter((_, n) => results[n].status === "fulfilled");
    done.forEach((i) => remove({ kind: i.kind, id: i.id }));
    if (done.length) setAddedCount((n) => n + done.length);
    results.forEach((r) => r.status === "rejected" && console.error("acquireContent failed:", r.reason));
    if (done.length < toAdd.length) setClaimError("Не вдалося додати в кабінет. Спробуйте ще раз трохи пізніше.");
    setClaiming(false);
  };

  return (
    <>
      <main className="min-h-screen pt-[112px] text-white sm:pt-[132px] lg:pt-[150px]">
        <div className="page-container pb-16">
          <h1 className="mb-1 text-[28px] font-bold leading-tight sm:text-[32px]">Кошик</h1>
          <p className="mb-6 text-[16px] font-medium text-white/85">
            {lines.length > 0 ? `${lines.length} ${materialsWord(lines.length)} у кошику` : "Тут зібрано те, що ви хочете почати."}
          </p>

          {addedCount > 0 && (
            <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-emerald-50 px-5 py-4 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.45)]">
              <p className="text-[15px] font-medium text-emerald-800">
                Додано в кабінет: {addedCount} {materialsWord(addedCount)}. Вони тепер у розділі «Моє навчання».
              </p>
              <button type="button" onClick={onOpenCabinet} className="min-h-[44px] rounded-xl bg-emerald-600 px-4 text-[14px] font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
                Перейти в кабінет
              </button>
            </div>
          )}
          {claimError && (
            <p role="alert" className="mb-5 rounded-[16px] bg-red-50 px-5 py-3 text-[14px] text-red-700">
              {claimError}
            </p>
          )}

          {lines.length === 0 ? (
            <EmptyCart onOpenCatalog={onOpenCatalog} onOpenGuides={onOpenGuides} onOpenMeditations={onOpenMeditations} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <ul className="flex flex-col gap-3">
                {[...lines].sort((a, b) => Number(isFreePrice(a.item.price)) - Number(isFreePrice(b.item.price))).map(({ entry, item }, idx, arr) => {
                  const isOwned = owned.has(cartKey(entry));
                  const isFree = isFreePrice(item.price);
                  // With both kinds in the cart, each group gets its own heading.
                  const mixed = arr.some((l) => isFreePrice(l.item.price)) && arr.some((l) => !isFreePrice(l.item.price));
                  const heading = mixed && (idx === 0 || isFreePrice(arr[idx - 1].item.price) !== isFree) ? (isFree ? "Безкоштовні" : "Платні") : null;
                  return (
                    <Fragment key={cartKey(entry)}>
                    {heading && <li aria-hidden="true" className={`px-1 text-[15px] font-semibold text-white/90 ${idx > 0 ? "mt-3" : ""}`}>{heading}</li>}
                    <li className="flex flex-col gap-4 rounded-[24px] bg-gradient-to-br from-white to-[#f1f1ff] p-4 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.55)] sm:min-h-[225px] sm:flex-row sm:items-center sm:gap-6 sm:p-6">
                      <button type="button" onClick={() => open(item)} aria-label={`Відкрити: ${item.title}`} className="flex shrink-0 rounded-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
                        <Tile item={item} />
                      </button>

                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <span className={`inline-block self-start rounded-full px-2.5 py-0.5 text-[12px] font-medium ${item.kind === "program" ? "bg-[#e4ecff] text-[#1d4ed8]" : "bg-[#ece9fd] text-[#4338ca]"}`}>{KIND_LABEL[item.kind]}</span>
                        <button type="button" onClick={() => open(item)} className="-my-3 mt-1 block self-start rounded-lg py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
                          <span className="block text-[16px] font-semibold leading-snug sm:text-[18px]">{item.title}</span>
                        </button>
                        {item.author && <div className="mt-1 text-[14px] text-slate-500">{item.author}</div>}
                        {item.description && <p className="mt-2 line-clamp-2 max-w-[560px] text-[14px] leading-relaxed text-slate-500">{item.description}</p>}
                        {isOwned ? (
                          <span className="mt-2 inline-block self-start rounded-full bg-[#eef0fd] px-3 py-1 text-[13px] font-medium text-[#4338ca]">Вже у вашому кабінеті</span>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 sm:min-h-[150px] sm:flex-col sm:items-end sm:self-stretch sm:justify-between sm:py-0.5">
                        {isFree ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-semibold text-emerald-700">Безкоштовно</span>
                        ) : (
                          <span className="text-[18px] font-semibold">{formatPrice(item.price)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => remove(entry)}
                          aria-label={`Видалити з кошика: ${item.title}`}
                          className="-mr-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-[14px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                        >
                          <TrashIcon />
                          Видалити
                        </button>
                      </div>
                    </li>
                    </Fragment>
                  );
                })}
              </ul>

              <aside aria-label="Ваше замовлення" className="rounded-[22px] bg-gradient-to-br from-white to-[#f1f1ff] p-5 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.55)] sm:p-6">
                <h2 className="text-[18px] font-bold leading-tight">Ваше замовлення</h2>

                {payable.length > 0 && (
                  <div className="mt-4 text-[15px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Платні матеріали:</span>
                      <span className="font-medium">{payable.length}</span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-slate-500">До сплати:</span>
                      <span className="text-[26px] font-bold leading-none">{totals.paidTotal.toLocaleString("uk-UA")} ₴</span>
                    </div>
                  </div>
                )}

                {payable.length > 0 ? (
                  <>
                    <button type="button" onClick={() => setNotice(true)} className={`${BTN} mt-5 min-h-[48px] text-[15px]`}>
                      Перейти до оплати <span aria-hidden="true" className="ml-2">→</span>
                    </button>
                    {notice && (
                      <p role="status" className="mt-3 text-[14px] leading-relaxed text-slate-500">
                        Оплата з’явиться найближчим часом. Ваш кошик збережений, нічого не втрачено.
                      </p>
                    )}
                  </>
                ) : inOrder.length === 0 ? (
                  <p className="mt-5 text-[14px] text-slate-500">Усе з кошика вже у вашому кабінеті.</p>
                ) : null}

                {unpriced > 0 && <p className="mt-4 text-[14px] text-slate-500">Для частини матеріалів ціна не вказана, вони не входять до суми.</p>}

                {free.length > 0 && (isParticipant || isGuest) && (
                  <div className={`mt-5 ${payable.length > 0 ? "border-t border-slate-200 pt-4" : ""}`}>
                    <div className="mb-3 flex items-center justify-between text-[15px]">
                      <span className="text-slate-500">Безкоштовні матеріали:</span>
                      <span className="font-medium">{free.length}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => claim(free.map((l) => l.item))}
                      disabled={claiming}
                      className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[16px] bg-gradient-to-r from-[#059669] to-[#10b981] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.65)] transition hover:opacity-90 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#059669] focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {isParticipant ? <path d="M12 5v14M5 12h14" /> : <path d="M15 4h4v16h-4M10 8l4 4-4 4M14 12H4" />}
                      </svg>
                      {claiming ? "Додаємо…" : isParticipant ? `Додати в кабінет${free.length > 1 ? ` (${free.length})` : ""}` : "Увійти, щоб додати"}
                    </button>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </main>
      <Footer onOpenTest={() => {}} onOpenCatalog={onOpenCatalog} />
    </>
  );
}
