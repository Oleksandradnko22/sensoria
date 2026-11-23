// Author-side access to the finance module (supabase/finance-migration.sql).
// Reads go straight to the author's own rows (RLS: nobody else's); every change
// goes through the `finance` Edge Function, which does the calculations.

import { supabase } from "./supabaseClient.ts";
import type { LedgerRow } from "../utils/financeView.ts";

export type FinanceAccount = {
  pendingKop: number;
  availableKop: number;
  reservedKop: number;
  debtKop: number;
  inFlightKop: number;
  lifetimeEarningsKop: number;
  totalPaidOutKop: number;
  totalRefundedKop: number;
  status: string;
  salesSuspended: boolean;
};

export type FinanceDebt = { id: string; originalKop: number; outstandingKop: number; reason: string; status: "open" | "repaid"; createdAt: string };
export type FinancePayout = { id: string; amountKop: number; status: string; destination: string; requestedAt: string; processedAt: string | null };
export type FinanceNotification = { id: string; message: string; eventType: string; createdAt: string; readAt: string | null };
export type FinanceBankAccount = {
  id: string;
  ibanLast4: string;
  bankName: string;
  holderName: string;
  taxId: string;
  status: "pending" | "verified" | "rejected" | "replaced";
  rejectReason: string | null;
  createdAt: string;
};
export type FinanceSale = {
  id: string;
  purchaseId?: string | null;
  confirmedAt: string;
  title: string;
  priceKop: number;
  authorKop: number;
  refundedKop: number;
  authorRefundedKop: number;
  pendingKop: number;
  holdUntil: string;
  disputed: boolean;
  // where the buyer came from: «catalog» = through Sensoria (30 %), «referral» = the author's own link (15 %)
  source: "catalog" | "referral";
  commissionBps: number;
  // which card paid (monobank paymentInfo.country): the bank's fee is 1.3 % for Ukrainian, 2 % for foreign; null = unknown
  cardOrigin?: "ua" | "foreign" | null;
  /** promo sales only: the author's price before the discount, and the discount (priceKop is what was paid) */
  listKop?: number | null;
  discountKop?: number | null;
};
export type FinanceTerms = {
  commissionBps: number;
  referralCommissionBps: number;
  authorBps: number;
  holdDays: number;
  reserveBps: number;
  reserveDays: number;
  inactivityDays: number;
  warningGraceDays: number;
  minPayoutKop: number;
  bankFeeBps: number;
  bankFeeFixedKop: number;
  autoPayout: boolean;
  splitAtSource: boolean;
  mode: "test" | "live";
};

export type MyFinance = {
  account: FinanceAccount;
  debts: FinanceDebt[];
  payouts: FinancePayout[];
  notifications: FinanceNotification[];
  ledger: LedgerRow[];
  bankAccounts: FinanceBankAccount[];
  sales: FinanceSale[];
  /** Earliest moment held money becomes available (null when nothing is held). */
  nextReleaseAt: string | null;
  /** Earliest reserve release date, if a reserve exists. */
  nextReserveReleaseAt: string | null;
  terms: FinanceTerms | null;
};

const EMPTY: FinanceAccount = {
  pendingKop: 0, availableKop: 0, reservedKop: 0, debtKop: 0, inFlightKop: 0,
  lifetimeEarningsKop: 0, totalPaidOutKop: 0, totalRefundedKop: 0, status: "ACTIVE", salesSuspended: false,
};

const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42883" || e.code === "PGRST202");

const SALE_COLS = "id, purchase_id, confirmed_at, content_title, amount_kop, author_kop, refunded_kop, author_refunded_kop, pending_kop, hold_until, disputed, sale_source, commission_bps";
// card_origin arrives with mono-migration.sql; before it the list loads without it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaleRow = Record<string, any>;
async function fetchSales(): Promise<{ data: SaleRow[] | null }> {
  const q = async (cols: string) => {
    const r = await supabase!.from("finance_payments").select(cols).order("confirmed_at", { ascending: false }).limit(500);
    return { data: r.data as SaleRow[] | null, error: r.error };
  };
  // promo columns arrive with promo-codes.sql, card_origin with mono-migration.sql; older databases load without them
  const full = await q(`${SALE_COLS}, card_origin, list_kop, discount_kop`);
  if (!full.error) return full;
  const withCard = await q(`${SALE_COLS}, card_origin`);
  return withCard.error ? await q(SALE_COLS) : withCard;
}

