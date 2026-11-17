// «Оплати»: the participant's purchase history (`purchases`) as a small dashboard: the latest purchase, totals,
// filters and every purchase with its number and a receipt. A material opens in «Моє навчання». With no purchases
// yet the demo (SHOW_DEMO) shows how the section looks after the first one; it disappears with a real purchase.
// «Квитанція» downloads a PDF at once. The refund request (the existing 14-day flow) is one quiet link in «Проблема з
// оплатою?», shown only while some purchase is still inside the window: no reminders elsewhere.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import FilterPills from "./FilterPills";
import { SHOW_DEMO } from "../../utils/demoMode";
import { useSession } from "../../context/SessionContext";
import { fetchMyPurchases } from "../../lib/purchases";
import { submitRefundRequest } from "../../lib/refunds";
import { billingDemoOn, BILLING_DEMO } from "../../dev/billingPreview";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import { isWithinRefundWindow, REFUND_WINDOW_DAYS } from "../../utils/refundWindow";
import {
  STATUS_LABEL,
  KIND_LABEL,
  formatAmount,
  grantsAccess,
  purchasesToCsv,
  shortOrderId,
  type PurchaseKind,
  type PurchaseStatus,
  type PurchaseView,
} from "../../utils/purchasesView";
import { useModal } from "../author/public/useModal";
import { downloadReceiptPdf } from "../../lib/receiptPdf";

// Enough words to force a real explanation, not an essay.
const MIN_REFUND_REASON_WORDS = 20;
const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const STATUS_STYLE: Record<PurchaseStatus, string> = {
  paid: "bg-emerald-50 text-emerald-800",
  free: "bg-[#eef0fd] text-[#4338ca]",
  pending: "bg-amber-50 text-amber-800",
  unpaid: "bg-rose-50 text-rose-800",
  refunded: "bg-black/[0.06] text-black/70",
};

type Props = {
  onNavigate?: (key: "learning" | "help") => void;
  /** opens the material in «Моє навчання» */
  onOpenMaterial?: (kind: PurchaseKind, id: string) => void;
  active?: boolean;
};

