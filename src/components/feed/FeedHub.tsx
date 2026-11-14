// «Публікації» — a small social network inside Sensoria (feed like Threads, composer like LinkedIn / Instagram).
//   «Для всіх»       authors publish, everyone signed in reads, likes and comments
//   «Для учасників»  participants publish; authors read, like and comment
//   «Для авторів»    authors only
// Each feed comes from the database 15 posts at a time («Рекомендовані»: feed_top, «Нові»: feed_page), more on scroll,
// refreshed when the tab is opened again. Who sees and writes what is enforced by the database.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { openAuthorProfile, openMaterial } from "../../context/AuthorProfileContext";
import { getInitials, type Profile } from "../../lib/auth";
import Avatar from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import FeedCard from "./FeedCard";
import FeedComposer from "./FeedComposer";
import { deletePost, fetchFeed, fetchSomeAuthors, setPostPinned, type FeedAudience, type FeedPost, type FeedSort } from "../../lib/authorPosts";
import { fetchIsFollowing, setFollowing } from "../../lib/authorFollows";
import { fetchAuthorContent } from "../../lib/authorPublic";
import { fetchAuthorDetails } from "../../lib/authorDetails";
import { fetchFeedPost, fetchNotifications, fetchWeek, markNotificationsSeen, type FeedNotification } from "../../lib/feed";
import { MENTION_RE } from "../../utils/authorPosts";
import { formatPostDate } from "../../utils/authorProfileView";
import { SHOW_AUTHOR_DEMO, SHOW_DEMO } from "../../utils/demoMode";
import { demoChanges, demoFeed, demoSaved } from "../../data/demoFeed";

const TABS: Record<FeedAudience, { label: string; icon: IconName; hint: string }> = {
  all: { label: "Для всіх", icon: "sparkle", hint: "Думки, практики й новини авторів Sensoria." },
  participants: { label: "Для учасників", icon: "heart", hint: "Простір учасників: досвід, маленькі перемоги й підтримка. Автори читають і відповідають." },
  authors: { label: "Для авторів", icon: "graduation", hint: "Закритий простір авторів: досвід, запитання й новини платформи." },
};

type ComposerState = { post: FeedPost | null; audience: FeedAudience };

