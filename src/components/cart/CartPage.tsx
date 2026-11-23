import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { LEGAL } from "../../data/legalOperator";
import Footer from "../Footer";
import { useCart } from "../../lib/cartStore";
import { acquireContent } from "../../lib/acquired";
import { fetchPromoQuote, fetchSellerInfo, startMonoCheckout, type PromoQuote, type SellerInfo } from "../../lib/finance";
import { isBankPageUrl } from "../../utils/payment";
import ProgramCover from "../ProgramCover";
import MaterialVisual from "../author/public/MaterialVisual";
import { materialsReady, useMaterialsVersion } from "../../lib/materialsStore";
import { buildCartCatalog, type CartCatalogItem } from "../../utils/cartCatalog";
import { useCartView } from "../../lib/useCartView";
import { cartKey, cartTotals, materialsWord, type CartKind } from "../../utils/cart";
import { formatPrice, isFreePrice } from "../../utils/price";
import { categoryLabelForTags } from "../../utils/catalogFilters";
import type { Profile } from "../../lib/auth";

// the immediate-access request — word for word from docs/legal/participant-agreement.md (the server stores it per order
// with the seller filled in)
const IMMEDIATE_TEMPLATE =
  "Прошу надати доступ до цифрового матеріалу одразу після оплати. Я розумію, що після надання доступу право розірвати договір протягом 14 днів без пояснення причин не застосовується (пункт 1 частини п’ятої статті 13 Закону України «Про захист прав споживачів»), а повернення коштів можливе у випадках, передбачених Правилами повернення коштів і законом. Продавець — {{назва ФОП/ТОВ автора}}.";
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
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-[16px] bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,87,255,0.6)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";

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
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  // an author's promo code: checked and priced on the server for each paid material in the cart (offer Б33)
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; quotes: Record<string, PromoQuote> } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  // ТЗ 3.1–3.2: the seller of each paid material and the buyer's explicit request for access right after payment
  const [sellers, setSellers] = useState<Record<string, SellerInfo>>({});
  // the seller could not be named (not for sale, network): it must be shown before payment, so that item cannot be paid
  const [sellerFailed, setSellerFailed] = useState<Record<string, string>>({});
  const [immediate, setImmediate] = useState(false);
  // two steps: the cart (summary, promo) → a screen of its own with the seller and the immediate-access request,
  // right before the bank's page — the long legal text gets a wide panel instead of stretching the sidebar
  const [step, setStep] = useState<"cart" | "confirm">("cart");
  const goStep = (next: "cart" | "confirm") => {
    setStep(next);
    setPayError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const checkout = () => {
    if (!userId) return onRequireLogin();
    if (!isParticipant) {
      setPayError("Купувати матеріали можуть учасники. Увійдіть в обліковий запис учасника.");
      return;
    }
    goStep("confirm");
  };

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
  const payableKey = payable.map((l) => l.item.id).join(",");
  useEffect(() => {
    if (!userId || !isParticipant || !payableKey) return;
    let cancelled = false;
    void Promise.allSettled(payableKey.split(",").map((id) => fetchSellerInfo(id).then((r) => [id, r] as const))).then((res) => {
      if (cancelled) return;
      const next: Record<string, SellerInfo> = {};
      const failed: Record<string, string> = {};
      const ids = payableKey.split(",");
      res.forEach((r, n) => {
        if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
        else failed[ids[n]] = r.reason instanceof Error ? r.reason.message : "Не вдалося визначити продавця.";
      });
      setSellers(next);
      setSellerFailed(failed);
    });
    return () => { cancelled = true; };
  }, [payableKey, userId, isParticipant]);
  const consentText =
    payable.length === 1 && sellers[payable[0].item.id]
      ? sellers[payable[0].item.id].consentText
      : IMMEDIATE_TEMPLATE.replace("{{назва ФОП/ТОВ автора}}", "зазначений біля кожного матеріалу вище");
  const quoteFor = (item: CatalogItem) => promo?.quotes[item.id];
  const discountTotal = payable.reduce((n, l) => n + (quoteFor(l.item)?.discountKop ?? 0), 0) / 100;
  const priceLabel = (item: CatalogItem) => {
    const q = quoteFor(item);
    return q ? `${(q.amountKop / 100).toLocaleString("uk-UA")} ₴` : formatPrice(item.price);
  };
  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (!userId || !isParticipant) return onRequireLogin();
    setPromoBusy(true);
    setPromoMsg(null);
    const results = await Promise.allSettled(payable.map((l) => fetchPromoQuote(l.item.id, code)));
    const quotes: Record<string, PromoQuote> = {};
    results.forEach((r, n) => {
      if (r.status === "fulfilled" && r.value.discountKop > 0) quotes[payable[n].item.id] = r.value;
    });
    const count = Object.keys(quotes).length;
    setPromo(count ? { code, quotes } : null);
    setPromoMsg(count ? `Промокод застосовано: ${count === 1 ? "1 матеріал" : `${count} матеріали`}.` : "Промокод недійсний для матеріалів у кошику.");
    setPromoBusy(false);
  };
  const unpriced = cartTotals(inOrder).unpriced;

  // Paid: one material = one payment on monobank's page. The server fixes the price and the split; the browser only names the material.
  const pay = async (item: CatalogItem) => {
    if (!userId) return onRequireLogin();
    if (!isParticipant) {
      setPayError("Купувати матеріали можуть учасники. Увійдіть в обліковий запис учасника.");
      return;
    }
    if (!immediate) {
      setPayError("Підтвердьте, що хочете отримати доступ одразу після оплати.");
      return;
    }
    setPaying(item.id);
    setPayError(null);
    try {
      const r = await startMonoCheckout(item.id, quoteFor(item) ? promo?.code : undefined);
      if (!isBankPageUrl(r.pageUrl)) throw new Error("Банк повернув неочікуване посилання. Спробуйте пізніше.");
      window.location.assign(r.pageUrl);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Не вдалося створити оплату. Спробуйте ще раз.");
      setPaying(null);
    }
  };

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
          {/* the same size as «Каталог програм»; the confirm step has its own title in the same place, so its block starts
              exactly where the cart's first card does */}
          {step === "confirm" && payable.length > 0 ? (
            <div>
              <h1 className="mb-2 text-[32px] font-bold leading-tight sm:text-[40px]">Оформлення замовлення</h1>
              <p className="mb-6 text-[16px] text-white/70">
                {payable.length} {materialsWord(payable.length)} до оплати · перевірте продавця й підтвердьте згоду
              </p>
            </div>
          ) : (
            <div>
              <h1 className="mb-2 text-[32px] font-bold leading-tight sm:text-[40px]">Кошик</h1>
              <p className="mb-6 text-[16px] text-white/70">
                {lines.length > 0 ? `${lines.length} ${materialsWord(lines.length)} у кошику` : "Тут зібрано те, що ви хочете почати."}
              </p>
            </div>
          )}

          {addedCount > 0 && (
            <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-gradient-to-r from-[#eef0fd] to-[#f6f1ff] ring-1 ring-[#e4def9] px-5 py-4 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.45)]">
              <p className="text-[15px] font-medium text-[#2d2a5c]">
                Додано в кабінет: {addedCount} {materialsWord(addedCount)}. Вони тепер у розділі «Моє навчання».
              </p>
              <button type="button" onClick={onOpenCabinet} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2">
                Перейти в кабінет
              </button>
            </div>
          )}
          {claimError && (
            <p role="alert" className="mb-5 rounded-[16px] bg-red-50 px-5 py-3 text-[14px] text-red-700">
              {claimError}
            </p>
          )}

          {step === "confirm" && payable.length > 0 ? (
            <section aria-labelledby="cart-confirm" className="rounded-[24px] bg-gradient-to-br from-white to-[#f1f1ff] p-5 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.55)] sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => goStep("cart")} className="-ml-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2 text-[14px] font-medium text-slate-500 hover:bg-[#eef0fd] hover:text-[#4338ca] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
                  <span aria-hidden="true">←</span> Назад до кошика
                </button>
                {/* where the buyer is: cart → confirmation → the bank's page */}
                <ol aria-label="Кроки оформлення" className="flex items-center gap-2 text-[12px] font-semibold">
                  {(["Кошик", "Підтвердження", "Оплата в банку"] as const).map((label, n) => (
                    <li key={label} className="flex items-center gap-2">
                      {n > 0 && <span aria-hidden="true" className="h-px w-5 bg-[#d9d4f7] sm:w-8" />}
                      <span aria-current={n === 1 ? "step" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${n === 1 ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white" : n === 0 ? "bg-[#eef0fd] text-[#4338ca]" : "bg-white text-slate-400 ring-1 ring-[#e3e6f4]"}`}>
                        {n === 0 ? <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9 17.5 20 6.5" /></svg> : <span aria-hidden="true">{n + 1}</span>}
                        <span className={n === 1 ? "" : "hidden sm:inline"}>{label}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-5 flex items-center gap-3.5">
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_8px_18px_-8px_rgba(91,61,245,0.7)]">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5l-7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
                </span>
                <div className="min-w-0">
                  <h2 id="cart-confirm" className="text-[24px] font-bold leading-tight sm:text-[28px]">Підтвердження замовлення</h2>
                  <p className="text-[14px] text-slate-500">Останній крок перед оплатою на захищеній сторінці банку.</p>
                </div>
              </div>

              <ul className="mt-6 flex flex-col gap-2.5">
                {payable.map((l) => (
                  <li key={cartKey(l.entry)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] bg-white px-4 py-4 ring-1 ring-[#ebe8ff] sm:px-5">
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${l.item.kind === "program" ? "bg-[#e4ecff] text-[#1d4ed8]" : "bg-[#ece9fd] text-[#4338ca]"}`}>{KIND_LABEL[l.item.kind]}</span>
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[16px] font-semibold leading-snug text-[#1d2240]">{l.item.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-500">
                        {sellers[l.item.id] ? (
                          <>
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>
                            Продавець: {sellers[l.item.id].legalName} · {sellers[l.item.id].codeMasked}
                          </>
                        ) : sellerFailed[l.item.id] ? (
                          <span className="text-red-700">{sellerFailed[l.item.id]} Цей матеріал зараз не можна оплатити.</span>
                        ) : (
                          "Продавець: завантажуємо…"
                        )}
                      </div>
                    </div>
                    <div className="text-[17px] font-semibold">{priceLabel(l.item)}</div>
                    {/* the seller in full before payment (ЗУ «Про електронну комерцію», ст. 7; lawyer, Ю-2.1) */}
                    {sellers[l.item.id] && (
                      <details className="basis-full text-[13px] text-slate-600">
                        <summary className="cursor-pointer font-medium text-[#4338ca] underline-offset-2 hover:underline">Відомості про продавця</summary>
                        <p className="mt-2 leading-relaxed">
                          Продавець: {sellers[l.item.id].legalName}, {sellers[l.item.id].codeMasked}.
                          {sellers[l.item.id].address ? ` Місцезнаходження: ${sellers[l.item.id].address}.` : ""} Претензії щодо матеріалу й оплати приймає Sensoria за дорученням продавця:{" "}
                          <a href={`mailto:${LEGAL.email}`} className="underline underline-offset-2">{LEGAL.email}</a>.
                        </p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-slate-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>
                Sensoria — оператор платформи (технічні послуги). Оплату приймає банк.
              </p>

              <label className={`mt-6 flex cursor-pointer items-start gap-3.5 rounded-[20px] p-4 ring-1 transition-colors sm:p-5 ${immediate ? "bg-gradient-to-br from-[#eef0fd] to-[#f3eeff] ring-[#c9cffa]" : "bg-gradient-to-br from-[#f8f8ff] to-[#f6f3ff] ring-[#e4def9]"}`}>
                <input type="checkbox" checked={immediate} onChange={(e) => { setImmediate(e.target.checked); setPayError(null); }} className="mt-[3px] h-[20px] w-[20px] shrink-0 cursor-pointer accent-[#4338ca]" />
                <span className="text-[14px] leading-relaxed text-slate-800">{consentText}</span>
              </label>
              <p className="mt-2.5 text-[12px] text-slate-500">
                <a href="/refunds" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Правила повернення коштів</a>
              </p>

              <p className="mt-5 text-[13px] leading-relaxed text-slate-600">
                Оплачуючи замовлення на сторінці банку, ви купуєте доступ до матеріалу в продавця на умовах{" "}
                <a href="/participant-agreement" target="_blank" rel="noopener" className="font-semibold text-[#4338ca] underline underline-offset-2">Угоди учасника</a>. Доступ — у «Моєму навчанні» одразу після оплати, без обмеження строку, доки працює Платформа.
              </p>
              <div className="mt-4 flex flex-col gap-4 rounded-[20px] bg-white p-4 ring-1 ring-[#ebe8ff] sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  {discountTotal > 0 && (
                    <div className="mb-1 text-[13px] text-slate-500">
                      <span className="line-through">{totals.paidTotal.toLocaleString("uk-UA")} ₴</span>
                      <span className="ml-2 font-medium text-[#4338ca]">−{discountTotal.toLocaleString("uk-UA")} ₴ за промокодом</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-3">
                    <span className="text-[15px] font-medium text-[#4b4f6b]">До сплати</span>
                    <span className="text-[32px] font-bold leading-none text-[#12172b]">{(totals.paidTotal - discountTotal).toLocaleString("uk-UA")} ₴</span>
                  </div>
                  {payable.length > 1 && <p className="mt-1 text-[12px] text-slate-500">Кожен матеріал оплачується окремо.</p>}
                </div>
                {payable.length === 1 ? (
                  <div className="sm:w-[340px]">
                    <button type="button" onClick={() => pay(payable[0].item)} disabled={paying !== null || !immediate || !sellers[payable[0].item.id]} className={`${BTN} min-h-[52px] text-[15px] shadow-[0_12px_26px_-12px_rgba(91,61,245,0.7)] disabled:opacity-60 disabled:shadow-none`}>
                      {paying ? "Переходимо до оплати…" : <>Перейти до оплати <span aria-hidden="true" className="ml-2">→</span></>}
                    </button>
                    {!immediate && <p className="mt-2 text-center text-[12px] text-slate-500">Позначте згоду вище, щоб перейти до оплати</p>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:items-end">
                    {payable.map((l) => (
                      <button
                        key={cartKey(l.entry)}
                        type="button"
                        onClick={() => pay(l.item)}
                        disabled={paying !== null || !immediate || !sellers[l.item.id]}
                        aria-label={`Оплатити: ${l.item.title}`}
                        className="inline-flex min-h-[46px] max-w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2 disabled:opacity-60"
                      >
                        <span className="truncate">{paying === l.item.id ? "Зачекайте…" : `Оплатити «${l.item.title}» · ${priceLabel(l.item)}`}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {payError && (
                <p role="alert" className="mt-3 rounded-[14px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
                  {payError}
                </p>
              )}
            </section>
          ) : lines.length === 0 ? (
            <EmptyCart onOpenCatalog={onOpenCatalog} onOpenGuides={onOpenGuides} onOpenMeditations={onOpenMeditations} />
          ) : (
            <div className="flex flex-col gap-6">
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
                        {item.description && <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-slate-500">{item.description}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {isOwned ? (
                            <span className="rounded-full bg-[#eef0fd] px-3 py-1 text-[13px] font-medium text-[#4338ca]">Вже у вашому кабінеті</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f1ff] px-3 py-1 text-[12px] font-medium text-[#5b3df5] ring-1 ring-[#e4def9]">
                              <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9 17.5 20 6.5" /></svg>
                              {isFree ? "Додається в кабінет без оплати" : "Доступ одразу після оплати"}
                            </span>
                          )}
                          {categoryLabelForTags(item.tags) && (
                            <span className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-[#e3e6f4]">{categoryLabelForTags(item.tags)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 sm:min-h-[150px] sm:flex-col sm:items-end sm:self-stretch sm:justify-between sm:py-0.5">
                        {isFree ? (
                          <span className="rounded-full bg-[#f1eeff] px-3 py-1 text-[13px] font-semibold text-[#6d5bd0]">Безкоштовно</span>
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

              {/* «Ваше замовлення»: one block, one thing after another — what is in the order, what happens next, the total,
                  the promo code and the next step */}
              <section aria-labelledby="cart-summary" className="rounded-[24px] bg-gradient-to-br from-white to-[#f1f1ff] p-5 text-slate-900 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.55)] sm:p-7">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_8px_18px_-8px_rgba(91,61,245,0.7)]">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1l1.4-6.3H6.6" /><circle cx="10" cy="19.5" r="1.2" /><circle cx="17" cy="19.5" r="1.2" /></svg>
                  </span>
                  <div className="min-w-0">
                    <h2 id="cart-summary" className="text-[20px] font-bold leading-tight">Ваше замовлення</h2>
                    <p className="text-[13px] text-slate-500">{inOrder.length} {materialsWord(inOrder.length)}{free.length > 0 && payable.length > 0 ? ` · ${payable.length} платн${payable.length === 1 ? "ий" : "і"}, ${free.length} безкоштовн${free.length === 1 ? "ий" : "і"}` : ""}</p>
                  </div>
                </div>

                {inOrder.length > 0 ? (
                  <ul className="mt-5 flex flex-col gap-2">
                    {[...payable, ...free].map((l) => {
                      const isFree = isFreePrice(l.item.price);
                      return (
                        <li key={cartKey(l.entry)} className="flex items-center gap-3 rounded-[16px] bg-white px-4 py-3.5 ring-1 ring-[#ebe8ff]">
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${l.item.kind === "program" ? "bg-[#e4ecff] text-[#1d4ed8]" : "bg-[#ece9fd] text-[#4338ca]"}`}>{KIND_LABEL[l.item.kind]}</span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#1d2240]">{l.item.title}</span>
                          {isFree ? (
                            <span className="shrink-0 rounded-full bg-[#f1eeff] px-2.5 py-0.5 text-[12px] font-semibold text-[#6d5bd0]">Безкоштовно</span>
                          ) : (
                            <span className="shrink-0 text-[15px] font-semibold">
                              {quoteFor(l.item) && <span className="mr-2 text-[13px] font-normal text-slate-400 line-through">{formatPrice(l.item.price)}</span>}
                              {priceLabel(l.item)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-4 text-[14px] text-slate-500">Усе з кошика вже у вашому кабінеті.</p>
                )}
                {unpriced > 0 && <p className="mt-3 text-[13px] text-slate-500">Для частини матеріалів ціна не вказана, вони не входять до суми.</p>}

                {payable.length > 0 && (
                  <>
                    <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
                      {([
                          ["Доступ одразу", "Матеріал з’явиться в «Моєму навчанні» після оплати.", <path key="p" d="M4 12.5 9 17.5 20 6.5" />],
                          ["Чек на пошту", "Фіскальний чек продавця надійде на вашу електронну пошту.", <><rect key="r" x="4" y="5.5" width="16" height="13" rx="2" /><path key="p" d="m4.5 7 7.5 6 7.5-6" /></>],
                          ["Оплата в банку", "Дані картки вводяться лише на захищеній сторінці monobank.", <><rect key="r" x="5" y="10.5" width="14" height="9.5" rx="2" /><path key="p" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>],
                        ] as const).map(([title, text, glyph]) => (
                        <li key={title} className="flex gap-3 rounded-[16px] bg-[#f6f5ff] p-3.5 ring-1 ring-[#ebe8ff]">
                          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#5b3df5] ring-1 ring-[#e4def9]">
                            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold text-[#1d2240]">{title}</span>
                            <span className="mt-0.5 block text-[12px] leading-snug text-slate-500">{text}</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 rounded-[20px] bg-gradient-to-br from-[#f3f4ff] to-[#f6f1ff] p-4 ring-1 ring-[#e4def9] sm:p-5">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void applyPromo();
                        }}
                      >
                        <label htmlFor="cart-promo" className="text-[13px] font-semibold text-[#2d2a5c]">Промокод автора</label>
                        <div className="mt-1.5 flex max-w-[520px] gap-2">
                          <input
                            id="cart-promo"
                            value={promoInput}
                            onChange={(e) => setPromoInput(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 20))}
                            autoComplete="off"
                            placeholder="Наприклад, STRESS20"
                            className="min-h-[44px] min-w-0 flex-1 rounded-[14px] bg-white px-3.5 text-[15px] uppercase tracking-wide ring-1 ring-[#d9d4f7] placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                          />
                          <button
                            type="submit"
                            disabled={promoBusy || !promoInput.trim()}
                            className="min-h-[44px] shrink-0 rounded-[14px] bg-white px-4 text-[14px] font-semibold text-[#3b27a8] ring-1 ring-[#c9cffa] hover:bg-[#eef0fd] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                          >
                            {promoBusy ? "Перевіряємо…" : "Застосувати"}
                          </button>
                        </div>
                        {promoMsg && <p role="status" className={`mt-2 text-[13px] ${promo ? "text-[#4338ca]" : "text-red-700"}`}>{promoMsg}</p>}
                      </form>

                      <div className="mt-4 flex flex-col gap-4 border-t border-[#e4def9] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          {discountTotal > 0 && (
                            <div className="mb-1 text-[13px] text-slate-500">
                              <span className="line-through">{totals.paidTotal.toLocaleString("uk-UA")} ₴</span>
                              <span className="ml-2 font-medium text-[#4338ca]">−{discountTotal.toLocaleString("uk-UA")} ₴ за промокодом</span>
                            </div>
                          )}
                          <div className="flex items-baseline gap-3">
                            <span className="text-[15px] font-medium text-[#4b4f6b]">До сплати</span>
                            <span className="text-[32px] font-bold leading-none text-[#12172b]">{(totals.paidTotal - discountTotal).toLocaleString("uk-UA")} ₴</span>
                          </div>
                          {payable.length > 1 && <p className="mt-1 text-[12px] text-slate-500">Кожен матеріал оплачується окремо</p>}
                        </div>
                        <div className="sm:w-[340px]">
                          <button type="button" onClick={checkout} className={`${BTN} min-h-[52px] text-[15px] shadow-[0_12px_26px_-12px_rgba(91,61,245,0.7)]`}>
                            Оформити замовлення <span aria-hidden="true" className="ml-2">→</span>
                          </button>
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-slate-500">
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
                            Далі — підтвердження, потім оплата на сторінці банку
                          </p>
                        </div>
                      </div>
                      {payError && step === "cart" && (
                        <p role="alert" className="mt-3 rounded-[14px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
                          {payError}
                        </p>
                      )}
                    </div>
                  </>
                )}

                {free.length > 0 && (isParticipant || isGuest) && (
                  <div className="mt-5 flex flex-col gap-3 rounded-[20px] bg-white p-4 ring-1 ring-[#ebe8ff] sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <p className="text-[14px] text-[#4b4f6b]">
                      {free.length === 1 ? "Безкоштовний матеріал додається" : `Безкоштовні матеріали (${free.length}) додаються`} в кабінет без оплати.
                    </p>
                    <button
                      type="button"
                      onClick={() => claim(free.map((l) => l.item))}
                      disabled={claiming}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[16px] px-5 text-[15px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2 disabled:opacity-60 sm:w-[340px] ${payable.length > 0 ? "bg-white text-[#3b27a8] ring-1 ring-[#c9cffa] hover:bg-[#eef0fd]" : "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white shadow-[0_10px_24px_-12px_rgba(91,61,245,0.7)] hover:opacity-90"}`}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {isParticipant ? <path d="M12 5v14M5 12h14" /> : <path d="M15 4h4v16h-4M10 8l4 4-4 4M14 12H4" />}
                      </svg>
                      {claiming ? "Додаємо…" : isParticipant ? `Додати в кабінет${free.length > 1 ? ` (${free.length})` : ""}` : "Увійти, щоб додати"}
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <Footer onOpenCatalog={onOpenCatalog} />
    </>
  );
}
