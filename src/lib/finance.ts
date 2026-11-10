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
  confirmedAt: string;
  title: string;
  priceKop: number;
  authorKop: number;
  refundedKop: number;
  authorRefundedKop: number;
  pendingKop: number;
  holdUntil: string;
  disputed: boolean;
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
    supabase.from("finance_payments").select("id, confirmed_at, content_title, amount_kop, author_kop, refunded_kop, author_refunded_kop, pending_kop, hold_until, disputed").order("confirmed_at", { ascending: false }).limit(100),
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
      id: p.id, confirmedAt: p.confirmed_at, title: p.content_title ?? "Матеріал", priceKop: Number(p.amount_kop), authorKop: Number(p.author_kop),
      refundedKop: Number(p.refunded_kop), authorRefundedKop: Number(p.author_refunded_kop), pendingKop: Number(p.pending_kop),
      holdUntil: p.hold_until, disputed: !!p.disputed,
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
export const markFinanceNotificationsRead = () => callFinance<{ ok: true }>({ action: "markNotificationsRead" });

// ── paying a material on monobank (the server decides the amount and the split; the browser only names the material) ──
export const startMonoCheckout = (contentId: string) =>
  callFinance<{ ok: true; pageUrl: string; ref: string }>({ action: "monoCheckout", contentId, origin: window.location.origin });
export const fetchMonoStatus = (pay: string) =>
  callFinance<{ ok: true; status: string; purchaseId: string | null; contentId: string }>({ action: "monoStatus", ref: pay });
export { callFinance };
