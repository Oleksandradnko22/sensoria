// Recent-messages list for the overview: real conversations first, then
// demo ones, read-state overridden by locally known read ids, first N shown.
export type MessagePreview = {
  id: string;
  authorName: string;
  contentTitle: string | null;
  preview: string;
  date: string;
  unread: boolean;
};

export function mergeMessagePreviews(
  real: MessagePreview[],
  demo: MessagePreview[],
  readIds: Record<string, boolean> | undefined,
  limit = 3
): MessagePreview[] {
  return [...real, ...demo]
    .map((m) => ({ ...m, unread: readIds && readIds[m.id] !== undefined ? !readIds[m.id] : m.unread }))
    .slice(0, limit);
}
