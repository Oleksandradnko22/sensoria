// Session history for meditations — deliberately NOT the same shape as
// program progress (utils/demoProgressStore.ts). A meditation is
// reusable, not "completed once": there's no percent, no required/
// optional items, just a plain running count of how many times you've
// used it plus when. Sasha's spec: "tracks session history (last
// session, count, last completed date) without competitive tracking" —
// so this stays limited to those three facts, nothing streak- or
// leaderboard-shaped.

const STORAGE_KEY = "sensoria_demo_meditation_sessions";

export type MeditationSessionHistory = {
  // How many times a session was started (not necessarily finished —
  // starting a meditation and closing it early is normal, not a
  // failure to track against someone).
  sessionCount: number;
  lastStartedAt: string | null;
  // Only set once a session actually reaches its natural end (or the
  // person explicitly ends it early via "Завершити") — see
  // MeditationExperience.tsx's completion flow.
  lastCompletedAt: string | null;
};

type StoredMap = Record<string, MeditationSessionHistory>;

function loadAll(): StoredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(map: StoredMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable (private mode, quota) — session history is a
    // nice-to-have, not core functionality, so fail silently.
  }
}

export function getSessionHistory(meditationId: string): MeditationSessionHistory {
  return (
    loadAll()[meditationId] ?? {
      sessionCount: 0,
      lastStartedAt: null,
      lastCompletedAt: null,
    }
  );
}

// The whole map at once — keyed by meditationId (2026-09-09, added for
// utils/behaviorRecommendations.ts's "часто відкриває медитації від
// тривожності" pattern, which needs every meditation's sessionCount to
// aggregate by tag, not just one at a time).
export function getAllSessionHistory(): StoredMap {
  return loadAll();
}

export function recordSessionStart(meditationId: string): MeditationSessionHistory {
  const all = loadAll();
  const current = all[meditationId] ?? { sessionCount: 0, lastStartedAt: null, lastCompletedAt: null };
  const next: MeditationSessionHistory = {
    ...current,
    sessionCount: current.sessionCount + 1,
    lastStartedAt: new Date().toISOString(),
  };
  all[meditationId] = next;
  saveAll(all);
  return next;
}

export function recordSessionCompleted(meditationId: string): MeditationSessionHistory {
  const all = loadAll();
  const current = all[meditationId] ?? { sessionCount: 0, lastStartedAt: null, lastCompletedAt: null };
  const next: MeditationSessionHistory = {
    ...current,
    lastCompletedAt: new Date().toISOString(),
  };
  all[meditationId] = next;
  saveAll(all);
  return next;
}

const later = (a: string | null, b: string | null): string | null => (a && b ? (a > b ? a : b) : a ?? b);

// Combines the on-device history with the account's server history. Counts
// take the larger of the two (sessions before the server log existed are only
// known locally; on a new device only the server knows them); dates take the
// later of the two.
export function mergeSessionHistory(
  local: MeditationSessionHistory,
  server: MeditationSessionHistory | undefined
): MeditationSessionHistory {
  if (!server) return local;
  return {
    sessionCount: Math.max(local.sessionCount, server.sessionCount),
    lastStartedAt: later(local.lastStartedAt, server.lastStartedAt),
    lastCompletedAt: later(local.lastCompletedAt, server.lastCompletedAt),
  };
}

// Writes the merged server history into the on-device cache, so everything
// that reads it synchronously (intro screen, recommendations, profile)
// sees the account's history on a fresh device.
export function hydrateSessionHistory(server: StoredMap): void {
  const all = loadAll();
  for (const [id, remote] of Object.entries(server)) {
    const base = all[id] ?? { sessionCount: 0, lastStartedAt: null, lastCompletedAt: null };
    all[id] = mergeSessionHistory(base, remote);
  }
  saveAll(all);
}
