// The platform operator's details for letters sent by edge functions. The SAME values as src/data/legalOperator.ts
// (the site's legal pages) — src/utils/brandEmail.test.ts fails if the two ever differ.
export const OPERATOR = {
  operatorName: "фізична особа — підприємець Лебеденко Олександра Русланівна",
  registration: "3837304242",
  address: "Україна, 25019, Кіровоградська обл., м. Кропивницький, провулок Вишняківський, 46",
  mailingAddress: "Україна, 25002, Кіровоградська обл., м. Кропивницький, вул. Івана Похитонова, 9, кв. 47",
  email: "sensoriaplatform@gmail.com",
  /** the current edition of the participant agreement and the day it took effect */
  edition: "1.1",
  effectiveDate: "22.11.2026",
} as const;
