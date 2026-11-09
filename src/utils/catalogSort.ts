// ONE sort list for the programs, guides and meditations catalogs: same options, same words, same order.
export type CatalogSortId = "default" | "popular" | "rating" | "new" | "cheap" | "expensive";

export const CATALOG_SORT_OPTIONS: { id: CatalogSortId; label: string }[] = [
  { id: "default", label: "За замовчуванням" },
  { id: "popular", label: "Популярні" },
  { id: "rating", label: "За рейтингом" },
  { id: "new", label: "Нові" },
  { id: "cheap", label: "Дешеві" },
  { id: "expensive", label: "Дорогі" },
];