export default function FeedHub({ role }: { role: "author" | "participant" }) {
  const session = useSession();
  const viewer = session?.profile ?? null;
  const tabs: FeedAudience[] = role === "author" ? ["all", "participants", "authors"] : ["all", "participants"];
  const [feed, setFeed] = useState<FeedAudience>("all");
  const [sort, setSort] = useState<FeedSort | "saved">("top");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  // «Фахівець» badge: only then the specialist themes are open in the composer (the server checks it too)
  const [isSpecialist, setIsSpecialist] = useState(false);
  useEffect(() => {
    if (role === "author" && viewer) fetchAuthorDetails(viewer.id).then((d) => setIsSpecialist(!!d.educationVerified)).catch(() => {});
  }, [role, viewer]);
  const [reloadKey, setReloadKey] = useState(0);
  // where this person writes: authors into «Для всіх» / «Для авторів», participants into «Для учасників»
  const writeTo: FeedAudience = role === "author" ? (feed === "authors" ? "authors" : "all") : "participants";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Спільнота</h1>
          <p className="mt-1 text-[15px] text-black/55">{sort === "saved" ? "Публікації, які ви зберегли." : TABS[feed].hint}</p>
        </div>
        {viewer && <NotificationsBell />}
      </div>
      {savedNote && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900 ring-1 ring-emerald-100">
          {savedNote}
          <button type="button" onClick={() => setSavedNote(null)} aria-label="Закрити" className="text-emerald-700">✕</button>
        </p>
      )}

      {/* feeds */}
      <div className="grid gap-1.5 rounded-[20px] bg-white p-1.5 shadow-[0_14px_36px_-30px_rgba(60,50,140,0.55)] ring-1 ring-[#ece8fb]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Стрічки">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={feed === t} onClick={() => setFeed(t)} className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-semibold transition ${feed === t ? "bg-gradient-to-r from-[#eef0fd] to-[#f3eeff] text-[#4338ca] shadow-[inset_0_0_0_1px_rgba(67,56,202,0.25)]" : "text-black/55 hover:bg-[#faf9ff] hover:text-black/80"}`}>
            <Icon name={TABS[t].icon} size={16} /> <span className="truncate">{TABS[t].label}</span>
          </button>
        ))}
      </div>

      <Feed
          key={`${feed}:${sort}:${reloadKey}`}
          kind={feed}
          sort={sort}
          role={role}
          viewer={viewer}
          canWrite={role === "author" ? feed !== "participants" : feed === "participants"}
          onCompose={(post) => { setComposer({ post, audience: post?.audience ?? writeTo }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onGoWrite={() => { setFeed("participants"); setComposer({ post: null, audience: "participants" }); }}
          composerSlot={composer && viewer ? (
            <FeedComposer
              key={composer.post?.id ?? "new"}
              role={role}
              viewer={viewer}
              isSpecialist={isSpecialist}
              post={composer.post}
              defaultAudience={composer.audience}
              onClose={() => setComposer(null)}
              onSaved={(note) => { setSavedNote(note ?? null); setReloadKey((k) => k + 1); }}
            />
          ) : null}
          sortControl={
        <div className="inline-flex rounded-2xl bg-[#f3f1fb] p-1" role="radiogroup" aria-label="Порядок публікацій">
              {([["top", "Рекомендовані"], ["new", "Нові"], ["saved", "Збережені"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)} className={`min-h-[36px] rounded-xl px-3.5 text-[13px] font-semibold transition ${sort === k ? "bg-white text-[#4338ca] shadow-[0_4px_12px_-6px_rgba(67,56,202,0.5)]" : "text-black/55 hover:text-black/75"}`}>
                  {l}
                </button>
              ))}
            </div>
          }
        />

    </div>
  );
}

function Feed({ kind, sort, role, viewer, canWrite, onCompose, onGoWrite, composerSlot, sortControl }: {
  kind: FeedAudience; sort: FeedSort | "saved"; role: "author" | "participant"; viewer: Profile | null; canWrite: boolean;
  onCompose: (post: FeedPost | null) => void; onGoWrite: () => void; composerSlot: React.ReactNode; sortControl: React.ReactNode;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [demo, setDemo] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  // quiet hours 23:00–8:00: a gentle «time to rest» instead of endless scrolling; one tap to scroll on anyway
  const [quiet, setQuiet] = useState(() => {
    const h = new Date().getHours();
    let skipped = false;
    try { skipped = sessionStorage.getItem("sensoria.feedQuiet") === "1"; } catch { /* private mode */ }
    return (h >= 23 || h < 8) && !skipped;
  });
  const showDemo = role === "author" ? SHOW_AUTHOR_DEMO : SHOW_DEMO;

  // demo posts are signed by real authors of the platform, so the name opens a real author page
  const demoPosts = useCallback(async (): Promise<FeedPost[]> => {
    const base = demoFeed(kind);
    const real = await fetchSomeAuthors(3).catch(() => []);
    const byName = new Map<string, (typeof real)[number]>();
    // the same demo name always gets the same real author
    if (real.length) base.forEach((p) => { if (p.authorIsAuthor && !byName.has(p.authorName)) byName.set(p.authorName, real[byName.size % real.length]); });
    return base.map((p) => {
      const changed = demoChanges.get(p.id);
      if (changed) return changed; // already shown before: the same author, reactions, vote, «Збережено»
      if (!p.authorIsAuthor || real.length === 0) return p;
      if (!byName.has(p.authorName)) byName.set(p.authorName, real[byName.size % real.length]);
      const a = byName.get(p.authorName)!;
      return { ...p, authorId: a.id, authorName: a.name, authorAvatarUrl: a.avatarUrl };
    });
  }, [kind]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    try {
      const page = sort === "saved" ? await fetchFeed("saved", null, "new") : await fetchFeed(kind, null, sort);
      if (page.posts.length === 0 && sort === "saved" && demoSaved.size > 0) { setPosts([...demoSaved.values()]); setHasMore(false); setDemo(true); }
      else if (page.posts.length === 0 && showDemo && sort !== "saved") { setPosts(await demoPosts()); setHasMore(false); setDemo(true); }
      else if (quiet) {
        // keep what is loaded: update those posts, add new ones on top
        setPosts((prev) => {
          if (prev.length === 0 || prev[0].id.startsWith("demo-")) return page.posts;
          const known = new Set(prev.map((p) => p.id));
          const fresh = new Map(page.posts.map((p) => [p.id, p]));
          const added = page.posts.filter((p) => !known.has(p.id) && (sort === "new" || p.authorId === viewer?.id));
          return [...added, ...prev.map((p) => fresh.get(p.id) ?? p)];
        });
        setDemo(false);
      } else { setPosts(page.posts); setHasMore(page.hasMore); setDemo(false); }
      setState("ready");
    } catch {
      // before supabase/feeds.sql is run the feed shows the demo (when demos are on)
      if (showDemo) { setPosts(await demoPosts()); setHasMore(false); setDemo(true); setState("ready"); }
      else if (!quiet) setState("error");
    }
  }, [kind, sort, showDemo, demoPosts, viewer?.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || demo || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const page = sort === "saved"
        ? await fetchFeed("saved", posts[posts.length - 1].createdAt, "new")
        : await fetchFeed(kind, posts[posts.length - 1].createdAt, sort, posts.length);
      setPosts((prev) => [...prev, ...page.posts.filter((p) => !prev.some((x) => x.id === p.id))]);
      setHasMore(page.hasMore);
    } catch {
      /* the button stays, the reader can try again */
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, demo, posts, kind, sort]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = endRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) void loadMore(); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // an author may ask to show a participant's story about their own material on its page
  const [ownContent, setOwnContent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (role !== "author" || !viewer) return;
    fetchAuthorContent(viewer.id).then((list) => setOwnContent(new Set(list.map((c) => c.id)))).catch(() => {});
  }, [role, viewer]);

  // «Підписатися»: one check per author on the page
  const [follows, setFollows] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!viewer || demo) return;
    const ids = [...new Set(posts.filter((p) => p.authorIsAuthor && p.authorId !== viewer.id).map((p) => p.authorId))].filter((id) => follows[id] === undefined);
    ids.forEach((id) => fetchIsFollowing(viewer.id, id).then((v) => setFollows((f) => ({ ...f, [id]: v === true }))).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, viewer, demo]);
  const toggleFollow = (authorId: string) => {
    const next = !follows[authorId];
    setFollows((f) => ({ ...f, [authorId]: next }));
    if (demo || !viewer) return;
    setFollowing(viewer.id, authorId, next).catch(() => setFollows((f) => ({ ...f, [authorId]: !next })));
  };

  const run = async (fn: () => Promise<void>, failure: string) => {
    setRowError(null);
    try { await fn(); await load(true); } catch { setRowError(failure); }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {composerSlot ?? (viewer && (canWrite ? (
        <div className="rounded-[26px] bg-white px-4 py-4 shadow-[0_20px_50px_-40px_rgba(50,40,140,0.6)] ring-1 ring-[#ece8fb] sm:px-6">
          <button type="button" onClick={() => onCompose(null)} className="flex w-full items-center gap-3.5 text-left">
            <Avatar avatarUrl={viewer.avatarUrl} initials={getInitials(viewer.name)} className="h-11 w-11 shrink-0 text-[14px] text-white sm:h-12 sm:w-12" />
            <span className="flex-1 rounded-2xl bg-[#faf9ff] px-4 py-3.5 text-[15px] text-black/40 ring-1 ring-[#efeafd] transition hover:bg-white hover:ring-[#d9d4f5]">Що нового, {viewer.name.split(" ")[0]}?</span>
          </button>
          <div className="mt-3 flex items-center gap-1 pl-[58px] sm:pl-[62px]">
            <button type="button" onClick={() => onCompose(null)} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#2f7a4f] hover:bg-emerald-50"><Icon name="image" size={17} /> Фото</button>
            <button type="button" onClick={() => onCompose(null)} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#c2410c] hover:bg-orange-50"><Icon name="video" size={17} /> Відео</button>
            {role === "author" && <button type="button" onClick={() => onCompose(null)} className="inline-flex min-h-[38px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#4338ca] hover:bg-[#eef0fd]"><Icon name="library" size={17} /> Матеріал</button>}
            <button type="button" onClick={() => onCompose(null)} className="ml-auto hidden min-h-[38px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white shadow-[0_10px_22px_-14px_rgba(91,61,245,0.9)] hover:opacity-95 sm:inline-flex sm:items-center">Написати</button>
          </div>
        </div>
      ) : role === "participant" ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[24px] bg-gradient-to-r from-[#f6f4ff] to-[#eef0fd] px-5 py-4 ring-1 ring-[#e4def9]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#5b3df5]"><Icon name="heart" size={20} /></span>
          <p className="min-w-0 flex-1 text-[14px] leading-snug text-[#2d2a5c]">Тут пишуть автори. Свої думки й досвід публікуйте у стрічці «Для учасників».</p>
          <button type="button" onClick={onGoWrite} className="rounded-xl bg-white px-4 py-2.5 text-[14px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff]">Написати</button>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-[24px] bg-gradient-to-r from-[#f6f4ff] to-[#eef0fd] px-5 py-4 ring-1 ring-[#e4def9]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#5b3df5]"><Icon name="comment" size={20} /></span>
          <p className="text-[14px] leading-snug text-[#2d2a5c]">Це стрічка учасників. Підтримайте їх вподобанням чи коментарем — відповідь автора дуже важлива.</p>
        </div>
      )))}

      {/* order of the feed, right before the posts */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-black/35">Стрічка</span>
        {sortControl}
      </div>

      {kind === "all" && sort === "top" && !demo && <WeekCard />}

      {demo && <p className="rounded-2xl bg-[#f6f4ff] px-4 py-2.5 text-[13px] text-[#4a2fd0]">Демо: так виглядатиме стрічка, коли з’являться публікації.</p>}
      {quiet && state === "ready" && posts.length > 0 && (
        <div className="rounded-[26px] bg-gradient-to-br from-[#1e2a5a] to-[#3b2f7a] px-6 py-7 text-white shadow-[0_24px_60px_-40px_rgba(30,20,90,0.9)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Icon name="moon" size={24} /></span>
          <h3 className="mt-4 text-[20px] font-bold">Час відпочити</h3>
          <p className="mt-1.5 max-w-[520px] text-[15px] leading-relaxed text-white/80">Вже пізно. Стрічка нікуди не дінеться до ранку, а сон — найкраща турбота про себе зараз. Можна спробувати вечірню медитацію в розділі «Медитації».</p>
          <button type="button" onClick={() => { setQuiet(false); try { sessionStorage.setItem("sensoria.feedQuiet", "1"); } catch { /* private mode */ } }} className="mt-5 rounded-2xl bg-white/15 px-5 py-2.5 text-[14px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/25">Гортати далі</button>
        </div>
      )}
      {rowError && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">{rowError}</p>}

      {state === "loading" && [0, 1, 2].map((k) => (
        <div key={k} className="flex gap-4 rounded-[26px] bg-white px-6 py-6 ring-1 ring-[#efeafd]" aria-hidden="true">
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-[#ece8fb]" />
          <div className="flex-1 space-y-3">
            <span className="block h-4 w-40 animate-pulse rounded-full bg-[#ece8fb]" />
            <span className="block h-3.5 w-full max-w-[560px] animate-pulse rounded-full bg-black/[0.05]" />
            <span className="block h-3.5 w-4/5 max-w-[460px] animate-pulse rounded-full bg-black/[0.05]" />
            <span className="block h-40 w-full max-w-[680px] animate-pulse rounded-2xl bg-black/[0.04]" />
          </div>
        </div>
      ))}
      {state === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100">
          Не вдалося завантажити стрічку.
          <button type="button" onClick={() => void load()} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}
      {state === "ready" && posts.length === 0 && sort === "saved" && (
        <div className="rounded-[24px] bg-white px-6 py-12 text-center ring-1 ring-[#efeafd]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="bookmark" size={24} /></span>
          <p className="mt-3 text-[15px] font-semibold text-[#12172b]">Збережених поки немає</p>
          <p className="mt-1 text-[14px] text-black/55">Натисніть «Зберегти» під публікацією, щоб повернутися до неї пізніше.</p>
        </div>
      )}
      {state === "ready" && posts.length === 0 && sort !== "saved" && (
        <div className="rounded-[24px] bg-white px-6 py-12 text-center ring-1 ring-[#efeafd]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="sparkle" size={24} /></span>
          <p className="mt-3 text-[15px] font-semibold text-[#12172b]">Тут поки тихо</p>
          <p className="mt-1 text-[14px] text-black/55">{canWrite ? "Станьте першим, хто напише." : "Публікації з’являться згодом."}</p>
        </div>
      )}

      {state === "ready" && !quiet && posts.map((p) => {
        const mine = !!viewer && p.authorId === viewer.id;
        const action = mine && !demo
          ? <OwnMenu canPin={p.authorIsAuthor && p.audience === "all"} pinned={p.isPinned}
              onEdit={() => onCompose(p)}
              onPin={() => void run(() => setPostPinned(p.id, !p.isPinned), "Не вдалося змінити закріплення.")}
              onDelete={() => { if (window.confirm("Видалити публікацію? Її не можна буде повернути.")) void run(async () => { await deletePost(p.id); setPosts((l) => l.filter((x) => x.id !== p.id)); }, "Не вдалося видалити публікацію."); }} />
          : p.authorIsAuthor && !mine
            ? <FollowButton on={!!follows[p.authorId]} onClick={() => toggleFollow(p.authorId)} />
            : null;
        return (
          <FeedCard
            key={p.id}
            post={p}
            viewer={viewer}
            onOpenAuthor={p.authorIsAuthor && !p.authorId.startsWith("demo-") ? () => openAuthorProfile(p.authorId) : undefined}
            onOpenContent={() => { if (p.attachment && !p.id.startsWith("demo-")) openMaterial(p.attachment.kind, p.attachment.id); }}
            headerAction={action}
            canFeature={!!p.contentId && ownContent.has(p.contentId)}
            onChange={(next) => { if (next.id.startsWith("demo-")) demoChanges.set(next.id, next); setPosts((list) => list.map((x) => (x.id === next.id ? next : x))); }}
          />
        );
      })}

      <div ref={endRef} aria-hidden="true" />
      {state === "ready" && !hasMore && posts.length >= 6 && (
        <p className="flex items-center gap-3 py-2 text-[13px] text-black/40"><span className="h-px flex-1 bg-[#ece8fb]" />Ви все переглянули<span className="h-px flex-1 bg-[#ece8fb]" /></p>
      )}
      {hasMore && !quiet && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mx-auto min-h-[44px] rounded-2xl bg-[#f1eeff] px-6 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff] disabled:opacity-60">
          {loadingMore ? "Завантаження…" : "Показати ще"}
        </button>
      )}
    </div>
  );
}

function FollowButton({ on, onClick, small = false }: { on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-xl font-semibold transition ${small ? "min-h-[34px] px-3 text-[12px]" : "min-h-[38px] px-4 text-[13px]"} ${on ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/30" : "bg-white text-[#4338ca] ring-1 ring-[#4338ca]/35 hover:bg-[#eef0fd]"}`}
    >
      {on ? "Ви підписані" : "+ Підписатися"}
    </button>
  );
}

