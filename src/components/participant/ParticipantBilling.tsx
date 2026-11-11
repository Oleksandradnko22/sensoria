// «Оплати»: the participant's real purchase history (`purchases`). Payments
// are not connected yet, so an empty history is the normal state today.
// No receipts, payment-method data or refund promises are invented: the
// refund request below is the existing product flow (14-day window) and is
// offered only for a real, paid purchase.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
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
  type PurchaseStatus,
  type PurchaseView,
} from "../../utils/purchasesView";
import { useModal } from "../author/public/useModal";

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
  onNavigate?: (key: "learning") => void;
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  active?: boolean;
};

function Badge({ status }: { status: PurchaseStatus }) {
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export default function ParticipantBilling({ onNavigate, onOpenProgram, onOpenGuide, onOpenMeditation, active = true }: Props) {
  const session = useSession();
  const myId = session?.profile.id;
  const demo = billingDemoOn();
  const [rows, setRows] = useState<PurchaseView[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [detailsId, setDetailsId] = useState<string | null>(null);

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

  const all = demo ? [...BILLING_DEMO, ...rows] : rows;
  const details = all.find((p) => p.id === detailsId) ?? null;

  const canOpen = (p: PurchaseView) =>
    !!p.title && grantsAccess(p) &&
    ((p.kind === "program" && !!onOpenProgram) || (p.kind === "guide" && !!onOpenGuide) || (p.kind === "meditation" && !!onOpenMeditation));
  const open = (p: PurchaseView) => {
    if (!canOpen(p)) return;
    if (p.kind === "program") onOpenProgram?.(p.contentId);
    if (p.kind === "guide") onOpenGuide?.(p.contentId);
    if (p.kind === "meditation") onOpenMeditation?.(p.contentId);
  };

  const exportCsv = () => {
    const blob = new Blob([purchasesToCsv(all, formatAbsoluteDate)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sensoria-pokupky.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const title = (p: PurchaseView) => p.title ?? "Матеріал більше недоступний";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Оплати</h1>
          <p className="text-black/60 mt-1">Історія ваших покупок на Sensoria.</p>
        </div>
        {state === "ready" && all.length > 0 && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-black/[0.12] bg-white text-[14px] font-medium text-black/80 hover:bg-black/[0.04]">
            <Icon name="clip" size={16} />
            Експорт історії
          </button>
        )}
      </div>

      {state === "loading" && !demo && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Завантаження покупок">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-2xl bg-white border border-black/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && !demo && (
        <div role="alert" className="rounded-2xl bg-white border border-black/[0.06] px-6 py-10 text-center">
          <div className="text-[16px] font-medium">Не вдалося завантажити покупки</div>
          <p className="text-[14px] text-black/60 mt-1">Перевірте з'єднання і спробуйте ще раз.</p>
          <button onClick={() => load()} className="mt-3 min-h-[44px] px-5 rounded-xl border border-black/[0.12] text-[14px] text-black/75 hover:bg-black/[0.04]">
            Спробувати ще раз
          </button>
        </div>
      )}

      {(state === "ready" || demo) && all.length === 0 && (
        <div className="max-w-[560px] rounded-2xl bg-white border border-black/[0.06] px-6 py-10 text-center">
          <span className="mx-auto w-12 h-12 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
            <Icon name="card" size={22} />
          </span>
          <div className="text-[16px] font-medium mt-4">Покупок поки немає</div>
          <p className="text-[14px] text-black/60 mt-1 max-w-[400px] mx-auto leading-relaxed">
            Тут з’явиться історія ваших покупок на Sensoria — програм, гайдів та інших матеріалів.
          </p>
          {onNavigate && (
            <button onClick={() => onNavigate("learning")} className="mt-4 min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90">
              Перейти до навчання
            </button>
          )}
        </div>
      )}

      {(state === "ready" || demo) && all.length > 0 && (
        <>
          {/* desktop / tablet: table */}
          <div className="hidden md:block rounded-2xl bg-white border border-black/[0.06] overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wide text-black/60 border-b border-black/[0.06]">
                  <th scope="col" className="px-5 py-3 font-medium">Дата</th>
                  <th scope="col" className="px-3 py-3 font-medium">Матеріал</th>
                  <th scope="col" className="px-3 py-3 font-medium">Тип</th>
                  <th scope="col" className="px-3 py-3 font-medium">Сума</th>
                  <th scope="col" className="px-3 py-3 font-medium">Статус</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">Дії</span></th>
                </tr>
              </thead>
              <tbody>
                {all.map((p) => (
                  <tr key={p.id} onClick={() => setDetailsId(p.id)} className="border-b border-black/[0.06] last:border-0 hover:bg-black/[0.02] cursor-pointer">
                    <td className="px-5 py-3 text-black/70 whitespace-nowrap">{formatAbsoluteDate(p.date)}</td>
                    <td className="px-3 py-3 min-w-0">
                      {canOpen(p) ? (
                        <button onClick={(e) => { e.stopPropagation(); open(p); }} className="font-semibold text-black/90 text-left hover:underline underline-offset-4">
                          {title(p)}
                        </button>
                      ) : (
                        <div className={`font-semibold ${p.title ? "text-black/90" : "text-black/60"}`}>{title(p)}</div>
                      )}
                      {p.author && <div className="text-[12px] text-black/60">{p.author}</div>}
                    </td>
                    <td className="px-3 py-3 text-black/70">{p.kind ? KIND_LABEL[p.kind] : "—"}</td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">{formatAmount(p.amount)}</td>
                    <td className="px-3 py-3"><Badge status={p.status} /></td>
                    <td className="px-3 py-1 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setDetailsId(p.id); }} aria-label={`Деталі покупки: ${title(p)}`} className="min-h-[44px] px-2 text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
                        Деталі
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile: transaction cards */}
          <ul className="md:hidden flex flex-col gap-3">
            {all.map((p) => (
              <li key={p.id}>
                <button onClick={() => setDetailsId(p.id)} aria-label={`Деталі покупки: ${title(p)}`} className="w-full text-left rounded-2xl bg-white border border-black/[0.06] p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-[16px] font-semibold break-words ${p.title ? "text-black/90" : "text-black/60"}`}>{title(p)}</div>
                      <div className="text-[14px] text-black/60 break-words">{[p.kind ? KIND_LABEL[p.kind] : null, p.author].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="text-[16px] font-semibold whitespace-nowrap">{formatAmount(p.amount)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] text-black/70">{formatAbsoluteDate(p.date)}</span>
                    <Badge status={p.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {details && (
        <PurchaseDialog
          key={details.id}
          p={details}
          isDemo={BILLING_DEMO.some((d) => d.id === details.id)}
          canOpen={canOpen(details)}
          onOpenMaterial={() => {
            setDetailsId(null);
            open(details);
          }}
          onClose={() => setDetailsId(null)}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-black/60">{label}</dt>
      <dd className="font-medium text-right break-words min-w-0">{children}</dd>
    </div>
  );
}

function PurchaseDialog({ p, isDemo, canOpen, onOpenMaterial, onClose }: { p: PurchaseView; isDemo: boolean; canOpen: boolean; onOpenMaterial: () => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, onClose);
  const session = useSession();

  const [refundMode, setRefundMode] = useState(false);
  const [name, setName] = useState(session?.profile.name ?? "");
  const [email, setEmail] = useState(session?.profile.email ?? "");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const words = countWords(reason);
  const canSubmit = name.trim() && email.trim() && phone.trim() && words >= MIN_REFUND_REASON_WORDS;
  const refundable = !isDemo && p.status === "paid" && !!p.title && !!p.kind && isWithinRefundWindow(p.date);

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
      setRefundMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати запит. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full min-h-[44px] px-3 py-2 rounded-lg border border-black/15 text-[16px] sm:text-[14px] focus:outline-none focus:border-black/40";
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="purchase-title" className="text-[16px] font-semibold text-black/90 break-words">Деталі покупки</h3>
            <div className={`text-[14px] mt-0.5 break-words ${p.title ? "text-black/75" : "text-black/60"}`}>{p.title ?? "Матеріал більше недоступний"}</div>
            {p.author && <div className="text-[12px] text-black/60">{p.author}</div>}
          </div>
          <Badge status={p.status} />
        </div>

        <dl className="mt-5 flex flex-col gap-3 text-[14px]">
          {p.kind && <Row label="Тип">{KIND_LABEL[p.kind]}</Row>}
          <Row label="Дата покупки">{formatAbsoluteDate(p.date)}</Row>
          <Row label="Сума">{formatAmount(p.amount)}</Row>
          <Row label="Статус">{STATUS_LABEL[p.status]}</Row>
          <Row label="Ідентифікатор">{shortOrderId(p.id)}</Row>
        </dl>

        {canOpen && (
          <button onClick={onOpenMaterial} className="mt-5 w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90">
            Перейти до матеріалу →
          </button>
        )}

        {p.amount > 0 && (
          <div className="mt-5 pt-4 border-t border-black/[0.06] flex flex-col gap-3">
            <p className="text-[12px] text-black/60 text-center">Квитанції з'являться, коли на платформі запрацюють реальні платежі.</p>
            {sent && <div role="status" className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-[14px]">Запит на повернення надіслано. Ми зв'яжемося з вами найближчим часом.</div>}
            {!sent && p.status === "paid" && !refundable && !isDemo && (
              <p className="text-[12px] text-black/60 text-center">Повернення можливе лише протягом {REFUND_WINDOW_DAYS} днів після покупки.</p>
            )}
            {!sent && refundable && !refundMode && (
              <button onClick={() => setRefundMode(true)} className="min-h-[44px] rounded-xl border border-black/[0.12] text-[14px] font-medium hover:bg-black/[0.03]">
                Запросити повернення коштів
              </button>
            )}
            {!sent && refundable && refundMode && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-black/[0.02] border border-black/10">
                <div className="text-[14px] font-medium">Запит на повернення коштів</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я та прізвище" aria-label="Ім'я та прізвище" className={input} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email" className={input} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Номер телефону" aria-label="Номер телефону" type="tel" className={input} />
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Опишіть причину повернення (мінімум ${MIN_REFUND_REASON_WORDS} слів)`} aria-label="Причина повернення" rows={4} className={`${input} resize-none`} />
                <div className={`text-[12px] text-right ${words >= MIN_REFUND_REASON_WORDS ? "text-emerald-700" : "text-black/60"}`}>{words}/{MIN_REFUND_REASON_WORDS} слів</div>
                {error && <div role="alert" className="text-[14px] text-rose-700">{error}</div>}
                <div className="flex items-center gap-2">
                  <button onClick={submit} disabled={!canSubmit || busy} className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 disabled:opacity-40">
                    {busy ? "Надсилаємо…" : "Надіслати запит"}
                  </button>
                  <button onClick={() => setRefundMode(false)} className="min-h-[44px] px-4 rounded-xl text-[14px] text-black/70 hover:bg-black/5">Скасувати</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button data-autofocus onClick={onClose} className="min-h-[44px] px-5 rounded-xl border border-black/[0.12] text-[14px] text-black/70 hover:bg-black/[0.04]">
            Закрити
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
