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