function Badge({ status }: { status: PurchaseStatus }) {
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

const CARD = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
type Filter = "all" | "paid" | "free" | "refunded";
const hasReceipt = (p: PurchaseView) => p.amount > 0 && (p.status === "paid" || p.status === "refunded");
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

export default function ParticipantBilling({ onNavigate, onOpenMaterial, active = true }: Props) {
  const session = useSession();
  const myId = session?.profile.id;
  const forcedDemo = billingDemoOn();
  const [rows, setRows] = useState<PurchaseView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refundOpen, setRefundOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // quiet refresh when the (always-mounted) section is reopened
  const load = (quiet = false) => {
    if (!myId) return;
    if (!quiet) setState("loading");
    fetchMyPurchases(myId)
      .then((r) => {
        setRows(r);
        setState("ready");
      })
      .catch(() => !quiet && setState("error"));
  };
  const first = useRef(true);
  useEffect(() => {
    if (!active) return;
    load(!first.current);
    first.current = false;
  }, [myId, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const demo = forcedDemo || (SHOW_DEMO && state === "ready" && rows.length === 0);
  const all = [...(demo ? BILLING_DEMO : []), ...rows].sort((a, b) => b.date.localeCompare(a.date));
  const refundable = rows.filter((p) => p.status === "paid" && !!p.title && !!p.kind && isWithinRefundWindow(p.date));

  const receipt = async (p: PurchaseView) => {
    setPdfBusy(p.id);
    setPdfError(null);
    try {
      const number = shortOrderId(p.id);
      const lines: [string, string][] = [
        ["Номер покупки", number],
        ["Дата й час", `${formatAbsoluteDate(p.date)}, ${fmtTime(p.date)}`],
        ["Матеріал", title(p)],
        ...(p.kind ? [["Тип", KIND_LABEL[p.kind]] as [string, string]] : []),
        ...(p.author ? [["Автор", p.author] as [string, string]] : []),
        // Seller's legal name (ФОП/ТОВ) comes with the seller block of release C; until then the author is named as the seller.
        ["Продавець", p.author ? `автор матеріалу — ${p.author}` : "автор матеріалу"],
        ...(session?.profile.name ? [["Покупець", session.profile.name] as [string, string]] : []),
        ["Спосіб оплати", "Картка, через monobank"],
        ["Статус", STATUS_LABEL[p.status]],
        ["Сума", formatAmount(p.amount)],
      ];
      await downloadReceiptPdf(lines, number, "Не є фіскальним чеком. Фіскальний чек видає продавець. Оплату прийнято через monobank; дані картки Sensoria не отримує й не зберігає.");
    } catch {
      setPdfError("Не вдалося створити PDF. Спробуйте ще раз.");
    } finally {
      setPdfBusy(null);
    }
  };
  const shown = all.filter((p) => filter === "all" || p.status === filter);
  const latest = all[0] ?? null;

  const canOpen = (p: PurchaseView) => !!p.title && !!p.kind && grantsAccess(p) && !!onOpenMaterial;
  const open = (p: PurchaseView) => {
    if (canOpen(p)) onOpenMaterial?.(p.kind!, p.siteId ?? p.contentId);
  };

  const exportCsv = () => {
    const blob = new Blob([purchasesToCsv(rows, formatAbsoluteDate)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sensoria-pokupky.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const title = (p: PurchaseView) => p.title ?? "Матеріал більше недоступний";
  const ready = (state === "ready" || demo) && all.length > 0;
  const count = (f: Filter) => all.filter((p) => f === "all" || p.status === f).length;

  const MaterialName = ({ p, className }: { p: PurchaseView; className: string }) =>
    canOpen(p) ? (
      <button type="button" onClick={() => open(p)} className={`${className} text-left text-[#12172b] hover:text-[#4338ca]`}>{title(p)}</button>
    ) : (
      <span className={`${className} ${p.title ? "text-[#12172b]" : "text-black/60"}`}>{title(p)}</span>
    );
  const ReceiptButton = ({ p }: { p: PurchaseView }) =>
    hasReceipt(p) ? (
      <button type="button" onClick={() => void receipt(p)} disabled={pdfBusy === p.id} aria-label={`Квитанція PDF: ${title(p)}`} className="disabled:opacity-50 inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-3 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] hover:ring-[#c9bff7]">
        {pdfBusy === p.id ? "Створюємо…" : "Квитанція PDF"}
      </button>
    ) : (
      <span className="text-[13px] text-black/40">Без оплати</span>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Оплати</h1>
          <p className="mt-1 text-[15px] text-black/55">Історія ваших покупок на Sensoria.</p>
        </div>
        {state === "ready" && rows.length > 0 && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white ring-1 ring-[#e3def9] text-[14px] font-semibold text-[#4338ca] hover:bg-[#f6f4ff]">
            <Icon name="clip" size={16} />
            Експорт історії
          </button>
        )}
      </div>

      {state === "loading" && !demo && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Завантаження покупок">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-[22px] bg-white ring-1 ring-[#ece8fb] animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && !demo && (
        <div role="alert" className={`${CARD} px-6 py-10 text-center`}>
          <div className="text-[16px] font-semibold text-[#12172b]">Не вдалося завантажити покупки</div>
          <p className="text-[14px] text-black/60 mt-1">Перевірте з'єднання і спробуйте ще раз.</p>
          <button onClick={() => load()} className="mt-3 min-h-[44px] px-5 rounded-xl ring-1 ring-[#e3def9] text-[14px] font-semibold text-[#4338ca] hover:bg-[#f6f4ff]">
            Спробувати ще раз
          </button>
        </div>
      )}

      {state === "ready" && !demo && all.length === 0 && (
        <div className={`${CARD} px-6 py-10 text-center`}>
          <span className="mx-auto w-14 h-14 rounded-2xl bg-[#f1eeff] text-[#7a68e0] flex items-center justify-center">
            <Icon name="card" size={24} />
          </span>
          <div className="text-[18px] font-bold text-[#12172b] mt-4">Покупок поки немає</div>
          <p className="text-[14px] text-black/60 mt-1 max-w-[420px] mx-auto leading-relaxed">
            Тут з’явиться історія ваших покупок на Sensoria: програм, гайдів та медитацій.
          </p>
          {onNavigate && (
            <button onClick={() => onNavigate("learning")} className="mt-4 min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold hover:opacity-95">
              Перейти до навчання
            </button>
          )}
        </div>
      )}

      {ready && latest && (
        <section aria-labelledby="bill-latest" className="rounded-[26px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] p-5 shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#e4def9] sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name={latest.kind ?? "card"} size={24} /></span>
            <div className="min-w-0 flex-1">
              <div id="bill-latest" className="text-[13px] font-semibold uppercase tracking-wide text-[#6d5bd0]">Остання покупка</div>
              <div className="mt-0.5 text-[22px] font-bold leading-tight text-[#12172b]">{title(latest)}</div>
              <p className="mt-0.5 text-[14px] text-black/60">
                {[latest.kind ? KIND_LABEL[latest.kind] : null, latest.author, formatAbsoluteDate(latest.date), formatAmount(latest.amount)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {canOpen(latest) && (
                <button type="button" onClick={() => open(latest)} className="min-h-[46px] whitespace-nowrap rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95">
                  Відкрити в «Моє навчання»
                </button>
              )}
              {hasReceipt(latest) && (
                <button type="button" onClick={() => void receipt(latest)} disabled={pdfBusy === latest.id} className="disabled:opacity-50 min-h-[46px] whitespace-nowrap rounded-xl bg-white px-5 text-[14px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] hover:bg-[#faf9ff]">
                  {pdfBusy === latest.id ? "Створюємо…" : "Квитанція PDF"}
                </button>
              )}
            </div>
          </div>
        </section>
      )}


      {ready && (
        <FilterPills
          label="Фільтр покупок"
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "Усі", count: count("all") },
            { key: "paid", label: "Оплачені", count: count("paid") },
            { key: "free", label: "Безкоштовні", count: count("free") },
            { key: "refunded", label: "Повернені", count: count("refunded") },
          ]}
        />
      )}

      {pdfError && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-800 ring-1 ring-rose-100">{pdfError}</p>}

      {ready && shown.length === 0 && <p className={`${CARD} px-6 py-8 text-center text-[14px] text-black/55`}>Тут поки нічого немає.</p>}

      {ready && shown.length > 0 && (
        <>
          {/* desktop / tablet: table */}
          <div className={`hidden md:block ${CARD} overflow-hidden`}>
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wide text-black/55 bg-[#faf9ff] border-b border-[#f1eefb]">
                  <th scope="col" className="px-5 py-3 font-semibold">Дата</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Матеріал</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Номер</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Сума</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Статус</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">Квитанція</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-[#f1eefb] last:border-0">
                    <td className="px-5 py-3 text-black/70 whitespace-nowrap">{formatAbsoluteDate(p.date)}</td>
                    <td className="px-3 py-3 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1eeff] text-[#6d5bd0]"><Icon name={p.kind ?? "card"} size={17} /></span>
                        <div className="min-w-0">
                          <MaterialName p={p} className="font-semibold" />
                          <div className="text-[12px] text-black/55">{[p.kind ? KIND_LABEL[p.kind] : null, p.author].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[13px] text-black/60 whitespace-nowrap">{shortOrderId(p.id)}</td>
                    <td className="px-3 py-3 font-semibold text-[#12172b] whitespace-nowrap">{formatAmount(p.amount)}</td>
                    <td className="px-3 py-3"><Badge status={p.status} /></td>
                    <td className="px-3 py-1.5 text-right"><ReceiptButton p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile: cards */}
          <ul className="md:hidden flex flex-col gap-3">
            {shown.map((p) => (
              <li key={p.id} className={`${CARD} p-4 flex flex-col gap-2`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <MaterialName p={p} className="block text-[16px] font-semibold break-words" />
                    <div className="text-[14px] text-black/55 break-words">{[p.kind ? KIND_LABEL[p.kind] : null, p.author].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="text-[16px] font-bold text-[#12172b] whitespace-nowrap">{formatAmount(p.amount)}</div>
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px] text-black/55">
                  <span>{formatAbsoluteDate(p.date)} · <span className="font-mono">{shortOrderId(p.id)}</span></span>
                  <Badge status={p.status} />
                </div>
                {hasReceipt(p) && <div><ReceiptButton p={p} /></div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {ready && (
        <section className={`${CARD} flex flex-wrap items-center gap-4 p-5 sm:p-6`}>
          <span className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="lifebuoy" size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-[#12172b]">Проблема з оплатою?</div>
            <p className="mt-0.5 text-[14px] text-black/55">Кошти списано, а матеріалу немає в «Моє навчання», або оплата пройшла двічі. Напишіть нам, і ми перевіримо разом із банком.</p>
            {refundable.length > 0 && (
              <button type="button" onClick={() => setRefundOpen(true)} className="mt-1 text-[13px] text-black/45 underline-offset-4 hover:text-black/70 hover:underline">
                Повернення коштів
              </button>
            )}
          </div>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate("help")} className="min-h-[46px] w-full whitespace-nowrap rounded-xl bg-white px-5 text-[14px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] hover:bg-[#faf9ff] sm:w-auto">
              Написати в «Допомога»
            </button>
          )}
        </section>
      )}

      {refundOpen && refundable.length > 0 && <RefundDialog items={refundable} onClose={() => setRefundOpen(false)} />}
    </div>
  );
}

function RefundDialog({ items, onClose }: { items: PurchaseView[]; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, onClose);
  const session = useSession();
  const [pickedId, setPickedId] = useState(items[0].id);
  const [name, setName] = useState(session?.profile.name ?? "");
  const [email, setEmail] = useState(session?.profile.email ?? "");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const p = items.find((i) => i.id === pickedId) ?? items[0];

  const words = countWords(reason);
  const canSubmit = name.trim() && email.trim() && phone.trim() && words >= MIN_REFUND_REASON_WORDS;
  const submit = async () => {
    if (!session?.profile.id || !canSubmit || !p.title || !p.kind) return;
    setBusy(true);
    setError(null);
    try {
      await submitRefundRequest({
        participantId: session.profile.id,
        contentTitle: p.title,
        contentKind: p.kind,
        purchaseId: p.id,
        amount: p.amount,
        purchasedAt: p.date,
        fullName: name,
        email,
        phone,
        reason,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати запит. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#d9d4f5] bg-white text-[16px] sm:text-[14px] focus:outline-none focus:border-[#5b3df5]";
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#12172b]/45 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] max-h-[90dvh] overflow-y-auto rounded-[26px] bg-white p-6 shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <h3 id="refund-title" className="text-[20px] font-bold text-[#12172b]">Повернення коштів</h3>
        <p className="mt-1 text-[13px] text-black/55">Протягом {REFUND_WINDOW_DAYS} днів після покупки. Ми розглянемо запит і напишемо вам.</p>
        {sent ? (
          <>
            <div role="status" className="mt-4 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-[14px]">Запит на повернення надіслано. Ми зв'яжемося з вами найближчим часом.</div>
            <div className="mt-5 flex justify-end">
              <button data-autofocus onClick={onClose} className="min-h-[44px] px-5 rounded-xl ring-1 ring-[#e3def9] text-[14px] font-semibold text-black/70 hover:bg-[#f6f4ff]">Закрити</button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {items.length > 1 ? (
              <label className="text-[13px] font-semibold text-[#2d2a5c]">
                Покупка
                <select value={pickedId} onChange={(e) => setPickedId(e.target.value)} className={`${input} mt-1`}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{`${i.title} · ${formatAbsoluteDate(i.date)} · ${formatAmount(i.amount)}`}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="rounded-xl bg-[#faf9ff] px-4 py-3 text-[14px] ring-1 ring-[#efeafd]">
                <div className="font-semibold text-[#12172b]">{p.title}</div>
                <div className="text-[13px] text-black/55">{formatAbsoluteDate(p.date)} · {formatAmount(p.amount)} · {shortOrderId(p.id)}</div>
              </div>
            )}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я та прізвище" aria-label="Ім'я та прізвище" className={input} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email" className={input} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Номер телефону" aria-label="Номер телефону" type="tel" className={input} />
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Опишіть причину повернення (мінімум ${MIN_REFUND_REASON_WORDS} слів)`} aria-label="Причина повернення" rows={4} className={`${input} resize-none`} />
            <div className={`text-[12px] text-right ${words >= MIN_REFUND_REASON_WORDS ? "text-emerald-700" : "text-black/60"}`}>{words}/{MIN_REFUND_REASON_WORDS} слів</div>
            {error && <div role="alert" className="text-[14px] text-rose-700">{error}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={submit} disabled={!canSubmit || busy} className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold hover:opacity-95 disabled:opacity-40">
                {busy ? "Надсилаємо…" : "Надіслати запит"}
              </button>
              <button data-autofocus onClick={onClose} className="min-h-[44px] px-4 rounded-xl text-[14px] text-black/70 hover:bg-[#f6f4ff]">Скасувати</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
