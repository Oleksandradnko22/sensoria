// Demo posts for the feeds («Публікації»): shown while a feed is empty or before supabase/feeds.sql is run, so the
// look can be checked. Participants are the same people as in the author's cabinet (demoWorld).
import type { FeedKind, FeedPost } from "../lib/authorPosts";
import { demoWorld } from "./demoWorld";

const H = 3_600_000;

function post(id: string, hoursAgo: number, authorName: string, isAuthor: boolean, audience: FeedPost["audience"], body: string, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id: `demo-feed-${id}`,
    authorId: `demo-${authorName}`,
    body,
    contentId: null,
    contentKind: null,
    isPinned: false,
    createdAt: new Date(Date.now() - hoursAgo * H).toISOString(),
    updatedAt: null,
    attachment: null,
    images: [],
    video: null,
    isShare: false,
    imageAlt: "",
    stats: { likeCount: Math.round(3 + (hoursAgo * 7) % 40), commentCount: Math.round((hoursAgo * 3) % 9), liked: false },
    audience,
    authorName,
    authorAvatarUrl: null,
    authorIsAuthor: isAuthor,
    ...extra,
  };
}

export function demoFeed(kind: FeedKind): FeedPost[] {
  const people = demoWorld().people.map((p) => p.name);
  const who = (i: number) => people[i % Math.max(1, people.length)] ?? "Учасник Sensoria";
  if (kind === "all") return [
    post("a1", 2, "Олена Коваль", true, "all", "Три хвилини, які змінюють вечір\n\nПеред сном спробуйте просте: видих довший за вдих. Чотири рахунки — вдих, шість — видих. Три хвилини, і тіло отримує сигнал, що день закінчився.", {
      attachment: { kind: "meditation", id: "demo", title: "Вечірнє заспокоєння", meta: "Медитація · 10 хв", unavailable: false },
    }),
    post("a2", 9, "Андрій Мельник", true, "all", "Тривога — не ворог. Це сигнал, який колись допомагав вижити. Коли ми перестаємо з ним боротися і починаємо його помічати, він стає тихішим."),
    post("a3", 26, "Олена Коваль", true, "all", "Відкрила запис на програму «Спокійний сон за 21 день». Для тих, хто вже зі мною, — коротке відео-знайомство в описі програми."),
    post("a4", 50, "Ірина Бондар", true, "all", "Маленьке нагадування на тиждень: ви не мусите заслуговувати на відпочинок. Відпочинок — це частина роботи, а не нагорода за неї."),
  ];
  if (kind === "participants") return [
    post("p1", 1, who(0), false, "participants", "Третій тиждень практикую вечірню медитацію. Засинаю швидше, і ранки стали спокійніші. Дякую всім, хто ділився досвідом тут!"),
    post("p2", 4, who(4), false, "participants", "Маленька перемога тижня: вперше за довгий час сказала «ні» і не відчула провини. Дякую практиці з програми про межі."),
    post("p3", 7, who(1), false, "participants", "Техніка дихання 4-7-8 реально працює в метро, коли накриває. Головне — не чекати, поки стане зовсім погано."),
    post("p4", 20, who(2), false, "participants", "Хтось проходив програму про стрес паралельно з роботою? Як ви знаходили час на практики?"),
    post("p5", 33, who(3), false, "participants", "Помітила, що чек-лист у програмі дуже допомагає не кидати. Відмічати пункти — маленька, але приємна перемога."),
  ];
  if (kind === "authors") return [
    post("u1", 3, "Команда Sensoria", true, "authors", "Новини для авторів\n\nУ редакторі програм з’явилась відеоінструкція «Модулі та уроки». А теми попереджень тепер діляться на загальні й ті, що доступні лише фахівцям."),
    post("u2", 15, "Андрій Мельник", true, "authors", "Колеги, як ви формулюєте практику «Спробуйте зараз», щоб учасники справді відповідали? У мене краще працює шкала, ніж текст."),
    post("u3", 40, "Ірина Бондар", true, "authors", "Ділюся спостереженням: короткі уроки по 5–7 хвилин проходять до кінця вдвічі частіше, ніж довгі."),
  ];
  return [];
}
