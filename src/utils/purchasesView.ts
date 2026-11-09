// «Оплати»: pure mapping + export helpers. Access and payment are different
// things — a row exists only for a real `purchases` record; free items
// (amount exactly 0) read «Доступно», never «Оплачено».
import { formatPrice } from "./price.ts";

export type PurchaseStatus = "paid" | "pending" | "unpaid" | "refunded" | "free";
export type PurchaseKind = "program" | "guide" | "meditation";

export type PurchaseView = {
  id: string;
  contentId: string;
  kind: PurchaseKind | null;
  title: string | null; // null = material no longer available
  author: string | null;
  amount: number;
  date: string; // ISO timestamp
  status: PurchaseStatus;
};

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  paid: "Оплачено",
  pending: "Очікує оплати",
  unpaid: "Не оплачено",
  refunded: "Повернено",
  free: "Доступно",
};

export const KIND_LABEL: Record<PurchaseKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

// DB status ("completed" | "refunded") + amount → UI status.
export function purchaseStatus(dbStatus: string, amount: number): PurchaseStatus {
  if (dbStatus === "refunded") return "refunded";
  if (dbStatus === "completed") return amount > 0 ? "paid" : "free";
  return "pending"; // unknown future states are never shown as paid
}

export const formatAmount = (amount: number): string => formatPrice(amount);

export const shortOrderId = (id: string): string => `#${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

// A material may be opened only when the purchase actually grants access.
export const grantsAccess = (p: Pick<PurchaseView, "status">): boolean => p.status === "paid" || p.status === "free";

// ── CSV (the participant's own purchases only) ─────────────────────────
// Cells that start with = + - @ would be executed as formulas by Excel.
function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function purchasesToCsv(rows: PurchaseView[], formatDate: (iso: string) => string): string {
  const head = ["Дата", "Матеріал", "Автор", "Тип", "Сума", "Статус", "Ідентифікатор"];
  const lines = rows.map((p) =>
    [
      formatDate(p.date),
      p.title ?? "Матеріал більше недоступний",
      p.author ?? "",
      p.kind ? KIND_LABEL[p.kind] : "",
      formatAmount(p.amount),
      STATUS_LABEL[p.status],
      shortOrderId(p.id),
    ]
      .map(cell)
      .join(";"),
  );
  return "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
}