// own post: edit / pin / delete
function OwnMenu({ canPin, pinned, onEdit, onPin, onDelete }: { canPin: boolean; pinned: boolean; onEdit: () => void; onPin: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "block w-full rounded-xl px-3 py-2 text-left text-[14px] hover:bg-[#f6f4ff]";
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Дії з публікацією" className="flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none text-black/50 hover:bg-black/5">⋯</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[210px] rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(70,40,170,0.45)] ring-1 ring-[#ebe8ff]">
          <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>Редагувати</button>
          {canPin && <button type="button" className={item} onClick={() => { setOpen(false); onPin(); }}>{pinned ? "Відкріпити" : "Закріпити в профілі"}</button>}
          <button type="button" className={`${item} text-rose-700 hover:bg-rose-50`} onClick={() => { setOpen(false); onDelete(); }}>Видалити</button>
        </div>
      )}
    </div>
  );
}

// ── notifications: answers, reactions, @mentions, new posts of authors you follow ─────────────────────────────
const NOTE_TEXT: Record<FeedNotification["kind"], (n: FeedNotification) => string> = {
  comment: (n) => `${n.actorName ?? "Хтось"} прокоментував(-ла) вашу публікацію`,
  reply: (n) => `${n.actorName ?? "Автор"} відповів(-ла) на ваш коментар`,
  reactions: (n) => `Вашу публікацію підтримали: ${n.text ?? ""}`,
  mention: (n) => `${n.actorName ?? "Хтось"} згадав(-ла) вас`,
  follow_post: (n) => `Нова публікація: ${n.actorName ?? "автор"}`,
  feature: () => "Автор хоче показати ваш досвід на сторінці матеріалу",
};

