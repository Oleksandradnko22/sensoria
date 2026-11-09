// On-device copy of the meditation session list (utils/meditationSession.ts),
// so a reload or reopened screen can restore the current session's before /
// after. Best-effort like the other on-device stores: private mode or quota
// problems fail silently. The account's copy lives on the server
// (meditation_sessions, meditation_mood_checkins).
import { restoreSessions, serializeSessions, type SessionList } from "./meditationSession.ts";

const KEY = "sensoria_meditation_sessions_v1";

export function loadSessionLog(): SessionList {
  try {
    return restoreSessions(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

// Applies a pure transition to the stored list and saves the result.
export function updateSessionLog(fn: (list: SessionList) => SessionList): SessionList {
  const next = fn(loadSessionLog());
  try {
    localStorage.setItem(KEY, serializeSessions(next));
  } catch {
    // storage unavailable — the session just isn't restorable
  }
  return next;
}

export function newSessionId(): string {
  const c = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
