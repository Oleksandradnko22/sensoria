// Registers for the accountant (docs/legal/internal/accountant-dps-review-2026-11-18.md, В2, В4, В5, В7, В9, В10).
// Pure functions, integer kopecks only. Amounts come from the bank's data; an estimate only while the bank is silent.
//
// One payment: the buyer pays; the bank directs the tariff to Sensoria's account, keeps its fee and credits the rest
// to the author:  paid = tariff + bank fee + credited to the author  (to the kopeck).

export type Source = "catalog" | "referral";

export interface RegisterInput {
  paidKop: number; // what the buyer paid (the bank's amount)
  tariffKop: number; // directed by the bank to Sensoria
  bankFeeKop?: number | null; // from the bank; null → estimated
  cardForeign?: boolean;
}

export interface RegisterRow {
  paidKop: number;
  tariffKop: number;
  bankFeeKop: number;
  bankFeeEstimated: boolean;
  creditedToAuthorKop: number;
}

/** The bank's fee: 1.3 % (Ukrainian card) / 2 % (foreign) of the WHOLE payment, out of the author's part (monobank). */
export const estimatedBankFeeKop = (paidKop: number, foreign = false) => Math.round((paidKop * (foreign ? 200 : 130)) / 10000);

export function registerRow(i: RegisterInput): RegisterRow {
  const ok = (n: number) => Number.isInteger(n) && n >= 0;
  if (!ok(i.paidKop) || !ok(i.tariffKop)) throw new Error("Суми мають бути цілими невід'ємними копійками.");
  const estimated = i.bankFeeKop == null;
  const fee = estimated ? estimatedBankFeeKop(i.paidKop, i.cardForeign) : (i.bankFeeKop as number);
  if (!ok(fee)) throw new Error("Комісія банку має бути цілими копійками.");
  const credited = i.paidKop - i.tariffKop - fee;
  if (credited < 0) throw new Error("Тариф і комісія більші за сплачену суму.");
  return { paidKop: i.paidKop, tariffKop: i.tariffKop, bankFeeKop: fee, bankFeeEstimated: estimated, creditedToAuthorKop: credited };
}

// ── dates and quarters (Kyiv time) ─────────────────────────────────────────

const KYIV = "Europe/Kyiv";

/** "2026-04-01" — the calendar day in Kyiv. */
export function kyivDay(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: KYIV, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "2026-Q2" in Kyiv time. */
export function kyivQuarter(iso: string): string {
  const [y, m] = kyivDay(iso).split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** The payment (receipt date) and the crediting fall into different quarters: the accountant must look. */
export const differentQuarters = (paidAt: string, creditedAt: string | null | undefined) =>
  !!creditedAt && kyivQuarter(paidAt) !== kyivQuarter(creditedAt);

// ── the monthly act of Sensoria's services (В7) ────────────────────────────

export interface ActSale { tariffKop: number; source: Source; paidKop: number; bankFeeKop: number }
export interface ActRefund { tariffKop: number }
export interface ActLine { count: number; sumKop: number }

/** Lines kept apart — no "net": (1) 30 %, (2) 15 %, (3) returned tariff; for reference — payments and the bank's fee. */
export function monthlyAct(sales: ActSale[], refunds: ActRefund[]) {
  const line = (xs: { tariffKop: number }[]): ActLine => ({ count: xs.length, sumKop: xs.reduce((n, x) => n + x.tariffKop, 0) });
  return {
    tariff30: line(sales.filter((s) => s.source === "catalog")),
    tariff15: line(sales.filter((s) => s.source === "referral")),
    returnedTariff: line(refunds),
    reference: {
      paymentsKop: sales.reduce((n, s) => n + s.paidKop, 0),
      bankFeeKop: sales.reduce((n, s) => n + s.bankFeeKop, 0),
    },
  };
}

// ── Sensoria's income book (В10): by the day the tariff reached the account ──

export interface BookEntry { creditedAt: string; tariffKop: number; kind: "income" | "refund"; paidAt?: string }

/** Day → income (credited tariffs) and refunds (−), Kyiv days, sorted. */
export function incomeBook(entries: BookEntry[]) {
  const days = new Map<string, { incomeKop: number; refundKop: number }>();
  for (const e of entries) {
    const d = kyivDay(e.creditedAt);
    const cur = days.get(d) ?? { incomeKop: 0, refundKop: 0 };
    if (e.kind === "income") cur.incomeKop += e.tariffKop;
    else cur.refundKop += e.tariffKop;
    days.set(d, cur);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v, totalKop: v.incomeKop - v.refundKop }));
}

export function quarterIncomeKop(entries: BookEntry[], quarter: string): number {
  return entries.filter((e) => kyivQuarter(e.creditedAt) === quarter).reduce((n, e) => n + (e.kind === "income" ? e.tariffKop : -e.tariffKop), 0);
}

/** A refund booked in a later quarter than its payment (the accountant decides how to show it, В5). */
export const refundOfEarlierQuarter = (paidAt: string, refundedAt: string) => kyivQuarter(refundedAt) !== kyivQuarter(paidAt);

// ── limits (В9, В10) ───────────────────────────────────────────────────────

/** Single tax, group 3, 2026: 1 167 minimum wages × 8 647 ₴. */
export const GROUP3_LIMIT_2026_KOP = 1_009_104_900;

export function limitLevel(incomeKop: number, limitKop = GROUP3_LIMIT_2026_KOP): "ok" | "warn80" | "warn95" | "over" {
  if (incomeKop > limitKop) return "over";
  // thresholds in whole hryvnias, as the accountant states them: 80 % = 8 072 839 ₴
  const at = (share: number) => Math.floor((limitKop * share) / 100) * 100;
  if (incomeKop >= at(0.95)) return "warn95";
  if (incomeKop >= at(0.8)) return "warn80";
  return "ok";
}

/** VAT watch: tariffs credited over the last 12 months — warnings at 800 000 ₴ and 1 000 000 ₴. */
export function vatLevel(rolling12Kop: number): "ok" | "warn800k" | "warn1m" {
  if (rolling12Kop >= 100_000_000) return "warn1m";
  if (rolling12Kop >= 80_000_000) return "warn800k";
  return "ok";
}

export function rolling12Kop(entries: BookEntry[], nowIso: string): number {
  const from = new Date(nowIso);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  return entries
    .filter((e) => Date.parse(e.creditedAt) > from.getTime() && Date.parse(e.creditedAt) <= Date.parse(nowIso))
    .reduce((n, e) => n + (e.kind === "income" ? e.tariffKop : -e.tariffKop), 0);
}
