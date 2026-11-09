// Maps stored section views onto a guide's CURRENT sections by stable key
// (2026-10-06). Pure, so it is tested without a database.
//
// A stored row identifies its section by `sectionId` (the heading block's id)
// once guide-block-identity-migration.sql ran; an older row has only the
// position `sectionIndex`, which is resolved against the current keys. Rows
// that point at a section the guide no longer has are KEPT in the database
// (history is never deleted) but ignored here, so they cannot inflate
// progress.

export type SectionViewRow = { sectionId?: string | null; sectionIndex?: number | null };

export function viewedKeys(rows: SectionViewRow[], currentKeys: string[]): string[] {
  const valid = new Set(currentKeys);
  const out = new Set<string>();
  for (const row of rows) {
    const key = row.sectionId ?? (row.sectionIndex == null ? undefined : currentKeys[row.sectionIndex]);
    if (key && valid.has(key)) out.add(key);
  }
  return Array.from(out);
}
