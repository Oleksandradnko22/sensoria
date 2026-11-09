const BUCKET = "content-files";

/** The object path inside the bucket from a public link (a query string such as ?v=… is ignored); null for foreign links. */
export function contentFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const rest = url.slice(i + marker.length).split(/[?#]/)[0];
  try { return decodeURIComponent(rest) || null; } catch { return rest || null; }
}
