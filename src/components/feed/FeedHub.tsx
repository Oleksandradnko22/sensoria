// «Публікації» as feeds, like Threads.
//   «Для всіх»       authors publish, everyone signed in reads, likes and comments
//   «Для учасників»  participants publish (text only); authors read, like and comment
//   «Для авторів»    authors only
// «Що нового?» opens the full composer (photos, video, material). Each feed comes from the database 15 posts at a time
// (feed_page), more on scroll, refreshed when the tab is opened again. Who sees and writes what is enforced by the database.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { openAuthorProfile } from "../../context/AuthorProfileContext";
import type { Profile } from "../../lib/auth";
import PostCard from "../author/public/PostCard";
import { PostComposerModal } from "../author/AuthorPosts";
import { createParticipantPost, deletePost, fetchFeed, fetchSomeAuthors, FEED_LABEL, setPostPinned, type FeedAudience, type FeedPost, type FeedSort } from "../../lib/authorPosts";
import { fetchIsFollowing, setFollowing } from "../../lib/authorFollows";
import { checkPublicText } from "../../utils/authorPosts";
import { SHOW_AUTHOR_DEMO, SHOW_DEMO } from "../../utils/demoMode";
import { demoFeed } from "../../data/demoFeed";

const PARTICIPANT_POST_MAX = 1000;

// the database explains a refusal (daily limit, contacts) in Ukrainian: show that instead of a generic error
export function serverReason(e: unknown): string | null {
  const m = (e as { message?: string } | null)?.message ?? "";
  return /^(Публікація|Коментар|Забагато)/.test(m) ? m : null;
}

const HINT: Record<FeedAudience, string> = {
  all: "Публікації авторів Sensoria для всіх учасників платформи.",
  participants: "Простір учасників: діліться досвідом і підтримуйте одне одного. Автори читають і коментують.",
  authors: "Лише для авторів: досвід, запитання й новини Sensoria.",
};

export default function FeedHub({ role }: { role: "author" | "participant" }) {
  const session = useSession();
  const viewer = session?.profile ?? null;
  const tabs: FeedAudience[] = role === "author" ? ["all", "participants", "authors"] : ["all", "participants"];
  const [feed, setFeed] = useState<FeedAudience>("all");
  const [sort, setSort] = useState<FeedSort>("top");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Публікації</h1>
        <p className="mt-1 text-[15px] text-black/55">{HINT[feed]}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Стрічки">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={feed === t}
            onClick={() => setFeed(t)}
            className={`min-h-[42px] rounded-2xl px-4 text-[14px] font-semibold transition ${feed === t ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-black/60 ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}
          >
            {FEED_LABEL[t]}
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
      <Feed key={`${feed}:${sort}`} kind={feed} sort={sort} role={role} viewer={viewer} />
    </div>
  );
}

function Feed({ kind, sort, role, viewer }: { kind: FeedAudience; sort: FeedSort; role: "author" | "participant"; viewer: Profile | null }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [demo, setDemo] = useState(false);
  const [composer, setComposer] = useState<{ post: FeedPost | null } | null>(null);
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
  // fresh posts when the person comes back to the tab, no constant polling
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
  // next page when the end of the list comes into view
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = endRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) void loadMore(); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // «Підписатися»: one check per author on the page, not per post
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

  // authors write into «Для всіх» and «Для авторів»; participants only into «Для учасників»
  const canWrite = role === "author" ? kind !== "participants" : kind === "participants";

  return (
    <div className="flex flex-col gap-4">
      {canWrite && viewer && (
        <div className="lg:col-span-2">
          {role === "author"
            ? <ComposeBar name={viewer.name} avatarUrl={viewer.avatarUrl} audience={FEED_LABEL[kind]} onOpen={() => setComposer({ post: null })} />
            : <ParticipantComposer userId={viewer.id} name={viewer.name} avatarUrl={viewer.avatarUrl} onPosted={() => void load(true)} />}
        </div>
      )}

      {demo && <p className="rounded-2xl bg-[#f6f4ff] px-4 py-2.5 text-[13px] text-[#4a2fd0] lg:col-span-2">Демо: так виглядатиме стрічка, коли з’являться публікації.</p>}
      {rowError && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-800 lg:col-span-2">{rowError}</p>}

      {state === "loading" && [0, 1, 2, 3].map((k) => <div key={k} className="h-[200px] animate-pulse rounded-2xl bg-white ring-1 ring-[#efeafd]" />)}
      {state === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100 lg:col-span-2">
          Не вдалося завантажити стрічку.
          <button type="button" onClick={() => void load()} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}
      {state === "ready" && posts.length === 0 && (
        <p className="rounded-2xl bg-white px-6 py-10 text-center text-[14px] text-black/55 ring-1 ring-[#efeafd] lg:col-span-2">Тут поки тихо. {canWrite ? "Напишіть першим!" : "Публікації з’являться згодом."}</p>
      )}

      {state === "ready" && posts.map((p) => {
        const mine = !!viewer && p.authorId === viewer.id;
        const action = mine && !demo
          ? <OwnMenu isAuthorPost={p.authorIsAuthor} canPin={p.authorIsAuthor && p.audience === "all"} pinned={p.isPinned}
              onEdit={() => setComposer({ post: p })}
              onPin={() => void run(() => setPostPinned(p.id, !p.isPinned), "Не вдалося змінити закріплення.")}
              onDelete={() => { if (window.confirm("Видалити публікацію? Її не можна буде повернути.")) void run(async () => { await deletePost(p.id); setPosts((l) => l.filter((x) => x.id !== p.id)); }, "Не вдалося видалити публікацію."); }} />
          : p.authorIsAuthor && !mine
            ? <FollowButton on={!!follows[p.authorId]} onClick={() => toggleFollow(p.authorId)} />
            : null;
        return (
          <PostCard
            key={p.id}
            post={p}
            showAuthor
            pinned={p.isPinned && kind === "all"}
            authorName={p.authorName}
            authorAvatarUrl={p.authorAvatarUrl}
            authorLabel={p.authorIsAuthor ? "Автор" : "Учасник"}
            onOpenAuthor={p.authorIsAuthor && !p.authorId.startsWith("demo-") ? () => openAuthorProfile(p.authorId) : undefined}
            headerAction={action}
            viewer={viewer}
            onRequireLogin={() => {}}
            onOpenContent={() => { if (!demo) openAuthorProfile(p.authorId); }}
            onChange={(next) => setPosts((list) => list.map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
          />
        );
      })}

      <div ref={endRef} aria-hidden="true" className="lg:col-span-2" />
      {hasMore && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mx-auto min-h-[44px] rounded-2xl bg-[#f1eeff] px-6 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff] disabled:opacity-60 lg:col-span-2">
          {loadingMore ? "Завантаження…" : "Показати ще"}
        </button>
      )}

      {composer && (
        <PostComposerModal
          post={composer.post}
          audience={kind === "authors" ? "authors" : "all"}
          onClose={() => setComposer(null)}
          onSaved={() => void load(true)}
        />
      )}
    </div>
  );
}

function FollowButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 min-h-[38px] rounded-xl px-4 text-[13px] font-semibold transition ${on ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white hover:opacity-95"}`}
    >
      {on ? "Ви підписані" : "Підписатися"}
    </button>
  );
}

