// «Публікації» — a small social network inside Sensoria (feed like Threads, composer like LinkedIn / Instagram).
//   «Для всіх»       authors publish, everyone signed in reads, likes and comments
//   «Для учасників»  participants publish; authors read, like and comment
//   «Для авторів»    authors only
// Each feed comes from the database 15 posts at a time («Рекомендовані»: feed_top, «Нові»: feed_page), more on scroll,
// refreshed when the tab is opened again. Who sees and writes what is enforced by the database.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { openAuthorProfile } from "../../context/AuthorProfileContext";
import { getInitials, type Profile } from "../../lib/auth";
import Avatar from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import FeedCard from "./FeedCard";
import FeedComposer from "./FeedComposer";
import { deletePost, fetchFeed, fetchSomeAuthors, setPostPinned, type FeedAudience, type FeedPost, type FeedSort } from "../../lib/authorPosts";
import { fetchIsFollowing, setFollowing } from "../../lib/authorFollows";
import { SHOW_AUTHOR_DEMO, SHOW_DEMO } from "../../utils/demoMode";
import { demoFeed } from "../../data/demoFeed";

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
  const [sort, setSort] = useState<FeedSort>("top");
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // where this person writes: authors into «Для всіх» / «Для авторів», participants into «Для учасників»
  const writeTo: FeedAudience = role === "author" ? (feed === "authors" ? "authors" : "all") : "participants";
  const newPost = () => {
    if (feed !== writeTo) setFeed(writeTo);
    setComposer({ post: null, audience: writeTo });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] px-6 py-7 ring-1 ring-[#e7e3fb] sm:px-8">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#7c5cf0]/15 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-[#3b6df0]/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#6d5bd0]">Спільнота Sensoria</div>
            <h1 className="mt-1.5 text-[34px] font-bold leading-tight text-[#12172b]">Публікації</h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-black/60">{TABS[feed].hint}</p>
          </div>
          {viewer && (
            <button type="button" onClick={newPost} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(91,61,245,0.8)] transition hover:opacity-95">
              <span aria-hidden="true" className="text-[20px] leading-none">+</span> Нова публікація
            </button>
          )}
        </div>
      </section>

      {/* feeds and order */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 ring-1 ring-[#ece8fb]" role="tablist" aria-label="Стрічки">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={feed === t} onClick={() => setFeed(t)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition ${feed === t ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/30" : "text-black/55 hover:bg-[#faf9ff] hover:text-black/80"}`}>
              <Icon name={TABS[t].icon} size={16} /> {TABS[t].label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-2xl bg-[#f3f1fb] p-1" role="radiogroup" aria-label="Порядок публікацій">
          {([["top", "Рекомендовані"], ["new", "Нові"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)} className={`min-h-[36px] rounded-xl px-3.5 text-[13px] font-semibold transition ${sort === k ? "bg-white text-[#4338ca] shadow-[0_4px_12px_-6px_rgba(67,56,202,0.5)]" : "text-black/55 hover:text-black/75"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Feed
          key={`${feed}:${sort}:${reloadKey}`}
          kind={feed}
          sort={sort}
          role={role}
          viewer={viewer}
          canWrite={role === "author" ? feed !== "participants" : feed === "participants"}
          onCompose={(post) => setComposer({ post, audience: post?.audience ?? writeTo })}
          onGoWrite={() => { setFeed("participants"); setComposer({ post: null, audience: "participants" }); }}
        />
        <Sidebar role={role} viewer={viewer} />
      </div>

      {composer && viewer && (
        <FeedComposer
          role={role}
          viewer={viewer}
          post={composer.post}
          defaultAudience={composer.audience}
          onClose={() => setComposer(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function Feed({ kind, sort, role, viewer, canWrite, onCompose, onGoWrite }: {
  kind: FeedAudience; sort: FeedSort; role: "author" | "participant"; viewer: Profile | null; canWrite: boolean;
  onCompose: (post: FeedPost | null) => void; onGoWrite: () => void;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [demo, setDemo] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const showDemo = role === "author" ? SHOW_AUTHOR_DEMO : SHOW_DEMO;

  // demo posts are signed by real authors of the platform, so the name opens a real author page
  const demoPosts = useCallback(async (): Promise<FeedPost[]> => {
    const base = demoFeed(kind);
    const real = await fetchSomeAuthors(3).catch(() => []);
    if (real.length === 0) return base;
    const byName = new Map<string, (typeof real)[number]>();
    return base.map((p) => {
      if (!p.authorIsAuthor) return p;
      if (!byName.has(p.authorName)) byName.set(p.authorName, real[byName.size % real.length]);
      const a = byName.get(p.authorName)!;
      return { ...p, authorId: a.id, authorName: a.name, authorAvatarUrl: a.avatarUrl };
    });
  }, [kind]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    try {
      const page = await fetchFeed(kind, null, sort);
      if (page.posts.length === 0 && showDemo) { setPosts(await demoPosts()); setHasMore(false); setDemo(true); }
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
      const page = await fetchFeed(kind, posts[posts.length - 1].createdAt, sort, posts.length);
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
      {viewer && (canWrite ? (
        <button type="button" onClick={() => onCompose(null)} className="flex w-full items-center gap-3 rounded-[24px] bg-white px-5 py-4 text-left shadow-[0_18px_44px_-38px_rgba(60,50,140,0.55)] ring-1 ring-[#ece8fb] transition hover:ring-[#d9d4f5]">
          <Avatar avatarUrl={viewer.avatarUrl} initials={getInitials(viewer.name)} className="h-11 w-11 text-[14px] text-white" />
          <span className="flex-1 rounded-2xl bg-[#faf9ff] px-4 py-3 text-[15px] text-black/45 ring-1 ring-[#efeafd]">Що нового, {viewer.name.split(" ")[0]}?</span>
          <span className="hidden items-center gap-3 text-black/40 sm:flex"><Icon name="image" size={20} /><Icon name="video" size={20} /></span>
        </button>
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
      ))}

      {demo && <p className="rounded-2xl bg-[#f6f4ff] px-4 py-2.5 text-[13px] text-[#4a2fd0]">Демо: так виглядатиме стрічка, коли з’являться публікації.</p>}
      {rowError && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800">{rowError}</p>}

      {state === "loading" && [0, 1, 2].map((k) => <div key={k} className="h-[240px] animate-pulse rounded-[24px] bg-white ring-1 ring-[#efeafd]" />)}
      {state === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100">
          Не вдалося завантажити стрічку.
          <button type="button" onClick={() => void load()} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}
      {state === "ready" && posts.length === 0 && (
        <div className="rounded-[24px] bg-white px-6 py-12 text-center ring-1 ring-[#efeafd]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="sparkle" size={24} /></span>
          <p className="mt-3 text-[15px] font-semibold text-[#12172b]">Тут поки тихо</p>
          <p className="mt-1 text-[14px] text-black/55">{canWrite ? "Станьте першим, хто напише." : "Публікації з’являться згодом."}</p>
        </div>
      )}

      {state === "ready" && posts.map((p) => {
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
            onOpenContent={() => { if (!p.authorId.startsWith("demo-")) openAuthorProfile(p.authorId); }}
            headerAction={action}
            onChange={(next) => setPosts((list) => list.map((x) => (x.id === next.id ? next : x)))}
          />
        );
      })}

      <div ref={endRef} aria-hidden="true" />
      {hasMore && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mx-auto min-h-[44px] rounded-2xl bg-[#f1eeff] px-6 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff] disabled:opacity-60">
          {loadingMore ? "Завантаження…" : "Показати ще"}
        </button>
      )}
    </div>
  );
}

// right column: authors to follow and the community rules — the same for authors and participants
function Sidebar({ role, viewer }: { role: "author" | "participant"; viewer: Profile | null }) {
  const [authors, setAuthors] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [follows, setFollows] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetchSomeAuthors(6).then((list) => {
      const others = list.filter((a) => a.id !== viewer?.id).slice(0, 4);
      setAuthors(others);
      if (viewer) others.forEach((a) => fetchIsFollowing(viewer.id, a.id).then((v) => setFollows((f) => ({ ...f, [a.id]: v === true }))).catch(() => {}));
    }).catch(() => {});
  }, [viewer]);
  const toggle = (id: string) => {
    if (!viewer) return;
    const next = !follows[id];
    setFollows((f) => ({ ...f, [id]: next }));
    setFollowing(viewer.id, id, next).catch(() => setFollows((f) => ({ ...f, [id]: !next })));
  };
  const rules: [IconName, string][] = [
    ["heart", "Підтримуйте, а не оцінюйте. Тут ділитися безпечно."],
    ["lock", "Без контактів, посилань і реклами поза Sensoria."],
    ["shield", "Про особисте й складне — в особистих повідомленнях автору."],
    ["warning", "Бачите шкідливе — натисніть «Поскаржитися»."],
  ];
  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
      {authors.length > 0 && (
        <section className="rounded-[24px] bg-white p-5 ring-1 ring-[#ece8fb]">
          <h2 className="text-[15px] font-bold text-[#12172b]">{role === "author" ? "Колеги на платформі" : "Автори для вас"}</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {authors.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <button type="button" onClick={() => openAuthorProfile(a.id)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar avatarUrl={a.avatarUrl} initials={getInitials(a.name)} className="h-10 w-10 text-[13px] text-white" />
                  <span className="truncate text-[14px] font-semibold text-[#12172b] group-hover:text-[#4338ca]">{a.name}</span>
                </button>
                {viewer && <FollowButton small on={!!follows[a.id]} onClick={() => toggle(a.id)} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-[24px] bg-gradient-to-br from-[#f6f4ff] to-[#eef0fd] p-5 ring-1 ring-[#e4def9]">
        <h2 className="text-[15px] font-bold text-[#12172b]">Як ми тут спілкуємося</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {rules.map(([icon, text]) => (
            <li key={text} className="flex gap-3 text-[13px] leading-snug text-[#2d2a5c]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#5b3df5]"><Icon name={icon} size={15} /></span>
              <span className="pt-1.5">{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
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
