// DEV only: `?billingDemo=1` shows sample purchases so the populated page
// can be reviewed while payments are not connected. Never active in a
// production build, never mixed into real data.
import type { PurchaseView } from "../utils/purchasesView.ts";

const KEY = "sensoria.billingDemo";

export function billingDemoOn(): boolean {
  if (!import.meta.env.DEV) return false;
  const q = new URLSearchParams(window.location.search).get("billingDemo");
  if (q === "1") sessionStorage.setItem(KEY, "1");
  if (q === "0") sessionStorage.removeItem(KEY);
  return sessionStorage.getItem(KEY) === "1";
}

export const BILLING_DEMO: PurchaseView[] = [
  { id: "00000001-demo", contentId: "stress-course", kind: "program", title: "Робота зі стресом", author: "Андрій Коваленко", amount: 1500, date: "2026-07-21T14:32:00Z", status: "paid" },
  { id: "00000002-demo", contentId: "panic-sos", kind: "guide", title: "SOS при панічних атаках", author: "Андрій Коваленко", amount: 290, date: "2026-07-28T10:05:00Z", status: "paid" },
  { id: "00000003-demo", contentId: "quick-grounding", kind: "meditation", title: "Швидке заземлення", author: "Sensoria", amount: 0, date: "2026-08-05T09:00:00Z", status: "free" },
];
