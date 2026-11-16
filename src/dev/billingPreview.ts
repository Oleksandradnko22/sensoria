// Sample purchases for «Оплати». DEV: `?billingDemo=1` shows them even next to real rows; otherwise they appear only
// as the demo (SHOW_DEMO) when the person has no purchases yet, and are never mixed into real data.
import type { PurchaseView } from "../utils/purchasesView.ts";

const KEY = "sensoria.billingDemo";

export function billingDemoOn(): boolean {
  if (!import.meta.env.DEV) return false;
  const q = new URLSearchParams(window.location.search).get("billingDemo");
  if (q === "1") sessionStorage.setItem(KEY, "1");
  if (q === "0") sessionStorage.removeItem(KEY);
  return sessionStorage.getItem(KEY) === "1";
}

// The same rows are the participant's demo «Після покупки» (SHOW_DEMO): dates are relative to today, so the paid
// program is always inside the 14-day refund window.
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
export const BILLING_DEMO: PurchaseView[] = [
  { id: "00000001-demo", contentId: "stress-course", kind: "program", title: "Робота зі стресом", author: "Андрій Коваленко", amount: 1500, date: daysAgo(0), status: "paid" },
  { id: "00000002-demo", contentId: "healthy-balance", kind: "program", title: "Підтримка емоційного балансу", author: "Sensoria", amount: 0, date: daysAgo(6), status: "free" },
  { id: "00000003-demo", contentId: "quick-grounding", kind: "meditation", title: "Швидке заземлення", author: "Sensoria", amount: 0, date: daysAgo(12), status: "free" },
];
