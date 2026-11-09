// "Більше не питати для цієї медитації" — Sasha's explicit call
// (2026-08-28): the optional "Як ви почуваєтесь зараз?" check-in
// (MeditationExperience.tsx) is a nice signature touch, but someone
// who does the same meditation often shouldn't have to dismiss it
// every single time. A per-meditation, not global, opt-out — turning
// it off for "Швидке заземлення" shouldn't silence it for every other
// meditation too. Client-only (localStorage), same honesty/scope as
// the rest of this prototype's local prefs (demoProgressStore.ts,
// demoReadStore.ts) — no backend table for this yet.

const STORAGE_KEY = "sensoria_meditation_checkin_disabled";

function loadAll(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode, quota) — worst case the
    // check-in just keeps showing; not worth surfacing to the user.
  }
}

export function isCheckinDisabled(meditationId: string): boolean {
  return loadAll().includes(meditationId);
}

export function disableCheckinForever(meditationId: string): void {
  const all = loadAll();
  if (!all.includes(meditationId)) {
    all.push(meditationId);
    saveAll(all);
  }
}

// Not currently exposed in the UI, but keeping a way back in is cheap
// and avoids a permanent, un-reversible dead end if this is ever
// surfaced in settings later.
export function enableCheckinAgain(meditationId: string): void {
  saveAll(loadAll().filter((id) => id !== meditationId));
}
