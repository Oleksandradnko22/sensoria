// Where monobank sends the buyer back (/payment-result?pay=<id>). The page asks OUR server for the result
// (the server checks the bank's signed webhook, or asks the bank itself) and never trusts the address bar.
import { useEffect, useState } from "react";
import Footer from "../components/Footer";
import { ACQUIRED_EVENT } from "../lib/acquired";
import { removeFromCartForOwner } from "../lib/cartStore";
import { fetchMonoStatus } from "../lib/finance";
import type { Profile } from "../lib/auth";
import { isPending, paymentView } from "../utils/payment";

type Props = {
  session: Profile | null | undefined; // undefined while the session is being restored
  onOpenCabinet: () => void;
  onOpenCart: () => void;
  onOpenCatalog: () => void;
  onRequireLogin: () => void;
};

const POLL_MS = 3000;
const POLL_TRIES = 20; // about a minute; after that we say honestly that the bank is still working

const PRIMARY =
  "inline-flex min-h-[48px] items-center justify-center rounded-[16px] bg-gradient-to-r from-[#0057ff] to-[#7b2cff] px-6 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(0,87,255,0.6)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";
const SECONDARY =
  "inline-flex min-h-[48px] items-center justify-center rounded-[16px] border border-[#d9d4f5] bg-white px-6 text-[16px] font-semibold text-[#4338ca] transition hover:bg-[#f4f2ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";

export default function PaymentResultPage({ session, onOpenCabinet, onOpenCart, onOpenCatalog, onRequireLogin }: Props) {
  const pay = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("pay");
  const [status, setStatus] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.id;

  useEffect(() => {
    if (!pay || !userId) return;
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await fetchMonoStatus(pay);
        if (stopped) return;
        setError(null);
        setStatus(r.status);
        if (r.status === "success") {
          // the paid material leaves the cart and appears in «Моє навчання»
          (["program", "guide", "meditation"] as const).forEach((kind) => removeFromCartForOwner({ kind, id: r.contentId }));
          window.dispatchEvent(new Event(ACQUIRED_EVENT));
        }
        if (!isPending(r.status)) return;
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : "Не вдалося перевірити оплату.");
      }
      tries += 1;
      if (tries >= POLL_TRIES) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [pay, userId]);

  const view = paymentView(status, timedOut);
  const waiting = view.kind === "wait" && !timedOut;

  let body;
  if (!pay) {
    body = (
      <>
        <h1 className="text-[24px] font-bold leading-tight">Не знайдено оплату</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-slate-600">Посилання неповне. Якщо ви щойно платили, перевірте розділ «Моє навчання».</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={onOpenCabinet} className={PRIMARY}>Моє навчання</button>
          <button type="button" onClick={onOpenCatalog} className={SECONDARY}>До каталогу</button>
        </div>
      </>
    );
  } else if (session === undefined) {
    body = <p role="status" className="text-[16px] text-slate-600">Завантажуємо…</p>;
  } else if (session === null) {
    body = (
      <>
        <h1 className="text-[24px] font-bold leading-tight">Увійдіть, щоб побачити результат</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-slate-600">Оплата прив’язана до вашого облікового запису.</p>
        <div className="mt-6">
          <button type="button" onClick={onRequireLogin} className={PRIMARY}>Увійти</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div role="status" aria-live="polite">
          <h1 className="text-[24px] font-bold leading-tight">{view.title}</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-slate-600">{view.text}</p>
          {error && view.kind === "wait" && <p className="mt-3 text-[14px] text-amber-700">{error}</p>}
          {waiting && <div aria-hidden="true" className="mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-[#e4e0fb]"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#5b3df5]" /></div>}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {view.kind === "paid" && <button type="button" onClick={onOpenCabinet} className={PRIMARY}>Перейти до навчання</button>}
          {view.kind === "failed" && <button type="button" onClick={onOpenCart} className={PRIMARY}>Повернутися до кошика</button>}
          {(view.kind === "review" || (view.kind === "wait" && timedOut)) && <button type="button" onClick={onOpenCabinet} className={PRIMARY}>Моє навчання</button>}
          {view.kind !== "wait" || timedOut ? <button type="button" onClick={onOpenCatalog} className={SECONDARY}>До каталогу</button> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen pt-[112px] text-slate-900 sm:pt-[132px] lg:pt-[150px]">
        <div className="page-container pb-16">
          <section className="mx-auto max-w-[620px] rounded-[24px] bg-gradient-to-br from-white to-[#f1f1ff] p-6 shadow-[0_16px_40px_-26px_rgba(30,41,99,0.55)] sm:p-9">{body}</section>
        </div>
      </main>
      <Footer onOpenTest={() => {}} onOpenCatalog={onOpenCatalog} />
    </>
  );
}
