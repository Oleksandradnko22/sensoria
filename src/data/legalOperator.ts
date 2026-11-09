// Legal identity of the platform operator — the ONE place to fill in before the
// legal pages are published. Nothing here is invented: every empty value is
// shown on the legal pages as a visible amber "заповнити" marker, so an
// unfinished document cannot be mistaken for a final one.
export const LEGAL = {
  /** Повне найменування оператора (юридична особа або ФОП). */
  operatorName: "фізична особа — підприємець Лебеденко Олександра Русланівна",
  /** Реєстраційні дані оператора (як надано власником платформи). */
  registration: "3837304242",
  /** Адреса для юридично значущих звернень. */
  address: "відділення № 5 Нової пошти, м. Кропивницький, вул. Кавалерійська, 17/19, Подільський район, Україна",
  /** Дата набрання чинності поточної редакції (напр. 01.01.2027). */
  effectiveDate: "",
  /** Номер або дата редакції. */
  edition: "1.0",
  /** Електронна адреса для звернень (та сама, що на сторінці «Контакти»). */
  email: "sensoriaplatform@gmail.com",
  /** Окрема пошта для звернень щодо персональних даних і скарг (необов'язково). */
  privacyEmail: "",
} as const;

export type LegalKey = keyof typeof LEGAL;
