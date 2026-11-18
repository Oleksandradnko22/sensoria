// The monthly act of Sensoria's services (offer Б38; form — accountant В7) as a PDF. The same file is downloaded by the
// owner to sign with КЕП on id.gov.ua and by the author, so it holds only what the act says — not its later status.
import type { LegalSection } from "../components/legal/LegalLayout";
import { LEGAL } from "../data/legalOperator";
import type { ActData, TaxSystem } from "./finance";

export const TAX_LABEL: Record<TaxSystem, string> = {
  fop2: "ФОП, єдиний податок, 2 група",
  fop3: "ФОП, єдиний податок, 3 група",
  fop_general: "ФОП, загальна система",
  tov3: "ТОВ, єдиний податок, 3 група",
  tov_general: "ТОВ, загальна система",
};
/** The act is the place of making: the operator's location (lawyer, 18.11.2026). */
export const ACT_PLACE = "м. Кропивницький";
const MONTHS = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
export const actMonth = (period: string) => { const [y, m] = period.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const uah = (kop: number) => (kop / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOURCE: Record<string, string> = { catalog: "каталог", referral: "посилання", promo: "промокод" };

export async function downloadActPdf(act: { data: ActData; issued_at: string }): Promise<void> {
  const d = act.data;
  const c = d.customer;
  const code = c?.code ? (c.code.length === 8 ? `код ЄДРПОУ ${c.code}` : `РНОКПП ${c.code}`) : null;
  const customer = [c?.legalName ?? "Автор Платформи Sensoria", code, c?.taxSystem ? TAX_LABEL[c.taxSystem] : null, c ? (c.vatPayer ? "платник ПДВ" : "не є платником ПДВ") : null].filter(Boolean).join(", ");
  const sections: LegalSection[] = [
    {
      id: "parties", title: "Сторони",
      body: [
        `Виконавець: ${LEGAL.operatorName}, РНОКПП ${LEGAL.registration}, платник єдиного податку третьої групи, не є платником ПДВ. Місцезнаходження: ${LEGAL.address}.`,
        `Замовник: ${customer}.`,
        "Підстава: Публічний договір про надання послуг технічного характеру (оферта для авторів), редакція 1.0 від 17.11.2026.",
      ],
    },
    {
      id: "services", title: "Надані послуги",
      body: [
        "Виконавець надав, а Замовник прийняв послуги технічного характеру Платформи Sensoria: розміщення цифрових матеріалів, оформлення замовлень, надання Покупцям доступу до цифрових матеріалів, передавання Банку даних для приймання оплати.",
        [
          `1. Послуги за успішними замовленнями, тариф 30 % — ${d.lines.tariff30.count} замовл., ${uah(d.lines.tariff30.sumKop)} грн`,
          `2. Послуги за успішними замовленнями, тариф 15 % — ${d.lines.tariff15.count} замовл., ${uah(d.lines.tariff15.sumKop)} грн`,
          `Разом вартість наданих послуг — ${d.lines.tariff30.count + d.lines.tariff15.count} замовл., ${uah(d.servicesKop)} грн`,
          `3. Повернено Замовнику Тариф у зв’язку з поверненням оплат Покупцям — ${d.lines.returned.count} замовл., ${uah(d.returnedKop)} грн`,
        ],
        `Вартість послуг за актом: ${uah(d.servicesKop)} грн (${d.servicesInWords}). Без ПДВ: Виконавець не є платником ПДВ.`,
        `Сума Тарифу, повернена у звітному місяці: ${uah(d.returnedKop)} грн (${d.returnedInWords}).`,
      ],
    },
    {
      id: "payment", title: "Оплата",
      body: ["Оплата вартості послуг здійснена в грошовій безготівковій формі: АТ «УНІВЕРСАЛ БАНК» за дорученням Замовника спрямував частину кожного платежу Покупця на поточний рахунок Виконавця. Повернення Тарифу здійснено в безготівковій формі. Зарахування зустрічних однорідних вимог не здійснювалося. Заборгованості сторін за актом немає."],
    },
    {
      id: "reference", title: "Довідково",
      body: [`Не є вартістю послуг Виконавця: загальна сума оплат Покупців за замовленнями — ${uah(d.reference.paymentsKop)} грн; комісія Банку за еквайринг, утримана Банком з частини Замовника, — ${uah(d.reference.bankFeeKop)} грн. Комісія Банку не є доходом Виконавця.`],
    },
    {
      id: "register", title: `Додаток 1. Реєстр замовлень за ${actMonth(d.period)}`,
      body: [
        d.register.length
          ? d.register.map((r) => `${r.n}. № ${r.order} · ${new Date(r.paidAt).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })} · матеріал ${r.material} · чек ${r.fiscalNo ?? "—"} · ціна ${uah(r.listKop)} · знижка ${uah(r.discountKop)} · сплачено ${uah(r.paidKop)} · ${SOURCE[r.source] ?? r.source} · тариф ${r.tariffPct} % = ${uah(r.tariffKop)} · комісія Банку ${uah(r.bankFeeKop)} · зараховано Замовнику ${uah(r.creditedToAuthorKop)} · ${r.status === "paid" ? "оплачено" : r.status === "refunded" ? "повернено" : "чарджбек"}${r.returnFiscalNo ? ` · чек повернення ${r.returnFiscalNo}` : ""}`)
          : ["Замовлень у звітному місяці немає."],
      ],
    },
    {
      id: "acceptance", title: "Прийняття і підписання",
      body: [
        "Акт підписується Виконавцем кваліфікованим електронним підписом і розміщується в кабінеті Автора. Замовник має право протягом 5 (п’яти) робочих днів з дня розміщення акта надати мотивовані письмові заперечення. Якщо заперечень не надано, акт вважається прийнятим Замовником без зауважень (розділ «Надходження коштів Автору» оферти).",
        "Замовник, який є юридичною особою або фізичною особою — підприємцем на загальній системі оподаткування, підписує акт кваліфікованим електронним підписом.",
        "Від Виконавця: кваліфікований електронний підпис.  Від Замовника: кваліфікований електронний підпис або прийняття в порядку, визначеному офертою.",
      ],
    },
  ];
  const { downloadLegalPdf } = await import("./legalPdf");
  await downloadLegalPdf({
    title: `Акт № ${d.number} про надання послуг технічного характеру за ${actMonth(d.period)}`,
    subtitle: `${ACT_PLACE} · дата складання: ${new Date(act.issued_at).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })}`,
    sections, edition: "", fileName: `sensoria-akt-${d.number}.pdf`,
  });
}
