// A lesson's kind follows what is attached to it (authors never pick it by hand).
type Attachments = { videoUrl?: string; audioUrl?: string; fileUrl?: string; imageUrl?: string; checklist?: string[] };

export function deriveLessonType(item: Attachments, hasChecklistItems: boolean): "video" | "audio" | "pdf" | "image" | "checklist" | "text" {
  const has = (v?: string) => !!v && v.trim().length > 0;
  if (has(item.videoUrl)) return "video";
  if (has(item.audioUrl)) return "audio";
  if (has(item.fileUrl)) return "pdf";
  if (has(item.imageUrl)) return "image";
  if (hasChecklistItems) return "checklist";
  return "text";
}
