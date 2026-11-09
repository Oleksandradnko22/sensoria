// Pure rules for author verification (files + profile completeness).

export const VERIFY_MAX_FILES = 3;
export const VERIFY_MAX_BYTES = 8 * 1024 * 1024;
export const VERIFY_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Returns a user-facing problem with the chosen files, or null if fine. */
export function validateVerificationFiles(files: readonly { type: string; size: number }[]): string | null {
  if (files.length === 0) return "Додайте хоча б один файл.";
  if (files.length > VERIFY_MAX_FILES) return `Не більше ${VERIFY_MAX_FILES} файлів.`;
  for (const f of files) {
    if (!VERIFY_TYPES.includes(f.type)) return "Підтримуються лише фото (JPG, PNG, WebP) та PDF.";
    if (f.size > VERIFY_MAX_BYTES) return "Файл завеликий — максимум 8 МБ.";
  }
  return null;
}

/** What is still missing in the profile before a request can be sent. */
export function missingProfileParts(p: { name: string; title: string; bio: string }): string[] {
  const out: string[] = [];
  if (!p.name.trim()) out.push("ім'я");
  if (!p.title.trim()) out.push("спеціалізацію (рядок під іменем)");
  if (!p.bio.trim()) out.push("розділ «Про себе»");
  return out;
}

