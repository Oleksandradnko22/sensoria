// «Активні сеанси» must list devices that are signed in NOW, not every device
// that ever logged in. Auth sessions do not expire by themselves, so "active"
// is defined by recent use: a device last seen within this window.
export const ACTIVE_SESSION_DAYS = 14;

export function activeCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - ACTIVE_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isActiveSession(lastSeenIso: string, now: Date = new Date()): boolean {
  const t = new Date(lastSeenIso).getTime();
  return !Number.isNaN(t) && t >= new Date(activeCutoffIso(now)).getTime();
}

// how often an open tab refreshes its own "last seen"
export const HEARTBEAT_MS = 10 * 60 * 1000;
