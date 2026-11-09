// Public author profile — ONE long profile, not tabs. Information
// architecture of a professional profile, reduced for Sensoria:
//
//   compact identity header (+ sticky mini header on scroll)
//   ├─ primary column: Публікації → Матеріали автора → Про автора → Відгуки
//   └─ quiet sidebar (desktop): short Про автора / Матеріали / Відгуки that
//      jump to the full sections
//
// Environment: a very light lavender page, warm-white surfaces only where
// content is an object (header, publication, material rows); About and
// Reviews are typography on the page itself. Real data only — no cover
// image (none exists), no followers, no CV (no such data). Publication,
// Comment, Review, Material and Private message stay separate concepts.
import AuthorReviews from "../components/author/public/AuthorReviews";
import { isAuthorPreview } from "../dev/authorPreview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOwnedKeys, type Access } from "../lib/ownedContent";
import AuthorAbout from "../components/author/public/AuthorAbout";
import AuthorMaterials from "../components/author/public/AuthorMaterials";
import Avatar from "../components/ui/Avatar";
import { Icon } from "../components/ui/Icon";
import ReportButton from "../components/ReportButton";
import AuthorKindBadge from "../components/author/AuthorKindBadge";
import PostCard from "../components/author/public/PostCard";
import { getInitials, type Profile } from "../lib/auth";
import { fetchAuthorPublicProfile, saveReviewReply, type AuthorPublicProfile } from "../lib/authorPublic";
import { fetchAuthorPosts, PostsUnavailableError, type AuthorPost } from "../lib/authorPosts";
import { fetchIsFollowing, setFollowing, type FollowState } from "../lib/authorFollows";
import { categoryLabels } from "../data/categoryLabels";
import AuthorCover from "../components/author/public/AuthorCover";
import { pluralUk } from "../utils/plural";
import { AUTHOR_LEFT_NOTICE, useAuthorLeft } from "../lib/authorStatus";
import {
  formatCount,
  formatSinceMonth,
  groupAuthorContent,
  summarizeRatings,
  formatRating,
  type AuthorContentKind,
} from "../utils/authorProfileView";
import { appendUnique } from "../utils/authorPosts";

type Props = {
  authorId: string;
  viewer: Profile | null | undefined;
  onRequireLogin: () => void;
  onBack: () => void;
  // "Написати автору" opens the participant's messenger with this author.
  onMessageAuthor: (author: { authorId: string; name: string; avatarUrl: string | null }) => void;
  onOpenProgram: (id: string) => void;
  onOpenGuide: (id: string) => void;
  onOpenMeditation: (id: string, authorName?: string) => void;
};

const SURFACE = "rounded-2xl bg-white text-black border border-black/[0.06]";
type TabId = "posts" | "materials" | "about" | "reviews";

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-400" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= Math.round(value)} />
      ))}
    </span>
  );
}

// "✓ Підтверджено" with a small explanation on tap/hover/focus (no title-only
// tooltip: it does not exist on touch screens).
function VerifiedBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="verified-note"
        onClick={() => setOpen((v) => !v)}
        className="relative text-[12px] font-medium tracking-normal text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 hover:bg-emerald-100 transition-colors after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']"
      >
        ✓ Особу перевірено
      </button>
      {open && (
        <span
          id="verified-note"
          role="note"
          className="absolute left-0 top-full mt-2 z-20 w-[260px] rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[12px] font-normal leading-relaxed text-black/70"
        >
          Команда Sensoria переглянула документ автора, щоб переконатися, що це реальна людина. Це не підтвердження кваліфікації чи досвіду.
        </span>
      )}
    </span>
  );
}

