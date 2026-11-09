// "Зараз не готовий" → "Нагадати ввечері" — a lightweight, same-device
// reminder for one specific practice, checked the next time the person
// opens the dashboard (ParticipantOverview.tsx). Same localStorage tier
// as demoProgressStore.ts (not synced across devices, no backend) —
// proportionate here since this is inherently a "come back to this
// browser later" mechanism, not a push/email notification (see the
// "Умні нагадування" conversation: real proactive outreach needs
// server-tracked progress + cron, which doesn't exist yet). One active
// reminder per item — setting a new one for the same item replaces the
// old, never stacks.

const STORAGE_KEY = "sensoria_practice_reminders";

export type PracticeReminder = {
  itemId: string;
  programId: string;
  programTitle: string;
  itemTitle: string;
  remindAt: string; // ISO
};

function loadAll(): Record<string, PracticeReminder> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, PracticeReminder>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable — the reminder just won't survive, not worth
    // surfacing to the person over (same reasoning as demoProgressStore).
  }
}

// "Ввечері" = 19:00 today, or tomorrow if it's already past that —
// simple, predictable, no need for the person to pick an exact time for
// what's meant to be a low-friction "not right now" option.
export function eveningTimestamp(from: Date = new Date()): string {
  const target = new Date(from);
  target.setHours(19, 0, 0, 0);
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

export function setPracticeReminder(reminder: PracticeReminder): void {
  const all = loadAll();
  all[reminder.itemId] = reminder;
  saveAll(all);
}

export function clearPracticeReminder(itemId: string): void {
  const all = loadAll();
  delete all[itemId];
  saveAll(all);
}

// Reminders whose time has already passed — what the dashboard's smart
// reminder card checks for. Most-recently-set first (arbitrary but
// stable), though in practice there's rarely more than one at a time.
export function getDuePracticeReminders(now: Date = new Date()): PracticeReminder[] {
  const all = Object.values(loadAll());
  return all.filter((r) => new Date(r.remindAt).getTime() <= now.getTime());
}
