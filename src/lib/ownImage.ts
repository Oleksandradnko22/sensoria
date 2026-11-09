// Images shown on public pages come only from our own storage (or the app itself),
// never from an arbitrary address stored in a row. Also the storage path of such a
// file, so removed pictures can be deleted from the bucket.
const HOST = (() => {
  try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host; } catch { return ""; }
})();

export const ownImage = (u: string): boolean => {
  if (import.meta.env.DEV && u.startsWith("data:image/")) return true; // dev sample data only
  if (u.startsWith("/") && !u.startsWith("//")) return true;
  try { return !!HOST && new URL(u).host === HOST; } catch { return false; }
};

// `{authorId}/{folder}/…` path inside the content-files bucket, or null
export const storagePath = (u: string, authorId: string, folder: string): string | null => {
  const m = u.match(/content-files\/(.+?)(?:\?|$)/);
  const p = m ? decodeURIComponent(m[1]) : "";
  return p.startsWith(`${authorId}/${folder}/`) ? p : null;
};
