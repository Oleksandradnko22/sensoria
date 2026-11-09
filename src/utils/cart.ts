// Pure cart rules. The cart stores only WHAT was added ({kind, id, addedAt}); title, author and
// price are always read from the live catalog, so a changed price is never stale in the cart.

import { isFreePrice, parsePrice, type PriceInput } from "./price.ts";

export type CartKind = "program" | "guide" | "meditation";
export type CartRef = { kind: CartKind; id: string };
export type CartEntry = CartRef & { addedAt: number };

export const MAX_CART_ITEMS = 20;

const KINDS: CartKind[] = ["program", "guide", "meditation"];
export const cartKey = (r: CartRef) => `${r.kind}:${r.id}`;

export function parseCart(raw: string | null): CartEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: CartEntry[] = [];
    for (const e of data) {
      const id = typeof e?.id === "string" ? e.id : "";
      // carts saved before guides/meditations existed hold programs only
      const kind: CartKind = KINDS.includes(e?.kind) ? e.kind : "program";
      const at = Number(e?.addedAt);
      if (!id || seen.has(cartKey({ kind, id }))) continue;
      seen.add(cartKey({ kind, id }));
      out.push({ kind, id, addedAt: Number.isFinite(at) ? at : 0 });
    }
    return out.slice(0, MAX_CART_ITEMS);
  } catch {
    return [];
  }
}

export function addToCart(cart: CartEntry[], ref: CartRef, now = Date.now()): CartEntry[] {
  if (cart.some((e) => cartKey(e) === cartKey(ref)) || cart.length >= MAX_CART_ITEMS) return cart;
  return [...cart, { kind: ref.kind, id: ref.id, addedAt: now }];
}

export function removeFromCart(cart: CartEntry[], ref: CartRef): CartEntry[] {
  return cart.filter((e) => cartKey(e) !== cartKey(ref));
}

// The guest's cart joins the account's cart on sign-in (no duplicates, account order first).
export function mergeCarts(account: CartEntry[], guest: CartEntry[]): CartEntry[] {
  return guest.reduce((acc, e) => addToCart(acc, e, e.addedAt), account);
}

export type CartLine<T> = { entry: CartEntry; item: T };

// Entries whose material no longer exists are not lines (the page drops them once the catalog is loaded).
export function resolveCart<T extends CartRef>(cart: CartEntry[], items: T[]): { lines: CartLine<T>[]; missing: CartEntry[] } {
  const byKey = new Map(items.map((p) => [cartKey(p), p]));
  const lines: CartLine<T>[] = [];
  const missing: CartEntry[] = [];
  for (const entry of cart) {
    const item = byKey.get(cartKey(entry));
    if (item) lines.push({ entry, item });
    else missing.push(entry);
  }
  return { lines, missing };
}

export function cartTotals(lines: { item: { price: PriceInput } }[]): { paidTotal: number; paidCount: number; freeCount: number; unpriced: number } {
  let paidTotal = 0;
  let paidCount = 0;
  let freeCount = 0;
  let unpriced = 0;
  for (const l of lines) {
    const p = parsePrice(l.item.price);
    if (p === null) unpriced += 1;
    else if (isFreePrice(l.item.price)) freeCount += 1;
    else {
      paidTotal += p;
      paidCount += 1;
    }
  }
  return { paidTotal, paidCount, freeCount, unpriced };
}

// 1 матеріал, 2–4 матеріали, 5+ матеріалів
export function materialsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "матеріал";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "матеріали";
  return "матеріалів";
}
