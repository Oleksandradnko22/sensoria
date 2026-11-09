// The cart as the person should see it: only materials that exist, minus what is already in the cabinet.
import { useMemo } from "react";
import { useCart } from "./cartStore.ts";
import { useOwnedKeys } from "./useOwnedKeys.ts";
import { useMaterialsVersion } from "./materialsStore.ts";
import { buildCartCatalog } from "../utils/cartCatalog.ts";
import { cartKey, resolveCart } from "../utils/cart.ts";
import type { Program } from "../data/programs.ts";

export function useCartView(programs: Program[], userId?: string | null, isParticipant = false) {
  const { cart } = useCart();
  const owned = useOwnedKeys(userId, isParticipant);
  const materialsVersion = useMaterialsVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalog = useMemo(() => buildCartCatalog(programs), [programs, materialsVersion]);
  return useMemo(() => {
    const { lines, missing } = resolveCart(cart, catalog);
    const open = lines.filter((l) => !owned.has(cartKey(l.entry)));
    return { lines, missing, owned, count: open.length };
  }, [cart, catalog, owned]);
}
