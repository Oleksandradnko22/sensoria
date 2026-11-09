// The icons an author can pick for the steps, principles and expectations in
// «Підхід і напрями». A fixed, curated set (24×24 stroke paths): authors choose
// by name, they never upload or draw anything. The id is what is stored; an
// empty or unknown id falls back to a default by position, so old profiles
// keep rendering.
export type StoryIconId =
  | "sprout" | "search" | "sparkles" | "flag" | "clock" | "check" | "heart" | "user" | "users" | "leaf" | "sun"
  | "moon" | "wind" | "book" | "compass" | "shield" | "message" | "headphones" | "target" | "lightbulb" | "feather"
  | "star" | "home";

export const STORY_ICONS: { id: StoryIconId; label: string; path: string }[] = [
  { id: "sprout", label: "Росток", path: "M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z" },
  { id: "search", label: "Пошук", path: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5" },
  { id: "sparkles", label: "Іскри", path: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" },
  { id: "flag", label: "Прапор", path: "M5 21V4M5 4h11l-2 4 2 4H5" },
  { id: "clock", label: "Час", path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" },
  { id: "check", label: "Галочка", path: "M4 12.5l5 5L20 6.5" },
  { id: "heart", label: "Серце", path: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { id: "user", label: "Людина", path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" },
  { id: "users", label: "Люди", path: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 11a3 3 0 1 0 0-6M19 20c0-2.5-1.5-4-3.5-4.7" },
  { id: "leaf", label: "Листок", path: "M5 19c0-9 5-14 15-14 0 9-5 14-15 14zM5 19c3-5 6-8 10-10" },
  { id: "sun", label: "Сонце", path: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" },
  { id: "moon", label: "Місяць", path: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
  { id: "wind", label: "Подих", path: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8a2.5 2.5 0 1 1-2.5 2.5" },
  { id: "book", label: "Книга", path: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6" },
  { id: "compass", label: "Компас", path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z" },
  { id: "shield", label: "Захист", path: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  { id: "message", label: "Розмова", path: "M4 5h16v11H9l-5 4z" },
  { id: "headphones", label: "Аудіо", path: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z" },
  { id: "target", label: "Ціль", path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" },
  { id: "lightbulb", label: "Ідея", path: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" },
  { id: "feather", label: "Пір'їна", path: "M20 4c-8 0-14 5-14 12v4M20 4c0 8-5 12-12 12M9 15l6-6" },
  { id: "star", label: "Зірка", path: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
  { id: "home", label: "Дім", path: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6" },
];

const BY_ID = new Map(STORY_ICONS.map((i) => [i.id as string, i]));

export const isStoryIcon = (v: unknown): v is StoryIconId => typeof v === "string" && BY_ID.has(v);

// default icon by position when the author picked none
export const DEFAULT_STEP_ICONS: StoryIconId[] = ["sprout", "search", "sparkles", "flag", "clock", "check"];
export const DEFAULT_PRINCIPLE_ICONS: StoryIconId[] = ["heart", "user", "leaf", "sparkles"];
export const DEFAULT_OFFER_ICON: StoryIconId = "check";

export function iconPath(id: string | undefined, fallback: StoryIconId): string {
  return (BY_ID.get(id ?? "") ?? BY_ID.get(fallback)!).path;
}