/** null = the finance migration has not been run yet. */
export async function fetchMyFinance(): Promise<MyFinance | null> {
  if (!supabase) return null;
  const acc = await supabase.from("author_financial_accounts").select("*").maybeSingle();
  if (missing(acc.error)) return null;
  if (acc.error) throw acc.error;

  const [debts, payouts, notes, ledger, held, reserves, terms, banks, sales] = await Promise.all([
    supabase.from("author_debts").select("id, original_kop, outstanding_kop, reason, status, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("payouts").select("id, amount_kop, payout_status, destination, requested_at, processed_at").order("requested_at", { ascending: false }).limit(20),
    supabase.from("financial_notifications").select("id, message, event_type, created_at, read_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("ledger_entries").select("id, operation_key, type, account, delta_kop, reason, created_at, author_share_kop, order_id").order("id", { ascending: false }).limit(300),
    supabase.from("finance_payments").select("hold_until").gt("pending_kop", 0).order("hold_until", { ascending: true }).limit(1),
    supabase.from("refund_reserves").select("release_at").eq("status", "held").order("release_at", { ascending: true }).limit(1),
    supabase.rpc("finance_public_terms"),
    supabase.from("author_bank_accounts").select("id, iban, bank_name, holder_name, tax_id, status, reject_reason, created_at").order("created_at", { ascending: false }).limit(6),
    fetchSales(),
  ]);

  const a = acc.data;
  const t = terms.data as Record<string, number | string> | null;
  return {
    account: a
      ? {
          pendingKop: Number(a.pending_kop), availableKop: Number(a.available_kop), reservedKop: Number(a.reserved_kop),
          debtKop: Number(a.debt_kop), inFlightKop: Number(a.in_flight_kop), lifetimeEarningsKop: Number(a.lifetime_earnings_kop),
          totalPaidOutKop: Number(a.total_paid_out_kop), totalRefundedKop: Number(a.total_refunded_kop),
          status: a.account_status, salesSuspended: a.sales_suspended,
        }
      : EMPTY,
    debts: (debts.data ?? []).map((d) => ({ id: d.id, originalKop: Number(d.original_kop), outstandingKop: Number(d.outstanding_kop), reason: d.reason, status: d.status, createdAt: d.created_at })),
    payouts: (payouts.data ?? []).map((p) => ({ id: p.id, amountKop: Number(p.amount_kop), status: p.payout_status, destination: p.destination, requestedAt: p.requested_at, processedAt: p.processed_at })),
    notifications: (notes.data ?? []).map((n) => ({ id: n.id, message: n.message, eventType: n.event_type, createdAt: n.created_at, readAt: n.read_at })),
    ledger: (ledger.data ?? []).map((l) => ({ ...l, delta_kop: Number(l.delta_kop) })) as LedgerRow[],
    bankAccounts: (banks.data ?? []).map((b) => ({
      id: b.id, ibanLast4: String(b.iban).slice(-4), bankName: b.bank_name ?? "", holderName: b.holder_name, taxId: b.tax_id,
      status: b.status, rejectReason: b.reject_reason, createdAt: b.created_at,
    })),
    sales: (sales.data ?? []).map((p) => ({
      id: p.id, purchaseId: p.purchase_id ?? null, confirmedAt: p.confirmed_at, title: p.content_title ?? "Матеріал", priceKop: Number(p.amount_kop), authorKop: Number(p.author_kop),
      refundedKop: Number(p.refunded_kop), authorRefundedKop: Number(p.author_refunded_kop), pendingKop: Number(p.pending_kop),
      holdUntil: p.hold_until, disputed: !!p.disputed,
      source: p.sale_source === "referral" ? "referral" : "catalog", commissionBps: Number(p.commission_bps ?? (p.sale_source === "referral" ? 1500 : 3000)),
      cardOrigin: p.card_origin === "ua" || p.card_origin === "foreign" ? p.card_origin : null,
      listKop: p.list_kop != null ? Number(p.list_kop) : null,
      discountKop: p.discount_kop != null ? Number(p.discount_kop) : null,
    })),
    nextReleaseAt: held.data?.[0]?.hold_until ?? null,
    nextReserveReleaseAt: reserves.data?.[0]?.release_at ?? null,
    terms: t
      ? {
          commissionBps: Number(t.commission_bps), referralCommissionBps: Number(t.referral_commission_bps ?? 1500), authorBps: Number(t.author_bps), holdDays: Number(t.hold_days),
          reserveBps: Number(t.reserve_bps), reserveDays: Number(t.reserve_days), inactivityDays: Number(t.inactivity_days),
          warningGraceDays: Number(t.warning_grace_days), minPayoutKop: Number(t.min_payout_kop),
          bankFeeBps: Number(t.bank_fee_bps ?? 0), bankFeeFixedKop: Number(t.bank_fee_fixed_kop ?? 0), autoPayout: Boolean(t.auto_payout ?? true), splitAtSource: Boolean(t.split_at_source ?? true), mode: t.mode as "test" | "live",
        }
      : null,
  };
}

async function callFinance<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { data, error } = await supabase.functions.invoke("finance", { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      const j = await res.json().catch(() => null);
      if (j?.message) throw new Error(j.message);
      if (j?.error) throw new Error(String(j.error));
    }
    throw error;
  }
  if (data?.error) throw new Error(data.message ?? data.error);
  return data as T;
}

const touched = new Map<string, number>();
/** A meaningful visit resets the «inactive author» clock. Throttled; never blocks the UI. */
export function touchFinanceActivity(type: "login" | "view_finance" | "manage_content"): void {
  const last = touched.get(type) ?? 0;
  if (Date.now() - last < 5 * 60_000) return;
  touched.set(type, Date.now());
  callFinance({ action: "touchActivity", type }).catch((e) => console.warn("finance activity:", e instanceof Error ? e.message : e));
}

export const requestPayout = (amountKop: number) => callFinance<{ ok: true; payoutId: string }>({ action: "requestPayout", amountKop });
export const saveBankAccount = (v: { iban: string; bankName: string; holderName: string; taxId: string }) =>
  callFinance<{ ok: true; status: string; unchanged?: boolean }>({ action: "saveBankAccount", ...v });
export type MonoConnection = { status: "none" | "requested" | "active" | "disabled"; ipnLast4: string | null; legalName: string | null; legalAddress?: string | null; buyerEmail?: string | null; buyerPhone?: string | null; singlePartner?: boolean; updatedAt: string | null };
export const fetchMonoConnection = () => callFinance<{ ok: true } & MonoConnection>({ action: "monoConnection" });
// Б41: the author's tax system; Б38: monthly acts of Sensoria's services
export type TaxSystem = "fop2" | "fop3" | "fop_general" | "tov3" | "tov_general";
export const fetchTaxProfile = () => callFinance<{ ok: true; taxSystem: TaxSystem | null; vatPayer: boolean; updatedAt: string | null }>({ action: "taxProfile" });
export const saveTaxProfile = (v: { taxSystem: TaxSystem; vatPayer: boolean }) => callFinance<{ ok: true }>({ action: "setTaxProfile", ...v });
export type ActStatus = "draft" | "issued" | "accepted" | "accepted_silent" | "objected" | "signed";
export type ServiceAct = {
  id: string; period: string; number: string; data: ActData; issued_at: string; accept_until: string; status: ActStatus; decided_at: string | null; objection: string | null;
  operator_signed_at: string | null; author_signed_at: string | null;
};
export type ActData = {
  number: string; period: string; servicesKop: number; servicesInWords: string; returnedKop: number; returnedInWords: string;
  lines: { tariff30: { count: number; sumKop: number }; tariff15: { count: number; sumKop: number }; returned: { count: number; sumKop: number } };
  reference: { paymentsKop: number; bankFeeKop: number };
  /** the customer as of the act's date (absent in acts made before 18.11.2026) */
  customer?: { legalName: string | null; code: string | null; taxSystem: TaxSystem | null; vatPayer: boolean };
  register: { n: number; order: string; paidAt: string; material: string; fiscalNo: string | null; listKop: number; discountKop: number; paidKop: number; source: string; tariffPct: number; tariffKop: number; bankFeeKop: number; creditedToAuthorKop: number; status: string; returnFiscalNo: string | null }[];
};
export const fetchMyActs = () => callFinance<{ ok: true; acts: ServiceAct[] }>({ action: "myActs" });
/** A signed copy of an act (КЕП from id.gov.ua): a short-lived link to download it. */
export const actFileUrl = (actId: string, which: "operator" | "author") => callFinance<{ ok: true; url: string }>({ action: "actFile", actId, which });
/** Uploads a file signed on id.gov.ua: the server gives a one-time slot in the private bucket, then checks the file is there.
 *  "operator" — Sensoria's signature (owner, admin), "author" — the author's own (ТОВ, ФОП на загальній системі). */
export async function uploadSignedAct(who: "operator" | "author", actId: string, file: File): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Файл більший за 10 МБ.");
  const slot = await callFinance<{ path: string; token: string }>({ action: who === "operator" ? "actUploadUrl" : "actAuthorUploadUrl", actId, fileName: file.name });
  const { error } = await supabase.storage.from("service-acts").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error("Файл не завантажився. Спробуйте ще раз.");
  await callFinance({ action: who === "operator" ? "actSigned" : "actAuthorSigned", actId, path: slot.path, reason: "КЕП" });
}
/** The seller's fiscal receipts (Checkbox) of the participant's own purchases: a sale and, after a refund, a return. */
export type MyFiscalReceipt = { invoiceId: string; kind: "sale" | "return"; ready: boolean; fiscalCode: string | null; url: string | null };
export const fetchMyFiscalReceipts = () => callFinance<{ ok: true; receipts: MyFiscalReceipt[] }>({ action: "myFiscalReceipts" });
export const decideAct = (actId: string, decision: "accept" | "object", objection?: string) => callFinance<{ ok: true }>({ action: "actDecision", actId, decision, objection });

