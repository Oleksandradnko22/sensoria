// The cart lives on this device (localStorage): one per signed-in person plus a guest one that joins the
// account's cart on sign-in. A signed-in person's cart is also kept on the server (cart_items) so it follows
// them between devices (refreshed on focus, on reconnect and every 30 s). Payments are not connected.
// Who the cart belongs to is set once by App (setCartOwner), so a modal or a header does not
// need the session passed down.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.ts";
import { addToCart, cartKey, mergeCarts, parseCart, removeFromCart, type CartEntry, type CartKind, type CartRef } from "../utils/cart.ts";

const PREFIX = "sensoria:cart:";
const EVENT = "sensoria:cart-changed";
const keyFor = (userId?: string | null) => `${PREFIX}${userId ?? "guest"}`;

let owner: string | null = null;

function read(key: string): CartEntry[] {
  try {
    return parseCart(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function write(key: string, cart: CartEntry[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(cart));
  } catch {
    // storage unavailable (private mode): the cart just won't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

// ── server copy (table cart_items) ─────────────────────────────────────────────
// The device copy is what the page reads and always updates first; the server copy only lets the cart
// follow a signed-in person between devices. Every server call is best-effort: before the migration is
// applied (or offline) the cart simply stays on this device.
async function pullServer(userId: string): Promise<CartEntry[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("cart_items").select("kind, content_id, added_at").eq("user_id", userId).order("added_at", { ascending: true });
  if (error || !data) return null;
  return (data as { kind: CartKind; content_id: string; added_at: string }[]).map((r) => ({ kind: r.kind, id: r.content_id, addedAt: Date.parse(r.added_at) || 0 }));
}

// A change that has been sent but not confirmed yet must not be overwritten by a refresh, and a change that
// failed (offline) is sent again on the next refresh instead of being lost.
let pending = 0;
let dirty = false;
let failedRetries = 0; // stop re-sending a change the server keeps refusing (e.g. a full cart)

function track(request: PromiseLike<{ error: unknown }>) {
  pending += 1;
  request.then(
    ({ error }) => {
      pending -= 1;
      if (error) dirty = true;
      else failedRetries = 0;
    },
    () => {
      pending -= 1;
      dirty = true;
    },
  );
}

function pushAdd(userId: string, entries: CartEntry[]) {
  if (!supabase || !entries.length) return;
  track(supabase.from("cart_items").upsert(entries.map((e) => ({ user_id: userId, kind: e.kind, content_id: e.id })), { onConflict: "user_id,kind,content_id", ignoreDuplicates: true }));
}

function pushRemove(userId: string, ref: CartRef) {
  if (!supabase) return;
  track(supabase.from("cart_items").delete().eq("user_id", userId).eq("kind", ref.kind).eq("content_id", ref.id));
}

// Signed in: the cart is the device cart plus the server cart (nothing is lost either way); the part the
// server did not have yet is sent up.
async function syncWithServer(userId: string) {
  const server = await pullServer(userId);
  if (!server || owner !== userId) return;
  const local = read(keyFor(userId));
  const merged = mergeCarts(server, local);
  const serverKeys = new Set(server.map(cartKey));
  pushAdd(userId, merged.filter((e) => !serverKeys.has(cartKey(e))));
  if (merged.length !== local.length || merged.some((e, i) => cartKey(e) !== cartKey(local[i] ?? e))) write(keyFor(userId), merged);
}

// Another device may have changed the cart, so take the server copy as it is now. Skipped while one of our
// own changes is still on its way; if one failed earlier, it is merged and sent again instead.
async function refreshFromServer() {
  const userId = owner;
  if (!userId || pending > 0) return;
  if (dirty && failedRetries < 3) {
    dirty = false;
    failedRetries += 1;
    await syncWithServer(userId);
    return;
  }
  if (dirty) {
    // gave up: take the server copy as the truth so the two stop disagreeing
    dirty = false;
    failedRetries = 0;
  }
  const server = await pullServer(userId);
  if (!server || owner !== userId || pending > 0) return;
  const local = read(keyFor(userId));
  if (server.length !== local.length || server.some((e, i) => cartKey(e) !== cartKey(local[i]))) write(keyFor(userId), server);
}

// A phone, a tablet and a laptop stay in step: refresh when the tab is shown or focused, when the connection
// comes back, and every 30 s while the page is open and visible.
const REFRESH_EVERY_MS = 30_000;
let timer: number | undefined;
const refreshIfVisible = () => document.visibilityState === "visible" && void refreshFromServer();
if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", refreshIfVisible);
  window.addEventListener("focus", refreshIfVisible);
  window.addEventListener("online", refreshIfVisible);
}
// The 30 s timer runs only while somebody is signed in.
function setTimerFor(userId: string | null) {
  if (typeof window === "undefined") return;
  window.clearInterval(timer);
  timer = userId ? window.setInterval(refreshIfVisible, REFRESH_EVERY_MS) : undefined;
}

// Moves the guest cart into the account cart once the person is signed in.
function adoptGuestCart(userId: string) {
  const guest = read(keyFor(null));
  if (!guest.length) return;
  write(keyFor(userId), mergeCarts(read(keyFor(userId)), guest));
  try {
    window.localStorage.removeItem(keyFor(null));
  } catch {
    // ignore
  }
}

// App calls this whenever it knows who is signed in (null = nobody).
export function setCartOwner(userId: string | null) {
  if (owner === userId) return;
  owner = userId;
  setTimerFor(userId);
  if (userId) {
    adoptGuestCart(userId);
    void syncWithServer(userId);
  }
  window.dispatchEvent(new Event(EVENT));
}

export function removeFromCartForOwner(ref: CartRef) {
  write(keyFor(owner), removeFromCart(read(keyFor(owner)), ref));
  if (owner) pushRemove(owner, ref);
}

export function useCart() {
  const [cart, setCart] = useState<CartEntry[]>(() => read(keyFor(owner)));

  useEffect(() => {
    const sync = () => setCart(read(keyFor(owner)));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync); // another tab
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((ref: CartRef) => {
    const next = addToCart(read(keyFor(owner)), ref);
    write(keyFor(owner), next);
    if (owner) pushAdd(owner, next.filter((e) => cartKey(e) === cartKey(ref)));
  }, []);
  const remove = useCallback((ref: CartRef) => {
    write(keyFor(owner), removeFromCart(read(keyFor(owner)), ref));
    if (owner) pushRemove(owner, ref);
  }, []);
  const has = useCallback((ref: CartRef) => cart.some((e) => cartKey(e) === cartKey(ref)), [cart]);
  return { cart, add, remove, has };
}

// Header → App: «open the cart» without threading a prop through every page.
export const OPEN_CART_EVENT = "sensoria:open-cart";
export const requestOpenCart = () => window.dispatchEvent(new Event(OPEN_CART_EVENT));
