// "Написати автору" on a public author profile does not open a form there:
// it hands the author over to the participant's own messenger, which then
// opens (or starts) the general conversation with that author. This tiny
// in-memory hand-off bridges the profile page and the dashboard; it is
// consumed exactly once.
export type PendingChat = { authorId: string; name: string; avatarUrl: string | null };

let pending: PendingChat | null = null;

export function setPendingChat(chat: PendingChat): void {
  pending = chat;
}

export function hasPendingChat(): boolean {
  return pending !== null;
}

export function takePendingChat(): PendingChat | null {
  const p = pending;
  pending = null;
  return p;
}

// Same hand-off for "open this material inside my cabinet" (a material the
// participant already has, clicked on an author's profile).
export type PendingOpen = { kind: "program" | "guide" | "meditation"; id: string };
let pendingOpen: PendingOpen | null = null;
export function setPendingOpen(o: PendingOpen): void {
  pendingOpen = o;
}
export function peekPendingOpen(): PendingOpen | null {
  return pendingOpen;
}
export function takePendingOpen(): PendingOpen | null {
  const o = pendingOpen;
  pendingOpen = null;
  return o;
}
