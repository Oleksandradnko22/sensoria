// The one rule for reading and showing a price (2026-10-07). Before this,
// every screen had its own check ("0" here, Number(...) === 0 there) and its
// own currency ("₴" / "грн"), so the same value could read differently on
// different screens — and an empty price counted as free on some of them.
//
// Product decision:
//   - 0, "0", "0.00" — anything that parses to exactly zero → "Безкоштовно"
//   - "", null, undefined → "Ціна не вказана" — an empty price is NEVER free
//   - a positive amount → "1 500 ₴" (Ukrainian grouping, hryvnia sign)
//
// Real input shapes in the project: `price` is a string ("0", "1500") in the
// demo catalog and for authored content (String(row.price) from the database),
// possibly a number. The home carousel's hand-written demo data
// (ProgramsSection) also carries the literal label "Безкоштовно" — recognised
// as free, since that is exactly what it says. Anything else that is not a
// plain non-negative number (negative, "abc", "1e3", NaN, Infinity) is
// treated as "not specified": it is never free and never shown as an amount.

export const FREE_PRICE_LABEL = "Безкоштовно";
export const UNSPECIFIED_PRICE_LABEL = "Ціна не вказана";

export type PriceInput = number | string | null | undefined;

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

// The amount in hryvnias, or null when there is no usable price.
export function parsePrice(value: PriceInput): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  if (text.toLowerCase() === FREE_PRICE_LABEL.toLowerCase()) return 0;
  if (!PLAIN_NUMBER.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

// True only when the price parses to exactly zero. Empty / missing /
// malformed is NOT free.
export function isFreePrice(value: PriceInput): boolean {
  return parsePrice(value) === 0;
}

export function formatPrice(value: PriceInput): string {
  const amount = parsePrice(value);
  if (amount === null) return UNSPECIFIED_PRICE_LABEL;
  if (amount === 0) return FREE_PRICE_LABEL;
  return `${amount.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
}
