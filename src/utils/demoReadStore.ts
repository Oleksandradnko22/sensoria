// Read-state for the fixed demo conversations (src/data/*Dashboard.ts),
// persisted to localStorage so a demo conversation you've already read
// stays read after leaving the dashboard and coming back — not just
// while switching between tabs in the same visit.
//
// Deliberately scoped to demo ids only. Real conversations' read state
// lives in the database (lib/messages.ts's markThreadRead) and a fresh
// fetch always reflects the truth there; caching a "read" flag for a
// real id here could freeze it as read even after a genuinely new
// message arrives, which is worse than the bug this file fixes.

const STORAGE_KEY = "sensoria_demo_read_ids";

export function loadDemoReadIds(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDemoReadIds(ids: Record<string, boolean>): void {
  try {
    const demoOnly = Object.fromEntries(
      Object.entries(ids).filter(([id]) => !id.startsWith("real:"))
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoOnly));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — read-state just
    // won't survive a remount; not worth surfacing to the user over.
  }
}
