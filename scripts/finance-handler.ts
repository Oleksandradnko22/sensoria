// Sensoria — finance Edge Function (own finance module).
//
// GENERATED FILE: supabase/functions/finance/index.ts is built from
//   - src/utils/financeEngine.ts  (the tested calculation engine), and
//   - scripts/finance-handler.ts  (this file: loading state, calling finance_apply)
// by `npm run build:finance`. Edit those two, not the output.
//
// This function never moves real money. Payments are confirmed by an
// administrator in TEST mode; the banking layer is a later stage.
//
// DEPLOY: Dashboard -> Edge Functions -> "finance" -> paste -> Deploy.
// Secrets: CRON_SECRET (for runJobs), RESEND_API_KEY / RESEND_FROM (emails),
// ADMIN_REQUIRE_2FA (as for admin-data). Schedule `runJobs` daily with the
// header  x-cron-secret: <CRON_SECRET>.
//
// Actions (POST { action, ... }):
//   author  (own JWT):  touchActivity, requestPayout, markNotificationsRead
//   admin   (2FA, owner): overview, authors, author, confirmPayment, refund,
//                         markDisputed, repayDebt, setStatus, payoutConfirm,
//                         payoutFail, setSettings, verify
//   cron:               runJobs

import { createClient } from "npm:@supabase/supabase-js@2";

// @@ENGINE@@

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
          body: JSON.stringify({ from, to: prof.email, subject: "Sensoria: фінансове сповіщення", text: n.message }),
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
  const res = { released: 0, inactivity: 0, autoPayouts: 0, distributed: 0, emails: { sent: 0, skipped: 0, failed: 0 }, errors: [] as string[] };

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

  res.emails = await sendPendingEmails();
  return res;
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
    payments: payments.data ?? [],
    reserves: reserves.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

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

    // ── who is calling ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Не авторизовано." }, 401);
    const user = userData.user;
    const { data: prof } = await admin.from("profiles").select("id, role, is_admin, admin_role").eq("id", user.id).single();

    // ── an author's own actions ──
    if (action === "touchActivity" || action === "requestPayout" || action === "markNotificationsRead" || action === "saveBankAccount") {
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
    if ((action === "bankAccounts" || action === "payoutRegistry") && adminRole !== "owner") {
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
        await admin.from("purchases").update({ status: "refunded" }).eq("id", after.purchase_id);
      }
      await admin.from("finance_audit_log").insert({ administrator_id: user.id, action: `refund_${kind}`, entity_type: "payment", entity_id: pay.id, reason, previous_value: null, new_value: { key: plan?.key } });
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
    if (e instanceof FinanceError) return json({ error: e.code, message: e.message }, 400);
    return json({ error: "server_error", message: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
