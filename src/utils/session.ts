// Session *policy* layer — enforces two rules on top of Supabase Auth's
// own (indefinitely-persisting) session:
//
//   1. Tab closed and reopened -> log out.
//   2. Idle more than 3 hours -> log out.
//
// Supabase's client library already persists its session in
// localStorage and silently refreshes the access token — it has no
// concept of either rule above on its own, so this module tracks just
// enough bookkeeping (a sessionStorage "tab is open" flag, and a
// localStorage "last active" timestamp) to decide, on boot, whether to
// call supabase.auth.signOut() before the app ever renders a logged-in
// state. See src/lib/auth.ts for the actual Supabase calls and
// src/App.tsx for how this gets wired into the boot sequence.
//
// The eviction *decision* (shouldEvictSession) is a pure function of
// three plain values, kept separate from the storage/Supabase side
// effects specifically so it's easy to unit test — see session.test.ts.

export type UserRole = "author" | "participant";

export const MAX_IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours

const TAB_FLAG_KEY = "sensoria.auth.tabOpen";
const LAST_ACTIVE_KEY = "sensoria.auth.lastActiveAt";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

// Pure decision: given what we know on boot, should any existing
// session be dropped? `lastActiveAt: null` means "nothing recorded" —
// a genuinely first-ever visit, or bookkeeping already cleared (e.g.
// after logout) — and there's nothing to evict in that case regardless
// of the tab flag, so we skip straight to false instead of forcing a
// pointless signOut() call on every fresh visitor.
export function shouldEvictSession(opts: {
  tabWasAlreadyOpen: boolean;
  lastActiveAt: number | null;
  now: number;
}): boolean {
  const { tabWasAlreadyOpen, lastActiveAt, now } = opts;
  if (lastActiveAt === null) return false;
  if (!tabWasAlreadyOpen) return true;
  return now - lastActiveAt > MAX_IDLE_MS;
}

export function createSessionBookkeeper(
  localStore: StorageLike = typeof localStorage !== "undefined" ? localStorage : memoryStorage(),
  sessionStore: StorageLike = typeof sessionStorage !== "undefined" ? sessionStorage : memoryStorage(),
  now: () => number = Date.now
) {
  // Call once at boot, before trusting any Supabase session that comes
  // back. Returns whether the caller should sign the user out.
  const checkAndMarkTabOpen = (): boolean => {
    const tabWasAlreadyOpen = sessionStore.getItem(TAB_FLAG_KEY) === "1";
    const lastActiveRaw = localStore.getItem(LAST_ACTIVE_KEY);
    const lastActiveAt = lastActiveRaw ? Number(lastActiveRaw) : null;

    sessionStore.setItem(TAB_FLAG_KEY, "1");

    const evict = shouldEvictSession({ tabWasAlreadyOpen, lastActiveAt, now: now() });
    if (evict) localStore.removeItem(LAST_ACTIVE_KEY);
    return evict;
  };

  // Called on login and then periodically (heartbeat) while a
  // dashboard is open, so idle time is measured from the last moment
  // the tab was actually open — not from the moment of login.
  const touch = () => {
    localStore.setItem(LAST_ACTIVE_KEY, String(now()));
  };

  const clear = () => {
    localStore.removeItem(LAST_ACTIVE_KEY);
  };

  return { checkAndMarkTabOpen, touch, clear };
}

const defaultBookkeeper = createSessionBookkeeper();
export const checkAndMarkTabOpen = defaultBookkeeper.checkAndMarkTabOpen;
export const touchSession = defaultBookkeeper.touch;
export const clearSessionBookkeeping = defaultBookkeeper.clear;