export default function AuthorPublicProfilePage({
  authorId,
  viewer,
  onRequireLogin,
  onBack,
  onMessageAuthor,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
}: Props) {
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const authorLeft = useAuthorLeft(authorId);
  const [data, setData] = useState<AuthorPublicProfile | null>(null);
  const [tab, setTabRaw] = useState<TabId>("posts");
  // sub-tab of «Матеріали» requested from «Про автора» (cleared on any other tab switch)
  const [materialsKind, setMaterialsKind] = useState<"program" | "meditation" | "guide" | null>(null);
  const setTab = (t: TabId) => {
    setMaterialsKind(null);
    setTabRaw(t);
  };
  // Cabinet state of this author's materials, for a signed-in participant
  // (one bulk read; drives the card CTA: Відкрити / Почати / Продовжити).
  const [access, setAccess] = useState<ReadonlyMap<string, Access> | undefined>(undefined);
  useEffect(() => {
    if (viewer?.role !== "participant") {
      setAccess(undefined);
      return;
    }
    let cancelled = false;
    fetchOwnedKeys(viewer.id)
      .then((m) => !cancelled && setAccess(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewer?.id, viewer?.role]);

  const load = useCallback(() => {
    let cancelled = false;
    setState("loading");
    setTabRaw("posts");
    fetchAuthorPublicProfile(authorId)
      .then((p) => {
        if (cancelled) return;
        setData(p);
        setState(p ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authorId]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [authorId]);

  // ── publications ──
  const [feedState, setFeedState] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [pinned, setPinned] = useState<AuthorPost | null>(null);
  const [posts, setPosts] = useState<AuthorPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const viewerId = viewer?.id ?? null;

  const loadFeed = useCallback(() => {
    let cancelled = false;
    setFeedState("loading");
    fetchAuthorPosts(authorId, viewerId)
      .then((page) => {
        if (cancelled) return;
        setPinned(page.pinned);
        setPosts(page.posts);
        setHasMore(page.hasMore);
        setFeedState("ready");
      })
      .catch((e) => {
        if (!cancelled) setFeedState(e instanceof PostsUnavailableError ? "unavailable" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [authorId, viewerId]);
  useEffect(() => loadFeed(), [loadFeed]);

  // Follow ("Підписатися"): participants only; private rows.
  const [follow, setFollow] = useState<FollowState>(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState(false);
  const canFollow = (!viewer || (viewer.role === "participant" && viewer.id !== authorId)) && follow !== "unavailable";
  useEffect(() => {
    setFollow(false);
    if (!viewer || viewer.role !== "participant" || viewer.id === authorId) return;
    let cancelled = false;
    fetchIsFollowing(viewer.id, authorId).then((f) => !cancelled && setFollow(f)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewer, authorId]);
  // Followers shown in the header follow the visitor's own (optimistic) toggle.
  const [followDelta, setFollowDelta] = useState(0);
  useEffect(() => setFollowDelta(0), [authorId]);
  const audience = data?.audience
    ? { ...data.audience, followers: Math.max(0, data.audience.followers + followDelta) }
    : null;
  const toggleFollow = async () => {
    if (!viewer) return onRequireLogin();
    if (followBusy || follow === "unavailable") return;
    const next = !follow;
    setFollowBusy(true);
    setFollowError(false);
    setFollow(next);
    setFollowDelta((d) => d + (next ? 1 : -1));
    try {
      await setFollowing(viewer.id, authorId, next);
    } catch {
      setFollowError(true);
      setFollow(!next);
      setFollowDelta((d) => d + (next ? -1 : 1));
    } finally {
      setFollowBusy(false);
    }
  };

  // A publication opened on its own page (from the carousel or the feed).
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const openPost = openPostId ? [pinned, ...posts].find((p) => p && p.id === openPostId) ?? null : null;
  const openPage = (id: string) => {
    setOpenPostId(id);
    window.scrollTo(0, 0);
  };
  const closePage = () => {
    setOpenPostId(null);
    window.scrollTo(0, 0);
  };

  const loadMore = async () => {
    const last = posts[posts.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAuthorPosts(authorId, viewerId, { before: last.createdAt });
      setPosts((prev) => appendUnique(prev, page.posts));
      setHasMore(page.hasMore);
    } catch {
      setFeedState("error");
    } finally {
      setLoadingMore(false);
    }
  };

  const updatePost = (next: AuthorPost) => {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    setPinned((p) => (p && p.id === next.id ? next : p));
  };

  const openContent = (kind: AuthorContentKind, id: string) => {
    if (kind === "program") onOpenProgram(id);
    if (kind === "guide") onOpenGuide(id);
    if (kind === "meditation") onOpenMeditation(id, data?.name);
  };

  // ── sticky mini header: appears once the identity header scrolls away ──
  const headerRef = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  const groups = useMemo(() => groupAuthorContent(data?.content ?? []), [data]);
  const ratings = useMemo(() => summarizeRatings((data?.reviews ?? []).map((r) => r.rating)), [data]);
  // Local `npm run dev` only (never in a production build): when the author has
  // no reviews yet, the header shows a sample 4.5 so the layout can be judged.
  const headerRatings = isAuthorPreview() && ratings.count === 0 ? { average: 4.5, count: 2 } : ratings;
  const since = formatSinceMonth(data?.memberSince);
  const topics = (data?.details.topics ?? [])
    .map((k) => (categoryLabels as Record<string, string>)[k])
    .filter(Boolean);
  const hasPosts = !!pinned || posts.length > 0;
  const canMessage = !authorLeft && !!viewer && viewer.role === "participant" && viewer.id !== authorId;
  const contentCount = data?.content.length ?? 0;
  const showFeed = true; // the main tab never disappears, even if publications are not set up yet
  const tabs = useMemo(() => {
    const t: { id: TabId; label: string }[] = [];
    t.push({ id: "posts", label: "Публікації" });
    t.push({ id: "materials", label: "Матеріали" });
    t.push({ id: "about", label: "Про автора" });
    t.push({ id: "reviews", label: "Відгуки" });
    return t;
  }, []);
  const activeTab: TabId = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const reviewWord = (n: number) => pluralUk(n, "відгук", "відгуки", "відгуків");

  const showAudience = !!audience;

  const actionButtons = (full: boolean) => {
    const pad = full ? "px-4 min-h-[44px] text-[14px]" : "px-5 min-h-[44px] text-[14px]";
    const writeCls = `${pad} rounded-xl border border-black/15 bg-white font-medium hover:border-black/30 hover:bg-[#f7f7fb] active:bg-[#efeff6] transition-colors disabled:opacity-60`;
    const writeBtn = canMessage ? (
      <button
        onClick={() => data && onMessageAuthor({ authorId, name: data.name, avatarUrl: data.avatarUrl })}
        className={writeCls}
      >
        Написати автору
      </button>
    ) : !viewer && !authorLeft ? (
      <button onClick={onRequireLogin} className={writeCls}>
        Написати автору
      </button>
    ) : null;
    const followBtn = canFollow ? (
      follow === true ? (
        <button
          onClick={toggleFollow}
          disabled={followBusy}
          aria-pressed
          title="Натисніть, щоб відписатися"
          className={`${pad} rounded-xl border border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca] font-medium hover:bg-[#e3e6fb] transition disabled:opacity-60`}
        >
          ✓ Ви підписані
        </button>
      ) : (
        <button
          onClick={toggleFollow}
          disabled={followBusy}
          aria-pressed={false}
          className={`${pad} rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium hover:opacity-90 transition disabled:opacity-60`}
        >
          Підписатися
        </button>
      )
    ) : null;
    return (
      <>
        {followBtn}
        {writeBtn}
        <ReportButton
          type="author"
          targetId={authorId}
          ownerId={authorId}
          label={data?.name ?? "Автор"}
          viewerId={viewerId}
        />
        {followError && (
          <span role="status" className="text-[12px] text-rose-600">
            Не вдалося змінити підписку. Спробуйте ще раз.
          </span>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#f3f4fb] text-black">
      {/* sticky mini header */}
      {state === "ready" && data && !openPost && (
        <div
          aria-hidden={!stuck}
          className={`fixed top-0 inset-x-0 z-30 bg-white border-b border-black/[0.08] transition-transform duration-200 ${
            stuck ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
            <Avatar avatarUrl={data.avatarUrl} initials={getInitials(data.name)} className="w-7 h-7 text-[12px] text-white" />
            <div className="min-w-0 flex-1 text-[14px] truncate">
              <span className="font-semibold">{data.name}</span>
              <span className="text-black/60"> · Автор Sensoria</span>
            </div>
            {canMessage && (
              <button
                tabIndex={stuck ? 0 : -1}
                onClick={() => data && onMessageAuthor({ authorId, name: data.name, avatarUrl: data.avatarUrl })}
                className="shrink-0 px-4 min-h-[44px] rounded-lg bg-black text-white text-[14px] font-medium"
              >
                Написати
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4`}>
        <button
          onClick={openPost ? closePage : onBack}
          className="inline-flex items-center gap-1.5 min-h-[44px] -mt-2 text-[14px] text-black/60 hover:text-black transition mb-1"
        >
          <Icon name="chevron" size={15} className="rotate-90" />
          {openPost ? "До профілю автора" : "Назад"}
        </button>

        {state === "loading" && (
          <div className={`${SURFACE} p-6 animate-pulse`} aria-busy="true" aria-label="Завантаження профілю">
            <div className="flex items-center gap-4">
              <div className="w-[72px] h-[72px] rounded-full bg-black/[0.06]" />
              <div className="flex-1">
                <div className="h-5 w-1/3 rounded bg-black/[0.06]" />
                <div className="h-3 w-1/2 rounded bg-black/[0.04] mt-3" />
              </div>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className={`${SURFACE} text-center py-12`} role="alert">
            <div className="text-[16px] font-medium">Не вдалося завантажити профіль</div>
            <button onClick={() => load()} className="mt-4 px-4 py-2 rounded-xl bg-black text-white text-[14px] font-medium">
              Спробувати ще раз
            </button>
          </div>
        )}

        {state === "missing" && (
          <div className={`${SURFACE} text-center py-12`}>
            <div className="text-[16px] font-medium">Профіль автора недоступний</div>
            <p className="text-[14px] text-black/55 mt-1">Можливо, автор видалив акаунт.</p>
          </div>
        )}

        {state === "ready" && data && (
          <>
            <div className={openPost ? "hidden" : ""}>
            {/* IDENTITY */}
            <header ref={headerRef} className={`${SURFACE} overflow-hidden`}>
              {/* No uploaded cover: the colour comes from the author's categories. */}
              <AuthorCover
                cover={{
                  coverType: data.details.coverType,
                  coverVariant: data.details.coverVariant,
                  coverImageUrl: data.details.coverImageUrl,
                  topics: data.details.topics,
                  seed: data.id,
                }}
              />
              <div className="px-5 sm:px-7 pb-5">
                <div className="relative z-10 flex items-end justify-between gap-4 -mt-11 sm:-mt-14">
                  <Avatar
                    avatarUrl={data.avatarUrl}
                    initials={getInitials(data.name)}
                    className="w-[92px] h-[92px] sm:w-[112px] sm:h-[112px] text-[24px] text-white ring-4 ring-white"
                  />
                  <div className="hidden sm:flex items-center gap-2 pb-1">{actionButtons(false)}</div>
                </div>

                <h1 className="text-[24px] sm:text-[24px] font-bold tracking-tight leading-tight mt-3 flex items-center gap-2 flex-wrap">
                  {data.name}
                  {data.details.verified && <VerifiedBadge />}
                </h1>
                <div className="text-[14px] text-black/60 mt-0.5">
                  {data.details.title ? `${data.details.title} · ` : ""}Автор Sensoria
                </div>
                <AuthorKindBadge educationVerified={data.details.educationVerified} showNote className="mt-2" />

                <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap mt-1.5 empty:hidden text-[14px] leading-5 text-black/60">
                  {showAudience && audience && (
                    <>
                      <span className="whitespace-nowrap">
                        {formatCount(audience.followers)} {pluralUk(audience.followers, "підписник", "підписники", "підписників")}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="whitespace-nowrap">
                        {formatCount(audience.participants)} {pluralUk(audience.participants, "учасник", "учасники", "учасників")}
                      </span>
                    </>
                  )}
                  {showAudience && audience && <span aria-hidden>·</span>}
                  {headerRatings.count > 0 && (
                    <button onClick={() => setTab("reviews")} className="inline-flex items-center gap-1.5 whitespace-nowrap min-h-[44px] -my-3 hover:text-black">
                      <span className="text-black/75 font-medium">{formatRating(headerRatings.average)}</span>
                      <Stars value={headerRatings.average} size={12} />
                      <span>
                        · {headerRatings.count} {reviewWord(headerRatings.count)}
                      </span>
                    </button>
                  )}
                  {headerRatings.count === 0 && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Stars value={0} size={12} />
                      <span>Ще немає оцінок</span>
                    </span>
                  )}
                </div>

                {data.details.positioning && (
                  <div className="mt-3 max-w-[640px]">
                    <p className="text-[16px] leading-relaxed text-black/75 line-clamp-3">{data.details.positioning}</p>
                  </div>
                )}
                {topics.length > 0 && (
                  <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1.5 mt-3.5">
                    <span className="text-[12px] text-black/55">Працює з темами</span>
                    {topics.map((t) => (
                      <span key={t} className="text-[12px] text-black/70 border border-[#4338ca]/40 rounded-full px-2.5 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="sm:hidden mt-4 grid grid-cols-2 gap-2 empty:hidden">{actionButtons(true)}</div>
                {authorLeft && (
                  <p role="status" className="mt-4 rounded-xl bg-[#f3f4ff] border border-[#dfe3ff] px-4 py-3 text-[14px] text-black/70">
                    Автор завершив співпрацю з платформою. {AUTHOR_LEFT_NOTICE.split(". ").slice(1).join(". ")}
                  </p>
                )}

              </div>

              <div
                role="tablist"
                aria-label="Розділи профілю"
                className="flex lg:hidden gap-1 px-3 sm:px-5 border-t border-black/[0.06] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {tabs.map((t) => {
                  const on = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      id={`tab-${t.id}`}
                      aria-selected={on}
                      aria-controls="author-panel"
                      onClick={() => setTab(t.id)}
                      className={`relative px-2 sm:px-4 py-3.5 text-[14px] sm:text-[14px] whitespace-nowrap transition ${
                        on ? "text-[#4338ca] font-semibold" : "text-black/55 hover:text-black/80"
                      }`}
                    >
                      {t.label}
                      {on && <span className="absolute left-2 right-2 sm:left-4 sm:right-4 bottom-0 h-[2px] bg-[#4338ca] rounded-full" />}
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="mt-5 grid gap-x-6 gap-y-10 items-start lg:grid-cols-[minmax(0,1fr)_240px]">
              {/* PRIMARY COLUMN */}
              <div id="author-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="min-w-0 flex flex-col gap-10 w-full">
                {showFeed && activeTab === "posts" && (
                  <section id="author-posts" aria-labelledby="h-posts" className="scroll-mt-16">
                    <h2 id="h-posts" className="sr-only">
                      Публікації
                    </h2>
                    {feedState === "loading" && (
                      <div className={`${SURFACE} p-5 animate-pulse`} aria-busy="true">
                        <div className="h-4 w-2/3 rounded bg-black/[0.06]" />
                        <div className="h-3 w-full rounded bg-black/[0.04] mt-4" />
                        <div className="h-3 w-5/6 rounded bg-black/[0.04] mt-2" />
                      </div>
                    )}
                    {feedState === "error" && (
                      <div className={`${SURFACE} p-5 text-[14px] text-black/65`} role="alert">
                        Не вдалося завантажити публікації.{" "}
                        <button onClick={() => loadFeed()} className="underline font-medium text-black/80">
                          Спробувати ще раз
                        </button>
                      </div>
                    )}
                    {feedState === "unavailable" && (
                      <p className="text-[14px] text-black/55">Публікації автора з’являться тут найближчим часом.</p>
                    )}
                    {feedState === "ready" && !hasPosts && (
                      <div className={`${SURFACE} px-6 py-12 text-center`}>
                        <span className="mx-auto w-12 h-12 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
                          <Icon name="comment" size={22} />
                        </span>
                        <div className="text-[16px] font-medium mt-4">Публікацій поки немає</div>
                        <p className="text-[14px] text-black/60 mt-1 max-w-[420px] mx-auto leading-relaxed">
                          {viewer?.id === authorId
                            ? "Створіть першу публікацію в кабінеті автора: розділ «Публікації» → «Нова публікація»."
                            : "Тут з’являться короткі тексти автора про емоційний добробут і рекомендовані матеріали."}
                        </p>
                      </div>
                    )}
                    {feedState === "ready" && hasPosts && (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:gap-4">
                          {pinned && (
                            <PostCard
                              pinned
                              post={pinned}
                              authorName={data.name}
                              authorAvatarUrl={data.avatarUrl}
                              viewer={viewer}
                              onRequireLogin={onRequireLogin}
                              onOpenContent={openContent}
                              onOpen={() => openPage(pinned.id)}
                              onChange={updatePost}
                            />
                          )}
                          {posts.map((p) => (
                            <PostCard
                              key={p.id}
                              post={p}
                              authorName={data.name}
                              authorAvatarUrl={data.avatarUrl}
                              viewer={viewer}
                              onRequireLogin={onRequireLogin}
                              onOpenContent={openContent}
                              onOpen={() => openPage(p.id)}
                              onChange={updatePost}
                            />
                          ))}
                        </div>
                        {hasMore && (
                          <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="self-center px-5 min-h-[44px] rounded-full border border-[#4338ca]/30 text-[14px] font-medium text-[#4338ca] bg-white hover:bg-[#eef0fd] transition-colors disabled:opacity-60"
                          >
                            {loadingMore ? "Завантажуємо…" : "Показати ще публікації"}
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* MATERIALS — sized to what exists */}
                {activeTab === "materials" && (
                  <section id="author-materials" aria-labelledby="h-materials" className="scroll-mt-16">
                    <h2 id="h-materials" className="sr-only">
                      Матеріали автора
                    </h2>
                    <AuthorMaterials
                      items={groups.flatMap((g) => g.items)}
                      featuredKey={pinned?.contentKind && pinned.contentId ? `${pinned.contentKind}:${pinned.contentId}` : null}
                      access={access}
                      initialKind={materialsKind}
                      onOpen={openContent}
                    />
                  </section>
                )}

                {/* ABOUT — typography, no container */}
                {activeTab === "about" && (
                <section id="author-about" aria-labelledby="h-about" className="scroll-mt-16">
                  <h2 id="h-about" className="sr-only">
                    Про автора
                  </h2>
                  <AuthorAbout
                    seed={data.id}
                    name={data.name}
                    initials={getInitials(data.name)}
                    avatarUrl={data.avatarUrl}
                    role={data.details.title}
                    story={data.story}
                    bio={data.details.bio}
                    approach={data.details.approach}
                    credentials={data.credentials}
                    experience={data.experience}
                    cases={data.cases}
                    content={data.content}
                    counts={{
                      program: groups.find((g) => g.kind === "program")?.items.length ?? 0,
                      meditation: groups.find((g) => g.kind === "meditation")?.items.length ?? 0,
                      guide: groups.find((g) => g.kind === "guide")?.items.length ?? 0,
                    }}
                    onOpenKind={(k) => {
                      setTabRaw("materials");
                      setMaterialsKind(k);
                    }}
                    onOpenContent={openContent}
                    site={data.details.site}
                    instagram={data.details.instagram}
                    since={since}
                  />
                </section>
                )}

                {/* REVIEWS — two reviews look like two reviews */}
                {activeTab === "reviews" && (
                <section id="author-reviews" aria-labelledby="h-reviews" className="scroll-mt-16">
                  <AuthorReviews
                    key={data.id}
                    reviews={data.reviews}
                    summary={ratings}
                    canReply={(!!viewer && viewer.id === authorId) || isAuthorPreview()}
                    onSaveReply={(id, reply) => saveReviewReply(id, reply, data.name)}
                    viewerId={viewerId}
                  />
                </section>
                )}
              </div>
              <aside className="hidden lg:block sticky top-16" aria-label="Розділи профілю">
                <div role="tablist" aria-orientation="vertical" aria-label="Розділи профілю" className={`${SURFACE} p-2 flex flex-col gap-0.5`}>
                  {tabs.map((t) => {
                    const on = activeTab === t.id;
                    const count = t.id === "materials" ? contentCount : t.id === "reviews" ? ratings.count : 0;
                    return (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={on}
                        aria-controls="author-panel"
                        onClick={() => setTab(t.id)}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 min-h-[44px] text-[14px] text-left transition-colors ${
                          on ? "bg-[#eef0fd] text-[#4338ca] font-semibold" : "text-black/65 hover:bg-black/[0.04] hover:text-black"
                        }`}
                      >
                        <span>{t.label}</span>
                        {count > 0 && <span className={`text-[12px] ${on ? "text-[#4338ca]/80" : "text-black/55"}`}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </aside>

            </div>
            </div>

            {openPost && (
              <div>
                <PostCard
                  post={openPost}
                  pinned={openPost.id === pinned?.id}
                  detail
                  authorName={data.name}
                  authorAvatarUrl={data.avatarUrl}
                  viewer={viewer}
                  onRequireLogin={onRequireLogin}
                  onOpenContent={openContent}
                  onChange={updatePost}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
