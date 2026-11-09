// Turns an unknown thrown value into a readable string for user-facing
// error banners (2026-09-21 bug fix). Several places in this app do
// `err instanceof Error ? err.message : String(err)` when catching a
// failed save/fetch — that works for real `Error` instances, but a lot
// of what actually gets thrown here isn't one. Supabase's client throws
// its raw `PostgrestError` on a failed query (see lib/programSaves.ts's
// `throw error`, lib/guideSaves.ts's equivalent, etc.) — a plain
// `{ message, details, hint, code }` object with no custom `toString()`.
// `String(...)` on a plain object falls back to `Object.prototype.
// toString`, i.e. the literal text "[object Object]" — which is exactly
// what was showing up in the "Не вдалося зберегти програму" banner
// instead of the real reason the save failed. This checks for a
// string `.message` property on ANY object (covers PostgrestError and
// anything else shaped like an error), not just real `Error` instances.
export function errorMessage(err: unknown, fallback = "Сталася невідома помилка."): string {
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string" &&
    (err as { message: string }).message.length > 0
  ) {
    return (err as { message: string }).message;
  }
  if (typeof err === "string" && err.length > 0) return err;
  return fallback;
}
