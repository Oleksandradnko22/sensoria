// «Відгуки» in the author cabinet: three kinds of feedback in one place.
//  · «Про матеріали»: star reviews of programs, guides and meditations (reviews), with a public reply;
//  · «Про вас»: reviews of the author as a specialist (author_reviews), also with a public reply;
//  · «Чи була корисною»: the yes / «не зовсім» answers after a meditation, with an optional private message.
// A reply is public and short (up to 600 characters, no contacts or links: the database refuses them too).
// A review can be reported to Sensoria, never deleted by the author. Demo reviews come from the demo world.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { reviews as demoReviewsData, type AuthoredContent, type ContentType } from "../../data/authorDashboard";
import { fetchReviewsForContentIds, replyToReview, type ReviewRow } from "../../lib/reviews";
import { fetchAuthorPublicReviews, saveReviewReply, type AuthorPublicReview } from "../../lib/authorPublic";
import { fetchMeditationFeedbackForAuthor, type MeditationFeedbackEntry } from "../../lib/itemFeedback";
import { sendMessage } from "../../lib/messages";
import { meditations } from "../../data/meditations";
import { useSession } from "../../context/SessionContext";
import { formatRelativeTime } from "../../utils/relativeTime";
import { pluralUk } from "../../utils/plural";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import { demoWorld } from "../../data/demoWorld";
import { Icon, type IconName } from "../ui/Icon";
import CatalogSort from "../catalog/CatalogSort";
import ReportButton from "../ReportButton";

type Props = { content: AuthoredContent[] };
type Tab = "content" | "author" | "helpful";
type Item = {
  id: string;
  real: boolean;
  kind: "content" | "author";
  participantId: string | null;
  name: string;
  contentId: string | null;
  contentTitle: string | null;
  contentType: ContentType | null;
  rating: number;
  text: string;
  date: string;
  reply: string | null;
};

const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
const TYPE_ICON: Record<ContentType, IconName> = { program: "program", meditation: "meditation", guide: "guide" };
const REPLY_MAX = 600;
const PAGE = 4;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "У";
// the same rule the database applies to replies: no e-mails, links or sites
const replyProblem = (t: string) => (!t.trim() ? "Напишіть відповідь." : t.trim().length > REPLY_MAX ? `Не більше ${REPLY_MAX} символів.` : /(@|https?:\/\/|www\.)/i.test(t) ? "У відповіді не можна залишати контакти чи посилання: спілкування — у «Повідомленнях»." : null);