function NotificationsBell() {
  const [data, setData] = useState<{ unread: number; items: FeedNotification[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [post, setPost] = useState<FeedPost | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const session = useSession();
  const load = useCallback(() => { fetchNotifications().then(setData).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data?.unread) { void markNotificationsSeen(); setData((d) => (d ? { ...d, unread: 0 } : d)); }
  };
  const openPost = async (id: string) => {
    setOpen(false);
    setPost(await fetchFeedPost(id));
  };
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Сповіщення${data?.unread ? `: нових ${data.unread}` : ""}`} className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#4338ca] shadow-[0_14px_30px_-24px_rgba(60,50,140,0.6)] ring-1 ring-[#ece8fb] transition hover:bg-[#f6f4ff]">
        <Icon name="megaphone" size={21} />
        {!!data?.unread && <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-1.5 text-[11px] font-bold text-white">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="sensoria-scroll absolute right-0 z-40 mt-2 max-h-[460px] w-[min(92vw,380px)] overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_24px_60px_-24px_rgba(60,40,160,0.45)] ring-1 ring-[#e7e3fb]">
          <div className="px-3 pb-1 pt-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[#6d5bd0]">Сповіщення</div>
          {!data || data.items.length === 0
            ? <p className="px-3 py-6 text-center text-[14px] text-black/50">Поки тихо. Тут з’являться відповіді, реакції й згадки.</p>
            : data.items.map((n, i) => (
              <button key={`${n.kind}:${n.postId}:${i}`} type="button" onClick={() => void openPost(n.postId)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f6f4ff] ${n.unread ? "bg-[#f7f5ff]" : ""}`}>
                <Avatar avatarUrl={n.actorAvatar} initials={getInitials(n.actorName ?? "S")} className="h-9 w-9 shrink-0 text-[12px] text-white" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-[#12172b]">{NOTE_TEXT[n.kind](n)}</span>
                  {n.text && n.kind !== "reactions" && <span className="mt-0.5 block truncate text-[13px] text-black/50">{n.text.replace(MENTION_RE, "@$1")}</span>}
                  <span className="mt-0.5 block text-[12px] text-black/40">{formatPostDate(n.at)}</span>
                </span>
                {n.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#4338ca]" />}
              </button>
            ))}
        </div>
      )}
      {post && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#12172b]/45 p-4 backdrop-blur-[2px] sm:p-8" role="dialog" aria-modal="true" aria-label="Публікація" onMouseDown={(e) => { if (e.target === e.currentTarget) setPost(null); }}>
          <div className="w-full max-w-[760px]">
            <div className="mb-2 flex justify-end"><button type="button" onClick={() => setPost(null)} className="rounded-xl bg-white/90 px-4 py-2 text-[14px] font-semibold text-[#4338ca]">Закрити ✕</button></div>
            <FeedCard post={post} viewer={session?.profile ?? null} onOpenAuthor={post.authorIsAuthor ? () => openAuthorProfile(post.authorId) : undefined} onOpenContent={() => { if (post.attachment) openMaterial(post.attachment.kind, post.attachment.id); }} onChange={setPost} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── «Тиждень у Sensoria»: the warmest posts of the week and new authors (can be hidden until next week) ────────
function WeekCard() {
  const weekKey = `sensoria.week.${Math.floor(Date.now() / (7 * 86_400_000))}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(weekKey) === "1"; } catch { return false; } });
  const [week, setWeek] = useState<{ top: FeedPost[]; newAuthors: { id: string; name: string; avatarUrl: string | null }[] } | null>(null);
  useEffect(() => { if (!hidden) fetchWeek().then(setWeek).catch(() => {}); }, [hidden]);
  if (hidden || !week || (week.top.length === 0 && week.newAuthors.length === 0)) return null;
  return (
    <section className="rounded-[26px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] px-5 py-5 ring-1 ring-[#e4def9] sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#5b3df5] shadow-[0_8px_18px_-12px_rgba(91,61,245,0.6)]"><Icon name="sparkle" size={19} /></span>
        <h3 className="flex-1 text-[17px] font-bold text-[#12172b]">Тиждень у Sensoria</h3>
        <button type="button" onClick={() => { setHidden(true); try { localStorage.setItem(weekKey, "1"); } catch { /* private mode */ } }} className="text-[13px] font-medium text-black/45 hover:text-black/70">Сховати</button>
      </div>
      {week.top.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2">
          {week.top.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-[#ece8fb]">
              <span className="w-5 shrink-0 text-center text-[15px] font-bold text-[#7c5cf0]">{i + 1}</span>
              <Avatar avatarUrl={p.authorAvatarUrl} initials={getInitials(p.authorName)} className="h-8 w-8 shrink-0 text-[11px] text-white" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#12172b]">{(p.body.split("\n")[0] || "").replace(MENTION_RE, "@$1")}</span>
                <span className="block text-[12px] text-black/45">{p.authorName} · {(p.stats.likeCount || 0)} реакцій · {p.stats.commentCount} коментарів</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {week.newAuthors.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-black/55">Нові автори:</span>
          {week.newAuthors.map((a) => (
            <button key={a.id} type="button" onClick={() => openAuthorProfile(a.id)} className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-[13px] font-semibold text-[#12172b] ring-1 ring-[#ece8fb] hover:ring-[#d9d4f5]">
              <Avatar avatarUrl={a.avatarUrl} initials={getInitials(a.name)} className="h-7 w-7 text-[10px] text-white" /> {a.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
