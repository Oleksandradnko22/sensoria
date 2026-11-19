// Legal identity of the platform operator — the ONE place to fill in before the
// legal pages are published. Nothing here is invented: every empty value is
// shown on the legal pages as a visible amber "заповнити" marker, so an
// unfinished document cannot be mistaken for a final one.
export const LEGAL = {
  /** Повне найменування оператора (юридична особа або ФОП). */
  operatorName: "фізична особа — підприємець Лебеденко Олександра Русланівна",
  /** Реєстраційні дані оператора (як надано власником платформи). */
  registration: "3837304242",
  /** Місцезнаходження ФОП — точно як у ЄДР (так само в ІПК 7724/ІПК/6 і 20-ОПП; район у ДПС — Фортечний). */
  address: "Україна, 25019, Кіровоградська обл., м. Кропивницький, провулок Вишняківський, 46",
  /** Адреса для листування: де оператор фактично отримує пошту (Укрпошта доставляє, на відділення Нової пошти — ні). */
  mailingAddress: "Україна, 25002, Кіровоградська обл., м. Кропивницький, вул. Івана Похитонова, 9, кв. 47",
  /** Дата набрання чинності поточної редакції (напр. 01.01.2027). */
  effectiveDate: "20.11.2026",
  /** Номер або дата редакції. */
  edition: "1.0",
  /** Електронна адреса для звернень (та сама, що на сторінці «Контакти»). */
  email: "sensoriaplatform@gmail.com",
  /** Окрема пошта для звернень щодо персональних даних і скарг (необов'язково). */
  privacyEmail: "",
} as const;

export type LegalKey = keyof typeof LEGAL;
