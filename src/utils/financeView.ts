import { differentQuarters, kyivQuarter, registerRow } from "./taxRegister.ts";
// Presentation helpers for the author's «Фінанси» page and the admin panel.
// Pure functions, no I/O (tested in financeView.test.ts).

export type LedgerRow = {
  id: number;
  operation_key: string;
  type: string;
  account: string;
  delta_kop: number;
  reason: string | null;
  created_at: string;
  author_share_kop?: number | null;
  order_id?: string | null;
};

export const uahFromKop = (kop: number) =>
  `${(kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: kop % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ₴`;

export const TYPE_LABEL: Record<string, string> = {
  PAYMENT_RECEIVED: "Оплату підтверджено",
  AUTHOR_EARNING: "Нарахування за продаж",
  SENSORIA_COMMISSION: "Тариф Sensoria",
  AUTHOR_PAYOUT: "Виплата",
  REFUND: "Повернення покупцю",
  PARTIAL_REFUND: "Часткове повернення покупцю",
  AUTHOR_DEBT_CREATED: "Виникла заборгованість",
  AUTHOR_DEBT_REPAID: "Погашення заборгованості",
  BANK_FEE_COLLECTED: "Комісія банку",
  BANK_FEE_PAID: "Комісія банку (розрахунок)",
  REFUND_RESERVE_CREATED: "Відкладено в резерв",
  REFUND_RESERVE_RELEASED: "Резерв звільнено",
  CHARGEBACK: "Оскаржений платіж (чарджбек)",
  MANUAL_ADJUSTMENT: "Ручна коригувальна операція",
  HOLD_RELEASED: "Кошти стали доступними",
};

export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Активний",
  DEBT: "Є заборгованість",
  INACTIVE_WITH_DEBT: "Борг і немає активності",
  WARNING: "Попередження",
  SALES_SUSPENDED: "Продажі призупинено",
  DEBT_COLLECTION: "Стягнення боргу",
  CLOSURE_REQUESTED: "Запит на припинення співпраці",
  CLOSED: "Співпрацю завершено",
};

export type HistoryRow = {
  key: string;
  date: string;
  label: string;
  /** Signed, from the AUTHOR's side: what happened to their money. null = informational. */
  amountKop: number | null;
  note: string;
};

const pick = (rows: LedgerRow[], account: string) => rows.find((r) => r.account === account);
const sum = (rows: LedgerRow[], account: string) => rows.filter((r) => r.account === account).reduce((s, r) => s + r.delta_kop, 0);

/**
 * One line per (operation, type) instead of the raw double-entry lines, so an
 * author sees «Нарахування +750 ₴», not four technical rows.
 */
