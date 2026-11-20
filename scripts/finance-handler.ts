// Sensoria — finance Edge Function (own finance module).
//
// GENERATED FILE: supabase/functions/finance/index.ts is built from
//   - src/utils/financeEngine.ts  (the tested calculation engine), and
//   - scripts/finance-handler.ts  (this file: loading state, calling finance_apply)
// by `npm run build:finance`. Edit those two, not the output.
//
// Money is taken by monobank (split payments): see the "monobank" section below. Until MONO_TOKEN is set
// and finance_settings.mode is 'live', payments are TEST: a test token from api.monobank.ua moves no real money.
//
// DEPLOY: Dashboard -> Edge Functions -> "finance" -> paste -> Deploy.
// DEPLOY WITH `npm run deploy:finance` (= --no-verify-jwt): monobank webhooks and pg_cron come without a user JWT,
// and Supabase's gateway would answer them 401. This function checks every caller itself: a user's JWT, the bank's
// signature, the x-cron-secret header.
// Secrets: CRON_SECRET (for runJobs / fiscalTick), RESEND_API_KEY / RESEND_FROM (emails),
// ADMIN_REQUIRE_2FA (as for admin-data). Schedule `runJobs` daily with the
// header  x-cron-secret: <CRON_SECRET>.
//
// Actions (POST { action, ... }):
//   buyer   (own JWT):  monoCheckout (+ promoCode), promoQuote, monoStatus     (+ webhook: POST ?hook=mono, signed by the bank)
//   author  (own JWT):  touchActivity, requestPayout, markNotificationsRead
//   admin   (2FA, owner): overview, authors, author, confirmPayment, refund,
//                         markDisputed, repayDebt, setStatus, payoutConfirm,
//                         payoutFail, setSettings, verify
//   cron:               runJobs

import { createClient } from "npm:@supabase/supabase-js@2";
import { brandFromText, renderBrandEmail, type BrandEmail } from "../_shared/brandEmail.ts";
import { OPERATOR } from "../_shared/operator.ts";

// @@ENGINE@@

// @@MONO@@

// @@FISCAL@@

// @@TAX@@

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ── loading state ───────────────────────────────────────────────────────────

async function loadSettings(): Promise<Settings> {
  const { data } = await admin.from("finance_settings").select("*").eq("id", 1).single();
  if (!data) return DEFAULT_SETTINGS;
  return {
    authorBps: data.author_bps,
    commissionBps: data.commission_bps,
    referralCommissionBps: data.referral_commission_bps ?? 1500,
    holdDays: data.hold_days,
    reserveBps: data.reserve_bps,
    reserveDays: data.reserve_days,
    inactivityDays: data.inactivity_days,
    warningGraceDays: data.warning_grace_days,
    reminderDays: data.reminder_days,
    minPayoutKop: Number(data.min_payout_kop),
    bankFeeBps: data.bank_fee_bps,
    bankFeeFixedKop: Number(data.bank_fee_fixed_kop),
    autoPayout: data.auto_payout ? 1 : 0,
    splitAtSource: data.split_at_source === false ? 0 : 1,
  };
}

// deno-lint-ignore no-explicit-any
const toBank = (r: any): BankAccountState => ({
  id: r.id,
  iban: r.iban,
  holderName: r.holder_name,
  taxId: r.tax_id,
  bankName: r.bank_name ?? "",
  status: r.status,
});

async function loadVerifiedBank(authorId: string): Promise<BankAccountState | null> {
  const { data } = await admin.from("author_bank_accounts").select("*").eq("author_id", authorId).eq("status", "verified").maybeSingle();
  return data ? toBank(data) : null;
}

// deno-lint-ignore no-explicit-any
const toAccount = (r: any): AccountState => ({
  authorId: r.author_id,
  pending: Number(r.pending_kop),
  available: Number(r.available_kop),
  reserved: Number(r.reserved_kop),
  debt: Number(r.debt_kop),
  inFlight: Number(r.in_flight_kop),
  lifetimeEarnings: Number(r.lifetime_earnings_kop),
  totalPaidOut: Number(r.total_paid_out_kop),
  totalRefunded: Number(r.total_refunded_kop),
  status: r.account_status,
  adminHold: r.admin_hold,
  salesSuspended: r.sales_suspended,
  lastMeaningfulActivityAt: r.last_meaningful_activity_at,
  warningAt: r.warning_at,
  reminderSentAt: r.reminder_sent_at,
  version: r.version,
});

async function loadAccount(authorId: string): Promise<AccountState> {
  const { data } = await admin.from("author_financial_accounts").select("*").eq("author_id", authorId).maybeSingle();
  return data ? toAccount(data) : emptyAccount(authorId);
}

async function loadDebts(authorId: string): Promise<DebtState[]> {
  const { data } = await admin.from("author_debts").select("*").eq("author_id", authorId).eq("status", "open");
  return (data ?? []).map((d) => ({
    id: d.id,
    originalKop: Number(d.original_kop),
    outstandingKop: Number(d.outstanding_kop),
    status: d.status,
    createdAt: d.created_at,
  }));
}

// deno-lint-ignore no-explicit-any
const toPayment = (p: any): PaymentState => ({
  id: p.id,
  purchaseId: p.purchase_id,
  authorId: p.author_id,
  buyerId: p.buyer_id,
  amountKop: Number(p.amount_kop),
  feeKop: Number(p.fee_kop ?? 0),
  grossKop: p.gross_kop == null ? undefined : Number(p.gross_kop),
  authorKop: Number(p.author_kop),
  sensoriaKop: Number(p.sensoria_kop),
  pendingKop: Number(p.pending_kop),
  holdUntil: p.hold_until,
  refundedKop: Number(p.refunded_kop),
  authorRefundedKop: Number(p.author_refunded_kop),
  sensoriaRefundedKop: Number(p.sensoria_refunded_kop),
  feeRefundedKop: Number(p.fee_refunded_kop ?? 0),
  disputed: !!p.disputed,
  splitAuthorKop: p.split_author_kop == null ? null : Number(p.split_author_kop),
});

// deno-lint-ignore no-explicit-any
const toReserve = (r: any): ReserveState => ({
  id: r.id,
  paymentId: r.payment_id,
  reservedKop: Number(r.reserved_kop),
  releasedKop: Number(r.released_kop),
  usedKop: Number(r.used_kop),
  releaseAt: r.release_at,
});

async function loadPaymentsFor(authorId: string): Promise<PaymentState[]> {
  const { data } = await admin.from("finance_payments").select("*").eq("author_id", authorId).gt("pending_kop", 0);
  return (data ?? []).map(toPayment);
}
async function loadReservesFor(authorId: string): Promise<ReserveState[]> {
  const { data } = await admin.from("refund_reserves").select("*").eq("author_id", authorId).eq("status", "held");
  return (data ?? []).map(toReserve);
}

// ── applying plans ──────────────────────────────────────────────────────────

/** Rebuilds the plan from fresh state and retries when the account changed in between. */
async function applyWithRetry(build: () => Promise<Plan | null>, actor: string | null): Promise<Plan | null> {
  for (let i = 0; i < 4; i += 1) {
    const plan = await build();
    if (!plan) return null;
    const { error } = await admin.rpc("finance_apply", { p: plan, p_actor: actor });
    if (!error) return plan;
    const msg = String(error.message);
    if (msg.includes("finance_version_conflict")) continue;
    if (msg.includes("finance_duplicate")) throw new FinanceError("duplicate", "Цю операцію вже виконано.");
    throw new Error(msg);
  }
  throw new FinanceError("busy", "Баланс зараз оновлюється, повторіть спробу.");
}

// ── emails ──────────────────────────────────────────────────────────────────

async function sendPendingEmails(): Promise<{ sent: number; skipped: number; failed: number }> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";
  const { data: rows } = await admin
    .from("financial_notifications")
    .select("id, author_id, message, event_type")
    .eq("delivery_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const n of rows ?? []) {
    const { data: prof } = await admin.from("profiles").select("email").eq("id", n.author_id).maybeSingle();
    let status: "sent" | "skipped" | "failed" = "skipped";
    if (key && prof?.email) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: prof.email, subject: "Sensoria: фінансове сповіщення", ...brandFromText("Фінансове сповіщення", n.message, "Ви отримали цей лист як автор Sensoria. Усі сповіщення — у кабінеті, розділ «Фінанси».") }),
        });
        status = res.ok ? "sent" : "failed";
      } catch {
        status = "failed";
      }
    }
    await admin.from("financial_notifications").update({ delivery_status: status }).eq("id", n.id);
    out[status] += 1;
  }
  return out;
}

// ── cron ────────────────────────────────────────────────────────────────────

