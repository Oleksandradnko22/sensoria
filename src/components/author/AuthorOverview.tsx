import { coverImageStyle, coverUrlForFrame } from "../../utils/coverFocus";
import { isTakenDown, statusRank } from "../../utils/authorContentList";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { pluralUk } from "../../utils/plural";
import {
  recentActivity as mockActivity,
  authoredContent,
  type AuthoredContent,
  type ContentStatus,
  type ContentType,
} from "../../data/authorDashboard";
import { useSession } from "../../context/SessionContext";
import { fetchRecentActivity, type ActivityEvent } from "../../lib/activity";
import { fetchMyReportCount } from "../../lib/reports";
import { formatRelativeTime } from "../../utils/relativeTime";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";

// Ukrainian plural forms for "скарга" — 1 скаргу, 2–4 скарги, 5+ (and
// 11–14) скарг. Same mod10/mod100 idiom used for "модуль" in
// publicContent.ts.
function complaintWord(n: number): string {
  return pluralUk(n, "скаргу", "скарги", "скарг");
}

type NavKey = "content" | "participants" | "finance" | "messages" | "reviews";

type Props = {
  content: AuthoredContent[];
  onNavigate: (key: NavKey) => void;
  onCreate: (type: ContentType) => void;
  onEditContent: (id: string) => void;
  unreadMessages?: number;
};

const activityIcon: Record<string, IconName> = {
  purchase: "card",
  review: "star",
  message: "mail",
  moderation: "shield",
  content: "megaphone",
};

// where an event leads (only destinations that already exist in the dashboard)
const activityTarget: Record<string, NavKey> = {
  purchase: "finance",
  review: "reviews",
  message: "messages",
  moderation: "content",
  content: "content",
};

// short heading of an event; the event's own text becomes the line under it
const activityTitle: Record<string, string> = {
  purchase: "Нова покупка",
  review: "Новий відгук",
  message: "Нове повідомлення",
  moderation: "Оновлення модерації",
  content: "Новий матеріал",
};

// "Олександра" -> "Олександро" for the greeting; other endings are left as they are (no guessing)
function greetingName(full: string | undefined): string {
  const first = (full ?? "").trim().split(/\s+/)[0];
  if (!first) return "";
  if (/ія$/i.test(first)) return first.slice(0, -1) + "є";
  if (/я$/i.test(first)) return first.slice(0, -1) + "ю";
  if (/а$/i.test(first)) return first.slice(0, -1) + "о";
  return first;
}