export function historyRows(entries: LedgerRow[]): HistoryRow[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const e of entries) {
    // Sensoria's own and cash lines are not the author's business
    if (["cash_in", "cash_out", "sensoria_revenue"].includes(e.account) && e.type !== "AUTHOR_PAYOUT") continue;
    const k = `${e.operation_key}|${e.type}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const rows: HistoryRow[] = [];
  for (const [key, g] of groups) {
    const type = g[0].type;
    const date = g.reduce((m, r) => (r.created_at > m ? r.created_at : m), g[0].created_at);
    const note = g.find((r) => r.reason)?.reason ?? "";
    let amount: number | null;
    switch (type) {
      case "AUTHOR_EARNING": amount = sum(g, "author_earned") || sum(g, "author_pending"); break;
      case "HOLD_RELEASED": amount = sum(g, "author_available"); break;
      case "REFUND": case "PARTIAL_REFUND": case "CHARGEBACK": amount = -sum(g, "author_refunded"); break;
      case "AUTHOR_DEBT_CREATED": amount = sum(g, "author_debt"); break;
      case "AUTHOR_DEBT_REPAID": amount = -Math.abs(sum(g, "author_debt")); break;
      case "REFUND_RESERVE_CREATED": amount = sum(g, "author_reserved"); break;
      case "REFUND_RESERVE_RELEASED": amount = -Math.abs(sum(g, "author_reserved")); break;
      case "AUTHOR_PAYOUT": amount = pick(g, "author_paid_out") ? -sum(g, "author_paid_out") : -Math.abs(sum(g, "author_available")); break;
      case "MANUAL_ADJUSTMENT": amount = sum(g, "author_available") || null; break;
      default: amount = null;
    }
    if (type === "AUTHOR_PAYOUT" && !pick(g, "author_paid_out")) {
      rows.push({ key, date, label: "Запит на виплату", amountKop: amount, note });
    } else {
      rows.push({ key, date, label: TYPE_LABEL[type] ?? type, amountKop: amount, note });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Plain-language text for the status banner; null when nothing needs saying. */
export function statusExplanation(status: string, debtKop: number): { tone: "info" | "warn" | "danger"; text: string } | null {
  switch (status) {
    case "DEBT":
      return { tone: "info", text: `У вас є заборгованість ${uahFromKop(debtKop)}: покупцеві повернули гроші після того, як ви вже отримали свою частку. Нові нарахування за продажі автоматично її погашають; продажі тривають.` };
    case "INACTIVE_WITH_DEBT":
    case "WARNING":
      return { tone: "warn", text: `Є заборгованість ${uahFromKop(debtKop)} і давно не було активності. Увійдіть у кабінет і перегляньте цю сторінку, інакше нові продажі буде призупинено.` };
    case "SALES_SUSPENDED":
      return { tone: "danger", text: `Нові продажі ваших матеріалів призупинено. Придбані матеріали залишаються доступними покупцям. Заборгованість: ${uahFromKop(debtKop)}. Зверніться до Sensoria, щоб відновити продажі.` };
    case "DEBT_COLLECTION":
      return { tone: "danger", text: `Заборгованість ${uahFromKop(debtKop)} передано на процедуру стягнення. Нові продажі призупинено.` };
    case "CLOSURE_REQUESTED":
      return { tone: "info", text: "Запит на припинення співпраці розглядається. Фінансова історія та можлива заборгованість зберігаються." };
    case "CLOSED":
      return { tone: "info", text: debtKop > 0 ? `Співпрацю завершено. Заборгованість ${uahFromKop(debtKop)} зберігається до погашення.` : "Співпрацю завершено." };
    default:
      return null;
  }
}

// ── «Фінанси» summaries (pure: tested in financeView.test.ts) ─────────────────────────────────────────────────

export type SaleLike = { confirmedAt: string; title: string; priceKop: number; authorKop: number; refundedKop: number; authorRefundedKop: number; source: "catalog" | "referral" };

// the author's money from a sale after refunds
export const netAuthorKop = (s: SaleLike) => Math.max(0, s.authorKop - s.authorRefundedKop);
export const isFullyRefunded = (s: SaleLike) => s.refundedKop >= s.priceKop && s.priceKop > 0;

const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

/** The last `count` months (oldest first), with the author's income split by where the buyer came from. */
export function monthlyIncome(sales: SaleLike[], count: number, now: Date = new Date()): { key: string; label: string; catalogKop: number; referralKop: number; sales: number }[] {
  const out: { key: string; label: string; catalogKop: number; referralKop: number; sales: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_SHORT[d.getMonth()], catalogKop: 0, referralKop: 0, sales: 0 });
  }
  const byKey = new Map(out.map((m) => [m.key, m]));
  for (const s of sales) {
    const d = new Date(s.confirmedAt);
    const m = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    if (s.source === "referral") m.referralKop += netAuthorKop(s);
    else m.catalogKop += netAuthorKop(s);
    if (!isFullyRefunded(s)) m.sales += 1;
  }
  return out;
}

/** Per material: how many sales (not fully refunded) and how much the author earned; most earning first. */
export function incomeByMaterial(sales: SaleLike[]): { title: string; sales: number; authorKop: number; referralShare: number }[] {
  const map = new Map<string, { title: string; sales: number; authorKop: number; referral: number }>();
  for (const s of sales) {
    const m = map.get(s.title) ?? { title: s.title, sales: 0, authorKop: 0, referral: 0 };
    if (!isFullyRefunded(s)) {
      m.sales += 1;
      if (s.source === "referral") m.referral += 1;
    }
    m.authorKop += netAuthorKop(s);
    map.set(s.title, m);
  }
  return [...map.values()]
    .map((m) => ({ title: m.title, sales: m.sales, authorKop: m.authorKop, referralShare: m.sales ? m.referral / m.sales : 0 }))
    .sort((a, b) => b.authorKop - a.authorKop);
}

/** Totals for the top cards: all time, this month, sales count, refunds. */
export function financeTotals(sales: SaleLike[], now: Date = new Date()) {
  const thisMonth = sales.filter((s) => { const d = new Date(s.confirmedAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
  return {
    allTimeKop: sales.reduce((n, s) => n + netAuthorKop(s), 0),
    monthKop: thisMonth.reduce((n, s) => n + netAuthorKop(s), 0),
    salesCount: sales.filter((s) => !isFullyRefunded(s)).length,
    referralCount: sales.filter((s) => !isFullyRefunded(s) && s.source === "referral").length,
    refundsCount: sales.filter((s) => s.refundedKop > 0).length,
  };
}

// ── bank fee and the monthly report (monobank: 1.3 % for Ukrainian cards, 2 % for foreign, taken from each
// receiver's own share before it reaches the account; not returned on a refund) ──────────────────────────────

export type CardOrigin = "ua" | "foreign" | null | undefined;
export const bankFeeBps = (card: CardOrigin) => (card === "foreign" ? 200 : 130);

/**
 * The bank's acquiring fee, all of it paid by the author: monobank takes it on the WHOLE payment out of the author's
 * part, the platform's agentFeePercent arrives in full (monobank, 18.11.2026). Estimated at the Ukrainian rate when
 * the card is unknown.
 */
export const authorBankFeeKop = (s: { priceKop?: number; authorKop: number; cardOrigin?: CardOrigin }) =>
  Math.round(((s.priceKop ?? s.authorKop) * bankFeeBps(s.cardOrigin)) / 10000);

/** What a sale leaves on the author's account: the share minus the bank's fee, minus what went back to the buyer.
 * After a full refund it is below zero by the fee: the bank keeps its fee. */
export const toAccountKop = (s: SaleLike & { cardOrigin?: CardOrigin }) => s.authorKop - authorBankFeeKop(s) - s.authorRefundedKop;

/** Split of a price for the worked example: Sensoria's commission, the author's share, the bank's fee, the rest. */
export function priceBreakdown(priceKop: number, commissionBps: number, card: CardOrigin = "ua") {
  const sensoriaKop = Math.round((priceKop * commissionBps) / 10000);
  const authorKop = priceKop - sensoriaKop;
  const feeKop = Math.round((priceKop * bankFeeBps(card)) / 10000); // the whole payment's fee, out of the author's part
  return { sensoriaKop, authorKop, feeKop, toAccountKop: authorKop - feeKop };
}

const csvCell = (v: string | number) => {
  const t = String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

/** The author's sales report for one month (`yyyy-mm`), as CSV for Excel (semicolons, BOM). */
/** Bank credits the author's share the next day; until the bank statement is matched, the credit date is that estimate. */
/** The same estimate as an ISO time, for the quarter check. */
export function creditDateIsoEstimate(confirmedAt: string): string {
  return new Date(Date.parse(confirmedAt) + 86_400_000).toISOString();
}

export function creditDateEstimate(confirmedAt: string): string {
  const d = new Date(confirmedAt);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("uk-UA");
}

/** Month report for the author's accountant: the full price is the taxable income (accounting-model.md, 3.1). */
export function monthReportCsv(sales: (SaleLike & { cardOrigin?: CardOrigin; commissionBps: number; creditedAt?: string | null; bankFeeKop?: number | null; listKop?: number | null; discountKop?: number | null })[], month: string): string {
  const rows = sales.filter((s) => s.confirmedAt.slice(0, 7) === month).sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
  // the register of one payment: paid = tariff directed to Sensoria + the bank's fee + credited to the author (В2)
  const reg = (s: (typeof rows)[number]) =>
    registerRow({ paidKop: s.priceKop, tariffKop: s.priceKop - s.authorKop, bankFeeKop: s.bankFeeKop ?? null, cardForeign: s.cardOrigin === "foreign" });
  const credited = (s: (typeof rows)[number]) => s.creditedAt ?? creditDateIsoEstimate(s.confirmedAt);
  const head = [
    "Дата оплати (чек)", "Дата зарахування", "Квартал", "Матеріал", "Покупець прийшов", "Ціна, ₴", "Знижка за промокодом, ₴", "Оплачено = дохід для податкового обліку, ₴",
    "Сплачено Покупцем, ₴", "Тариф, спрямовано Банком на рахунок Sensoria, ₴", "Комісія Банку, ₴", "Джерело комісії", "Зараховано Автору, ₴", "Картка", "Повернено покупцю (ваша частка), ₴",
  ];
  const lines = rows.map((s) => {
    const r = reg(s);
    return [
      new Date(s.confirmedAt).toLocaleDateString("uk-UA"),
      s.creditedAt ? new Date(s.creditedAt).toLocaleDateString("uk-UA") : `${creditDateEstimate(s.confirmedAt)} (орієнтовно)`,
      differentQuarters(s.confirmedAt, credited(s)) ? `Різні квартали (${kyivQuarter(s.confirmedAt)} / ${kyivQuarter(credited(s))})` : kyivQuarter(s.confirmedAt),
      s.title,
      s.discountKop ? "Ваш промокод" : s.source === "referral" ? "За вашим посиланням" : "Через Sensoria",
      money(s.listKop ?? s.priceKop),
      money(s.discountKop ?? 0),
      money(s.priceKop),
      money(r.paidKop),
      money(r.tariffKop),
      money(r.bankFeeKop),
      r.bankFeeEstimated ? "Оцінка (банк ще не повідомив)" : "Дані банку",
      money(r.creditedToAuthorKop),
      s.cardOrigin === "foreign" ? "Іноземна (2 %)" : s.cardOrigin === "ua" ? "Українська (1,3 %)" : "Невідомо (1,3 %)",
      money(s.authorRefundedKop),
    ];
  });
  const sum = (f: (s: (typeof rows)[number]) => number) => money(rows.reduce((n, s) => n + f(s), 0));
  const total = [
    "Разом", "", "", "", "", sum((s) => s.listKop ?? s.priceKop), sum((s) => s.discountKop ?? 0), sum((s) => s.priceKop),
    sum((s) => reg(s).paidKop), sum((s) => reg(s).tariffKop), sum((s) => reg(s).bankFeeKop), "", sum((s) => reg(s).creditedToAuthorKop), "", sum((s) => s.authorRefundedKop),
  ];
  return "\uFEFF" + [head, ...lines, total].map((r) => r.map(csvCell).join(";")).join("\n");
}