async function runJobs() {
  const settings = await loadSettings();
  const now = nowIso();
  const res = { released: 0, inactivity: 0, autoPayouts: 0, distributed: 0, emails: { sent: 0, skipped: 0, failed: 0 },
    mono: null as { checked: number; changed: number } | null, monoStatement: null as { items: number; fixed: number; unknown: number } | null, fiscalQueued: 0, errors: [] as string[] };

  // 1) holds and reserves that expired
  const authors = new Set<string>();
  const { data: due } = await admin.from("finance_payments").select("author_id").gt("pending_kop", 0).eq("disputed", false).lte("hold_until", now);
  for (const r of due ?? []) authors.add(r.author_id);
  const { data: dueRes } = await admin.from("refund_reserves").select("author_id").eq("status", "held").lte("release_at", now);
  for (const r of dueRes ?? []) authors.add(r.author_id);
  for (const authorId of authors) {
    try {
      const plan = await applyWithRetry(async () => {
        const [account, debts, payments, reserves] = await Promise.all([loadAccount(authorId), loadDebts(authorId), loadPaymentsFor(authorId), loadReservesFor(authorId)]);
        return planRelease({ settings, now, account, debts, payments, reserves });
      }, null);
      if (plan) res.released += 1;
    } catch (e) {
      res.errors.push(`release ${authorId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 2) debtors who went quiet
  const { data: debtors } = await admin
    .from("author_financial_accounts")
    .select("author_id, created_at")
    .gt("debt_kop", 0)
    .in("account_status", ["DEBT", "INACTIVE_WITH_DEBT", "WARNING"]);
  for (const d of debtors ?? []) {
    try {
      const plan = await applyWithRetry(async () => {
        const account = await loadAccount(d.author_id);
        return planInactivity({ settings, now, account, fallbackSince: d.created_at });
      }, null);
      if (plan) res.inactivity += 1;
    } catch (e) {
      res.errors.push(`inactivity ${d.author_id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 3) automatic payouts: the available balance, once the minimum is reached, to the VERIFIED account
  if (settings.autoPayout) {
    const { data: rich } = await admin
      .from("author_financial_accounts")
      .select("author_id")
      .gt("available_kop", 0)
      .eq("debt_kop", 0);
    for (const r of rich ?? []) {
      try {
        const { data: open } = await admin.from("payouts").select("id").eq("author_id", r.author_id).in("payout_status", ["requested", "processing"]).limit(1);
        const bankAccount = await loadVerifiedBank(r.author_id);
        const plan = await applyWithRetry(async () => planAutoPayout({
          settings, now, account: await loadAccount(r.author_id), payoutId: uuid(), bankAccount, hasOpenPayout: (open?.length ?? 0) > 0,
        }), null);
        if (plan) res.autoPayouts += 1;
      } catch (e) {
        res.errors.push(`auto payout ${r.author_id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // 4) execution of auto-distribution orders. TEST mode: simulated bank confirmation.
  //    LIVE mode: orders wait for the banking layer (split/mass payout), nothing is marked paid here.
  const { data: modeRow } = await admin.from("finance_settings").select("mode").eq("id", 1).single();
  if (settings.autoPayout && (modeRow?.mode ?? "test") === "test") {
    const { data: orders } = await admin.from("payouts").select("*").eq("is_auto", true).eq("payout_status", "requested").limit(200);
    for (const po of orders ?? []) {
      try {
        await applyWithRetry(async () => planPayoutConfirm({
          now, account: await loadAccount(po.author_id), payoutId: po.id, amountKop: Number(po.amount_kop),
          reference: `TEST-DISTRIBUTION-${String(po.id).slice(0, 8)}`, adminId: "system",
          payoutBankAccountId: po.bank_account_id, currentBankAccountId: (await loadVerifiedBank(po.author_id))?.id ?? null,
        }), null);
        res.distributed += 1;
      } catch (e) {
        res.errors.push(`distribution ${po.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // 5) monobank: payments whose webhook never came, then the daily statement check
  if (Deno.env.get("MONO_TOKEN")) {
    try {
      res.mono = await monoCheckStuck();
    } catch (e) {
      res.errors.push(`mono stuck: ${e instanceof Error ? e.message : e}`);
    }
    try {
      res.monoStatement = await monoReconcileStatement();
    } catch (e) {
      res.errors.push(`mono statement: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 5b) monthly acts (Б38) and their silent acceptance
  try {
    const acts = await runActs();
    (res as Record<string, unknown>).acts = acts;
  } catch (e) {
    res.errors.push(`acts: ${e instanceof Error ? e.message : e}`);
  }

  // 6) fiscal receipts: queue what a webhook could not (the sender to the cash service comes with the PRRO connection)
  try {
    res.fiscalQueued = await fiscalRequeueMissing();
  } catch (e) {
    res.errors.push(`fiscal queue: ${e instanceof Error ? e.message : e}`);
  }

  // 6b) buyers' order confirmations that failed right after the payment
  try {
    (res as Record<string, unknown>).confirmations = await resendPurchaseConfirmations();
  } catch (e) {
    res.errors.push(`purchase confirmations: ${e instanceof Error ? e.message : e}`);
  }

  // 7) authors' registers: still the author's own, real, working register? (a broken one stops the author's sales)
  try {
    (res as Record<string, unknown>).prroChecked = await recheckAuthorRegisters();
  } catch (e) {
    res.errors.push(`prro recheck: ${e instanceof Error ? e.message : e}`);
  }

  res.emails = await sendPendingEmails();
  return res;
}

/** Invoices still open 15+ minutes after creation: ask the bank directly (webhooks may be lost after 3 retries). */
async function monoCheckStuck() {
  const out = { checked: 0, changed: 0 };
  const older = new Date(Date.now() - 15 * 60_000).toISOString();
  const newer = new Date(Date.now() - 31 * 86400_000).toISOString();
  const { data: rows } = await admin.from("mono_invoices").select("*").in("status", ["created", "processing", "hold"])
    .not("mono_invoice_id", "is", null).lte("updated_at", older).gte("created_at", newer).order("created_at").limit(50);
  for (const row of (rows ?? []) as MonoRow[]) {
    out.checked += 1;
    const bank = await monoCall(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(row.mono_invoice_id!)}`);
    if (!bank) continue;
    const r = await applyMonoStatus(row, bank);
    if (r.applied && bank.status !== row.status) out.changed += 1;
    else await admin.from("mono_invoices").update({ updated_at: nowIso() }).eq("id", row.id); // next check in 15 minutes
  }
  return out;
}

/** The bank's statement for the last 2 days against our invoices: a payment the bank has and we do not is shown for review. */
async function monoReconcileStatement() {
  const out = { items: 0, fixed: 0, unknown: 0 };
  const to = Math.floor(Date.now() / 1000);
  const from = to - 2 * 86400;
  const st = await monoCall(`/api/merchant/statement?from=${from}&to=${to}`);
  for (const it of (Array.isArray(st?.list) ? st.list : []) as Record<string, unknown>[]) {
    if (it.status !== "success") continue;
    out.items += 1;
    const invoiceId = String(it.invoiceId ?? "");
    const { data: row } = await admin.from("mono_invoices").select("*").eq("mono_invoice_id", invoiceId).maybeSingle();
    if (!row) {
      out.unknown += 1;
      const { data: seen } = await admin.from("finance_audit_log").select("id").eq("action", "mono_statement_unknown").eq("entity_id", invoiceId.slice(0, 120)).limit(1);
      if (!seen?.length) {
        await admin.from("finance_audit_log").insert({
          administrator_id: null, action: "mono_statement_unknown", entity_type: "payment", entity_id: invoiceId.slice(0, 120),
          reason: "Оплата є у виписці банку, але не знайдена в Sensoria", previous_value: null, new_value: { amount: it.amount, reference: it.reference ?? null },
        });
      }
      continue;
    }
    if ((row as MonoRow).status === "success") continue;
    const bank = await monoCall(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`);
    if (bank && (await applyMonoStatus(row as MonoRow, bank)).applied) out.fixed += 1;
  }
  return out;
}

// ── admin helpers ───────────────────────────────────────────────────────────


async function authorOverview(authorId: string) {
  const [acc, debts, ledger, payouts, notes, activity, statusLog, payments, reserves] = await Promise.all([
    admin.from("author_financial_accounts").select("*").eq("author_id", authorId).maybeSingle(),
    admin.from("author_debts").select("*").eq("author_id", authorId).order("created_at", { ascending: false }),
    admin.from("ledger_entries").select("*").eq("author_id", authorId).order("id", { ascending: false }).limit(150),
    admin.from("payouts").select("*").eq("author_id", authorId).order("requested_at", { ascending: false }).limit(30),
    admin.from("financial_notifications").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("author_activity").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(20),
    admin.from("author_status_log").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("finance_payments").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
    admin.from("refund_reserves").select("*").eq("author_id", authorId).order("created_at", { ascending: false }).limit(30),
  ]);
  const { data: prof } = await admin.from("profiles").select("id, name, email").eq("id", authorId).maybeSingle();
  return {
    profile: prof,
    account: acc.data,
    debts: debts.data ?? [],
    ledger: ledger.data ?? [],
    payouts: payouts.data ?? [],
    notifications: notes.data ?? [],
    activity: activity.data ?? [],
    statusLog: statusLog.data ?? [],
    payments: await (async () => {
      const list = payments.data ?? [];
      const ids = list.map((p) => p.purchase_id).filter(Boolean);
      const { data: declined } = ids.length
        ? await admin.from("mono_invoices").select("id").in("id", ids).eq("review_reason", "refund_declined_by_bank")
        : { data: [] };
      const set = new Set((declined ?? []).map((d) => d.id));
      return list.map((p) => ({ ...p, refund_declined: set.has(p.purchase_id) }));
    })(),
    reserves: reserves.data ?? [],
  };
}

// ── monobank (split payments) ───────────────────────────────────────────────
// The buyer pays on monobank's page; monobank splits the money between the author's and Sensoria's FOP.
// A purchase and its ledger entries are created ONLY here, after a webhook with a valid signature
// (or a status check against the bank) says `success`. The amount and the order are never taken from the browser.
// Secrets: MONO_TOKEN (test token from api.monobank.ua first), SITE_URL (default https://sensoria.courses).

const MONO_API = "https://api.monobank.ua";
const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://sensoria.courses").replace(/\/+$/, "");
const allowedOrigins = () => [siteUrl(), "https://www.sensoria.courses", "http://localhost:5173", "http://127.0.0.1:5173"];

async function monoCall(path: string, body?: unknown) {
  const token = Deno.env.get("MONO_TOKEN");
  if (!token) throw new FinanceError("payments_not_configured", "Оплату ще не підключено.");
  const res = await fetch(`${MONO_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Token": token, "X-Cms": MONO_CMS_NAME, "X-Cms-Version": "1", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    console.error("monobank", path, res.status, text.slice(0, 500));
    // the bank's own reason (errCode / errText) — no secrets in it, and it tells what to fix
    const why = [data?.errCode, data?.errText ?? data?.errorDescription].filter(Boolean).join(": ").slice(0, 200);
    throw new FinanceError("mono_error", `Банк не прийняв запит (${res.status}${why ? `: ${why}` : ""}). Спробуйте пізніше.`);
  }
  return data;
}

let cachedPubkey: string | null = null;
async function monoPubkey(force = false): Promise<string> {
  if (!cachedPubkey || force) cachedPubkey = (await monoCall("/api/merchant/pubkey"))?.key ?? null;
  return cachedPubkey ?? "";
}
async function verifyMonoWebhook(raw: string, sign: string | null): Promise<boolean> {
  if (await verifyWebhookSignature(raw, sign, await monoPubkey())) return true;
  return await verifyWebhookSignature(raw, sign, await monoPubkey(true)); // the bank may have rotated its key
}

interface MonoRow {
  id: string; buyer_id: string; content_id: string; author_id: string;
  amount_kop: number; author_kop: number; sensoria_kop: number; sale_source: SaleSource;
  mono_invoice_id: string | null; page_url: string | null; status: string; mono_modified: string | null;
  mode: "test" | "live";
  list_kop?: number | null; discount_kop?: number | null; promo_code_id?: string | null;
}

// The immediate-access request on the payment page — word for word from docs/legal/participant-agreement.md
// («Галочка на сторінці оплати»; consentTexts.test.ts checks it). Stored with every order (supabase/purchase-consents.sql).
const IMMEDIATE_ACCESS_TEXT =
  "Прошу надати доступ до цифрового матеріалу одразу після оплати. Я розумію, що після надання доступу право розірвати договір протягом 14 днів без пояснення причин не застосовується (пункт 1 частини п’ятої статті 13 Закону України «Про захист прав споживачів»), а повернення коштів можливе у випадках, передбачених Правилами повернення коштів і законом. Продавець — {{назва ФОП/ТОВ автора}}.";

/** The seller of a material: the author's FOP/LLC from the bank connection. РНОКПП is masked, ЄДРПОУ shown in full. */
async function sellerOf(authorId: string): Promise<{ legalName: string; codeMasked: string }> {
  const { data: r } = await admin.from("author_mono_receivers").select("legal_name, ipn, status").eq("author_id", authorId).maybeSingle();
  const code = String(r?.ipn ?? "");
  if (r?.legal_name && code) {
    return { legalName: String(r.legal_name), codeMasked: code.length === 8 ? `ЄДРПОУ ${code}` : `РНОКПП ••••${code.slice(-4)}` };
  }
  const { data: p } = await admin.from("profiles").select("name").eq("id", authorId).maybeSingle();
  return { legalName: `автор матеріалу${p?.name ? ` ${p.name}` : ""}`, codeMasked: "дані ФОП ще не підключено" };
}
const immediateAccessText = (seller: { legalName: string; codeMasked: string }) =>
  IMMEDIATE_ACCESS_TEXT.replace("{{назва ФОП/ТОВ автора}}", `${seller.legalName} (${seller.codeMasked})`);

/** Seller block for the cart: who sells this material and the exact text the buyer is asked to confirm. */
async function sellerInfoFor(payload: Record<string, unknown>) {
  const contentId = String(payload.contentId ?? "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId);
  const { data: content } = await admin.from("content").select("id, author_id, status").eq(isUuid ? "id" : "slug", contentId).maybeSingle();
  if (!content || content.status !== "published") throw new FinanceError("not_for_sale", "Цей матеріал недоступний для купівлі.");
  const seller = await sellerOf(content.author_id as string);
  return { ...seller, consentText: immediateAccessText(seller) };
}

/** An author's promo code valid for this material right now (offer Б33). Only the author's own codes count. */
async function findPromo(code: unknown, content: { id: string; author_id: string }) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return null;
  if (!/^[A-Z0-9]{3,20}$/.test(c)) throw new FinanceError("promo_invalid", "Промокод недійсний для цього матеріалу.");
  const { data: rows, error } = await admin.from("author_promo_codes")
    .select("id, discount_percent, content_id, max_uses, uses, active, expires_at")
    .eq("author_id", content.author_id).eq("code", c).limit(1);
  if (error) throw new FinanceError("promo_invalid", "Промокоди поки не працюють.");
  const r = rows?.[0];
  const ok = r && r.active && (r.content_id == null || r.content_id === content.id) && Number(r.uses) < Number(r.max_uses)
    && (!r.expires_at || Date.parse(r.expires_at as string) > Date.now());
  if (!ok) throw new FinanceError("promo_invalid", "Промокод недійсний для цього матеріалу.");
  return { id: r.id as string, percent: Number(r.discount_percent) };
}

/** Price, discount and amount to pay for the cart, before the buyer goes to the bank (nothing is created). */
async function promoQuoteFor(payload: Record<string, unknown>) {
  const contentId = String(payload.contentId ?? "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId);
  const { data: content } = await admin.from("content").select("id, author_id, price, status")
    .eq(isUuid ? "id" : "slug", contentId).maybeSingle();
  if (!content || content.status !== "published") throw new FinanceError("not_for_sale", "Цей матеріал недоступний для купівлі.");
  const listKop = Math.round(Number(content.price) * 100);
  const promo = await findPromo(payload.promoCode, content as { id: string; author_id: string });
  if (!promo) return { listKop, discountKop: 0, amountKop: listKop };
  const q = promoQuote(listKop, promo.percent, await loadSettings());
  return { listKop, discountKop: q.discountKop, amountKop: q.amountKop, percent: promo.percent };
}

async function monoCheckout(userId: string, payload: Record<string, unknown>, client: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null }) {
  // ТЗ 3.2: access right after payment only on the buyer's explicit request, recorded with the order
  if (payload.immediateAccess !== true) throw new FinanceError("immediate_access_required", "Підтвердьте, що хочете отримати доступ одразу після оплати.");
  // release B: no invoice without the buyer's current consents (docs/consent-legal-spec.md, 2.4); a missing function = not migrated yet
  const { data: consentOk, error: consentErr } = await admin.rpc("has_required_consents", { p_uid: userId });
  if (!consentErr && consentOk === false) throw new FinanceError("consent_required", "Щоб продовжити, прийміть умови користування.");
  const contentId = String(payload.contentId ?? "");
  // programs are named by their uuid, guides and meditations by their readable slug (the id the site uses)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId);
  const { data: content } = await admin.from("content").select("id, author_id, title, price, status, sale_status")
    .eq(isUuid ? "id" : "slug", contentId).maybeSingle();
  if (!content || content.status !== "published") throw new FinanceError("not_for_sale", "Цей матеріал недоступний для купівлі.");
  if (content.sale_status && !["published", "restored"].includes(content.sale_status)) throw new FinanceError("not_for_sale", "Продаж цього матеріалу тимчасово призупинено.");
  if (content.author_id === userId) throw new FinanceError("own_content", "Власний матеріал купувати не потрібно.");
  const listKop = Math.round(Number(content.price) * 100);
  if (!Number.isFinite(listKop) || listKop <= 0) throw new FinanceError("free", "Цей матеріал безкоштовний: оплата не потрібна.");
  // an author's promo code: checked and priced only here, never from the client's numbers (offer Б33)
  const promo = await findPromo(payload.promoCode, content as { id: string; author_id: string });
  const settingsForPromo = promo ? await loadSettings() : null;
  const quote = promo && settingsForPromo ? promoQuote(listKop, promo.percent, settingsForPromo) : null;
  const amountKop = quote ? quote.amountKop : listKop;
  const { data: owned } = await admin.from("purchases").select("id").eq("participant_id", userId).eq("content_id", content.id).eq("status", "completed").limit(1);
  if (owned?.length) throw new FinanceError("already_bought", "Ви вже придбали цей матеріал.");

  // the same unpaid invoice is reused for 50 minutes: a double click or a reload never creates a second one
  const since = new Date(Date.now() - 50 * 60_000).toISOString();
  const { data: open } = await admin.from("mono_invoices").select("id, page_url, amount_kop").eq("buyer_id", userId).eq("content_id", content.id)
    .in("status", ["created", "processing"]).not("page_url", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (open?.[0] && Number(open[0].amount_kop) === amountKop) return { pageUrl: open[0].page_url as string, ref: open[0].id as string, reused: true };

  const settings = await loadSettings();
  const { data: cfg } = await admin.from("finance_settings").select("mode").eq("id", 1).single();
  const mode: "test" | "live" = cfg?.mode === "live" ? "live" : "test";
  const { data: rcv } = await admin.from("author_mono_receivers").select("receiver_id, status").eq("author_id", content.author_id).maybeSingle();
  // a paid sale needs the author's FOP connected to the split. The test token requires a split too (monobank,
  // 18.11.2026: «'splitReceiverId' is required»): the author's linked receiver, or MONO_TEST_SPLIT_RECEIVER_ID for test payments
  const testReceiver = mode === "test" ? (Deno.env.get("MONO_TEST_SPLIT_RECEIVER_ID") ?? "").trim() : "";
  const receiverId = (rcv?.status === "active" ? String(rcv.receiver_id ?? "") : "") || testReceiver;
  if (!receiverId) {
    throw new FinanceError("author_not_connected", mode === "test"
      ? "Тестова оплата: автора не прив’язано до отримувача monobank. Прив’яжіть його в адмінці «Фінанси» або додайте секрет MONO_TEST_SPLIT_RECEIVER_ID."
      : "Автор ще не підключив прийом оплат. Спробуйте пізніше.");
  }
  if (mode === "live") {
    // the author's receipt is issued on the author's own PRRO: no register — no paid sale (ТЗ 3.4)
    const { data: af } = await admin.from("author_fiscal").select("status").eq("author_id", content.author_id).maybeSingle();
    if (af?.status !== "active") throw new FinanceError("author_no_prro", "Автор ще не підключив касу для чеків. Спробуйте пізніше.");
  }
  // referral rate only on the server's own record of the buyer's click (never from the client)
  const { data: attr } = await admin.from("referral_attributions").select("created_at").eq("buyer_id", userId).eq("author_id", content.author_id).maybeSingle();
  // a promo code is the author's own referral: 15 % of the list price (offer Б33)
  const source = quote ? "referral" : pickSaleSource(attr?.created_at ?? null, nowIso());
  const { authorKop, sensoriaKop } = quote ? quote : splitAmount(amountKop, settings, source);

  const ref = uuid();
  const requested = String(payload.origin ?? "");
  const origin = allowedOrigins().includes(requested) ? requested : siteUrl();
  const split = buildInvoiceBody({
    amountKop, authorKop, sensoriaKop, title: content.title, contentCode: content.id,
    authorReceiverId: receiverId,
    reference: ref, redirectUrl: `${origin}/payment-result?pay=${ref}`, webHookUrl: `${SUPABASE_URL}/functions/v1/finance?hook=mono`,
  });
  const body = split;

  const { error: insErr } = await admin.from("mono_invoices").insert({
    id: ref, buyer_id: userId, content_id: content.id, author_id: content.author_id,
    amount_kop: amountKop, author_kop: authorKop, sensoria_kop: sensoriaKop, sale_source: source, mode,
    ...(quote && promo ? { list_kop: listKop, discount_kop: quote.discountKop, promo_code_id: promo.id } : {}),
  });
  if (insErr) throw new Error(insErr.message);
  // the immediate-access consent, before the bank invoice exists (a missing table = not migrated yet)
  const seller = await sellerOf(content.author_id as string);
  const { error: pcErr } = await admin.from("purchase_consents").insert({
    invoice_id: ref, buyer_id: userId, content_id: content.id, seller_legal_name: seller.legalName, seller_code_masked: seller.codeMasked,
    consent_text: immediateAccessText(seller), ip: client.ip, user_agent: client.userAgent,
  });
  if (pcErr && !/does not exist|schema cache|PGRST205|42P01/i.test(`${pcErr.code} ${pcErr.message}`)) throw new Error(pcErr.message);
  try {
    const inv = await monoCall("/api/merchant/invoice/create", body);
    if (!inv?.invoiceId || !inv?.pageUrl) throw new FinanceError("mono_error", "Банк не повернув посилання на оплату.");
    await admin.from("mono_invoices").update({ mono_invoice_id: inv.invoiceId, page_url: inv.pageUrl, updated_at: nowIso() }).eq("id", ref);
    return { pageUrl: inv.pageUrl as string, ref };
  } catch (e) {
    await admin.from("mono_invoices").update({ status: "failure", review_reason: "invoice_create_failed", updated_at: nowIso() }).eq("id", ref);
    throw e;
  }
}

async function recordPaid(row: MonoRow, p: Record<string, unknown>) {
  const { error: pErr } = await admin.from("purchases").upsert(
    { id: row.id, participant_id: row.buyer_id, content_id: row.content_id, amount: Number((row.amount_kop / 100).toFixed(2)), status: "completed", purchased_at: nowIso() },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (pErr) throw new Error(pErr.message);
  const { data: content } = await admin.from("content").select("title, kind, slug").eq("id", row.content_id).maybeSingle();
  // the paid material shows up in «Моє навчання» (the same table free materials go to), under the id the site
  // uses for it: a program's uuid, a guide's or meditation's slug
  if (content?.kind) {
    const { error: aErr } = await admin.from("acquired_content").upsert(
      { user_id: row.buyer_id, kind: content.kind, content_id: content.kind === "program" ? row.content_id : (content.slug ?? row.content_id) },
      { onConflict: "user_id,kind,content_id", ignoreDuplicates: true },
    );
    if (aErr) throw new Error(aErr.message);
  }
  const settings = await loadSettings();
  const expected = splitAmount(row.amount_kop, settings, row.sale_source, Number(row.list_kop ?? row.amount_kop));
  if (expected.authorKop !== Number(row.author_kop)) {
    // settings changed between the invoice and the payment: the bank already split by the invoice, so the books need a human look
    await admin.from("finance_audit_log").insert({
      administrator_id: null, action: "mono_split_mismatch", entity_type: "payment", entity_id: row.id, reason: "Частки в рахунку банку відрізняються від поточних налаштувань",
      previous_value: { authorKop: row.author_kop, sensoriaKop: row.sensoria_kop }, new_value: { authorKop: expected.authorKop, sensoriaKop: expected.sensoriaKop },
    });
  }
  await applyWithRetry(async () => {
    const [account, debts] = await Promise.all([loadAccount(row.author_id), loadDebts(row.author_id)]);
    return planPaymentReceived({
      settings, now: nowIso(), account, debts,
      purchase: {
        purchaseId: row.id, authorId: row.author_id, buyerId: row.buyer_id, amountKop: row.amount_kop, contentId: row.content_id, contentTitle: content?.title ?? "", source: row.sale_source,
        listKop: row.list_kop ?? null, promoCodeId: row.promo_code_id ?? null,
      },
      paymentId: uuid(), reserveId: uuid(), externalReference: String(p.invoiceId ?? row.mono_invoice_id ?? "").slice(0, 120), mode: row.mode,
      bankFeeKop: bankFeeKop(p.paymentInfo),
    });
  }, null).then(async (r) => {
    // a promo code is used up only by a confirmed payment (once: a duplicate never gets here)
    if (row.promo_code_id) await admin.rpc("increment_promo_use", { p_id: row.promo_code_id });
    return r;
  }).catch((e) => {
    if (e instanceof FinanceError && e.code === "duplicate") return null; // the same payment was already recorded
    throw e;
  });
}

// ── the buyer's order confirmation (ЗУ «Про захист прав споживачів», ст. 13: confirmation of a distance contract on a
// durable medium) ── once per order, right after the bank confirms the payment; the night jobs retry what failed.
// What it confirms: the order, the seller, the price, and the immediate-access request exactly as recorded with the order.
const KIND_UA: Record<string, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };
const uahText = (kop: number) => `${(kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;
const kyivTime = (iso: string) => new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function purchaseConfirmationEmail(o: {
  order: string; title: string; kind: string | null; listKop: number; discountKop: number; paidKop: number; paidAt: string;
  seller: string; sellerCode: string; consentText: string; consentAt: string; test: boolean; site: string; agreementEdition: string;
}): { subject: string } & BrandEmail {
  const rows = [
    { label: "Замовлення", value: `№ ${o.order}` },
    { label: "Дата", value: kyivTime(o.paidAt) },
    { label: "Матеріал", value: `${o.kind && KIND_UA[o.kind] ? `${KIND_UA[o.kind]} ` : ""}«${o.title}»` },
    ...(o.discountKop > 0 ? [{ label: "Ціна", value: uahText(o.listKop) }, { label: "Знижка за промокодом автора", value: `−${uahText(o.discountKop)}` }] : []),
    { label: "Сплачено", value: `${uahText(o.paidKop)} · карткою через monobank` },
    { label: "У виписці", value: "оплата може відображатися з назвою «Sensoria»" },
    { label: "Продавець", value: `${o.seller} (${o.sellerCode})` },
  ];
  return {
    subject: `${o.test ? "[ТЕСТ] " : ""}Замовлення № ${o.order} на Sensoria: оплату отримано`,
    preheader: `«${o.title}» уже у вашому кабінеті. Деталі замовлення й продавець — у листі.`,
    heading: "Дякуємо! Оплату отримано",
    blocks: [
      ...(o.test ? [{ type: "badge" as const, text: "Тестове замовлення: справжні гроші не списано" }] : []),
      { type: "text", text: `Матеріал «${o.title}» уже відкрито у вашому кабінеті, у розділі «Моє навчання». Цей лист підтверджує ваше замовлення — збережіть його.` },
      { type: "button", label: "Перейти до навчання", url: `${o.site}/account` },
      { type: "details", title: "Деталі замовлення", rows },
      { type: "note", text: "Sensoria — оператор платформи: надає технічні послуги з розміщення матеріалу, оформлення замовлення та надання доступу й не є продавцем матеріалу." },
      { type: "quote", label: `Ваш запит на доступ одразу після оплати (зафіксовано ${kyivTime(o.consentAt)})`, text: o.consentText },
      { type: "text", text: "Фіскальний чек продавця надійде окремим листом від касового сервісу Checkbox. Чек і квитанцію також можна відкрити в кабінеті, у розділі «Оплати»." },
      { type: "details", title: "Повернення й претензії", rows: [
        { label: "Повернення коштів", value: `За Правилами повернення коштів (${o.site}/refunds) і законом; запит — у розділі «Оплати» під цією покупкою.` },
        { label: "Претензії", value: `Щодо матеріалу й оплати приймає Sensoria за дорученням продавця: ${OPERATOR.email} або поштою — ${OPERATOR.mailingAddress}.` },
        { label: "Умови, які ви прийняли", value: `Угода учасника (${o.agreementEdition}) — у кабінеті: «Профіль → Документи і згоди», там її можна завантажити в PDF.` },
      ] },
      { type: "note", text: `Оператор платформи: ${OPERATOR.operatorName}, РНОКПП ${OPERATOR.registration}, місцезнаходження: ${OPERATOR.address}. Питання: ${o.site}/contacts` },
    ],
    reason: "Ви отримали цей лист, бо оформили замовлення на Sensoria.",
  };
}

/** Sends the confirmation once: the row is claimed first (confirmation_sent_at), released again if the email failed. */
async function sendPurchaseConfirmation(invoiceId: string): Promise<"sent" | "skipped" | "failed"> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "skipped";
  const { data: pc } = await admin.from("purchase_consents").update({ confirmation_sent_at: nowIso() })
    .eq("invoice_id", invoiceId).is("confirmation_sent_at", null).select("*").maybeSingle();
  if (!pc) return "skipped"; // already sent, or an order made before the consent record existed
  const release = () => admin.from("purchase_consents").update({ confirmation_sent_at: null }).eq("invoice_id", invoiceId);
  try {
    const [{ data: inv }, { data: content }] = await Promise.all([
      admin.from("mono_invoices").select("buyer_id, amount_kop, list_kop, discount_kop, mode, updated_at").eq("id", invoiceId).single(),
      admin.from("content").select("title, kind").eq("id", pc.content_id).maybeSingle(),
    ]);
    const { data: buyer } = inv?.buyer_id ? await admin.from("profiles").select("email").eq("id", inv.buyer_id).maybeSingle() : { data: null };
    if (!inv || !buyer?.email) { await release(); return "skipped"; }
    const { data: pay } = await admin.from("finance_payments").select("confirmed_at").eq("purchase_id", invoiceId).maybeSingle();
    // the edition of the participant agreement this buyer accepted (the current one carries its date)
    const { data: consent } = await admin.from("legal_consents").select("version").eq("user_id", inv.buyer_id).eq("document", "participant_agreement")
      .is("withdrawn_at", null).order("accepted_at", { ascending: false }).limit(1).maybeSingle();
    const ver = consent?.version ?? OPERATOR.edition;
    const agreementEdition = ver === OPERATOR.edition ? `редакція ${ver} від ${OPERATOR.effectiveDate}` : `редакція ${ver}`;
    const paidKop = Number(inv.amount_kop);
    const msg = purchaseConfirmationEmail({
      order: invoiceId.replace(/-/g, "").slice(0, 8).toUpperCase(), title: content?.title ?? "Цифровий освітній матеріал", kind: content?.kind ?? null,
      listKop: Number(inv.list_kop ?? paidKop), discountKop: Number(inv.discount_kop ?? 0), paidKop, paidAt: pay?.confirmed_at ?? nowIso(),
      seller: pc.seller_legal_name, sellerCode: pc.seller_code_masked, consentText: pc.consent_text, consentAt: pc.accepted_at,
      test: inv.mode !== "live", site: siteUrl(), agreementEdition,
    });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>", to: buyer.email, subject: msg.subject, ...renderBrandEmail(msg) }),
    });
    if (!res.ok) { await release(); return "failed"; }
    return "sent";
  } catch (e) {
    console.error("purchase confirmation", invoiceId, e);
    await release();
    return "failed";
  }
}

/** Night jobs: confirmations that did not go out right after the payment (mail down, no key yet) — last 7 days. */
async function resendPurchaseConfirmations(): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: rows } = await admin.from("purchase_consents").select("invoice_id").is("confirmation_sent_at", null).gte("accepted_at", since).limit(200);
  let sent = 0;
  for (const r of rows ?? []) {
    const { data: inv } = await admin.from("mono_invoices").select("status").eq("id", r.invoice_id).maybeSingle();
    if (inv?.status !== "success") continue;
    if ((await sendPurchaseConfirmation(r.invoice_id as string)) === "sent") sent += 1;
  }
  return sent;
}

/** A fully refunded purchase no longer gives access: it is marked refunded and leaves «Моє навчання». */
async function revokePaidAccess(purchaseId: string) {
  const { data: pu } = await admin.from("purchases").update({ status: "refunded" }).eq("id", purchaseId).select("participant_id, content_id").maybeSingle();
  if (!pu) return;
  const { data: c } = await admin.from("content").select("kind, slug").eq("id", pu.content_id).maybeSingle();
  if (!c?.kind) return;
  const ids = [pu.content_id as string, ...(c.slug ? [c.slug as string] : [])];
  await admin.from("acquired_content").delete().eq("user_id", pu.participant_id).eq("kind", c.kind).in("content_id", ids);
}

async function recordReversal(row: MonoRow) {
  const { data: pay } = await admin.from("finance_payments").select("*").eq("purchase_id", row.id).maybeSingle();
  if (!pay) return;
  await applyWithRetry(async () => {
    const [account, fresh, reserveRows] = await Promise.all([
      loadAccount(row.author_id),
      admin.from("finance_payments").select("*").eq("id", pay.id).single(),
      admin.from("refund_reserves").select("*").eq("payment_id", pay.id).limit(1),
    ]);
    const payment = toPayment(fresh.data);
    const amountKop = payment.amountKop - payment.refundedKop;
    if (amountKop <= 0) return null; // already refunded in the books
    return planRefund({
      now: nowIso(), account, payment, reserve: reserveRows.data?.[0] ? toReserve(reserveRows.data[0]) : null,
      refundId: uuid(), debtId: uuid(), idempotencyKey: `mono-reversed:${row.id}`, amountKop, kind: "full", reason: "Повернення коштів через monobank",
    });
  }, null).catch((e) => {
    if (e instanceof FinanceError && e.code === "duplicate") return null;
    throw e;
  });
  await revokePaidAccess(row.id);
}

// ── fiscal receipts (ПРРО) ──────────────────────────────────────────────────
// The receipts of a payment go to a queue (fiscal_receipts); the sender to the cash service runs from runJobs.
// docs/legal/internal/accountant-dps-review-2026-11-18.md, В1 і В3.

/** Idempotent: one receipt per invoice, issuer and kind. A return mirrors the sale receipts that exist. */
async function enqueueReceipts(row: MonoRow, kind: FiscalKind): Promise<number> {
  const [{ data: s }, { data: inv }, { data: sales }] = await Promise.all([
    admin.from("finance_settings").select("sensoria_fee_fiscal").eq("id", 1).single(),
    admin.from("mono_invoices").select("payment_info").eq("id", row.id).single(),
    admin.from("fiscal_receipts").select("issuer").eq("invoice_id", row.id).eq("kind", "sale"),
  ]);
  const feeFiscal = kind === "sale" ? s?.sensoria_fee_fiscal !== false : (sales ?? []).some((r) => r.issuer === "sensoria");
  // the tariff as the bank really paid it (paymentInfo.agentFee); our estimate only while the bank has not said.
  // TEST payments: monobank's test token reports agentFee 0 (even with a test split receiver), so the estimate is
  // used there — otherwise Sensoria's receipt would silently disappear (seen 19.11.2026). Same rule in the act and Б39.
  const bankFee = row.mode === "live" ? agentFeeKopOf(inv?.payment_info) : null;
  const sensoriaKop = bankFee ?? Number(row.sensoria_kop);
  if (bankFee != null && bankFee !== Number(row.sensoria_kop) && kind === "sale") {
    await admin.from("finance_audit_log").insert({
      administrator_id: null, action: "agent_fee_mismatch", entity_type: "payment", entity_id: row.id,
      reason: "Тариф, який зарахував банк, відрізняється від розрахункового — потрібна звірка",
      previous_value: { sensoriaKop: Number(row.sensoria_kop) }, new_value: { agentFee: bankFee },
    });
  }
  const drafts = plannedReceipts({
    kind, invoiceId: row.id, contentId: row.content_id, listKop: row.list_kop ?? null,
    amountKop: Number(row.amount_kop), sensoriaKop, feeFiscal,
  });
  const card = cardDetailsOf(inv?.payment_info);
  const rows = drafts.map((d) => ({
    invoice_id: row.id, author_id: row.author_id, issuer: d.issuer, kind: d.kind, deliver_to: d.deliverTo, item_code: d.itemCode,
    item_name: d.itemName, price_kop: d.priceKop, discount_kop: d.discountKop, amount_kop: d.amountKop, card, mode: row.mode,
  }));
  const { error } = await admin.from("fiscal_receipts").upsert(rows, { onConflict: "invoice_id,issuer,kind", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Never blocks the payment or the refund: a failure is logged, and runJobs re-queues what is missing. */
async function queueReceipts(row: MonoRow, kind: FiscalKind) {
  try {
    await enqueueReceipts(row, kind);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fiscal enqueue", row.id, kind, msg);
    await admin.from("finance_audit_log").insert({
      administrator_id: null, action: "fiscal_enqueue_failed", entity_type: "payment", entity_id: row.id, reason: `${kind}: ${msg}`.slice(0, 500),
    });
  }
}


// ── acts (Б38) ──────────────────────────────────────────────────────────────

/** Kyiv calendar month as a UTC range: "2026-11" → [2026-10-31T22:00Z, 2026-11-30T22:00Z). */
function kyivMonthRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  // Kyiv is UTC+2 in winter and UTC+3 in summer: the offset at noon UTC on the 1st of the month
  const off = (yy: number, mm: number) => {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hourCycle: "h23" }).format(new Date(Date.UTC(yy, mm - 1, 1, 12))));
    return h - 12;
  };
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return {
    from: new Date(Date.UTC(y, m - 1, 1) - off(y, m) * 3_600_000).toISOString(),
    to: new Date(Date.UTC(ny, nm - 1, 1) - off(ny, nm) * 3_600_000).toISOString(),
  };
}

/** Working days skip weekends and the dates in business_holidays (empty while martial law makes holidays working days). */
async function workingDaysFrom(day: string, n: number): Promise<string> {
  const { data } = await admin.from("business_holidays").select("day").gte("day", day).limit(60);
  return addWorkingDays(day, n, new Set((data ?? []).map((r) => String(r.day))));
}

/** The customer's details as of the act's date — a primary document keeps them, later changes do not rewrite it. */
async function actCustomerOf(authorId: string) {
  const [{ data: r }, { data: d }] = await Promise.all([
    admin.from("author_mono_receivers").select("legal_name, ipn").eq("author_id", authorId).maybeSingle(),
    admin.from("author_details").select("tax_system, vat_payer").eq("profile_id", authorId).maybeSingle(),
  ]);
  return { legalName: r?.legal_name ?? null, code: r?.ipn ? String(r.ipn) : null, taxSystem: d?.tax_system ?? null, vatPayer: !!d?.vat_payer };
}

async function actDataFor(authorId: string, period: string) {
  const { from, to } = kyivMonthRange(period);
  const { data: pays } = await admin.from("finance_payments").select("*").eq("author_id", authorId).gte("confirmed_at", from).lt("confirmed_at", to);
  const list = pays ?? [];
  const ids = list.map((x) => x.purchase_id);
  const [{ data: invs }, { data: rec }, { data: refunds }, { data: tasks }] = await Promise.all([
    ids.length ? admin.from("mono_invoices").select("id, mode, payment_info, bank_fee_kop, list_kop, discount_kop, promo_code_id").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("fiscal_receipts").select("invoice_id, kind, fiscal_code").eq("issuer", "author").in("invoice_id", ids) : Promise.resolve({ data: [] }),
    admin.from("finance_refunds").select("order_id, sensoria_share_kop, created_at").eq("author_id", authorId).gte("created_at", from).lt("created_at", to),
    admin.from("tariff_refund_tasks").select("purchase_id, amount_kop, paid_at").eq("author_id", authorId).eq("status", "paid").gte("paid_at", from).lt("paid_at", to),
  ]);
  // deno-lint-ignore no-explicit-any
  const inv = new Map<string, any>((invs ?? []).map((r: { id: string }) => [r.id, r]));
  const fno = (id: string, kind: string) => (rec ?? []).find((r) => r.invoice_id === id && r.kind === kind)?.fiscal_code ?? null;
  const orders: ActOrder[] = list.map((x) => {
    const i = inv.get(x.purchase_id) ?? {};
    const tariff = (i.mode === "live" ? agentFeeKopOf(i.payment_info) : null) ?? Number(x.sensoria_kop);
    const fee = i.bank_fee_kop != null ? Number(i.bank_fee_kop) : estimatedBankFeeKop(Number(x.amount_kop), x.card_origin === "foreign");
    const refunded = Number(x.refunded_kop) >= Number(x.amount_kop);
    return {
      purchaseId: x.purchase_id, contentId: x.content_id ?? x.purchase_id, paidAt: x.confirmed_at, creditedAt: null,
      listKop: Number(i.list_kop ?? x.amount_kop), discountKop: Number(i.discount_kop ?? 0), paidKop: Number(x.amount_kop),
      source: i.promo_code_id ? "promo" : x.sale_source === "referral" ? "referral" : "catalog",
      tariffBps: Number(x.commission_bps), tariffKop: tariff, bankFeeKop: fee, fiscalNo: fno(x.purchase_id, "sale"),
      status: x.dispute_outcome === "lost" ? "chargeback" : refunded ? "refunded" : "paid",
      refundedAt: refunded ? x.dispute_closed_at ?? x.updated_at ?? null : null, returnFiscalNo: fno(x.purchase_id, "return"),
    };
  });
  // (б) the tariff returned this month: by the bank with a refund, or repaid by Sensoria after a lost chargeback
  const returned = [
    ...(refunds ?? []).filter((r) => Number(r.sensoria_share_kop) > 0).map((r) => ({ purchaseId: r.order_id, tariffKop: Number(r.sensoria_share_kop) })),
    ...(tasks ?? []).map((t) => ({ purchaseId: t.purchase_id, tariffKop: Number(t.amount_kop) })),
  ];
  return { ...buildAct({ period, authorId, orders, returnedTariffs: returned }), customer: await actCustomerOf(authorId) };
}

/** Days 1–5 of a month: drafts of the acts for the previous month (Sensoria signs each with КЕП and uploads it — only then
 *  is it placed for the author, see actSigned); after 5 working days without an answer — accepted silently. */
async function runActs(): Promise<{ issued: number; silent: number }> {
  const out = { issued: 0, silent: 0 };
  const today = kyivDay(nowIso());
  const [y, m, d] = today.split("-").map(Number);
  if (d <= 5) {
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    const { from, to } = kyivMonthRange(prev);
    const { data: who } = await admin.from("finance_payments").select("author_id").gte("confirmed_at", from).lt("confirmed_at", to).limit(5000);
    const { data: who2 } = await admin.from("finance_refunds").select("author_id").gte("created_at", from).lt("created_at", to).limit(5000);
    const authors = [...new Set([...(who ?? []), ...(who2 ?? [])].map((r) => r.author_id as string))];
    for (const a of authors) {
      const { data: have } = await admin.from("service_acts").select("id").eq("author_id", a).eq("period", prev).maybeSingle();
      if (have) continue;
      const act = await actDataFor(a, prev);
      const { error } = await admin.from("service_acts").insert({ author_id: a, period: prev, number: act.number, data: act, status: "draft", accept_until: today });
      if (!error) out.issued += 1;
    }
    if (out.issued) await admin.from("admin_alert_outbox").insert({ kind: "acts_to_sign", title: "Акти до підпису КЕП", urgent: false, details: `Акти за ${prev}: ${out.issued}. Завантажте PDF в адмінці «Фінанси», підпишіть на id.gov.ua і завантажте підписані файли.` }).then(() => {}, () => {});
  }
  const { data: silent } = await admin.from("service_acts").update({ status: "accepted_silent", decided_at: nowIso() }).eq("status", "issued").lt("accept_until", today).select("id");
  out.silent = silent?.length ?? 0;
  return out;
}

// signed acts: id.gov.ua gives .p7s (the PDF inside) or an ASiC container; a signed PDF is accepted too
const ACTS_BUCKET = "service-acts";
const ACT_FILE_EXT = ["p7s", "asice", "asics", "pdf"];
async function actUploadSlot(actId: string, who: "operator" | "author", fileName: string) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!ACT_FILE_EXT.includes(ext)) throw new FinanceError("bad_act_file", "Завантажте файл, підписаний на id.gov.ua: .p7s, .asice, .asics або .pdf.");
  const path = `${actId}/${who}-${Date.now()}.${ext}`;
  const { data, error } = await admin.storage.from(ACTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new FinanceError("act_upload", "Не вдалося підготувати завантаження. Спробуйте пізніше.");
  return { path, token: data.token };
}
/** The client says it uploaded `path`: it must be this act's own slot and really be in the bucket. */
async function actUploadedPath(actId: string, who: "operator" | "author", path: string): Promise<string> {
  if (!new RegExp(`^${actId}/${who}-\\d+\\.(${ACT_FILE_EXT.join("|")})$`).test(path)) throw new FinanceError("bad_act_file", "Файл не знайдено.");
  const { data } = await admin.storage.from(ACTS_BUCKET).list(actId, { search: path.split("/")[1] });
  if (!data?.some((f) => `${actId}/${f.name}` === path)) throw new FinanceError("bad_act_file", "Файл не завантажився. Спробуйте ще раз.");
  return path;
}

// monobank's webhook addresses (bank, 18.11.2026)
const MONO_WEBHOOK_IPS = ["3.123.182.27", "63.180.143.70"];

// ── sending to the cash service (Checkbox) ──
// Sensoria's register: secrets SENSORIA_PRRO_LICENSE_KEY / SENSORIA_PRRO_PIN. An author's register: a Vault secret,
// read by author_fiscal_secret() (supabase/author-prro.sql).
// Checkbox has ONE address for test and fiscal work; a test register differs only by its license key. So a TEST
// payment never touches a real register: all its receipts (the author's and Sensoria's) go to Sensoria's TEST register
// (secrets SENSORIA_PRRO_TEST_LICENSE_KEY / SENSORIA_PRRO_TEST_PIN); without them test receipts wait in the queue.

async function fiscalCredsFor(issuer: FiscalIssuer, authorId: string, live: boolean): Promise<CheckboxCreds | null> {
  if (!live) {
    const licenseKey = Deno.env.get("SENSORIA_PRRO_TEST_LICENSE_KEY") ?? "";
    const pin = Deno.env.get("SENSORIA_PRRO_TEST_PIN") ?? "";
    return licenseKey && pin ? { licenseKey, pin } : null;
  }
  if (issuer === "sensoria") {
    const licenseKey = Deno.env.get("SENSORIA_PRRO_LICENSE_KEY") ?? "";
    const pin = Deno.env.get("SENSORIA_PRRO_PIN") ?? "";
    return licenseKey && pin ? { licenseKey, pin } : null;
  }
  const { data: af } = await admin.from("author_fiscal").select("status").eq("author_id", authorId).maybeSingle();
  if (af?.status !== "active") return null;
  const { data: sec, error } = await admin.rpc("author_fiscal_secret", { p_author: authorId });
  if (error || !sec) return null;
  const v = (typeof sec === "string" ? JSON.parse(sec) : sec) as { licenseKey?: string; pin?: string };
  return v.licenseKey && v.pin ? { licenseKey: v.licenseKey, pin: v.pin } : null;
}

/** Daily: every connected author register must still sign in and pass checkRegister (own FOP, not a test one). */
async function recheckAuthorRegisters(): Promise<{ checked: number; broken: number }> {
  const out = { checked: 0, broken: 0 };
  const { data: list, error } = await admin.from("author_fiscal").select("author_id").eq("status", "active").limit(500);
  if (error) throw new Error(error.message);
  for (const a of list ?? []) {
    const authorId = a.author_id as string;
    const creds = await fiscalCredsFor("author", authorId, true);
    const { data: rcv } = await admin.from("author_mono_receivers").select("ipn").eq("author_id", authorId).maybeSingle();
    out.checked += 1;
    let why: string | null = null;
    if (!creds) why = "Не знайдено даних доступу до каси.";
    else {
      try {
        const check = await verifyViaCheckbox(creds, rcv?.ipn ? String(rcv.ipn) : null, fetch as unknown as FetchLike);
        if (!check.ok) why = check.reason;
      } catch (e) {
        // only a refusal of the key/PIN counts; a network hiccup is tried again tomorrow
        if (e instanceof FiscalError && e.code === "prro_auth") why = "Каса не прийняла ключ або PIN.";
      }
    }
    if (why) {
      out.broken += 1;
      await markAuthorPrroBroken(authorId, why);
    }
  }
  return out;
}

/** The author's register stopped working: sales stop (monoCheckout needs status 'active'), the author and the admin are told once. */
async function markAuthorPrroBroken(authorId: string, why: string) {
  const { data: af } = await admin.from("author_fiscal").update({ status: "error", last_error: why.slice(0, 300), updated_at: nowIso() })
    .eq("author_id", authorId).eq("status", "active").select("author_id").maybeSingle();
  if (!af) return; // already marked
  const day = nowIso().slice(0, 10);
  await admin.from("financial_notifications").insert({
    author_id: authorId, event_type: "PRRO_BROKEN", dedupe_key: `prro-broken:${day}`,
    message: "Ваша каса для чеків (ПРРО) перестала приймати запити. Продаж ваших платних матеріалів призупинено, доки ви не підключите касу знову у «Фінанси → Каса для чеків». Перевірте в кабінеті Checkbox, що каса активна, оплачена і касир має ключ.",
  }).then(() => {}, () => {});
  await fiscalAlert("Каса автора не працює", `Автор ${authorId}: ${why}. Продаж призупинено.`);
}

async function fiscalAlert(title: string, details: string) {
  await admin.from("admin_alert_outbox").insert({ kind: "fiscal", title, details: details.slice(0, 1000), urgent: true }).then(() => {}, () => {});
}

/** Sends due receipts in the right order. Returns how many were fiscalized. */
async function fiscalSendDue(onlyInvoice?: string): Promise<{ sent: number; failed: number; waiting: number }> {
  const out = { sent: 0, failed: 0, waiting: 0 };
  let q = admin.from("fiscal_receipts").select("*").eq("status", "pending").lte("next_attempt_at", nowIso()).order("created_at").limit(50);
  if (onlyInvoice) q = q.eq("invoice_id", onlyInvoice);
  const { data: due, error } = await q;
  if (error || !due?.length) return out;
  const invIds = [...new Set(due.map((r) => r.invoice_id as string))];
  const { data: allRows } = await admin.from("fiscal_receipts").select("*").in("invoice_id", invIds);
  const rows = allRows ?? due;
  const queued: QueuedReceipt[] = rows.map((r) => ({ id: r.id, invoiceId: r.invoice_id, issuer: r.issuer, kind: r.kind, status: r.status, nextAttemptAt: r.next_attempt_at }));
  // the order holds across one run: a return waits for its sale, Sensoria's receipt for the author's
  for (const pass of [0, 1, 2]) {
    void pass;
    const ready = sendable(queued, nowIso());
    if (!ready.length) break;
    for (const qr of ready) {
      const r = rows.find((x) => x.id === qr.id)!;
      const { data: inv } = await admin.from("mono_invoices").select("buyer_id, author_id, mode, payment_info, bank_fee_kop, card_origin, amount_kop").eq("id", r.invoice_id).single();
      const live = inv?.mode === "live";
      const base = CHECKBOX_API;
      const creds = await fiscalCredsFor(r.issuer, r.author_id, live);
      if (!creds) {
        out.waiting += 1;
        qr.status = "failed"; // not this run (kept pending in the database)
        await admin.from("fiscal_receipts").update({ last_error: !live ? "Тестова каса не налаштована" : r.issuer === "sensoria" ? "ПРРО Sensoria не підключено" : "ПРРО автора не підключено" }).eq("id", r.id);
        continue;
      }
      const card = cardDetailsOf(inv?.payment_info);
      // card requisites are optional for internet acquiring (mandatory only for POS / Tap to phone): a receipt without
      // them is sent anyway — a sale without any receipt would be far worse. Only Sensoria's receipt never carries them.
      const to = r.deliver_to === "buyer" ? inv?.buyer_id : r.author_id;
      const { data: who } = to ? await admin.from("profiles").select("email").eq("id", to).maybeSingle() : { data: null };
      const related = r.kind === "return" ? rows.find((x) => x.invoice_id === r.invoice_id && x.issuer === r.issuer && x.kind === "sale")?.provider_receipt_id : null;
      try {
        // «Комісія еквайра»: the bank's fee on the author's sale (withheld from the author's share); none on Sensoria's
        // tariff or on returns. The bank's real fee when it said so; the 1.3 % / 2 % estimate otherwise (and in test
        // mode, where the test token reports no fee, so that the line can be checked on the test register).
        const bankFee = inv?.bank_fee_kop != null && (live || Number(inv.bank_fee_kop) > 0) ? Number(inv.bank_fee_kop) : null;
        const commissionKop = r.issuer === "author" && r.kind === "sale"
          ? bankFee ?? estimatedBankFeeKop(Number(inv?.amount_kop ?? r.amount_kop), inv?.card_origin === "foreign")
          : null;
        const draft: ReceiptDraft = { issuer: r.issuer, kind: r.kind, deliverTo: r.deliver_to, itemCode: r.item_code, itemName: r.item_name, priceKop: Number(r.price_kop), discountKop: Number(r.discount_kop), amountKop: Number(r.amount_kop) };
        const res = await sendViaCheckbox(creds, checkboxReceiptBody(draft, card, { email: who?.email ?? null, relatedReceiptId: related ?? null, commissionKop }), fetch as unknown as FetchLike, base);
        await admin.from("fiscal_receipts").update({
          status: "done", provider_receipt_id: res.providerReceiptId, fiscal_code: res.fiscalCode, receipt_url: res.receiptUrl, done_at: nowIso(), last_error: null, attempts: Number(r.attempts) + 1,
        }).eq("id", r.id);
        qr.status = "done";
        r.status = "done";
        r.provider_receipt_id = res.providerReceiptId;
        out.sent += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // the author's register no longer lets us in (key revoked, subscription over, register closed):
        // new sales of this author stop at checkout until the register is reconnected; the author and the admin hear about it
        if (live && r.issuer === "author" && e instanceof FiscalError && e.code === "prro_auth") await markAuthorPrroBroken(r.author_id, msg);
        const attempts = Number(r.attempts) + 1;
        const next = nextAttemptAt(attempts - 1, nowIso()); // 1st failure → +1 min, 2nd → +5 min, …
        await admin.from("fiscal_receipts").update(next ? { attempts, next_attempt_at: next, last_error: msg.slice(0, 500) } : { attempts, status: "failed", last_error: msg.slice(0, 500) }).eq("id", r.id);
        qr.status = "failed";
        if (!next) {
          out.failed += 1;
          await fiscalAlert("Чек не сформовано", `Замовлення ${r.invoice_id} (${r.issuer}, ${r.kind}): ${msg}`);
        }
      }
    }
  }
  // unsent for over an hour → the admin hears about it (the cash service's offline mode should have taken it)
  // once per receipt: only those that crossed the hour since the previous tick (the tick runs every 5 minutes)
  const old = new Date(Date.now() - ALERT_AFTER_MINUTES * 60_000).toISOString();
  const older = new Date(Date.now() - (ALERT_AFTER_MINUTES + 5) * 60_000).toISOString();
  const { data: stale } = await admin.from("fiscal_receipts").select("id, invoice_id").eq("status", "pending").lt("created_at", old).gte("created_at", older).limit(20);
  if (stale?.length && !onlyInvoice) await fiscalAlert("Чеки не сформовано понад годину", `${stale.length} чек(и) чекають: ${stale.map((x) => x.invoice_id).join(", ")}`);
  return out;
}

/** Paid or refunded invoices of the last 7 days whose receipts are not in the queue (e.g. the webhook ran before the migration). */
async function fiscalRequeueMissing(): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: invs, error } = await admin.from("mono_invoices").select("*").in("status", ["success", "reversed"]).gte("updated_at", since).limit(500);
  if (error) throw new Error(error.message);
  if (!invs?.length) return 0;
  const { data: have, error: hErr } = await admin.from("fiscal_receipts").select("invoice_id, kind").eq("issuer", "author").in("invoice_id", invs.map((r) => r.id));
  if (hErr) throw new Error(hErr.message);
  const seen = new Set((have ?? []).map((r) => `${r.invoice_id}:${r.kind}`));
  let n = 0;
  for (const row of invs as MonoRow[]) {
    if (!seen.has(`${row.id}:sale`)) n += await enqueueReceipts(row, "sale");
    if (row.status === "reversed" && !seen.has(`${row.id}:return`)) n += await enqueueReceipts(row, "return");
  }
  return n;
}

/** One place for webhooks and status checks. Throws on a real failure so that the bank retries the webhook. */
async function applyMonoStatus(row: MonoRow, p: Record<string, unknown>): Promise<{ applied: boolean; reason?: string }> {
  const status = parseStatus(p.status);
  if (!status) return { applied: false, reason: "unknown_status" };
  const modified = typeof p.modifiedDate === "string" ? p.modifiedDate : undefined;
  if (!isNewer(modified, row.mono_modified)) return { applied: false, reason: "stale" };
  if (typeof p.amount === "number" && p.amount !== Number(row.amount_kop)) {
    await admin.from("mono_invoices").update({ status: "needs_review", review_reason: "amount_mismatch", updated_at: nowIso() }).eq("id", row.id);
    return { applied: false, reason: "amount_mismatch" };
  }
  const effect = effectOf(status);
  if (effect === "paid") {
    await admin.from("mono_invoices").update({ card_origin: cardOrigin(p.paymentInfo), bank_fee_kop: bankFeeKop(p.paymentInfo) }).eq("id", row.id);
    // separate update: until fiscal-migration.sql runs the column is missing, and that must not lose card_origin above
    await admin.from("mono_invoices").update({ payment_info: p.paymentInfo ?? null }).eq("id", row.id);
    await recordPaid(row, p);
    await admin.from("finance_payments").update({ card_origin: cardOrigin(p.paymentInfo) }).eq("purchase_id", row.id);
    await queueReceipts(row, "sale");
    await fiscalSendDue(row.id).catch((e) => console.error("fiscal send", row.id, e));
    await sendPurchaseConfirmation(row.id).catch((e) => console.error("purchase confirmation", row.id, e));
  }
  if (effect === "reversed") {
    await recordReversal(row);
    await queueReceipts(row, "return");
    await fiscalSendDue(row.id).catch((e) => console.error("fiscal send", row.id, e));
  }
  await admin.from("mono_invoices").update({ status, mono_modified: modified ?? row.mono_modified, updated_at: nowIso() }).eq("id", row.id);
  return { applied: true };
}

async function handleMonoWebhook(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!(await verifyMonoWebhook(raw, req.headers.get("x-sign")))) return json({ error: "bad_signature" }, 403);
  let p: Record<string, unknown>;
  try { p = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  const invoiceId = String(p.invoiceId ?? "");
  let { data: row } = await admin.from("mono_invoices").select("*").eq("mono_invoice_id", invoiceId).maybeSingle();
  if (!row && typeof p.reference === "string") {
    row = (await admin.from("mono_invoices").select("*").eq("id", p.reference).maybeSingle()).data;
    if (row && invoiceId) await admin.from("mono_invoices").update({ mono_invoice_id: invoiceId }).eq("id", row.id);
  }
  if (!row) return json({ ok: true, ignored: "unknown_invoice" }); // not ours: answer 200 so the bank stops retrying
  const out = await applyMonoStatus(row as MonoRow, p);
  return json({ ok: true, ...out });
}

/** The buyer's return page asks here; if the webhook is late, the bank is asked directly. */
async function monoStatusFor(userId: string, ref: string) {
  const { data: row } = await admin.from("mono_invoices").select("*").eq("id", ref).eq("buyer_id", userId).maybeSingle();
  if (!row) throw new FinanceError("no_invoice", "Оплату не знайдено.");
  let cur = row as MonoRow;
  if (["created", "processing", "hold"].includes(cur.status) && cur.mono_invoice_id) {
    const bank = await monoCall(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(cur.mono_invoice_id)}`);
    if (bank) {
      await applyMonoStatus(cur, bank);
      cur = (await admin.from("mono_invoices").select("*").eq("id", ref).single()).data as MonoRow;
    }
  }
  // the site names guides and meditations by slug: send it so the paid item leaves the cart
  const { data: c } = await admin.from("content").select("kind, slug").eq("id", cur.content_id).maybeSingle();
  const siteId = c && c.kind !== "program" && c.slug ? c.slug : cur.content_id;
  return { status: cur.status, purchaseId: cur.status === "success" ? cur.id : null, contentId: siteId };
}

/** A full refund of a payment made through monobank goes back to the buyer's card first; only then the books change. */
async function monoCancelIfNeeded(purchaseId: string, kind: RefundKind, requestKey: string) {
  if (kind === "chargeback") return; // the bank already took the money
  const { data: inv } = await admin.from("mono_invoices").select("mono_invoice_id, status").eq("id", purchaseId).maybeSingle();
  if (!inv || inv.status !== "success" || !inv.mono_invoice_id) return; // not a monobank payment (e.g. a TEST confirmation)
  if (kind !== "full") throw new FinanceError("mono_partial_refund", "Часткове повернення через банк ще не підтримується: зверніться до розробника.");
  let res: Record<string, unknown> | null = null;
  try {
    res = await monoCall("/api/merchant/invoice/cancel", { invoiceId: inv.mono_invoice_id, extRef: requestKey.slice(0, 60) });
  } catch (e) {
    // the bank answers with an error when a receiver's account lacks the money: the same as a refused refund
    if (e instanceof MonoError) throw new FinanceError("mono_cancel_failed", `Банк відхилив повернення коштів: ${e.message}`.slice(0, 300));
    throw e;
  }
  if (res?.status === "failure") throw new FinanceError("mono_cancel_failed", "Банк відхилив повернення коштів.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // monobank webhook: no user, authenticated only by the bank's signature
  if (new URL(req.url).searchParams.get("hook") === "mono") {
    // the signature is the real check; monobank's addresses are an extra hint only (logged, never trusted alone)
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    if (ip && !MONO_WEBHOOK_IPS.includes(ip)) console.warn("mono webhook from an unexpected address", ip);
    try {
      return await handleMonoWebhook(req);
    } catch (e) {
      console.error("mono webhook", e);
      return json({ error: "server_error" }, 500); // not 200: the bank will retry
    }
  }

  try {
    const payload = await req.json().catch(() => null);
    const action = payload?.action as string | undefined;
    if (!action) return json({ error: "bad_request" }, 400);

    // ── cron ──
    if (action === "runJobs") {
      const secret = Deno.env.get("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
      return json(await runJobs());
    }
    // every few minutes: retries of fiscal receipts (1 / 5 / 15 / 60 / 180 / 360 min)
    if (action === "fiscalTick") {
      const secret = Deno.env.get("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);
      return json({ ok: true, ...(await fiscalSendDue()) });
    }

    // ── who is calling ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Не авторизовано." }, 401);
    const user = userData.user;
    const { data: prof } = await admin.from("profiles").select("id, role, is_admin, admin_role").eq("id", user.id).single();

    // ── any signed-in user: pay for a material on monobank ──
    if (action === "monoCheckout") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
      return json({ ok: true, ...(await monoCheckout(user.id, payload, { ip, userAgent })) });
    }
    if (action === "sellerInfo") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      return json({ ok: true, ...(await sellerInfoFor(payload)) });
    }
    // «Оплати» of a participant: the seller's fiscal receipts (Checkbox) of their own purchases — sale and return
    if (action === "myFiscalReceipts") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      const { data: invs } = await admin.from("mono_invoices").select("id").eq("buyer_id", user.id).in("status", ["success", "reversed"]).order("created_at", { ascending: false }).limit(200);
      const ids = (invs ?? []).map((i) => i.id as string);
      const { data: rec } = ids.length
        ? await admin.from("fiscal_receipts").select("invoice_id, kind, status, fiscal_code, receipt_url").eq("issuer", "author").in("invoice_id", ids)
        : { data: [] };
      return json({
        ok: true,
        receipts: (rec ?? []).map((r) => ({ invoiceId: r.invoice_id, kind: r.kind, ready: r.status === "done" && !!r.receipt_url, fiscalCode: r.fiscal_code ?? null, url: r.status === "done" ? r.receipt_url ?? null : null })),
      });
    }
    if (action === "promoQuote") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      return json({ ok: true, ...(await promoQuoteFor(payload)) });
    }
    if (action === "monoStatus") {
      if (!prof) return json({ error: "Не авторизовано." }, 401);
      return json({ ok: true, ...(await monoStatusFor(user.id, String(payload.ref ?? ""))) });
    }

    // ── an author's own actions ──
    if (["taxProfile", "setTaxProfile", "myActs", "actDecision", "actFile", "actAuthorUploadUrl", "actAuthorSigned"].includes(action)) {
      if (prof?.role !== "author") return json({ error: "Лише для авторів." }, 403);
      if (action === "taxProfile") {
        const { data } = await admin.from("author_details").select("tax_system, vat_payer, tax_profile_updated_at").eq("profile_id", user.id).maybeSingle();
        return json({ ok: true, taxSystem: data?.tax_system ?? null, vatPayer: !!data?.vat_payer, updatedAt: data?.tax_profile_updated_at ?? null });
      }
      if (action === "setTaxProfile") {
        const sys = String(payload.taxSystem ?? "");
        if (!["fop2", "fop3", "fop_general", "tov3", "tov_general"].includes(sys)) throw new FinanceError("bad_tax_system", "Оберіть систему оподаткування.");
        const { error } = await admin.from("author_details").update({ tax_system: sys, vat_payer: !!payload.vatPayer, tax_profile_updated_at: nowIso() }).eq("profile_id", user.id);
        if (error) throw new FinanceError("tax_profile", "Не вдалося зберегти. Спробуйте пізніше.");
        return json({ ok: true });
      }
      if (action === "myActs") {
        const { data } = await admin.from("service_acts").select("id, period, number, data, issued_at, accept_until, status, decided_at, objection, operator_signed_at, author_signed_at")
          .eq("author_id", user.id).neq("status", "draft").order("period", { ascending: false }).limit(24);
        return json({ ok: true, acts: data ?? [] });
      }
      if (action === "actFile") {
        const which = payload.which === "author" ? "author" : "operator";
        const { data: a } = await admin.from("service_acts").select("operator_signed_path, author_signed_path").eq("id", String(payload.actId)).eq("author_id", user.id).neq("status", "draft").maybeSingle();
        const path = which === "author" ? a?.author_signed_path : a?.operator_signed_path;
        if (!path) throw new FinanceError("no_act_file", "Підписаного файлу ще немає.");
        const { data: url } = await admin.storage.from(ACTS_BUCKET).createSignedUrl(path, 120, { download: true });
        if (!url?.signedUrl) throw new FinanceError("act_file", "Не вдалося відкрити файл. Спробуйте пізніше.");
        return json({ ok: true, url: url.signedUrl });
      }
      if (action === "actAuthorUploadUrl" || action === "actAuthorSigned") {
        const { data: a } = await admin.from("service_acts").select("id, number, status, author_signed_path").eq("id", String(payload.actId)).eq("author_id", user.id)
          .in("status", ["issued", "accepted", "accepted_silent", "signed"]).maybeSingle();
        if (!a) throw new FinanceError("act_closed", "Акт недоступний для підписання.");
        if (action === "actAuthorUploadUrl") return json({ ok: true, ...(await actUploadSlot(a.id, "author", String(payload.fileName ?? ""))) });
        const path = await actUploadedPath(a.id, "author", String(payload.path ?? ""));
        await admin.from("service_acts").update({ author_signed_path: path, author_signed_at: nowIso(), status: "signed", decided_at: nowIso() }).eq("id", a.id);
        return json({ ok: true });
      }
      const decision = payload.decision === "object" ? "object" : "accept";
      const objection = String(payload.objection ?? "").trim().slice(0, 2000);
      if (decision === "object" && objection.length < 10) throw new FinanceError("no_objection", "Опишіть заперечення (не менше 10 символів).");
      const { data: act } = await admin.from("service_acts").update(decision === "accept" ? { status: "accepted", decided_at: nowIso() } : { status: "objected", decided_at: nowIso(), objection })
        .eq("id", String(payload.actId)).eq("author_id", user.id).eq("status", "issued").select("id, number").maybeSingle();
      if (!act) throw new FinanceError("act_closed", "Цей акт уже прийнято або строк для заперечень минув.");
      if (decision === "object") await admin.from("admin_alert_outbox").insert({ kind: "act_objection", title: "Заперечення до акта", urgent: false, details: `Акт ${act.number}: ${objection}` }).then(() => {}, () => {});
      return json({ ok: true });
    }

    if (action === "prroStatus" || action === "connectPrro") {
      if (prof?.role !== "author") return json({ error: "Лише для авторів." }, 403);
      if (action === "prroStatus") {
        const { data: af } = await admin.from("author_fiscal").select("status, last_error, updated_at").eq("author_id", user.id).maybeSingle();
        return json({ ok: true, status: af?.status ?? "none", lastError: af?.last_error ?? null, updatedAt: af?.updated_at ?? null });
      }
      const licenseKey = String(payload.licenseKey ?? "").trim();
      const pin = String(payload.pin ?? "").replace(/\s+/g, "");
      if (licenseKey.length < 10) throw new FinanceError("bad_license", "Вкажіть ключ ліцензії каси з кабінету Checkbox.");
      if (!/^\d{4,10}$/.test(pin)) throw new FinanceError("bad_pin", "PIN касира — 4–10 цифр.");
      // no receipt is sent: sign in, then check that this is the author's OWN, REAL register (fiscalReceipts.ts,
      // checkRegister). A failed attempt never replaces a register that already works.
      const { data: rcv } = await admin.from("author_mono_receivers").select("ipn").eq("author_id", user.id).maybeSingle();
      let check: RegisterCheck;
      try {
        check = await verifyViaCheckbox({ licenseKey, pin }, rcv?.ipn ? String(rcv.ipn) : null, fetch as unknown as FetchLike);
      } catch (e) {
        if (e instanceof FiscalError && e.code === "prro_auth") throw new FinanceError("prro_auth", "Каса не прийняла ключ або PIN. Перевірте дані в кабінеті Checkbox.");
        throw new FinanceError("prro_unavailable", `Каса зараз не відповідає. Спробуйте за кілька хвилин.${e instanceof Error ? ` (${e.message.slice(0, 120)})` : ""}`);
      }
      if (!check.ok) {
        // what Checkbox answered, for support (no secrets): the register's number, the tax id it reported, test or not
        await admin.from("finance_audit_log").insert({
          administrator_id: null, action: "prro_check_failed", entity_type: "author", entity_id: user.id, reason: check.reason,
          new_value: { fiscalNumber: check.fiscalNumber, taxIdReported: check.taxId ? `••••${check.taxId.slice(-4)}` : null, isTest: check.isTest },
        }).then(() => {}, () => {});
        throw new FinanceError("prro_check", check.reason ?? "Касу не вдалося перевірити.");
      }
      const { error: sErr } = await admin.rpc("author_fiscal_store", { p_author: user.id, p_license: licenseKey, p_pin: pin, p_status: "active", p_error: null });
      if (sErr) throw new FinanceError("prro_store", "Каси поки не підключаються. Спробуйте пізніше.");
      await admin.from("author_fiscal").update({ cash_register_id: check.fiscalNumber }).eq("author_id", user.id);
      return json({ ok: true, status: "active", fiscalNumber: check.fiscalNumber });
    }

    if (action === "touchActivity" || action === "requestPayout" || action === "markNotificationsRead" || action === "saveBankAccount" || action === "monoConnection" || action === "requestMonoConnection") {
      if (prof?.role !== "author") return json({ error: "Лише для авторів." }, 403);
      const settings = await loadSettings();

      if (action === "touchActivity") {
        const type = String(payload.type ?? "");
        if (!isMeaningful(type)) return json({ ok: true, counted: false });
        const plan = await applyWithRetry(async () => {
          const account = await loadAccount(user.id);
          return planActivity({ now: nowIso(), account, type });
        }, null);
        if (plan) await admin.from("author_activity").insert({ author_id: user.id, activity_type: type, is_meaningful: true });
        return json({ ok: true, counted: !!plan });
      }

      if (action === "markNotificationsRead") {
        await admin.from("financial_notifications").update({ read_at: nowIso() }).eq("author_id", user.id).is("read_at", null);
        // reading the notifications is itself meaningful activity
        await applyWithRetry(async () => planActivity({ now: nowIso(), account: await loadAccount(user.id), type: "ack_notification" }), null);
        return json({ ok: true });
      }

      // connecting the author's FOP/TOV to the monobank split: the author names it, the owner links monobank's receiver id
      if (action === "monoConnection") {
        const { data: r } = await admin.from("author_mono_receivers").select("status, ipn, legal_name, updated_at").eq("author_id", user.id).maybeSingle();
        return json({ ok: true, status: r?.status ?? "none", ipnLast4: r?.ipn ? String(r.ipn).slice(-4) : null, legalName: r?.legal_name ?? null, updatedAt: r?.updated_at ?? null });
      }
      if (action === "requestMonoConnection") {
        const ipn = String(payload.ipn ?? "").replace(/\s+/g, "");
        const legalName = String(payload.legalName ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
        if (!validateTaxId(ipn)) throw new FinanceError("bad_tax_id", "РНОКПП ФОП — 10 цифр, ЄДРПОУ ТОВ — 8 цифр.");
        if (legalName.length < 5) throw new FinanceError("bad_name", "Вкажіть назву ФОП або ТОВ повністю, як у документах.");
        // A6 (paid sales) must be signed with a code first; a missing function = not migrated yet
        const { data: paidOk, error: paidErr } = await admin.rpc("has_current_consent", { p_uid: user.id, p_document: "author_paid_sales" });
        if (!paidErr && paidOk === false) throw new FinanceError("paid_consent_required", "Спершу підтвердьте умови платних продажів кодом з листа.");
        const { data: cur } = await admin.from("author_mono_receivers").select("status, ipn").eq("author_id", user.id).maybeSingle();
        if (cur?.status === "active" && cur.ipn === ipn) return json({ ok: true, status: "active", unchanged: true });
        // a new FOP means a new receiver: until the owner links it, paid sales wait (the old receiver is not reused)
        const { error: upErr } = await admin.from("author_mono_receivers").upsert(
          { author_id: user.id, ipn, legal_name: legalName, status: "requested", receiver_id: null, updated_at: nowIso() },
          { onConflict: "author_id" },
        );
        if (upErr) throw new Error(upErr.message);
        await admin.from("finance_audit_log").insert({ administrator_id: null, action: "mono_connection_requested", entity_type: "author", entity_id: user.id, reason: "Автор надіслав дані ФОП для підключення оплат", previous_value: cur ? { status: cur.status } : null, new_value: { ipn: `••••${ipn.slice(-4)}`, legalName } });
        return json({ ok: true, status: "requested" });
      }

      if (action === "saveBankAccount") {
        const ibanCheck = validateUaIban(String(payload.iban ?? ""));
        if (!ibanCheck.ok) throw new FinanceError("bad_iban", ibanCheck.error);
        const holderName = String(payload.holderName ?? "").trim().replace(/\s+/g, " ");
        const taxId = String(payload.taxId ?? "").replace(/\s+/g, "");
        const bankName = String(payload.bankName ?? "").trim().slice(0, 80);
        if (holderName.length < 5) throw new FinanceError("bad_holder", "Вкажіть ПІБ власника рахунку повністю, як у банку.");
        if (!validateTaxId(taxId)) throw new FinanceError("bad_tax_id", "РНОКПП має містити 10 цифр (ЄДРПОУ — 8).");
        const { data: same } = await admin.from("author_bank_accounts").select("id, status, holder_name, tax_id").eq("author_id", user.id).eq("iban", ibanCheck.iban).in("status", ["pending", "verified"]).maybeSingle();
        if (same && same.holder_name === holderName && same.tax_id === taxId) return json({ ok: true, id: same.id, status: same.status, unchanged: true });
        // a newer request replaces the previous pending one; a verified account keeps working until the new one is verified
        await admin.from("author_bank_accounts").update({ status: "rejected", reject_reason: "Замінено новішим запитом автора" }).eq("author_id", user.id).eq("status", "pending");
        const { data: ins, error: insErr } = await admin
          .from("author_bank_accounts")
          .insert({ author_id: user.id, iban: ibanCheck.iban, bank_name: bankName, holder_name: holderName, tax_id: taxId })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        await admin.from("finance_audit_log").insert({ administrator_id: null, action: "bank_account_submitted", entity_type: "author", entity_id: user.id, reason: "Автор вказав банківський рахунок", previous_value: null, new_value: { accountId: ins.id, iban: `••••${ibanCheck.iban.slice(-4)}` } });
        return json({ ok: true, id: ins.id, status: "pending" });
      }

      if (settings.autoPayout) throw new FinanceError("auto_only", "Виплати відбуваються автоматично після періоду підтвердження — запит не потрібен.");
      // requestPayout: always to the author's VERIFIED account, never to anything typed in the request
      const amountKop = Number(payload.amountKop);
      const bankAccount = await loadVerifiedBank(user.id);
      const payoutId = uuid();
      await applyWithRetry(async () => planPayoutRequest({ settings, now: nowIso(), account: await loadAccount(user.id), payoutId, amountKop, bankAccount }), user.id);
      return json({ ok: true, payoutId });
    }

    // ── administrators ──
    if (!prof?.is_admin) return json({ error: "Доступ лише для команди Sensoria." }, 403);
    const adminRole = prof.admin_role === "support" ? "support" : "owner";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    let aal = "aal1";
    try {
      aal = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1";
    } catch { /* keep aal1 */ }
    if (!(Deno.env.get("ADMIN_REQUIRE_2FA") === "false" || aal === "aal2")) {
      return json({ error: "Потрібна двофакторна автентифікація." }, 403);
    }
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    const settings = await loadSettings();

    // reads (owner and support)
    if (action === "overview") {
      const [{ data: totals }, { data: bad }, { data: accounts }, { data: pend }, { count: ntest }] = await Promise.all([
        admin.rpc("finance_totals"),
        admin.rpc("finance_verify"),
        admin.from("author_financial_accounts").select("author_id, account_status, debt_kop"),
        admin.from("payouts").select("id").eq("payout_status", "requested"),
        admin.from("finance_payments").select("id", { count: "exact", head: true }).eq("mode", "test"),
      ]);
      const list = accounts ?? [];
      return json({
        mode: (await admin.from("finance_settings").select("mode").eq("id", 1).single()).data?.mode ?? "test",
        settings,
        totals,
        mismatches: bad ?? [],
        authorsWithDebt: list.filter((a) => Number(a.debt_kop) > 0).length,
        authorsSuspended: list.filter((a) => ["SALES_SUSPENDED", "DEBT_COLLECTION"].includes(a.account_status)).length,
        pendingPayouts: (pend ?? []).length,
        pendingBankAccounts: (await admin.from("author_bank_accounts").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0,
        testPayments: ntest ?? 0,
        role: adminRole,
      });
    }
    if (action === "authors") {
      const { data: accounts } = await admin.from("author_financial_accounts").select("*").order("debt_kop", { ascending: false }).limit(300);
      const ids = (accounts ?? []).map((a) => a.author_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
      // deno-lint-ignore no-explicit-any
      const byId = new Map<string, any>((profs ?? []).map((p: { id: string }) => [p.id, p]));
      return json({ authors: (accounts ?? []).map((a) => ({ ...a, name: byId.get(a.author_id)?.name ?? "—", email: byId.get(a.author_id)?.email ?? "" })) });
    }
    if (action === "author") return json(await authorOverview(String(payload.authorId)));
    if (action === "verify") return json({ mismatches: (await admin.rpc("finance_verify")).data ?? [] });
    if ((action === "bankAccounts" || action === "payoutRegistry" || action === "monoReceivers" || action === "setMonoReceiver") && adminRole !== "owner") {
      return json({ error: "Банківські реквізити авторів доступні лише власнику." }, 403);
    }
    if (action === "bankAccounts") {
      const { data: rows } = await admin.from("author_bank_accounts").select("*").in("status", ["pending"]).order("created_at", { ascending: true }).limit(100);
      const ids = (rows ?? []).map((r) => r.author_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
      // deno-lint-ignore no-explicit-any
      const byId = new Map<string, any>((profs ?? []).map((p: { id: string }) => [p.id, p]));
      return json({
        accounts: (rows ?? []).map((r) => ({
          ...r,
          authorName: byId.get(r.author_id)?.name ?? "—",
          authorEmail: byId.get(r.author_id)?.email ?? "",
          holderMatches: holderLooksLikeAuthor(r.holder_name, byId.get(r.author_id)?.name ?? ""),
        })),
      });
    }
    if (action === "payoutRegistry") {
      // A file for the bank client's bulk-payment import. The order is built from each payout's own snapshot of the verified account.
      const { data: rows } = await admin.from("payouts").select("*").eq("payout_status", "requested").order("requested_at", { ascending: true });
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [["payout_id", "amount_uah", "iban", "holder", "tax_id", "purpose"].join(";")];
      for (const r of rows ?? []) {
        lines.push([
          r.id, (Number(r.amount_kop) / 100).toFixed(2), r.destination_iban, esc(r.destination_holder), r.destination_tax_id,
          esc(`Авторська винагорода Sensoria, виплата ${String(r.id).slice(0, 8)}`),
        ].join(";"));
      }
      return json({ count: rows?.length ?? 0, csv: lines.join("\n"), totalKop: (rows ?? []).reduce((s, r) => s + Number(r.amount_kop), 0) });
    }
    if (action === "payoutQueue") {
      const { data } = await admin.from("payouts").select("*").in("payout_status", ["requested", "processing"]).order("requested_at", { ascending: true });
      return json({ payouts: data ?? [] });
    }

    // everything below changes money or statuses: owner only, with a reason
    if (adminRole !== "owner") return json({ error: "Фінансові дії доступні лише власнику." }, 403);
    const authorIdOf = async (table: string, id: string) => (await admin.from(table).select("author_id").eq("id", id).single()).data?.author_id as string;

    if (action === "confirmPayment") {
      const mode = (await admin.from("finance_settings").select("mode").eq("id", 1).single()).data?.mode ?? "test";
      if (mode !== "test") return json({ error: "live_not_ready", message: "Реальний режим недоступний: банківський шар ще не підключено." }, 400);
      const { data: pu } = await admin.from("purchases").select("id, participant_id, content_id, amount, status, purchased_at").eq("id", payload.purchaseId).single();
      if (!pu) throw new FinanceError("no_purchase", "Покупку не знайдено.");
      if (pu.status !== "completed") throw new FinanceError("bad_status", "Покупка не в статусі «completed».");
      const { data: content } = await admin.from("content").select("author_id, title").eq("id", pu.content_id).single();
      if (!content) throw new FinanceError("no_content", "Матеріал не знайдено.");
      const amountKop = Math.round(Number(pu.amount) * 100);
      if (settings.splitAtSource && !(await loadVerifiedBank(content.author_id as string))) {
        throw new FinanceError("author_no_bank", "У автора немає підтвердженого банківського рахунку: розподіл оплати неможливий.");
      }
      // referral rate only on the server's own record of the buyer's click (never from the client)
      const { data: attr } = await admin.from("referral_attributions").select("created_at")
        .eq("buyer_id", pu.participant_id).eq("author_id", content.author_id).maybeSingle();
      const source = pickSaleSource(attr?.created_at ?? null, pu.purchased_at);
      const plan = await applyWithRetry(async () => {
        const authorId = content.author_id as string;
        const [account, debts] = await Promise.all([loadAccount(authorId), loadDebts(authorId)]);
        return planPaymentReceived({
          settings, now: nowIso(), account, debts,
          purchase: { purchaseId: pu.id, authorId, buyerId: pu.participant_id, amountKop, contentId: pu.content_id, contentTitle: content.title, source },
          paymentId: uuid(), reserveId: uuid(), externalReference: String(payload.reference ?? "TEST").slice(0, 120), mode: "test",
        });
      }, user.id);
      return json({ ok: true, key: plan?.key });
    }

    if (action === "refund") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const requestKey = String(payload.requestKey ?? "");
      if (requestKey.length < 8) throw new FinanceError("no_key", "Бракує ключа запиту (захист від подвійного повернення).");
      const { data: pay } = await admin.from("finance_payments").select("*").eq(payload.paymentId ? "id" : "purchase_id", payload.paymentId ?? payload.purchaseId).single();
      if (!pay) throw new FinanceError("no_payment", "Платіж не знайдено: оплату ще не підтверджено.");
      const kind = (payload.kind as RefundKind) ?? "full";
      const authorId = pay.author_id as string;
      try {
        await monoCancelIfNeeded(pay.purchase_id as string, kind, requestKey);
      } catch (e) {
        // monobank refuses a refund when a receiver's account lacks the money: the author learns it at once and the
        // attempt stays in the audit log, so the team can agree with the author and try again
        if (e instanceof FinanceError && e.code === "mono_cancel_failed") {
          await admin.from("financial_notifications").insert({
            author_id: authorId, event_type: "REFUND_FAILED", dedupe_key: `refund-failed:${requestKey}`,
            message: `Банк не провів повернення коштів покупцю за «${pay.content_title ?? "матеріал"}». Найчастіше причина — на вашому рахунку ФОП бракує суми вашої частки. Поповніть рахунок, і ми повторимо повернення.`,
          });
          await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "refund_failed_at_bank", entity_type: "payment", entity_id: pay.id, reason, previous_value: null, new_value: { purchaseId: pay.purchase_id, kind } });
          // the order shows «Повернення відхилено банком» in the admin panel; the buyer keeps access until it goes through
          await admin.from("mono_invoices").update({ review_reason: "refund_declined_by_bank", updated_at: nowIso() }).eq("id", pay.purchase_id);
          await admin.from("admin_alert_outbox").insert({
            kind: "refund_declined", title: "Повернення відхилено банком", urgent: true,
            details: `«${pay.content_title ?? "матеріал"}», замовлення ${String(pay.purchase_id).slice(0, 8)}: банк не провів повернення (найчастіше бракує коштів на рахунку автора). Автора повідомлено; доступ покупця не знято.`,
          }).then(() => {}, () => {});
        }
        throw e;
      }
      const plan = await applyWithRetry(async () => {
        const [account, fresh, reserveRows] = await Promise.all([
          loadAccount(authorId),
          admin.from("finance_payments").select("*").eq("id", pay.id).single(),
          admin.from("refund_reserves").select("*").eq("payment_id", pay.id).limit(1),
        ]);
        const payment = toPayment(fresh.data);
        const amountKop = kind === "partial" ? Number(payload.amountKop) : payment.amountKop - payment.refundedKop;
        return planRefund({
          now: nowIso(), account, payment, reserve: reserveRows.data?.[0] ? toReserve(reserveRows.data[0]) : null,
          refundId: uuid(), debtId: uuid(), idempotencyKey: requestKey, amountKop, kind, reason,
        });
      }, user.id);
      // a fully refunded order no longer gives the buyer access
      const after = (await admin.from("finance_payments").select("amount_kop, refunded_kop, purchase_id").eq("id", pay.id).single()).data;
      if (after && Number(after.refunded_kop) >= Number(after.amount_kop)) {
        await admin.from("mono_invoices").update({ review_reason: null }).eq("id", pay.purchase_id).eq("review_reason", "refund_declined_by_bank");
        await revokePaidAccess(after.purchase_id as string);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: `refund_${kind}`, entity_type: "payment", entity_id: pay.id, reason, previous_value: null, new_value: { key: plan?.key } });
      return json({ ok: true });
    }

    // Б39 / В6: the dispute is closed by the bank's letter
    if (action === "closeDispute") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину (номер листа банку).");
      const outcome = payload.outcome === "lost" ? "lost" : "won";
      const debitedFrom = payload.debitedFrom === "author_full" ? "author_full" : "proportional";
      const debitedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.debitedAt ?? "")) ? String(payload.debitedAt) : kyivDay(nowIso());
      const { data: pay } = await admin.from("finance_payments").select("*").eq("id", String(payload.paymentId)).single();
      if (!pay) throw new FinanceError("no_payment", "Платіж не знайдено.");
      if (outcome === "won") {
        await admin.from("finance_payments").update({ disputed: false, dispute_outcome: "won", dispute_closed_at: nowIso() }).eq("id", pay.id);
        await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "dispute_won", entity_type: "payment", entity_id: pay.id, reason });
        return json({ ok: true });
      }
      // lost: the buyer got the money back — books as a chargeback, access ends, return receipts
      await applyWithRetry(async () => {
        const [account, fresh, reserveRows] = await Promise.all([
          loadAccount(pay.author_id),
          admin.from("finance_payments").select("*").eq("id", pay.id).single(),
          admin.from("refund_reserves").select("*").eq("payment_id", pay.id).limit(1),
        ]);
        const payment = toPayment(fresh.data);
        const amountKop = payment.amountKop - payment.refundedKop;
        if (amountKop <= 0) return null;
        return planRefund({
          now: nowIso(), account, payment, reserve: reserveRows.data?.[0] ? toReserve(reserveRows.data[0]) : null,
          refundId: uuid(), debtId: uuid(), idempotencyKey: `chargeback:${pay.id}`, amountKop, kind: "chargeback", reason,
        });
      }, user.id).catch((e) => {
        if (e instanceof FinanceError && e.code === "duplicate") return null;
        throw e;
      });
      await admin.from("finance_payments").update({ disputed: false, dispute_outcome: "lost", dispute_debited_from: debitedFrom, dispute_closed_at: nowIso() }).eq("id", pay.id);
      await revokePaidAccess(pay.purchase_id);
      const { data: row } = await admin.from("mono_invoices").select("*").eq("id", pay.purchase_id).maybeSingle();
      if (row) {
        await queueReceipts(row as MonoRow, "return");
        await fiscalSendDue(row.id).catch((e) => console.error("fiscal send", row.id, e));
      }
      // the bank took everything from the author: Sensoria repays its tariff within 5 working days, a separate payment
      if (debitedFrom === "author_full") {
        const tariff = (row?.mode === "live" ? agentFeeKopOf(row?.payment_info) : null) ?? Number(pay.sensoria_kop);
        const due = await workingDaysFrom(debitedAt, 5);
        await admin.from("tariff_refund_tasks").upsert(
          { payment_id: pay.id, purchase_id: pay.purchase_id, author_id: pay.author_id, amount_kop: tariff, debited_at: debitedAt, due_date: due },
          { onConflict: "payment_id", ignoreDuplicates: true },
        );
        await admin.from("admin_alert_outbox").insert({ kind: "tariff_refund", title: "Повернути тариф Автору", urgent: true, details: `Програний чарджбек, замовлення ${String(pay.purchase_id).slice(0, 8)}: перерахуйте автору ${(tariff / 100).toFixed(2)} ₴ до ${due} окремим платежем.` }).then(() => {}, () => {});
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "dispute_lost", entity_type: "payment", entity_id: pay.id, reason, new_value: { debitedFrom, debitedAt } });
      return json({ ok: true });
    }
    // Книга обліку доходів Sensoria (ФОП, 3 група): дохід = зарахований тариф, за ДАТОЮ ЗАРАХУВАННЯ (п. 292.6 ПКУ);
    // повернення тарифу — окремо з мінусом. Сума тарифу — фактична від банку (paymentInfo.agentFee), інакше розрахункова.
    // Дату зарахування банк не повідомляє: «наступного дня» (оцінка) — звіряти з випискою рахунку ФОП перед внесенням.
    if (action === "incomeBook") {
      if (adminRole !== "owner") return json({ error: "Лише для власниці." }, 403);
      const year = Number(payload.year) || new Date().getUTCFullYear();
      const mode = payload.mode === "test" ? "test" : "live";
      const from = `${year - 1}-01-01T00:00:00Z`; // the year before too: the rolling 12 months for the VAT watch
      const to = `${year + 1}-01-01T00:00:00Z`;
      const { data: pays, error: pErr } = await admin.from("finance_payments")
        .select("id, purchase_id, sensoria_kop, split_sensoria_kop, confirmed_at").eq("mode", mode).gte("confirmed_at", from).lt("confirmed_at", to).limit(20000);
      if (pErr) throw new FinanceError("book_failed", pErr.message);
      const ids = (pays ?? []).map((p) => p.purchase_id as string);
      const invs: { id: string; payment_info: unknown }[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await admin.from("mono_invoices").select("id, payment_info").in("id", ids.slice(i, i + 500));
        invs.push(...((data ?? []) as { id: string; payment_info: unknown }[]));
      }
      const payIds = (pays ?? []).map((p) => p.id as string);
      const refunds: { payment_id: string; sensoria_share_kop: number; created_at: string; completed_at: string | null; refund_type: string }[] = [];
      for (let i = 0; i < payIds.length; i += 500) {
        const { data } = await admin.from("finance_refunds").select("payment_id, sensoria_share_kop, created_at, completed_at, refund_type")
          .in("payment_id", payIds.slice(i, i + 500)).in("status", ["approved", "completed"]);
        refunds.push(...((data ?? []) as typeof refunds));
      }
      const { data: tariffBack } = await admin.from("tariff_refund_tasks").select("payment_id, amount_kop, paid_at").eq("status", "paid").gte("paid_at", from).lt("paid_at", to);
      const paidAtOf = new Map((pays ?? []).map((p) => [p.id as string, p.confirmed_at as string]));
      const entries: BookEntry[] = [];
      let estimatedFee = 0;
      for (const p of pays ?? []) {
        const bank = mode === "live" ? agentFeeKopOf(invs.find((v) => v.id === p.purchase_id)?.payment_info) : null;
        if (bank == null) estimatedFee += 1;
        const tariff = bank ?? Number(p.split_sensoria_kop ?? p.sensoria_kop ?? 0);
        if (tariff > 0) entries.push({ kind: "income", tariffKop: tariff, creditedAt: new Date(Date.parse(p.confirmed_at as string) + 86_400_000).toISOString(), paidAt: p.confirmed_at as string });
      }
      const earlier: { paidAt: string; refundedAt: string; tariffKop: number }[] = [];
      for (const r of refunds) {
        const t = Number(r.sensoria_share_kop);
        if (t <= 0) continue;
        const at = r.completed_at ?? r.created_at;
        entries.push({ kind: "refund", tariffKop: t, creditedAt: at });
        const paidAt = paidAtOf.get(r.payment_id);
        if (paidAt && refundOfEarlierQuarter(paidAt, at)) earlier.push({ paidAt, refundedAt: at, tariffKop: t });
      }
      for (const t of tariffBack ?? []) {
        if (Number(t.amount_kop) > 0 && t.paid_at) entries.push({ kind: "refund", tariffKop: Number(t.amount_kop), creditedAt: t.paid_at as string });
      }
      const inYear = entries.filter((e) => kyivDay(e.creditedAt).startsWith(String(year)));
      const ytd = inYear.reduce((n, e) => n + (e.kind === "income" ? e.tariffKop : -e.tariffKop), 0);
      const now = nowIso();
      const rolling = rolling12Kop(entries, now);
      return json({
        year, mode,
        days: incomeBook(inYear),
        quarters: [1, 2, 3, 4].map((q) => ({ quarter: `${year}-Q${q}`, kop: quarterIncomeKop(inYear, `${year}-Q${q}`) })),
        ytdKop: ytd, limitKop: GROUP3_LIMIT_2026_KOP, limit: limitLevel(ytd),
        rolling12Kop: rolling, vat: vatLevel(rolling),
        earlierQuarterRefunds: earlier.filter((e) => kyivDay(e.refundedAt).startsWith(String(year))),
        estimatedTariffs: estimatedFee,
      });
    }
    if (action === "tariffTasks") {
      const { data } = await admin.from("tariff_refund_tasks").select("*").eq("status", "open").order("due_date");
      const ids = [...new Set((data ?? []).map((t) => t.author_id))];
      const [{ data: profs }, { data: rcv }] = await Promise.all([
        ids.length ? admin.from("profiles").select("id, name").in("id", ids) : Promise.resolve({ data: [] }),
        ids.length ? admin.from("author_mono_receivers").select("author_id, legal_name, ipn").in("author_id", ids) : Promise.resolve({ data: [] }),
      ]);
      return json({
        tasks: (data ?? []).map((t) => ({
          ...t,
          authorName: (profs ?? []).find((p) => p.id === t.author_id)?.name ?? "—",
          legalName: (rcv ?? []).find((r) => r.author_id === t.author_id)?.legal_name ?? null,
          code: (rcv ?? []).find((r) => r.author_id === t.author_id)?.ipn ?? null,
        })),
      });
    }
    if (action === "tariffTaskPaid") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const ref = String(payload.bankReference ?? "").trim();
      if (ref.length < 3) throw new FinanceError("no_reference", "Вкажіть номер платіжної інструкції з банку.");
      const { data: t } = await admin.from("tariff_refund_tasks").update({ status: "paid", paid_at: nowIso(), bank_reference: ref.slice(0, 120) }).eq("id", String(payload.taskId)).eq("status", "open").select("*").maybeSingle();
      if (!t) throw new FinanceError("no_task", "Завдання не знайдено або вже закрите.");
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "tariff_refunded_to_author", entity_type: "payment", entity_id: t.payment_id, reason, new_value: { amountKop: t.amount_kop, bankReference: ref } });
      await admin.from("financial_notifications").insert({ author_id: t.author_id, event_type: "TARIFF_REFUNDED", dedupe_key: `tariff-refund:${t.id}`, message: `Sensoria повернула вам тариф ${(Number(t.amount_kop) / 100).toFixed(2)} ₴ за замовленням ${String(t.purchase_id).slice(0, 8)} після програного спору щодо платежу.` }).then(() => {}, () => {});
      return json({ ok: true });
    }

    // Б38: Sensoria signs each act with КЕП on id.gov.ua; the signed file is what the author gets
    if (action === "actsToSign") {
      const period = /^\d{4}-\d{2}$/.test(String(payload.period ?? "")) ? String(payload.period) : null;
      let q = admin.from("service_acts").select("id, author_id, period, number, data, issued_at, accept_until, status, decided_at, objection, operator_signed_at, author_signed_at").order("period", { ascending: false }).limit(300);
      q = period ? q.eq("period", period) : q.eq("status", "draft");
      const { data } = await q;
      const ids = [...new Set((data ?? []).map((a) => a.author_id))];
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name").in("id", ids) : { data: [] };
      return json({ acts: (data ?? []).map((a) => ({ ...a, authorName: (profs ?? []).find((p) => p.id === a.author_id)?.name ?? "—" })) });
    }
    if (action === "actUploadUrl") {
      const { data: a } = await admin.from("service_acts").select("id").eq("id", String(payload.actId)).maybeSingle();
      if (!a) throw new FinanceError("no_act", "Акт не знайдено.");
      return json({ ok: true, ...(await actUploadSlot(a.id, "operator", String(payload.fileName ?? ""))) });
    }
    if (action === "actSigned") {
      const { data: a } = await admin.from("service_acts").select("id, author_id, period, number, status").eq("id", String(payload.actId)).maybeSingle();
      if (!a) throw new FinanceError("no_act", "Акт не знайдено.");
      const path = await actUploadedPath(a.id, "operator", String(payload.path ?? ""));
      if (a.status === "draft") {
        // placed for the author now: the 5 working days start today (issued_at stays the act's date, as in the signed PDF)
        const today = kyivDay(nowIso());
        await admin.from("service_acts").update({ operator_signed_path: path, operator_signed_at: nowIso(), status: "issued", accept_until: await workingDaysFrom(today, 5) }).eq("id", a.id);
        await admin.from("financial_notifications").insert({ author_id: a.author_id, event_type: "ACT_ISSUED", dedupe_key: `act:${a.period}`, message: `Акт № ${a.number} про надання послуг за ${a.period}, підписаний КЕП Sensoria, розміщено в «Фінансах». Якщо маєте заперечення, надішліть їх протягом 5 робочих днів.` }).then(() => {}, () => {});
      } else {
        await admin.from("service_acts").update({ operator_signed_path: path, operator_signed_at: nowIso() }).eq("id", a.id);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "act_signed_by_operator", entity_type: "service_act", entity_id: a.id, reason: reason || "КЕП", new_value: { path } });
      return json({ ok: true });
    }

    if (action === "markDisputed") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const paymentId = String(payload.paymentId);
      const disputed = !!payload.disputed;
      const authorId = await authorIdOf("finance_payments", paymentId);
      const plan: Plan = {
        key: `dispute:${paymentId}:${disputed}:${nowIso()}`, kind: "DISPUTE", authorId, expectedVersion: null,
        lines: [], payments: [{ op: "update", row: { id: paymentId, disputed } }], debts: [], reserves: [], refunds: [], payouts: [],
        notifications: [], statusLog: [], audit: { action: disputed ? "payment_disputed" : "payment_dispute_closed", reason, previous: { disputed: !disputed }, next: { disputed } },
      };
      const { error } = await admin.rpc("finance_apply", { p: plan, p_actor: user.id });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "repayDebt") {
      const authorId = String(payload.authorId);
      const source = payload.source === "available" ? "available" : "cash";
      await applyWithRetry(async () => {
        const [account, debts] = await Promise.all([loadAccount(authorId), loadDebts(authorId)]);
        return planManualDebtRepayment({ now: nowIso(), account, debts, amountKop: Number(payload.amountKop), source, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()) });
      }, user.id);
      return json({ ok: true });
    }

    if (action === "setStatus") {
      const authorId = String(payload.authorId);
      await applyWithRetry(async () =>
        planAdminStatus({ now: nowIso(), account: await loadAccount(authorId), action: payload.statusAction, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()) }), user.id);
      return json({ ok: true });
    }

    // monobank split receivers: requests from authors + monobank's own list (matched by IPN/EDRPOU where the bank returns it)
    if (action === "monoReceivers") {
      const { data: rows } = await admin.from("author_mono_receivers").select("*").order("updated_at", { ascending: false }).limit(300);
      const ids = (rows ?? []).map((r) => r.author_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("id, name, email").in("id", ids) : { data: [] };
      // deno-lint-ignore no-explicit-any
      const byId = new Map<string, any>((profs ?? []).map((p: { id: string }) => [p.id, p]));
      let bank: Record<string, unknown>[] = [];
      let bankError: string | null = null;
      if (Deno.env.get("MONO_TOKEN")) {
        try {
          const res = await monoCall("/api/merchant/split-receiver/list");
          bank = Array.isArray(res?.list) ? res.list : Array.isArray(res) ? res : [];
        } catch (e) {
          bankError = e instanceof Error ? e.message : String(e);
        }
      }
      const idOf = (b: Record<string, unknown>) => String(b.splitReceiverId ?? b.id ?? "");
      const codeOf = (b: Record<string, unknown>) => String(b.ipn ?? b.edrpou ?? b.taxId ?? b.code ?? "").replace(/\s+/g, "");
      return json({
        receivers: (rows ?? []).map((r) => ({
          authorId: r.author_id, name: byId.get(r.author_id)?.name ?? "—", email: byId.get(r.author_id)?.email ?? "",
          ipn: r.ipn, legalName: r.legal_name, status: r.status, receiverId: r.receiver_id, updatedAt: r.updated_at,
          suggested: r.ipn ? bank.filter((b) => codeOf(b) === r.ipn).map(idOf).filter(Boolean) : [],
        })),
        bank: bank.map((b) => ({ id: idOf(b), name: String(b.name ?? b.legalName ?? b.fullName ?? ""), code: codeOf(b) })),
        bankError,
      });
    }
    if (action === "setMonoReceiver") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину (що саме ви перевірили).");
      const authorId = String(payload.authorId ?? "");
      const disable = !!payload.disable;
      const receiverId = String(payload.receiverId ?? "").trim().slice(0, 120);
      if (!disable && !receiverId) throw new FinanceError("bad_receiver", "Вкажіть splitReceiverId з monobank.");
      const { data: cur } = await admin.from("author_mono_receivers").select("*").eq("author_id", authorId).maybeSingle();
      if (!cur) throw new FinanceError("bad_author", "Автор ще не надсилав даних ФОП.");
      await admin.from("author_mono_receivers").update(disable ? { status: "disabled", updated_at: nowIso() } : { status: "active", receiver_id: receiverId, updated_at: nowIso() }).eq("author_id", authorId);
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: disable ? "mono_receiver_disabled" : "mono_receiver_linked", entity_type: "author", entity_id: authorId, reason, previous_value: { status: cur.status, receiverId: cur.receiver_id }, new_value: disable ? { status: "disabled" } : { status: "active", receiverId } });
      await admin.from("financial_notifications").insert({
        author_id: authorId, event_type: disable ? "MONO_DISABLED" : "MONO_CONNECTED", dedupe_key: `mono:${authorId}:${disable ? "off" : receiverId}`,
        message: disable ? `Прийом оплат призупинено. Причина: ${reason}` : "Прийом оплат підключено: ваша частка надходитиме на рахунок ФОП у monobank.",
      });
      return json({ ok: true });
    }

    if (action === "verifyBankAccount") {
      const approve = !!payload.approve;
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину (що саме ви перевірили).");
      const { data: acct } = await admin.from("author_bank_accounts").select("*").eq("id", payload.accountId).single();
      if (!acct || acct.status !== "pending") throw new FinanceError("bad_account", "Рахунок не знайдено або вже опрацьовано.");
      if (approve) {
        await admin.from("author_bank_accounts").update({ status: "replaced" }).eq("author_id", acct.author_id).eq("status", "verified");
        await admin.from("author_bank_accounts").update({ status: "verified", verified_by: user.id, verified_at: nowIso() }).eq("id", acct.id);
        // payout orders made for the OLD account can no longer be confirmed (see planPayoutConfirm)
      } else {
        await admin.from("author_bank_accounts").update({ status: "rejected", reject_reason: reason }).eq("id", acct.id);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: approve ? "bank_account_verified" : "bank_account_rejected", entity_type: "author", entity_id: acct.author_id, reason, previous_value: { status: "pending" }, new_value: { accountId: acct.id, iban: `••••${String(acct.iban).slice(-4)}`, holder: acct.holder_name } });
      await admin.from("financial_notifications").insert({
        author_id: acct.author_id, event_type: approve ? "BANK_ACCOUNT_VERIFIED" : "BANK_ACCOUNT_REJECTED", dedupe_key: `bank:${acct.id}:${approve}`,
        message: approve ? "Ваш банківський рахунок підтверджено: виплати надходитимуть на нього." : `Банківський рахунок не підтверджено. Причина: ${reason}`,
      });
      return json({ ok: true });
    }

    if (action === "bankFeeSettle") {
      const { data: totals } = await admin.rpc("finance_totals");
      await applyWithRetry(async () => planBankFeeSettlement({
        now: nowIso(), paidKop: Number(payload.paidKop), collectedLeftKop: Number(totals?.bank_fee_owed_kop ?? 0),
        moveSurplusToSensoria: !!payload.moveSurplus, reason, adminId: user.id, idempotencyKey: String(payload.requestKey ?? uuid()),
      }), user.id);
      return json({ ok: true });
    }

    if (action === "payoutConfirm" || action === "payoutFail") {
      const payoutId = String(payload.payoutId);
      const { data: po } = await admin.from("payouts").select("*").eq("id", payoutId).single();
      if (!po || !["requested", "processing"].includes(po.payout_status)) throw new FinanceError("bad_payout", "Виплату не знайдено або вже опрацьовано.");
      const authorId = po.author_id as string;
      await applyWithRetry(async () => {
        const account = await loadAccount(authorId);
        return action === "payoutConfirm"
          ? planPayoutConfirm({
              now: nowIso(), account, payoutId, amountKop: Number(po.amount_kop), reference: String(payload.reference ?? ""), adminId: user.id,
              payoutBankAccountId: po.bank_account_id, currentBankAccountId: (await loadVerifiedBank(authorId))?.id ?? null,
            })
          : planPayoutFail({ now: nowIso(), account, payoutId, amountKop: Number(po.amount_kop), reason, adminId: user.id });
      }, user.id);
      return json({ ok: true });
    }

    if (action === "setSettings") {
      if (!reason) throw new FinanceError("reason_required", "Вкажіть причину.");
      const next: Settings = { ...settings, ...(payload.settings ?? {}) };
      checkSettings(next);
      await admin.from("finance_settings").update({
        author_bps: next.authorBps, commission_bps: next.commissionBps, referral_commission_bps: next.referralCommissionBps, hold_days: next.holdDays, reserve_bps: next.reserveBps,
        reserve_days: next.reserveDays, inactivity_days: next.inactivityDays, warning_grace_days: next.warningGraceDays,
        reminder_days: next.reminderDays, min_payout_kop: next.minPayoutKop, bank_fee_bps: next.bankFeeBps,
        bank_fee_fixed_kop: next.bankFeeFixedKop, auto_payout: !!next.autoPayout, split_at_source: !!next.splitAtSource,
        ...(payload.sensoriaIban !== undefined ? { sensoria_iban: String(payload.sensoriaIban).replace(/\s+/g, "") || null, sensoria_account_holder: String(payload.sensoriaHolder ?? "").trim() || null } : {}),
        updated_at: nowIso(),
      }).eq("id", 1);
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: "settings_changed", entity_type: "settings", entity_id: "1", reason, previous_value: settings, new_value: next });
      return json({ ok: true, settings: next });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    if (e instanceof FinanceError || e instanceof MonoError) return json({ error: e.code, message: e.message }, 400);
    return json({ error: "server_error", message: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
