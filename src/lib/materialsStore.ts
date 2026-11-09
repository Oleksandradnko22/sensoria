// A tiny "something changed" signal for the meditations and guides lists. The lists themselves are the exported
// arrays of data/meditations.ts and data/guides.ts (updated in place once the database copy is read); components
// that build something from them subscribe to the version so they rebuild when it changes.
import { useSyncExternalStore } from "react";

let version = 0;
let ready = false;
const listeners = new Set<() => void>();

export function bumpMaterialsVersion() {
  version += 1;
  listeners.forEach((l) => l());
}

// true once the database read has finished (successfully or not); until then a cart entry for a material that is
// only in the database must not be treated as "gone"
export function materialsReady(): boolean {
  return ready;
}

export function markMaterialsReady() {
  if (ready) return;
  ready = true;
  bumpMaterialsVersion();
}

export function useMaterialsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}