// own post: edit / pin / delete (participants: delete)
function OwnMenu({ isAuthorPost, canPin, pinned, onEdit, onPin, onDelete }: { isAuthorPost: boolean; canPin: boolean; pinned: boolean; onEdit: () => void; onPin: () => void; onDelete: () => void }) {
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
        <div className="absolute right-0 z-20 mt-1 w-[200px] rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(70,40,170,0.45)] ring-1 ring-[#ebe8ff]">
          {isAuthorPost && <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>Редагувати</button>}
          {canPin && <button type="button" className={item} onClick={() => { setOpen(false); onPin(); }}>{pinned ? "Відкріпити" : "Закріпити в профілі"}</button>}
          <button type="button" className={`${item} text-rose-700 hover:bg-rose-50`} onClick={() => { setOpen(false); onDelete(); }}>Видалити</button>
        </div>
      )}
    </div>
  );
}

function Initial({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl
    ? <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
    : <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-[15px] font-semibold text-white">{(name.trim()[0] ?? "S").toUpperCase()}</span>;
}

// «Що нового?» — opens the full composer
function ComposeBar({ name, avatarUrl, audience, onOpen }: { name: string; avatarUrl: string | null; audience: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left ring-1 ring-[#efeafd] transition hover:ring-[#d9d4f5]">
      <Initial name={name} avatarUrl={avatarUrl} />
      <span className="flex-1 text-[15px] text-black/45">Що нового? <span className="text-[13px] text-black/35">· {audience}</span></span>
      <span className="rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 py-2 text-[13px] font-semibold text-white">Написати</span>
    </button>
  );
}

// a participant's post: text only, into «Для учасників»; checked for contacts and rude words before it goes out
function ParticipantComposer({ userId, name, avatarUrl, onPosted }: { userId: string; name: string; avatarUrl: string | null; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = async () => {
    const check = checkPublicText(text, PARTICIPANT_POST_MAX);
    if (!check.ok) { setNotice(check.message); return; }
    setBusy(true);
    setNotice(null);
    try {
      await createParticipantPost(userId, text);
      setText("");
      onPosted();
    } catch (e) {
      setNotice(serverReason(e) ?? "Не вдалося опублікувати. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#efeafd]">
      <div className="flex gap-3">
        <Initial name={name} avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setNotice(null); }}
            maxLength={PARTICIPANT_POST_MAX}
            rows={3}
            aria-label="Нова публікація"
            placeholder="Що нового? Поділіться досвідом чи думкою…"
            className="w-full resize-none rounded-xl bg-[#faf9ff] px-3.5 py-2.5 text-[15px] ring-1 ring-[#ebe8ff] placeholder:text-black/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]"
          />
          <p className="mt-1.5 text-[12px] text-black/45">Не діліться тут дуже особистим і контактами. Про особисте краще написати автору в повідомленнях.</p>
          {notice && <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{notice}</p>}
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[12px] text-black/40">{text.length}/{PARTICIPANT_POST_MAX}</span>
            <button type="button" onClick={() => void submit()} disabled={busy || !text.trim()} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40">
              {busy ? "Публікуємо…" : "Опублікувати"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
