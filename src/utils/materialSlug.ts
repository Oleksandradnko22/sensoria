// The readable id of a new guide / meditation (content.slug, see materials-db-model-migration.sql):
// lowercase latin letters, digits and hyphens, at most 80 characters, unique per kind.
const UA: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  ы: "y", э: "e", ё: "io", ъ: "",
};

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function slugify(title: string): string {
  const latin = [...title.toLowerCase()].map((ch) => UA[ch] ?? ch).join("");
  return latin.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// `uniqueSuffix` is a few characters of the content uuid, so two materials with the same title never clash.
export function makeSlug(title: string, uniqueSuffix: string): string {
  const suffix = uniqueSuffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "x";
  const base = slugify(title).slice(0, 80 - suffix.length - 1).replace(/-+$/, "");
  return base ? `${base}-${suffix}` : `material-${suffix}`;
}
