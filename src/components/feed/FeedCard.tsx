// One post in the feeds, Sensoria style. Layout like Threads: an avatar rail on the left, the content on the right, so
// text, photos and the material line up on one edge however wide the page is.
// Inside: @authors as links, a delicate topic under a blur, a poll, «Питання до автора», «Досвід учасника» (a
// participant's story about a material — its author may ask to show it on the material's page), four gentle reactions
// instead of one heart, «Зберегти».
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import Avatar from "../ui/Avatar";
import { getInitials, type Profile } from "../../lib/auth";
import type { FeedPost, ReactionKind } from "../../lib/authorPosts";
import { answerStoryFeature, REACTIONS, requestStoryFeature, setReaction, setSaved, votePoll } from "../../lib/feed";
import { openAuthorProfile } from "../../context/AuthorProfileContext";
import { clipText, MENTION_RE, splitPostBody } from "../../utils/authorPosts";
import { formatPostDate, formatReviewDate } from "../../utils/authorProfileView";
import ReportButton from "../ReportButton";
import PostComments from "../author/public/PostComments";
import { PostImages, PostVideoEmbed } from "../author/public/PostMedia";

const CLIP = 480;
const AUDIENCE: Record<FeedPost["audience"], string> = { all: "Для всіх", participants: "Для учасників", authors: "Для авторів" };

