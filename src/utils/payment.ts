// Small pure helpers for the payment flow in the browser.

/** The browser only ever follows a link to monobank's own payment page (never to anything else the server returned). */
export function isBankPageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "pay.mbnk.biz" || h.endsWith(".mbnk.biz") || h === "monobank.ua" || h.endsWith(".monobank.ua");
  } catch {
    return false;
  }
}

export type PaymentView =
  | { kind: "wait"; title: string; text: string }
  | { kind: "paid"; title: string; text: string }
  | { kind: "failed"; title: string; text: string }
  | { kind: "review"; title: string; text: string };

/** What the return page tells the person for each status of the invoice. */
export function paymentView(status: string | null, timedOut: boolean): PaymentView {
  switch (status) {
    case "success":
      return { kind: "paid", title: "Оплату отримано", text: "Дякуємо! Матеріал уже у вашому кабінеті, у розділі «Моє навчання»." };
    case "failure":
    case "expired":
      return { kind: "failed", title: "Оплата не пройшла", text: "Гроші не списано. Ви можете спробувати ще раз із кошика." };
    case "reversed":
      return { kind: "failed", title: "Оплату повернено", text: "Кошти повернуто на вашу картку. Доступ до матеріалу закрито." };
    case "needs_review":
      return { kind: "review", title: "Ми перевіряємо оплату", text: "Щось потребує ручної перевірки. Ми напишемо вам, коли все буде готово." };
    default:
      return timedOut
        ? { kind: "wait", title: "Банк ще опрацьовує оплату", text: "Це може тривати кілька хвилин. Матеріал з’явиться у «Моєму навчанні», щойно оплата підтвердиться." }
        : { kind: "wait", title: "Перевіряємо оплату…", text: "Зачекайте кілька секунд, не закривайте сторінку." };
  }
}

/** True while the status can still change: keep asking the server. */
export const isPending = (status: string | null): boolean => status === null || status === "created" || status === "processing" || status === "hold";
