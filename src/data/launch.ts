// The public launch: 1 December 2026, 12:00 Kyiv (UTC+2 in winter). Until then the site is closed to visitors: only the
// «Для авторів» page (countdown + application), the sign-in pages and the legal / help pages are open; anyone signed in
// (invited authors, the team) sees everything. After this moment the site opens by itself — nothing to switch.
export const LAUNCH_AT = Date.parse("2026-12-01T10:00:00Z");

import type { Page } from "../utils/routes";
export const PRELAUNCH_OPEN: Page[] = [
  "for-authors", "author-apply", "author-auth", "participant-auth", "author-dashboard", "participant-dashboard", "admin-dashboard",
  "privacy", "terms", "refunds", "author-agreement", "participant-agreement", "contacts", "crisis-help",
];

/** Closed for this visitor now? Dev only: ?open=1 (or the device preview) opens it for the browser tab. */
export function prelaunchClosed(page: Page, signedIn: boolean, now = Date.now()): boolean {
  if (now >= LAUNCH_AT || signedIn || PRELAUNCH_OPEN.includes(page)) return false;
  if (import.meta.env.DEV) {
    try {
      const q = new URLSearchParams(window.location.search).get("open");
      if (q === "1") sessionStorage.setItem("sensoria:prelaunch-open", "1");
      if (q === "0") sessionStorage.removeItem("sensoria:prelaunch-open");
      if (sessionStorage.getItem("sensoria:prelaunch-open") === "1") return false;
    } catch { /* private mode */ }
  }
  return true;
}