// the heading already says what happened, so the line under it drops the repeated words
function eventDetail(text: string): string {
  const stripped = text.replace(/^Нове повідомлення від /, "Від ").replace(/^Новий відгук на /, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

const typeMeta: Record<ContentType, { label: string; icon: IconName }> = {
  program: { label: "Програма", icon: "program" },
  meditation: { label: "Медитація", icon: "meditation" },
  guide: { label: "Гайд", icon: "guide" },
};

const statusMeta: Record<ContentStatus, { label: string; cls: string }> = {
  published: { label: "Опубліковано", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  review: { label: "На модерації", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  draft: { label: "Чернетка", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  archived: { label: "В архіві", cls: "bg-rose-50 text-rose-600 ring-rose-200" },
};

// both lists show 4 rows and a button that reveals 4 more each time
const PAGE = 4;

// published first, then on moderation, drafts, archive last (the original order is kept inside a group)

function ShowMore({ shown, total, onMore, label }: { shown: number; total: number; onMore: () => void; label: string }) {
  if (shown >= total) return null;
  const rest = Math.min(PAGE, total - shown);
  return (
    <button
      type="button"
      onClick={onMore}
      className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]"
    >
      {label} ({rest}) <span aria-hidden="true">↓</span>
    </button>
  );
}

const DEMO_IDS = new Set(authoredContent.map((c) => c.id));

export default function AuthorOverview({
  content,
  onNavigate,
  onCreate,
  onEditContent,
  unreadMessages = 0,
}: Props) {
  const session = useSession();
  const allContent = content;
  const published = allContent.filter((c) => c.status === "published");

  const [realActivity, setRealActivity] = useState<ActivityEvent[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);
  useEffect(() => {
    if (!session) return;
    const realContentIds = content.filter((c) => !DEMO_IDS.has(c.id)).map((c) => c.id);
    fetchRecentActivity(session.profile.id, realContentIds)
      .then(setRealActivity)
      .catch(() => setRealActivity([]))
      .finally(() => setActivityLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.id, content.length]);

  // Count-only notice — see supabase/functions/author-report-count for
  // why this is the one thing an author can learn about complaints
  // filed against them (no identity, reason, or details).
  const [reportCount, setReportCount] = useState(0);
  useEffect(() => {
    if (!session) return;
    fetchMyReportCount().then(setReportCount);
  }, [session?.profile.id]);

  // Real events first (someone actually did something), demo showcase
  // events after — same mix-in convention used everywhere else.
  // newest first, whatever the source
  const activity = [...realActivity, ...(SHOW_AUTHOR_DEMO ? mockActivity : [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const [activityShown, setActivityShown] = useState(PAGE);
  const [contentShown, setContentShown] = useState(PAGE);

  // Defensive against any future edge case producing a non-finite value
  // (e.g. a division by zero somewhere upstream) — a stat card showing
  // "NaN" is a worse failure mode than showing "0", so every number
  // rendered below is clamped through this first.
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);

  // per-material counts come with the content list (lib/content.ts fetchContentMetrics); a person in two
  // materials is counted in each, the same way the «Контент» tab shows it
  const totalParticipants = safe(allContent.reduce((sum, c) => sum + c.participants, 0));
  const totalRevenue = safe(allContent.reduce((sum, c) => sum + c.revenue, 0));
  const ratedItems = published.filter((c) => c.rating !== null);
  const avgRating =
    ratedItems.length > 0
      ? safe(
          ratedItems.reduce((sum, c) => sum + (c.rating ?? 0), 0) /
            ratedItems.length
        )
      : null;

  const stats = [
    { label: "Учасники", value: totalParticipants.toLocaleString("uk-UA"), pending: false, icon: "graduation" as IconName },
    { label: "Дохід", value: `${totalRevenue.toLocaleString("uk-UA")} ₴`, pending: false, icon: "card" as IconName },
    { label: "Опубліковано", value: String(published.length), pending: false, icon: "library" as IconName },
    { label: "Середній рейтинг", value: avgRating ? `${avgRating.toFixed(1)} ★` : "—", pending: false, icon: "star" as IconName },
  ];

  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!createOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!createRef.current?.contains(e.target as Node)) setCreateOpen(false);
    };
    const items = () => Array.from(createRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus(); // keyboard users land on the first option
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCreateOpen(false);
        createBtnRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [createOpen]);

  const sortedContent = [...allContent].sort((a, b) => statusRank(a) - statusRank(b));
  const recentContent = sortedContent.slice(0, contentShown);
  const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
  const secondaryBtn =
    "inline-flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white px-4 text-[15px] xl:text-[14px] min-[1500px]:text-[15px] font-semibold text-[#1d2240] shadow-[0_8px_22px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] transition hover:bg-[#faf9ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]";
  const hello = greetingName(session?.profile.name);

  return (
    <div className="flex flex-col gap-7">
      {/* HEADER */}
      <header className="min-w-0">
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-black/50">Огляд</div>
        <h1 className="mt-1 text-[32px] font-bold leading-tight text-[#12172b]">
          Привіт{hello ? `, ${hello}` : ""}
        </h1>
        <p className="mt-1.5 text-[15px] text-black/55">Тут усе найважливіше про ваш контент, аудиторію та результати.</p>
      </header>

      {reportCount > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5 flex items-start gap-3">
          <span className="text-amber-600 mt-0.5"><Icon name="warning" size={18} /></span>
          <div className="text-[13px] text-amber-800 leading-relaxed">
            <span className="font-semibold">
              На ваш акаунт подано {reportCount} {complaintWord(reportCount)}.
            </span>{" "}
            Хто саме і з якої причини — бачить лише команда Sensoria; кожне
            звернення розглядається окремо, і це не означає, що ви щось
            порушили.
          </div>
        </div>
      )}

      {/* METRICS — four separate cards */}
      <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={`${card} flex min-w-0 items-center gap-4 px-4 py-5 sm:px-5`}>
            <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0] sm:flex">
              <Icon name={s.icon} size={24} />
            </span>
            <div className="min-w-0">
              <dt className="text-[14px] font-medium text-black/60">{s.label}</dt>
              <dd className="mt-0.5 min-h-[34px] whitespace-nowrap text-[20px] font-bold leading-[34px] tracking-tight text-[#12172b] sm:text-[28px]">
                {s.pending ? <span className="block h-7 w-20 animate-pulse rounded-lg bg-[#e7e3fb]" aria-label="Завантаження" /> : s.value}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      {/* QUICK ACTIONS */}
      <section aria-labelledby="ov-actions">
        <h2 id="ov-actions" className="text-[17px] font-bold text-[#12172b]">Швидкі дії</h2>
        {/* four equal actions across the row on a wide screen, two by two on a tablet, one column on a phone */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative w-full" ref={createRef}>
            <button
              ref={createBtnRef}
              type="button"
              onClick={() => setCreateOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={createOpen}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[15px] xl:text-[14px] min-[1500px]:text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(91,92,240,0.75)] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2"
            >
              <span aria-hidden="true" className="text-[22px] leading-none">+</span> Створити контент
              <span aria-hidden="true" className={`transition-transform ${createOpen ? "rotate-180" : ""}`}><Icon name="chevron" size={16} /></span>
            </button>
            {createOpen && (
              <div role="menu" className="absolute left-0 top-full z-20 mt-2 w-[250px] overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(30,41,90,0.35)] ring-1 ring-[#ebe8ff]">
                {(["program", "meditation", "guide"] as ContentType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateOpen(false);
                      onCreate(t);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-[#12172b] transition hover:bg-[#f1eeff] focus:bg-[#f1eeff] focus:outline-none"
                  >
                    <span className="text-[#6d5bd0]"><Icon name={typeMeta[t].icon} size={18} /></span>
                    Створити {t === "program" ? "програму" : t === "meditation" ? "медитацію" : "гайд"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => onNavigate("messages")} className={secondaryBtn}>
            <span className="text-[#6d5bd0]"><Icon name="mail" size={19} /></span>
            Відповісти учасникам
            {unreadMessages > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#7c5cf0] px-1.5 text-[11px] font-semibold text-white">{unreadMessages}</span>
            )}
          </button>
          <button type="button" onClick={() => onNavigate("finance")} className={secondaryBtn}>
            <span className="text-[#6d5bd0]"><Icon name="card" size={19} /></span>
            Переглянути виплати
          </button>
          <button type="button" onClick={() => onNavigate("reviews")} className={secondaryBtn}>
            <span className="text-[#6d5bd0]"><Icon name="star" size={19} /></span>
            Відгуки учасників
          </button>
        </div>
      </section>

      <div className="grid gap-5 min-[1400px]:grid-cols-2">
        {/* RECENT ACTIVITY */}
        <section aria-labelledby="ov-activity" className={`${card} min-w-0 p-4 sm:p-6`}>
          <h2 id="ov-activity" className="text-[20px] font-bold text-[#12172b]">Останні події</h2>
          <ul className="mt-3">
            {!activityLoaded && activity.length === 0
              ? [0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 py-3.5">
                    <span className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[#e7e3fb]" />
                    <span className="h-4 flex-1 animate-pulse rounded bg-black/5" />
                  </li>
                ))
              : activity.slice(0, activityShown).map((event) => {
                  const target = activityTarget[event.type];
                  const tone = event.type === "review" ? "bg-amber-50 text-amber-500" : "bg-[#f1eeff] text-[#6d5bd0]";
                  const inner = (
                    <>
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
                        <Icon name={activityIcon[event.type] ?? "bulb"} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-snug text-[#12172b]">{activityTitle[event.type] ?? "Подія"}</span>
                        <span className="mt-0.5 line-clamp-2 text-[13px] text-black/60">{eventDetail(event.text)}</span>
                      </span>
                      <span className="shrink-0 self-start pt-0.5 text-[12px] text-black/55">{formatRelativeTime(event.date)}</span>
                    </>
                  );
                  return (
                    <li key={event.id} className="border-b border-black/5 last:border-0">
                      {target ? (
                        <button type="button" onClick={() => onNavigate(target)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-3 text-left transition hover:bg-[#faf9ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3.5 py-3">{inner}</div>
                      )}
                    </li>
                  );
                })}
          </ul>
          <ShowMore shown={activityShown} total={activity.length} onMore={() => setActivityShown((n) => n + PAGE)} label="Показати ще" />
          {activityLoaded && activity.length === 0 && (
            <p className="py-6 text-[14px] text-black/60">Подій поки немає. Тут з'являтимуться покупки, відгуки й повідомлення.</p>
          )}
        </section>

        {/* MY CONTENT */}
        <section aria-labelledby="ov-content" className={`${card} min-w-0 p-4 sm:p-6`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="ov-content" className="text-[20px] font-bold text-[#12172b]">Мій контент</h2>
            <button type="button" onClick={() => onNavigate("content")} className="text-[14px] font-semibold text-[#3b5bdb] hover:underline focus:outline-none focus-visible:underline">
              Увесь контент →
            </button>
          </div>
          {recentContent.length === 0 ? (
            <p className="py-6 text-[14px] text-black/60">Ви ще нічого не створили. Натисніть «Створити контент», щоб почати.</p>
          ) : (
            <>
              <ul className="mt-3">
                {recentContent.map((item) => {
                  const st = isTakenDown(item) ? { label: "Знято з публікації", cls: "bg-violet-50 text-violet-700 ring-violet-200" } : statusMeta[item.status];
                  const tm = typeMeta[item.type];
                  const live = item.status === "published";
                  return (
                    <li key={item.id} className="border-b border-black/5 last:border-0">
                      <button
                        type="button"
                        onClick={() => (item.status === "archived" ? onNavigate("content") : onEditContent(item.id))}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-3 text-left transition hover:bg-[#faf9ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]"
                      >
                        <span className="flex h-[60px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#d6e0ff] via-[#e2d9ff] to-[#cfc3ff] text-white">
                          {item.coverUrl ? <img src={coverUrlForFrame(item.coverUrl, item.coverFocus, "square")} alt="" loading="lazy" style={coverImageStyle(item.coverFocus, "square")} className="h-full w-full object-cover" /> : <Icon name={tm.icon} size={26} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="inline-block rounded-full bg-[#f1eeff] px-2.5 py-0.5 text-[12px] font-semibold text-[#6d5bd0]">{tm.label}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[15px] font-semibold leading-snug text-[#12172b]">{item.title}</span>
                          {live && (item.participants > 0 || item.rating !== null) && (
                            <span className="mt-0.5 flex items-center gap-3 text-[13px] text-black/60">
                              {item.participants > 0 && <span>{item.participants.toLocaleString("uk-UA")} {pluralUk(item.participants, "учасник", "учасники", "учасників")}</span>}
                              {item.rating !== null && <span className="inline-flex items-center gap-1"><Icon name="star" size={13} /> {item.rating.toFixed(1)}</span>}
                            </span>
                          )}
                        </span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${st.cls}`}>{st.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <ShowMore shown={contentShown} total={sortedContent.length} onMore={() => setContentShown((n) => n + PAGE)} label="Показати ще" />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
