// "A personal observation changed" — a tiny in-memory signal (same idea as
// savedSignal.ts) so "Ваші спостереження" and the overview's summary re-read
// their data exactly when a note, a practice answer or a before/after pair was
// written or deleted somewhere (lesson player, meditation player, this page),
// and can otherwise skip re-reading on every tab switch.
let version = 0;
const listeners = new Set<() => void>();

export function notifyObservationsChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

export function getObservationsVersion(): number {
  return version;
}

export function subscribeObservations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
