// «Sign in, then come back to the program I was looking at».
// Signing in can reload the whole app (Google redirect, MFA step), so the target lives in
// sessionStorage instead of in memory. It is read once, expires after 30 minutes, and is
// dropped if the person backs out of the sign-in page.
const KEY = "sensoria:login-return-program";
const TTL_MS = 30 * 60 * 1000;

export type LoginReturn = { id: string; section: string | null };

export function setLoginReturn(programId: string, section: string | null = null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: programId, section, t: Date.now() }));
  } catch {
    // storage unavailable: sign-in just lands on the dashboard
  }
}

export function clearLoginReturn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** The program (and the tab of its page) to return to; forgotten once read. Null if none. */
export function takeLoginReturn(): LoginReturn | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { id?: string; section?: string | null; t?: number };
    return v.id && typeof v.t === "number" && Date.now() - v.t < TTL_MS ? { id: v.id, section: v.section ?? null } : null;
  } catch {
    return null;
  }
}
