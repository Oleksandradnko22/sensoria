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

/** "HH:MM" in Kyiv time. */
export function kyivTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: KYIV, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/**
 * Did a refund CANCEL the payment (nothing was credited to anyone) or come later (debited from the author, the tariff
 * stays with Sensoria)? monobank, 20.11.2026: «день у день» — the same day as the payment. Where that day ends is the
 * bank's to say (the end of the Kyiv calendar day or the close of its operational day): `cutoff` "HH:MM" Kyiv time,
 * "24:00" = the whole calendar day (finance_settings.refund_same_day_cutoff). A payment made after the cutoff has
 * its own «day» until the next cutoff.
 */
export function sameDayCancel(paidAtIso: string, refundAtIso: string, cutoff = "24:00"): boolean {
  const opDay = (iso: string) => {
    if (cutoff >= "24:00") return kyivDay(iso);
    // after the cutoff the operational day is the next calendar day
    if (kyivTime(iso) < cutoff) return kyivDay(iso);
    const d = new Date(`${kyivDay(iso)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return Date.parse(refundAtIso) >= Date.parse(paidAtIso) && opDay(paidAtIso) === opDay(refundAtIso);
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

// ── working days (Б39: 5 working days; Б38: 5 working days to object) ─────

/** "2026-11-20" + n working days (Saturdays and Sundays skipped; public holidays are not tracked yet). */
export function addWorkingDays(day: string, n: number, holidays: ReadonlySet<string> = new Set()): string {
  const d = new Date(`${day}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d.toISOString().slice(0, 10))) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

// ── an amount in words (Ukrainian), for the act ─────────────────────────────

const ONES_M = ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const ONES_F = ["", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const TEENS = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
const TENS = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
const HUNDREDS = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];

const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 100;
  if (t >= 11 && t <= 14) return many;
  const u = n % 10;
  return u === 1 ? one : u >= 2 && u <= 4 ? few : many;
};

function triad(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
  const out = [HUNDREDS[h]];
  if (t === 1) out.push(TEENS[u]);
  else out.push(TENS[t], (feminine ? ONES_F : ONES_M)[u]);
  return out.filter(Boolean).join(" ");
}

/** 30000 → «триста гривень 00 копійок». */
export function uahInWords(kop: number): string {
  if (!Number.isInteger(kop) || kop < 0) throw new Error("Сума має бути цілими копійками.");
  const uah = Math.floor(kop / 100), k = kop % 100;
  const parts: string[] = [];
  const millions = Math.floor(uah / 1_000_000), thousands = Math.floor((uah % 1_000_000) / 1000), rest = uah % 1000;
  if (millions) parts.push(triad(millions, false), plural(millions, "мільйон", "мільйони", "мільйонів"));
  if (thousands) parts.push(triad(thousands, true), plural(thousands, "тисяча", "тисячі", "тисяч"));
  if (rest || !parts.length) parts.push(rest ? triad(rest, true) : "нуль");
  parts.push(plural(uah, "гривня", "гривні", "гривень"));
  return `${parts.filter(Boolean).join(" ")} ${String(k).padStart(2, "0")} ${plural(k, "копійка", "копійки", "копійок")}`;
}

// ── the act data (В7) ───────────────────────────────────────────────────────

export interface ActOrder {
  purchaseId: string;
  contentId: string;
  paidAt: string;
  creditedAt: string | null;
  listKop: number;
  discountKop: number;
  paidKop: number;
  source: "catalog" | "referral" | "promo";
  tariffBps: number;
  tariffKop: number;
  bankFeeKop: number;
  fiscalNo: string | null;
  status: "paid" | "refunded" | "chargeback";
  refundedAt: string | null;
  returnFiscalNo: string | null;
}

const actCode8 = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

/**
 * The act for one author and month: services for successful orders of the month (30 % and 15 % apart), the tariff
 * returned in the month (refunds and tariffs repaid after a lost chargeback) — never netted; payments and the bank's
 * fee only for reference. `orders` — orders paid in the month; `returnedTariffs` — tariff sums returned in the month.
 */
export function buildAct(p: { period: string; authorId: string; orders: ActOrder[]; returnedTariffs: { purchaseId: string; tariffKop: number }[] }) {
  // every order paid in the month is a service rendered (line 1/2), even if refunded later the same month: the refund is
  // line 3, never netted (accountant's example: 3 payments + 1 refund → line 1: 3 / 900, line 3: 1 / 300)
  const ok = p.orders;
  const sum = (xs: { tariffKop: number }[]) => xs.reduce((n, x) => n + x.tariffKop, 0);
  const l30 = ok.filter((o) => o.tariffBps === 3000);
  const l15 = ok.filter((o) => o.tariffBps === 1500);
  const servicesKop = sum(l30) + sum(l15);
  const returnedKop = sum(p.returnedTariffs);
  return {
    number: `S-${p.period.replace("-", "")}-${actCode8(p.authorId)}`,
    period: p.period,
    lines: {
      tariff30: { count: l30.length, sumKop: sum(l30) },
      tariff15: { count: l15.length, sumKop: sum(l15) },
      returned: { count: p.returnedTariffs.length, sumKop: returnedKop },
    },
    servicesKop,
    servicesInWords: uahInWords(servicesKop),
    returnedKop,
    returnedInWords: uahInWords(returnedKop),
    reference: { paymentsKop: ok.reduce((n, o) => n + o.paidKop, 0), bankFeeKop: ok.reduce((n, o) => n + o.bankFeeKop, 0) },
    register: p.orders.map((o, i) => ({
      n: i + 1,
      order: actCode8(o.purchaseId),
      paidAt: o.paidAt,
      creditedAt: o.creditedAt,
      material: actCode8(o.contentId),
      fiscalNo: o.fiscalNo,
      listKop: o.listKop,
      discountKop: o.discountKop,
      paidKop: o.paidKop,
      source: o.source,
      tariffPct: o.tariffBps / 100,
      tariffKop: o.tariffKop,
      bankFeeKop: o.bankFeeKop,
      creditedToAuthorKop: o.paidKop - o.tariffKop - o.bankFeeKop,
      status: o.status,
      refundedAt: o.refundedAt,
      returnFiscalNo: o.returnFiscalNo,
    })),
  };
}
