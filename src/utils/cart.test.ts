import test from "node:test";
import assert from "node:assert/strict";
import { addToCart, cartKey, cartTotals, materialsWord, mergeCarts, parseCart, removeFromCart, resolveCart, MAX_CART_ITEMS } from "./cart.ts";

const P = (id: string) => ({ kind: "program" as const, id });
const G = (id: string) => ({ kind: "guide" as const, id });

test("parseCart tolerates garbage, defaults old entries to programs, drops duplicates", () => {
  assert.deepEqual(parseCart(null), []);
  assert.deepEqual(parseCart("not json"), []);
  assert.deepEqual(parseCart('{"a":1}'), []);
  const c = parseCart('[{"id":"a","addedAt":1},{"id":"a","addedAt":2},{"id":5},{"id":"b","kind":"guide"},{"id":"a","kind":"guide"}]');
  assert.deepEqual(c.map(cartKey), ["program:a", "guide:b", "guide:a"]);
});

test("same id of another kind is a different material", () => {
  const c = addToCart(addToCart([], P("x"), 1), G("x"), 2);
  assert.equal(c.length, 2);
  assert.equal(addToCart(c, P("x"), 3), c);
});

test("add is capped, remove and merge work per kind", () => {
  let full = [] as ReturnType<typeof parseCart>;
  for (let i = 0; i < MAX_CART_ITEMS + 5; i++) full = addToCart(full, P(`p${i}`), i);
  assert.equal(full.length, MAX_CART_ITEMS);
  const a = addToCart(addToCart([], P("a"), 1), G("a"), 2);
  assert.deepEqual(removeFromCart(a, P("a")).map(cartKey), ["guide:a"]);
  const merged = mergeCarts(a, [{ ...G("a"), addedAt: 9 }, { ...P("c"), addedAt: 10 }]);
  assert.deepEqual(merged.map(cartKey), ["program:a", "guide:a", "program:c"]);
});

test("resolve separates materials that no longer exist", () => {
  const cart = addToCart(addToCart([], P("a"), 1), G("gone"), 2);
  const r = resolveCart(cart, [{ ...P("a"), price: "100" }]);
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.missing.map(cartKey), ["guide:gone"]);
});

test("totals split free, paid and unpriced", () => {
  const t = cartTotals([{ item: { price: "0" } }, { item: { price: "1500" } }, { item: { price: 500 } }, { item: { price: "" } }]);
  assert.deepEqual(t, { paidTotal: 2000, paidCount: 2, freeCount: 1, unpriced: 1 });
});

test("ukrainian plural for materials", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25].map(materialsWord), ["матеріал", "матеріали", "матеріали", "матеріалів", "матеріалів", "матеріалів", "матеріал", "матеріали", "матеріалів"]);
});
