// «What the signed-in participant already has in the cabinet», kept fresh: re-read when something is added
// from the cart, when a lesson player closes, and when the tab comes back into view.
import { useEffect, useState } from "react";
import { fetchOwnedKeys } from "./ownedContent.ts";
import { ACQUIRED_EVENT } from "./acquired.ts";

export function useOwnedKeys(userId?: string | null, enabled = true): Set<string> {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId || !enabled) {
      setOwned(new Set());
      return;
    }
    let cancelled = false;
    const load = () =>
      fetchOwnedKeys(userId)
        .then((m) => !cancelled && setOwned(new Set(m.keys())))
        .catch(() => undefined);
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener(ACQUIRED_EVENT, load);
    window.addEventListener("sensoria:progress-changed", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(ACQUIRED_EVENT, load);
      window.removeEventListener("sensoria:progress-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, enabled]);
  return owned;
}
