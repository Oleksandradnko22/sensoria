// "Is this material already in the participant's cabinet?" — the same notion
// "Моє навчання" uses: an enrollment (acquired content) or real activity
// (program progress, started guide, meditation session). Real purchases are
// not wired yet (payments are a later stage), so this is the honest signal
// available today. Three bulk reads, no per-item query.
import { enrollments } from "../data/participantDashboard.ts";
import { fetchAllProgress } from "./contentProgressSync.ts";
import { fetchAllSectionViews } from "./guideSectionViews.ts";
import { fetchSessionSummary } from "./meditationSessions.ts";
import { fetchAcquired } from "./acquired.ts";

export type OwnedKind = "program" | "guide" | "meditation";
export const ownedKey = (kind: OwnedKind, id: string) => `${kind}:${id}`;

// "owned" = in the cabinet; "started" = in the cabinet AND real activity exists
// (so the CTA can say "Продовжити" instead of "Почати").
export type Access = "owned" | "started";

// `demoEnrollments: false` leaves out the static demo enrollments of the cabinet: «Збережене» uses that to tell what
// the person really has (added, started) from what they only saved.
export async function fetchOwnedKeys(userId: string, opts: { demoEnrollments?: boolean } = {}): Promise<Map<string, Access>> {
  const owned = new Map<string, Access>((opts.demoEnrollments === false ? [] : enrollments).map((e) => [ownedKey(e.kind as OwnedKind, e.contentId), "owned" as Access]));
  const [progress, views, sessions, acquired] = await Promise.all([
    fetchAllProgress(userId).catch(() => ({})),
    fetchAllSectionViews(userId).catch(() => ({})),
    fetchSessionSummary(userId).catch(() => ({})),
    fetchAcquired(userId).catch(() => []),
  ]);
  // added from the cart: in the cabinet, not started yet (real activity below upgrades it to "started")
  acquired.forEach((a) => owned.set(ownedKey(a.kind, a.contentId), "owned"));
  Object.keys(progress).forEach((id) => owned.set(ownedKey("program", id), "started"));
  Object.entries(views).forEach(([id, n]) => n > 0 && owned.set(ownedKey("guide", id), "started"));
  Object.keys(sessions).forEach((id) => owned.set(ownedKey("meditation", id), "started"));
  return owned;
}