export default function AuthorReviews({ content }: Props) {
  const session = useSession();
  const myId = session?.profile.id ?? null;
  const myName = session?.profile.name ?? "Автор";
  const [tab, setTab] = useState<Tab>("content");

  // material lookup by id or slug (guide / meditation reviews may be stored by the short name)
  const byKey = useMemo(() => {
    const m = new Map<string, AuthoredContent>();
    content.forEach((c) => { m.set(c.id, c); if (c.slug) m.set(c.slug, c); });
    return m;
  }, [content]);

  // ── data ───────────────────────────────────────────────────────────────────────────────────────────────────
  const [contentReviews, setContentReviews] = useState<ReviewRow[]>([]);
  const [authorReviews, setAuthorReviews] = useState<AuthorPublicReview[]>([]);
  const [feedback, setFeedback] = useState<MeditationFeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const keys = content.filter((c) => c.status !== "draft" || c.everPublished).flatMap((c) => [c.id, c.slug].filter(Boolean) as string[]);
  const keysKey = keys.join(",");
  useEffect(() => {
    if (!myId) return;
    let off = false;
    setLoading(true);
    setFailed(false);
    const uuids = keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k));
    const slugs = keys.filter((k) => !/^[0-9a-f-]{36}$/i.test(k));
    Promise.all([
      fetchReviewsForContentIds(uuids),
      // short names: a separate request, so a database with a uuid column can't break the main one
      slugs.length ? fetchReviewsForContentIds(slugs).catch(() => [] as ReviewRow[]) : Promise.resolve([] as ReviewRow[]),
      fetchAuthorPublicReviews(myId).catch(() => [] as AuthorPublicReview[]),
      fetchMeditationFeedbackForAuthor().catch(() => [] as MeditationFeedbackEntry[]),
    ])
      .then(([a, b, au, fb]) => {
        if (off) return;
        const seen = new Set<string>();
        setContentReviews([...a, ...b].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
        setAuthorReviews(au);
        setFeedback(fb);
      })
      .catch(() => { if (!off) setFailed(true); })
      .finally(() => { if (!off) setLoading(false); });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, keysKey, reload]);

  // demo (the same reviews the demo materials are rated with in «Контент»)
  const demoItems: Item[] = useMemo(() => {
    if (!SHOW_AUTHOR_DEMO) return [];
    const now = Date.now();
    const w = demoWorld();
    const aboutMaterials = demoReviewsData.map((r, i) => {
      const c = byKey.get(r.contentId);
      return { id: `demo-${r.id}`, real: false, kind: "content" as const, participantId: null, name: r.participantName, contentId: r.contentId, contentTitle: c?.title ?? null, contentType: c?.type ?? null, rating: r.rating, text: r.text, date: new Date(now - (6 + i * 9) * 86_400_000).toISOString(), reply: r.reply ?? null };
    });
    const aboutYou: Item[] = [
      { id: "demo-a1", real: false, kind: "author", participantId: null, name: w.people[2]?.name ?? "Учасник", contentId: null, contentTitle: null, contentType: null, rating: 5, text: "Дуже уважна до деталей і пояснює простими словами. Після програми я нарешті розумію, що зі мною відбувається, коли накриває тривога.", date: new Date(now - 4 * 86_400_000).toISOString(), reply: null },
      { id: "demo-a2", real: false, kind: "author", participantId: null, name: w.people[5]?.name ?? "Учасник", contentId: null, contentTitle: null, contentType: null, rating: 4, text: "Подобається спокійна подача. Хотілося б більше коротких практик на 3–5 хвилин.", date: new Date(now - 17 * 86_400_000).toISOString(), reply: "Дякую! Додаю кілька коротких практик у наступний модуль." },
    ];
    return [...aboutMaterials, ...aboutYou];
  }, [byKey]);
  const demoFeedback: MeditationFeedbackEntry[] = useMemo(() => {
    if (!SHOW_AUTHOR_DEMO) return [];
    const w = demoWorld();
    const listeners = w.people.filter((p) => p.entries.some((e) => e.contentId === "demo-evening-meditation")).slice(0, 3);
    return listeners.map((p, i) => ({ id: `demo-f${i}`, meditationId: "demo-evening-meditation", participantId: "", participantName: p.name, value: i === 1 ? "not_helpful" : "helpful", reason: i === 0 ? "Заснула за 10 хвилин, дякую" : i === 1 ? "Трохи швидкий темп на початку" : null, createdAt: new Date(Date.now() - (2 + i * 5) * 86_400_000).toISOString(), updatedAt: null }) as MeditationFeedbackEntry);
  }, []);

  const realItems: Item[] = [
    ...contentReviews.map((r) => {
      const c = byKey.get(r.contentId);
      return { id: r.id, real: true, kind: "content" as const, participantId: r.participantId, name: r.participantName, contentId: r.contentId, contentTitle: r.contentTitle || c?.title || null, contentType: c?.type ?? null, rating: r.rating, text: r.text, date: r.createdAt, reply: r.authorReply };
    }),
    ...authorReviews.map((r) => ({ id: r.id, real: true, kind: "author" as const, participantId: null, name: r.reviewerName, contentId: null, contentTitle: null, contentType: null, rating: r.rating, text: r.text, date: r.createdAt, reply: r.authorReply ?? null })),
  ];
  const [localReplies, setLocalReplies] = useState<Record<string, string>>({});
  const all = [...realItems, ...demoItems].map((i) => (localReplies[i.id] !== undefined ? { ...i, reply: localReplies[i.id] } : i));
  const contentItems = all.filter((i) => i.kind === "content");
  const aboutYou = all.filter((i) => i.kind === "author");
  const feedbackAll = [...feedback.filter((f) => meditations.some((m) => m.id === f.meditationId) || byKey.has(f.meditationId)), ...demoFeedback];

  // ── filters ────────────────────────────────────────────────────────────────────────────────────────────────
  const [material, setMaterial] = useState("all");
  const [stars, setStars] = useState<"all" | "5" | "4" | "low">("all");
  const [noReply, setNoReply] = useState(false);
  const [sort, setSort] = useState<"new" | "old" | "low">("new");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [tab, material, stars, noReply, sort]);

  const source = tab === "author" ? aboutYou : contentItems;
  const list = source
    .filter((i) => tab !== "content" || material === "all" || i.contentId === material || byKey.get(i.contentId ?? "")?.id === material)
    .filter((i) => (stars === "all" ? true : stars === "low" ? i.rating <= 3 : i.rating === Number(stars)))
    .filter((i) => !noReply || !i.reply)
    .sort((a, b) => (sort === "low" ? a.rating - b.rating || +new Date(b.date) - +new Date(a.date) : sort === "old" ? +new Date(a.date) - +new Date(b.date) : +new Date(b.date) - +new Date(a.date)));

  // the summary speaks about the open section (materials or you), so it matches «Огляд» / «Контент» exactly
  const ratedAll = tab === "author" ? aboutYou : contentItems;
  const avg = (xs: Item[]) => (xs.length ? xs.reduce((n, i) => n + i.rating, 0) / xs.length : 0);
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: ratedAll.filter((i) => i.rating === s).length }));
  const waiting = [...contentItems, ...aboutYou].filter((i) => !i.reply).length;
  const helpfulShare = feedbackAll.length ? Math.round((100 * feedbackAll.filter((f) => f.value === "helpful").length) / feedbackAll.length) : null;

  const materialOptions = useMemo(
    () => [{ id: "all", label: "Усі матеріали" }, ...content.filter((c) => contentItems.some((i) => i.contentId === c.id || i.contentId === c.slug)).map((c) => ({ id: c.id, label: c.title.length > 40 ? `${c.title.slice(0, 40)}…` : c.title }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, contentItems.length],
  );

  const saveReply = async (i: Item, text: string) => {
    const problem = replyProblem(text);
    if (problem) throw new Error(problem);
    const clean = text.trim();
    if (i.real) {
      if (i.kind === "content") await replyToReview({ reviewId: i.id, reply: clean, participantId: i.participantId ?? "", contentTitle: i.contentTitle ?? "" });
      else await saveReviewReply(i.id, clean, myName);
    }
    setLocalReplies((r) => ({ ...r, [i.id]: clean }));
  };

  if (!session) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Відгуки</h1>
        <p className="mt-1 text-[15px] text-black/55">Що учасники кажуть про ваші матеріали й про вас.</p>
      </div>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100">
          Не вдалося завантажити відгуки.
          <button type="button" onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}

      {/* SUMMARY */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${card} flex items-center gap-4 p-5`}>
          <div className="text-[44px] font-bold leading-none text-[#12172b]">{ratedAll.length ? avg(ratedAll).toFixed(1) : "—"}</div>
          <div>
            <div className="flex gap-0.5 text-amber-500" aria-hidden="true">{[1, 2, 3, 4, 5].map((s) => <Icon key={s} name="star" size={16} filled={s <= Math.round(avg(ratedAll))} />)}</div>
            <div className="mt-1 text-[13px] text-black/55">{ratedAll.length} {pluralUk(ratedAll.length, "відгук", "відгуки", "відгуків")} {tab === "author" ? "про вас" : "про матеріали"}</div>
          </div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex flex-col gap-1.5" aria-label="Розподіл оцінок">
            {dist.map((d) => (
              <div key={d.s} className="flex items-center gap-2 text-[12px]">
                <span className="w-3 font-semibold text-[#2d2a5c]">{d.s}</span>
                <Icon name="star" size={11} filled />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ece9fe]"><div className="h-full rounded-full bg-amber-400 transition-[width] duration-500" style={{ width: `${ratedAll.length ? (100 * d.n) / ratedAll.length : 0}%` }} /></div>
                <span className="w-5 text-right text-black/50">{d.n}</span>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => { setNoReply(true); setTab(contentItems.some((i) => !i.reply) ? "content" : "author"); }} className={`${card} flex items-center gap-4 p-5 text-left transition hover:ring-[#d9d0fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]`}>
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${waiting ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}><Icon name={waiting ? "comment" : "check"} size={22} /></span>
          <span>
            <span className="block text-[26px] font-bold leading-none text-[#12172b]">{waiting}</span>
            <span className="mt-1 block text-[13px] text-black/55">{waiting ? "чекають на вашу відповідь" : "на всі відгуки є відповідь"}</span>
          </span>
        </button>
        <div className={`${card} flex items-center gap-4 p-5`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="heart" size={22} /></span>
          <div>
            <div className="text-[26px] font-bold leading-none text-[#12172b]">{helpfulShare != null ? `${helpfulShare}%` : "—"}</div>
            <div className="mt-1 text-[13px] text-black/55">медитації були корисними</div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Тип відгуків">
        {([["content", "Про матеріали", contentItems.length], ["author", "Про вас", aboutYou.length], ["helpful", "Чи була корисною", feedbackAll.length]] as [Tab, string, number][]).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${tab === k ? "bg-[#12172b] text-white" : "bg-white text-[#1d2240] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
            {l}<span className={`rounded-full px-2 py-0.5 text-[12px] ${tab === k ? "bg-white/20" : "bg-[#f1eeff] text-[#5b4bd0]"}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab !== "helpful" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Оцінка">
              {([["all", "Усі оцінки"], ["5", "5 ★"], ["4", "4 ★"], ["low", "3 ★ і нижче"]] as ["all" | "5" | "4" | "low", string][]).map(([k, l]) => (
                <Chip key={k} active={stars === k} onClick={() => setStars(k)}>{l}</Chip>
              ))}
              <Chip active={noReply} onClick={() => setNoReply((v) => !v)}>Без відповіді</Chip>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {tab === "content" && <CatalogSort<string> value={material} onChange={setMaterial} options={materialOptions} label="Матеріал" variant="light" className="" icon={<Icon name="library" size={16} />} />}
              <CatalogSort<"new" | "old" | "low"> value={sort} onChange={setSort} options={[{ id: "new", label: "Спершу нові" }, { id: "old", label: "Спершу давні" }, { id: "low", label: "Спершу низькі оцінки" }]} label="Порядок" variant="light" className="" />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {loading && all.length === 0 ? (
              [0, 1].map((k) => <div key={k} className={`${card} h-[150px] animate-pulse`} />)
            ) : list.length === 0 ? (
              <Empty text={source.length === 0 ? (tab === "author" ? "Відгуки про вас з’являться тут, коли учасники оцінять вашу роботу на сторінці автора." : "Коли учасники оцінять ваші матеріали, відгуки з’являться тут.") : "За цими фільтрами відгуків немає."} />
            ) : (
              list.slice(0, shown).map((i) => <ReviewCard key={i.id} item={i} viewerId={myId} onSave={saveReply} />)
            )}
          </div>
          {list.length > shown && <ShowMore n={Math.min(PAGE, list.length - shown)} onClick={() => setShown((n) => n + PAGE)} />}
        </>
      ) : (
        <FeedbackList items={feedbackAll} byKey={byKey} />
      )}
    </div>
  );
}

function ReviewCard({ item, viewerId, onSave }: { item: Item; viewerId: string | null; onSave: (i: Item, text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = editing || !item.reply;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(item, text);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти відповідь. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`${card} p-5 sm:p-6`}>
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e2dbff] to-[#cfc3ff] text-[14px] font-bold text-[#4a2fd0]">{initials(item.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[16px] font-semibold text-[#12172b]">{item.name}</span>
            <span className="flex gap-0.5 text-amber-500" aria-label={`Оцінка ${item.rating} з 5`}>{[1, 2, 3, 4, 5].map((s) => <Icon key={s} name="star" size={14} filled={s <= item.rating} />)}</span>
            <span className="text-[12px] text-black/50">{formatRelativeTime(item.date)}</span>
            {!item.real && <span className="rounded-full bg-[#f6f4ff] px-2 py-0.5 text-[11px] font-semibold text-[#6d5bd0]">демо</span>}
          </div>
          {item.contentTitle ? (
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f6f4ff] px-2.5 py-0.5 text-[12px] font-medium text-[#4d5278]">
              {item.contentType && <Icon name={TYPE_ICON[item.contentType]} size={12} />}<span className="truncate">{item.contentTitle}</span>
            </span>
          ) : item.kind === "author" ? (
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-medium text-emerald-700"><Icon name="heart" size={12} /> Відгук про вас</span>
          ) : null}
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-[#2d2a5c]">{item.text}</p>

          {item.reply && !editing && (
            <div className="mt-4 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#efeafd]">
              <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-[#6d5bd0]">
                Ваша відповідь
                <button type="button" onClick={() => { setText(item.reply ?? ""); setEditing(true); }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[#5b4bd0] hover:bg-[#f1eeff]"><Icon name="note" size={13} /> Змінити</button>
              </div>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#2d2a5c]">{item.reply}</p>
            </div>
          )}

          {open && (
            <div className="mt-4">
              <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} maxLength={REPLY_MAX} rows={2} placeholder="Подякуйте або дайте коротку відповідь…" aria-label={`Відповідь на відгук ${item.name}`} className="w-full resize-y rounded-2xl border border-[#d9d4f5] bg-[#faf9ff] px-4 py-3 text-[14px] leading-relaxed focus:border-[#5b3df5] focus:bg-white focus:outline-none" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12px] text-black/50">Відповідь бачать усі · {text.trim().length}/{REPLY_MAX}</span>
                <div className="flex gap-2">
                  {editing && <button type="button" onClick={() => { setEditing(false); setError(null); }} className="min-h-[40px] rounded-xl px-3 text-[13px] font-semibold text-black/55 hover:text-black">Скасувати</button>}
                  <button type="button" onClick={() => void save()} disabled={busy || !text.trim()} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50">
                    {busy ? "Зберігаємо…" : item.reply ? "Зберегти" : "Відповісти"}
                  </button>
                </div>
              </div>
              {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
            </div>
          )}

          {item.real && (
            <div className="mt-3 flex justify-end">
              <ReportButton type="review" targetId={item.id} ownerId={null} label={`відгук ${item.name}`} viewerId={viewerId} className="min-h-[36px] rounded-full px-3 text-[12px] font-medium text-black/45 hover:bg-black/[0.04] hover:text-black/70" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function FeedbackList({ items, byKey }: { items: MeditationFeedbackEntry[]; byKey: Map<string, AuthoredContent> }) {
  const [filter, setFilter] = useState<"all" | "helpful" | "not">("all");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filter]);
  const list = items.filter((f) => filter === "all" || (filter === "helpful" ? f.value === "helpful" : f.value !== "helpful")).sort((a, b) => +new Date(b.updatedAt ?? b.createdAt) - +new Date(a.updatedAt ?? a.createdAt));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-black/55">Відповіді на питання «Ця практика була корисною?» після медитації. Їх бачите лише ви.</p>
        <div className="flex gap-2" role="group" aria-label="Відповідь">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>Усі</Chip>
          <Chip active={filter === "helpful"} onClick={() => setFilter("helpful")}>Так</Chip>
          <Chip active={filter === "not"} onClick={() => setFilter("not")}>Не зовсім</Chip>
        </div>
      </div>
      {list.length === 0 ? (
        <Empty text="Коли учасники відповідатимуть після ваших медитацій, це з’явиться тут." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.slice(0, shown).map((f) => <FeedbackCard key={f.id} f={f} title={byKey.get(f.meditationId)?.title ?? meditations.find((m) => m.id === f.meditationId)?.title ?? "Медитація"} />)}
        </ul>
      )}
      {list.length > shown && <ShowMore n={Math.min(PAGE, list.length - shown)} onClick={() => setShown((n) => n + PAGE)} />}
    </>
  );
}

function FeedbackCard({ f, title }: { f: MeditationFeedbackEntry; title: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = !f.participantId;
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage({ recipientId: f.participantId, contentId: null, body: text.trim() });
      setSent(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };
  const helpful = f.value === "helpful";
  return (
    <li className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6d5bd0]"><Icon name="meditation" size={13} /> <span className="truncate">{title}</span></div>
          <div className="mt-1 text-[15px] font-semibold text-[#12172b]">{f.participantName}{demo && <span className="ml-2 rounded-full bg-[#f6f4ff] px-2 py-0.5 text-[11px] font-semibold text-[#6d5bd0]">демо</span>}</div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${helpful ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{helpful ? "Корисно" : "Не зовсім"}</span>
      </div>
      {f.reason && <p className="mt-3 text-[14px] leading-relaxed text-[#2d2a5c]">«{f.reason}»</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12px] text-black/50">{formatRelativeTime(f.updatedAt ?? f.createdAt)}</span>
        {sent ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700"><Icon name="check" size={14} /> Надіслано</span>
        ) : !open && !demo ? (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#f1eeff] px-3 text-[13px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]"><Icon name="mail" size={14} /> Написати</button>
        ) : null}
      </div>
      {open && (
        <div className="mt-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`Особисте повідомлення для ${f.participantName}…`} className="w-full resize-y rounded-2xl border border-[#d9d4f5] bg-[#faf9ff] px-4 py-3 text-[14px] focus:border-[#5b3df5] focus:bg-white focus:outline-none" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-xl px-3 text-[13px] font-semibold text-black/55 hover:text-black">Скасувати</button>
            <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "Надсилаємо…" : "Надіслати"}</button>
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
        </div>
      )}
    </li>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-[40px] items-center rounded-2xl px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${active ? "bg-[#12172b] text-white" : "bg-white text-[#1d2240] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
      {children}
    </button>
  );
}

function ShowMore({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <div>
      <button type="button" onClick={onClick} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
        Показати ще ({n}) <span aria-hidden="true">↓</span>
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={`${card} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="star" size={24} /></span>
      <p className="max-w-[440px] text-[14px] text-black/60">{text}</p>
    </div>
  );
}
