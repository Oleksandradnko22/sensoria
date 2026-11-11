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
  SENSORIA_COMMISSION: "Комісія Sensoria",
  AUTHOR_PAYOUT: "Виплата",
  REFUND: "Повернення покупцю",
  PARTIAL_REFUND: "Часткове повернення покупцю",
  AUTHOR_DEBT_CREATED: "Виникла заборгованість",
  AUTHOR_DEBT_REPAID: "Погашення заборгованості",
  BANK_FEE_COLLECTED: "Комісія банку (за рахунок Sensoria)",
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
