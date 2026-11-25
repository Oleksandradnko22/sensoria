// The letter a new author gets right after signing the author agreement, while the application waits for approval:
// an invitation to the closed Telegram community «Sensoria — спільнота авторів» (join by the link only).
import { renderBrandEmail } from "./brandEmail.ts";

export const AUTHOR_COMMUNITY_URL = "https://t.me/+7sdccrmZrvsyOTE6";

export function authorCommunityEmail(name?: string | null): { subject: string; html: string; text: string } {
  const hello = name?.trim() ? `Вітаємо, ${name.trim().split(/\s+/)[0]}!` : "Вітаємо!";
  return {
    subject: "Поки ми розглядаємо анкету — долучайтеся до спільноти авторів Sensoria",
    ...renderBrandEmail({
      preheader: "Закрита Telegram-спільнота для авторів Sensoria: новини, інструкції, допомога з першими матеріалами.",
      heading: "Спільнота авторів Sensoria",
      blocks: [
        { type: "text", text: `${hello} Дякуємо, що заповнили анкету й підписали договір. Ми вже розглядаємо вашу заявку і напишемо, щойно кабінет автора відкриється.` },
        { type: "text", text: "А поки запрошуємо вас до закритої Telegram-спільноти «Sensoria — спільнота авторів». Там ми:" },
        { type: "details", rows: [
          { label: "Новини", value: "розповідаємо про новини та оновлення платформи" },
          { label: "Інструкції", value: "ділимося інструкціями й рекомендаціями щодо роботи з платформою" },
          { label: "Допомога", value: "допомагаємо зі створенням і оформленням перших матеріалів" },
          { label: "Зустрічі", value: "проводимо освітні зустрічі та практичні розбори" },
          { label: "Ідеї", value: "обговорюємо ідеї та пропозиції щодо розвитку платформи" },
        ] },
        { type: "button", label: "Приєднатися до спільноти", url: AUTHOR_COMMUNITY_URL },
        { type: "note", text: "Спільнота закрита: увійти можна лише за цим посиланням. Будь ласка, не пересилайте його іншим людям." },
      ],
      reason: "Ви отримали цей лист, бо подали анкету автора на Sensoria й підписали договір з автором.",
    }),
  };
}
