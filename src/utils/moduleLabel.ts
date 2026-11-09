// Programs are not limited by time — people go through them at their own
// pace — so a program's size is shown as a module count, never as days.
import { pluralUk } from "./plural.ts";

/** 1 модуль · 2–4 модулі · 5+ модулів; "" when there are no modules (nothing to show). */
export function moduleCountLabel(n: number | null | undefined): string {
  if (!n || !Number.isFinite(n) || n <= 0) return "";
  return `${n} ${pluralUk(n, "модуль", "модулі", "модулів")}`;
}