/** The author's cash register for fiscal receipts (ТЗ 3.4): the key and PIN go to the server only (Vault). */
export type PrroStatus = { status: "none" | "pending" | "active" | "error" | "disabled"; lastError: string | null; updatedAt: string | null };
export const fetchPrroStatus = () => callFinance<{ ok: true } & PrroStatus>({ action: "prroStatus" });
export const connectPrro = (v: { licenseKey: string; pin: string }) => callFinance<{ ok: true; status: string }>({ action: "connectPrro", ...v });
export const requestMonoConnection = (v: { ipn: string; legalName: string; legalAddress: string; buyerEmail: string; buyerPhone: string; singlePartner: boolean }) =>
  callFinance<{ ok: true; status: string; unchanged?: boolean }>({ action: "requestMonoConnection", ...v });
export const markFinanceNotificationsRead = () => callFinance<{ ok: true }>({ action: "markNotificationsRead" });

// ── paying a material on monobank (the server decides the amount and the split; the browser only names the material) ──
export const startMonoCheckout = (contentId: string, promoCode?: string) =>
  callFinance<{ ok: true; pageUrl: string; ref: string }>({ action: "monoCheckout", contentId, origin: window.location.origin, immediateAccess: true, ...(promoCode ? { promoCode } : {}) });
/** Who sells the material (the author's FOP/LLC) and the exact immediate-access text for it (ТЗ 3.1–3.2). */
export type SellerInfo = { legalName: string; codeMasked: string; address?: string | null; email?: string | null; phone?: string | null; operatorEmail?: string; consentText: string };
export const fetchSellerInfo = (contentId: string) => callFinance<{ ok: true } & SellerInfo>({ action: "sellerInfo", contentId });
/** The author's promo code for one material: the server checks it and prices it (offer Б33). */
export type PromoQuote = { listKop: number; discountKop: number; amountKop: number; percent?: number };
export const fetchPromoQuote = (contentId: string, promoCode: string) =>
  callFinance<{ ok: true } & PromoQuote>({ action: "promoQuote", contentId, promoCode });
export const fetchMonoStatus = (pay: string) =>
  callFinance<{ ok: true; status: string; purchaseId: string | null; contentId: string }>({ action: "monoStatus", ref: pay });
export { callFinance };
