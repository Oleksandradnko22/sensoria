// Pure state of a meditation SESSION (2026-10-06): one practice run from
// start to end, with its own BEFORE and AFTER self-report.
//
// Rules this module enforces (and utils/meditationSession.test.ts checks):
//  - every start creates a NEW session; earlier sessions are never touched,
//    so repeating a meditation never overwrites an earlier before/after;
//  - BEFORE and AFTER are stored separately on the session (either may be
//    missing — the check-in is optional);
//  - AFTER may be recorded even if BEFORE was skipped;
//  - a session abandoned by starting again is marked "stopped", not deleted;
//  - the result is described as the person's own report, never as an effect
//    of the practice.
//
// No I/O here except the tolerant (de)serialisation used for the on-device
// copy; the server copy lives in meditation_sessions / meditation_mood_checkins.

export type SessionStatus = "in_progress" | "completed" | "stopped";

export type BeforeReport = { stateKeys: string[]; intensity: number | null };
export type AfterReport = { intensity: number | null; changeKeys: string[] };

export type MeditationSession = {
  id: string;
  meditationId: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  before: BeforeReport | null;
  after: AfterReport | null;
};

export type SessionList = MeditationSession[];

const MAX_KEPT = 50;

function update(list: SessionList, id: string, fn: (s: MeditationSession) => MeditationSession): SessionList {
  return list.map((s) => (s.id === id ? fn(s) : s));
}

// New session. A still-open earlier session of the same meditation is closed
// as "stopped" (the person started over) — kept, never deleted or merged.
export function startSession(
  list: SessionList,
  params: { id: string; meditationId: string; now: string }
): SessionList {
  if (list.some((s) => s.id === params.id)) return list;
  const closed = list.map((s) =>
    s.meditationId === params.meditationId && s.status === "in_progress"
      ? { ...s, status: "stopped" as const, endedAt: params.now }
      : s
  );
  const created: MeditationSession = {
    id: params.id,
    meditationId: params.meditationId,
    startedAt: params.now,
    endedAt: null,
    status: "in_progress",
    before: null,
    after: null,
  };
  return [...closed, created].slice(-MAX_KEPT);
}

export function recordBefore(list: SessionList, id: string, before: BeforeReport): SessionList {
  return update(list, id, (s) => ({ ...s, before }));
}

// Allowed in any status: the AFTER question is asked on the report screen,
// i.e. after the session already ended.
export function recordAfter(list: SessionList, id: string, patch: Partial<AfterReport>): SessionList {
  return update(list, id, (s) => ({
    ...s,
    after: { intensity: s.after?.intensity ?? null, changeKeys: s.after?.changeKeys ?? [], ...patch },
  }));
}

export function completeSession(list: SessionList, id: string, now: string): SessionList {
  return update(list, id, (s) => (s.status === "in_progress" ? { ...s, status: "completed", endedAt: now } : s));
}

// A manual early finish: not "completed", still resumable elsewhere.
export function stopSession(list: SessionList, id: string, now: string): SessionList {
  return update(list, id, (s) => (s.status === "in_progress" ? { ...s, status: "stopped", endedAt: now } : s));
}

// The session a screen opened mid-practice should attach to: the latest one of
// this meditation that is still open, else the latest one of it at all.
export function currentSessionFor(list: SessionList, meditationId: string): MeditationSession | null {
  const mine = list.filter((s) => s.meditationId === meditationId);
  return [...mine].reverse().find((s) => s.status === "in_progress") ?? mine[mine.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Result — the person's own report, nothing more
// ---------------------------------------------------------------------------

export const RESULT_CAVEAT =
  "Це ваш особистий досвід у цю хвилину, а не оцінка чи висновок про вплив практики.";

export type SessionResult =
  | { kind: "none" }
  | { kind: "before_only"; text: string; caveat: string }
  | { kind: "after_only"; text: string; caveat: string }
  | { kind: "pair"; before: number; after: number; text: string; caveat: string };

export function describeResult(session: Pick<MeditationSession, "before" | "after"> | null): SessionResult {
  const before = session?.before?.intensity ?? null;
  const after = session?.after?.intensity ?? null;
  if (before === null && after === null) return { kind: "none" };
  if (before !== null && after === null) {
    return { kind: "before_only", text: `Перед практикою ви відзначили напругу ${before} з 5.`, caveat: RESULT_CAVEAT };
  }
  if (before === null && after !== null) {
    return { kind: "after_only", text: `Після практики ви відзначили напругу ${after} з 5.`, caveat: RESULT_CAVEAT };
  }
  const b = before as number;
  const a = after as number;
  return {
    kind: "pair",
    before: b,
    after: a,
    text:
      b === a
        ? `Ви відзначили напругу ${b} з 5 і до практики, і після.`
        : `Ви відзначили напругу ${b} з 5 до практики і ${a} з 5 після.`,
    caveat: RESULT_CAVEAT,
  };
}

// ---------------------------------------------------------------------------
// Completion — when a playing session counts as over
// ---------------------------------------------------------------------------

export function isSessionOver(p: {
  sessionEnded: boolean;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
}): boolean {
  if (p.sessionEnded) return true;
  return p.duration > 0 && !p.isPlaying && p.currentTime >= p.duration - 0.5;
}

// ---------------------------------------------------------------------------
// On-device copy: tolerant restore (a corrupt or older blob never breaks the app)
// ---------------------------------------------------------------------------

export function serializeSessions(list: SessionList): string {
  return JSON.stringify({ v: 1, sessions: list.slice(-MAX_KEPT) });
}

export function restoreSessions(raw: string | null | undefined): SessionList {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { v?: number; sessions?: unknown };
    if (!data || data.v !== 1 || !Array.isArray(data.sessions)) return [];
    return data.sessions.filter(isSession);
  } catch {
    return [];
  }
}

function isSession(x: unknown): x is MeditationSession {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<MeditationSession>;
  return (
    typeof s.id === "string" &&
    typeof s.meditationId === "string" &&
    typeof s.startedAt === "string" &&
    (s.status === "in_progress" || s.status === "completed" || s.status === "stopped") &&
    (s.before === null || typeof s.before === "object") &&
    (s.after === null || typeof s.after === "object")
  );
}