// text with «@[Ім'я]» turned into links to the author's page
function RichText({ text, mentions }: { text: string; mentions: { id: string; name: string }[] }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    const who = mentions.find((x) => x.name === m[1]);
    parts.push(who
      ? <button key={at} type="button" onClick={() => openAuthorProfile(who.id)} className="font-semibold text-[#4338ca] hover:underline underline-offset-4">@{m[1]}</button>
      : <span key={at} className="font-semibold text-[#4338ca]">@{m[1]}</span>);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function FeedCard({
  post,
  viewer,
  onOpenAuthor,
  onOpenContent,
  headerAction,
  onChange,
  canFeature = false,
}: {
  post: FeedPost;
  viewer: Profile | null;
  onOpenAuthor?: () => void;
  onOpenContent: () => void;
  headerAction?: React.ReactNode;
  onChange: (post: FeedPost) => void;
  // the viewer is the author of the material this participant's story is about
  canFeature?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [revealed, setRevealed] = useState(!post.sensitiveTopic);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const { headline, rest } = splitPostBody(post.body);
  const clipped = clipText(rest, CLIP);
  const att = post.attachment;
  const demo = post.id.startsWith("demo-");
  const mine = !!viewer && viewer.id === post.authorId;
  const story = !post.authorIsAuthor && !!att;
  const amaOpen = !!post.amaUntil && new Date(post.amaUntil).getTime() > Date.now();
  const reactions = post.reactions ?? {};
  const total = Object.values(reactions).reduce((a, b) => a + (b ?? 0), 0) || post.stats.likeCount;
  const top = REACTIONS.filter((r) => (reactions[r.kind] ?? 0) > 0).sort((a, b) => (reactions[b.kind] ?? 0) - (reactions[a.kind] ?? 0)).slice(0, 3);
  const current = REACTIONS.find((r) => r.kind === post.myReaction) ?? (post.stats.liked ? REACTIONS[0] : null);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picker]);

  const react = async (kind: ReactionKind | null) => {
    if (!viewer) return;
    setPicker(false);
    setError(null);
    const prevKind = current?.kind ?? null;
    const next = { ...reactions };
    if (prevKind) next[prevKind] = Math.max(0, (next[prevKind] ?? 1) - 1);
    if (kind) next[kind] = (next[kind] ?? 0) + 1;
    const nextTotal = Object.values(next).reduce((a, b) => a + (b ?? 0), 0);
    onChange({ ...post, reactions: next, myReaction: kind, stats: { ...post.stats, liked: !!kind, likeCount: nextTotal } });
    if (demo) return;
    try { await setReaction(post.id, viewer.id, kind); } catch { onChange(post); setError("Не вдалося зберегти реакцію."); }
  };
  const save = async () => {
    if (!viewer) return;
    const next = !post.saved;
    onChange({ ...post, saved: next });
    if (demo) return;
    try { await setSaved(post.id, viewer.id, next); } catch { onChange(post); }
  };
  const vote = async (i: number) => {
    if (!viewer || post.myVote != null || !post.poll) return;
    const counts = [...(post.pollCounts ?? post.poll.options.map(() => 0))];
    counts[i] = (counts[i] ?? 0) + 1;
    onChange({ ...post, myVote: i, pollCounts: counts });
    if (demo) return;
    try { await votePoll(post.id, viewer.id, i); } catch { onChange(post); setError("Не вдалося зберегти голос."); }
  };
  const feature = async () => {
    try {
      const ok = await requestStoryFeature(post.id);
      if (ok) onChange({ ...post, feature: { requested: true, consented: false } });
      else setError("Показати можна лише досвід із вашим матеріалом.");
    } catch { setError("Не вдалося надіслати запит."); }
  };
  const consent = async (yes: boolean) => {
    try {
      await answerStoryFeature(post.id, yes);
      onChange({ ...post, feature: yes ? { requested: true, consented: true } : null });
    } catch { setError("Не вдалося зберегти відповідь."); }
  };

  const avatar = (
    <span className={`block shrink-0 rounded-full ${post.authorIsAuthor ? "bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] p-[2px]" : "bg-[#ece8fb] p-[2px]"}`}>
      <Avatar avatarUrl={post.authorAvatarUrl} initials={getInitials(post.authorName)} className="h-11 w-11 text-[14px] text-white ring-2 ring-white sm:h-12 sm:w-12" />
    </span>
  );
  const name = <span className={`truncate text-[16px] font-semibold text-[#12172b] ${onOpenAuthor ? "hover:text-[#4338ca]" : ""}`}>{post.authorName}</span>;
  const pollTotal = (post.pollCounts ?? []).reduce((a, b) => a + b, 0);

  return (
    <article className="post-in rounded-[26px] bg-white px-4 py-5 shadow-[0_20px_50px_-40px_rgba(50,40,140,0.6)] ring-1 ring-[#ece8fb] transition hover:ring-[#e0daf8] sm:px-6 sm:py-6">
      <div className="flex gap-3.5 sm:gap-4">
        {onOpenAuthor
          ? <button type="button" onClick={onOpenAuthor} aria-label={`Сторінка автора: ${post.authorName}`} className="self-start rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">{avatar}</button>
          : <span className="self-start">{avatar}</span>}

        <div className="min-w-0 flex-1">
          <header className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {onOpenAuthor ? <button type="button" onClick={onOpenAuthor} className="min-w-0 truncate text-left">{name}</button> : name}
                {post.authorIsAuthor && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef0fd] px-2 py-0.5 text-[11px] font-semibold text-[#4338ca]"><Icon name="check" size={11} /> Автор</span>}
                {story && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><Icon name="leaf" size={11} /> Досвід учасника</span>}
                {amaOpen && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f5f0ff] px-2 py-0.5 text-[11px] font-semibold text-[#7c3aed]"><Icon name="comment" size={11} /> Питання до автора</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-black/45">
                <time dateTime={post.createdAt} title={formatReviewDate(post.createdAt)}>{formatPostDate(post.createdAt)}</time>
                <span aria-hidden="true">·</span>
                <span>{AUDIENCE[post.audience]}</span>
                {post.updatedAt && <><span aria-hidden="true">·</span><span>відредаговано</span></>}
                {post.isPinned && post.audience === "all" && <><span aria-hidden="true">·</span><span className="font-medium text-[#4338ca]">закріплено</span></>}
              </div>
            </div>
            {headerAction}
          </header>

          {post.hiddenAt && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-snug text-amber-900 ring-1 ring-amber-100">Публікацію приховано до перевірки модератором: її бачите лише ви. Якщо все гаразд, вона повернеться в стрічку.</p>
          )}
          {mine && post.feature?.requested && !post.feature.consented && (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] leading-snug text-emerald-900 ring-1 ring-emerald-100">
              Автор матеріалу хоче показати ваш досвід на сторінці матеріалу: ваше ім’я з першою літерою прізвища й текст.
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void consent(true)} className="rounded-xl bg-emerald-700 px-3.5 py-1.5 font-semibold text-white">Погоджуюсь</button>
                <button type="button" onClick={() => void consent(false)} className="rounded-xl bg-white px-3.5 py-1.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">Ні, дякую</button>
              </div>
            </div>
          )}

          {/* content (under a blur when the topic is delicate) */}
          <div className="relative">
            <div className={revealed ? "" : "pointer-events-none select-none blur-[10px]"} aria-hidden={!revealed}>
              <div className="max-w-[68ch]">
                {headline && <h3 className="mt-3 text-[19px] font-bold leading-snug tracking-[-0.01em] text-[#12172b]"><RichText text={headline} mentions={post.mentions ?? []} /></h3>}
                {(rest || !headline) && (
                  <p className={`whitespace-pre-line break-words text-[15.5px] leading-[1.7] text-[#2d2a5c] ${headline ? "mt-1.5" : "mt-3"}`}><RichText text={expanded ? rest : clipped.text} mentions={post.mentions ?? []} /></p>
                )}
                {clipped.clipped && !expanded && (
                  <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-[14px] font-semibold text-[#4338ca] hover:underline underline-offset-4">Читати далі</button>
                )}
              </div>

              {(post.images.length > 0 || post.video) && (
                <div className="mt-4 flex max-w-[680px] flex-col gap-3">
                  {post.images.length > 0 && <PostImages images={post.images} alt={post.imageAlt} />}
                  {post.video && <PostVideoEmbed video={post.video} />}
                </div>
              )}
            </div>
            {!revealed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="mx-3 max-w-[360px] rounded-2xl bg-white/90 px-5 py-4 text-center shadow-[0_14px_36px_-20px_rgba(50,40,140,0.6)] ring-1 ring-[#ece8fb] backdrop-blur">
                  <div className="text-[13px] font-semibold text-[#b45309]">Делікатна тема</div>
                  <div className="mt-0.5 text-[14px] text-[#2d2a5c]">{post.sensitiveTopic}</div>
                  <button type="button" onClick={() => setRevealed(true)} className="mt-3 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff]">Показати</button>
                </div>
              </div>
            )}
          </div>

          {/* poll */}
          {post.poll && revealed && (
            <div className="mt-4 max-w-[560px] rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#ece8fb]">
              {post.poll.question && <div className="mb-3 text-[15px] font-semibold text-[#12172b]">{post.poll.question}</div>}
              <div className="flex flex-col gap-2">
                {post.poll.options.map((o, i) => {
                  const n = post.pollCounts?.[i] ?? 0;
                  const pct = pollTotal ? Math.round((n / pollTotal) * 100) : 0;
                  const voted = post.myVote != null;
                  return voted ? (
                    <div key={i} className="relative overflow-hidden rounded-xl bg-white ring-1 ring-[#ece8fb]">
                      <span className={`absolute inset-y-0 left-0 ${post.myVote === i ? "bg-gradient-to-r from-[#dfe4ff] to-[#ece4ff]" : "bg-[#f3f1fb]"}`} style={{ width: `${pct}%` }} />
                      <span className="relative flex items-center justify-between gap-3 px-3.5 py-2.5 text-[14px]">
                        <span className={post.myVote === i ? "font-semibold text-[#4338ca]" : "text-[#2d2a5c]"}>{o}{post.myVote === i ? " ✓" : ""}</span>
                        <span className="tabular-nums font-semibold text-black/60">{pct}%</span>
                      </span>
                    </div>
                  ) : (
                    <button key={i} type="button" onClick={() => void vote(i)} disabled={!viewer} className="rounded-xl bg-white px-3.5 py-2.5 text-left text-[14px] font-medium text-[#2d2a5c] ring-1 ring-[#e3def9] transition hover:bg-[#f6f4ff] hover:ring-[#c9bff7]">{o}</button>
                  );
                })}
              </div>
              <div className="mt-2 text-[12px] text-black/45">{pollTotal > 0 ? `Проголосували: ${pollTotal}` : "Будьте першим"} · анонімно</div>
            </div>
          )}

          {/* attached material */}
          {att && revealed && (
            <div className="mt-4 flex max-w-[680px] items-center gap-3.5 rounded-2xl bg-gradient-to-r from-[#f6f4ff] to-[#eef0fd] p-3.5 ring-1 ring-[#e4def9]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#5b3df5] shadow-[0_6px_14px_-8px_rgba(91,61,245,0.5)]"><Icon name={att.kind} size={22} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d5bd0]">{story ? "Про матеріал" : post.isShare ? "Ділиться матеріалом" : "Матеріал автора"}</div>
                {att.unavailable
                  ? <div className="mt-0.5 text-[14px] text-black/55">Матеріал більше недоступний</div>
                  : <><div className="mt-0.5 truncate text-[15px] font-semibold text-[#12172b]">{att.title}</div><div className="text-[12px] text-black/55">{att.meta}</div></>}
              </div>
              {!att.unavailable && <button type="button" onClick={onOpenContent} className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] transition hover:bg-[#f6f4ff]">Відкрити →</button>}
            </div>
          )}
          {story && canFeature && !mine && (
            <div className="mt-2 text-[13px]">
              {post.feature?.consented
                ? <span className="font-medium text-emerald-700">Показано на сторінці матеріалу</span>
                : post.feature?.requested
                  ? <span className="text-black/50">Запит надіслано: чекаємо згоди учасника</span>
                  : <button type="button" onClick={() => void feature()} className="font-semibold text-emerald-700 hover:underline">Показати цей досвід на сторінці матеріалу</button>}
            </div>
          )}

          {/* summary, like LinkedIn: reactions on the left, comments on the right */}
          {(total > 0 || post.stats.commentCount > 0) && (
            <div className="mt-3 flex max-w-[680px] items-center gap-2 pb-2 text-[13px] text-black/50">
              {total > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {top.map((r) => (
                      <span key={r.kind} title={`${r.label}: ${reactions[r.kind] ?? 0}`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white ring-2 ring-white" style={{ background: r.color }}>
                        <Icon name={r.icon} size={12} filled={r.icon === "heart"} />
                      </span>
                    ))}
                  </span>
                  <span className="tabular-nums">{total}</span>
                </span>
              )}
              {post.stats.commentCount > 0 && (
                <button type="button" onClick={() => setCommentsOpen(true)} className="ml-auto tabular-nums hover:text-[#4338ca] hover:underline">
                  {post.stats.commentCount} {post.stats.commentCount % 10 === 1 && post.stats.commentCount % 100 !== 11 ? "коментар" : [2, 3, 4].includes(post.stats.commentCount % 10) && ![12, 13, 14].includes(post.stats.commentCount % 100) ? "коментарі" : "коментарів"}
                </button>
              )}
            </div>
          )}

          {/* actions */}
          <div className="-ml-2.5 flex max-w-[690px] items-center gap-1 border-t border-[#f1eefb] pt-1.5">
            <div
              ref={pickerRef}
              className="relative"
              onMouseEnter={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setPicker(true), 450); }}
              onMouseLeave={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setPicker(false), 300); }}
            >
              {/* one tap = «Підтримую» (or takes the reaction back); hold / hover = choose another, like LinkedIn */}
              <button
                type="button"
                onClick={() => { if (picker) return; void react(current ? null : "support"); }}
                onContextMenu={(e) => { e.preventDefault(); setPicker(true); }}
                onTouchStart={() => { pressTimer.current = window.setTimeout(() => setPicker(true), 450); }}
                onTouchEnd={() => window.clearTimeout(pressTimer.current)}
                onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); setPicker(true); } }}
                aria-label={current ? `Прибрати реакцію «${current.label}»` : "Підтримую (утримуйте, щоб обрати іншу реакцію)"}
                aria-haspopup="menu"
                aria-expanded={picker}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold transition ${current ? "hover:bg-[#f6f4ff]" : "text-black/55 hover:bg-[#f6f4ff] hover:text-[#7c3aed]"}`}
                style={current ? { color: current.color } : undefined}
              >
                <span key={current?.kind ?? "none"} className={current ? "animate-[pop_0.25s_ease-out]" : ""}><Icon name={current?.icon ?? "heart"} size={19} filled={!!current && current.icon === "heart"} /></span>
                {current ? current.label : "Підтримую"}
              </button>
              {picker && (
                <div className="absolute bottom-full left-0 z-30 mb-1.5 flex items-end gap-1 rounded-full bg-white px-2 py-1.5 shadow-[0_14px_36px_-12px_rgba(60,40,160,0.45)] ring-1 ring-[#ebe8ff] animate-[pickerIn_0.16s_ease-out]" role="menu" aria-label="Реакції">
                  {REACTIONS.map((r, i) => (
                    <button
                      key={r.kind}
                      type="button"
                      role="menuitem"
                      onClick={() => void react(r.kind)}
                      aria-label={r.label}
                      className="group/r relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-150 hover:-translate-y-1.5 hover:scale-125 focus:-translate-y-1.5 focus:scale-125 focus:outline-none"
                      style={{ background: r.color, animationDelay: `${i * 30}ms` }}
                    >
                      <Icon name={r.icon} size={20} filled={r.icon === "heart"} />
                      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#12172b] px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover/r:opacity-100 group-focus/r:opacity-100">{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-expanded={commentsOpen}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition ${commentsOpen ? "bg-[#f6f4ff] text-[#4338ca]" : "text-black/55 hover:bg-[#f6f4ff] hover:text-[#4338ca]"}`}
            >
              <Icon name="comment" size={19} />
              {amaOpen ? "Поставити питання" : "Коментувати"}
            </button>
            <button type="button" onClick={() => void save()} aria-pressed={!!post.saved} aria-label={post.saved ? "Прибрати зі збережених" : "Зберегти"} className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition ${post.saved ? "text-[#4338ca]" : "text-black/55 hover:bg-[#f6f4ff] hover:text-[#4338ca]"}`}>
              <Icon name="bookmark" size={19} filled={!!post.saved} /> <span className="hidden sm:inline">{post.saved ? "Збережено" : "Зберегти"}</span>
            </button>
            <span className="ml-auto opacity-70 transition hover:opacity-100">
              {!demo && <ReportButton type="post" targetId={post.id} ownerId={post.authorId} label={`Публікація: ${clipText(post.body, 80).text}`} viewerId={viewer?.id} />}
            </span>
          </div>
          {error && <p role="status" className="mt-1 text-[13px] text-rose-600">{error}</p>}

          {commentsOpen && (
            <div className="mt-2 max-w-[680px] rounded-2xl bg-[#fbfaff] px-4 py-4 ring-1 ring-[#f1eefb]">
              {amaOpen && <p className="mb-2 text-[13px] text-[#7c3aed]">Питання приймаються до {new Date(post.amaUntil!).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}. Автор відповідає й закріплює найкращі відповіді зверху.</p>}
              {demo
                ? <p className="text-[13px] text-[#4a2fd0]">Демо: коментарі з’являться у справжніх публікаціях.</p>
                : <PostComments postId={post.id} postAuthorId={post.authorId} viewer={viewer} onRequireLogin={() => {}} onCountChange={(d) => onChange({ ...post, stats: { ...post.stats, commentCount: Math.max(0, post.stats.commentCount + d) } })} />}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
