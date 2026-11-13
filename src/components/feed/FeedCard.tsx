// One post in the feeds, Sensoria style: who wrote it (clickable to the author's page), «Підписатися» or the own-post
// menu, the text (first short line = title), photos / video, an attached material and a quiet action bar.
import { useState } from "react";
import { Icon } from "../ui/Icon";
import Avatar from "../ui/Avatar";
import { getInitials, type Profile } from "../../lib/auth";
import type { FeedPost } from "../../lib/authorPosts";
import { clipText, splitPostBody } from "../../utils/authorPosts";
import { formatPostDate, formatReviewDate } from "../../utils/authorProfileView";
import ReportButton from "../ReportButton";
import PostComments from "../author/public/PostComments";
import { PostImages, PostVideoEmbed } from "../author/public/PostMedia";
import { usePostLike } from "../author/public/PostCard";

const CLIP = 420;
const AUDIENCE: Record<FeedPost["audience"], string> = { all: "Для всіх", participants: "Для учасників", authors: "Для авторів" };

export default function FeedCard({
  post,
  viewer,
  onOpenAuthor,
  onOpenContent,
  headerAction,
  onChange,
}: {
  post: FeedPost;
  viewer: Profile | null;
  onOpenAuthor?: () => void;
  onOpenContent: () => void;
  headerAction?: React.ReactNode;
  onChange: (post: FeedPost) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { headline, rest } = splitPostBody(post.body);
  const clipped = clipText(rest, CLIP);
  const { like, likeError } = usePostLike(post, viewer, () => {}, (p) => onChange({ ...post, ...p }));
  const att = post.attachment;
  const demo = post.id.startsWith("demo-");

  const who = (
    <>
      <span className={`relative shrink-0 rounded-full ${post.authorIsAuthor ? "bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] p-[2px]" : ""}`}>
        <Avatar avatarUrl={post.authorAvatarUrl} initials={getInitials(post.authorName)} className="h-12 w-12 text-[15px] text-white ring-2 ring-white" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`truncate text-[16px] font-semibold text-[#12172b] ${onOpenAuthor ? "group-hover:text-[#4338ca]" : ""}`}>{post.authorName}</span>
          {post.authorIsAuthor && <span className="shrink-0 rounded-full bg-[#eef0fd] px-2 py-0.5 text-[11px] font-semibold text-[#4338ca]">Автор</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-black/50">
          <time dateTime={post.createdAt} title={formatReviewDate(post.createdAt)}>{formatPostDate(post.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{AUDIENCE[post.audience]}</span>
          {post.updatedAt && <><span aria-hidden="true">·</span><span>відредаговано</span></>}
          {post.isPinned && post.audience === "all" && <><span aria-hidden="true">·</span><span className="font-medium text-[#4338ca]">закріплено</span></>}
        </span>
      </span>
    </>
  );

  return (
    <article className="post-in rounded-[24px] bg-white shadow-[0_18px_44px_-36px_rgba(60,50,140,0.55)] ring-1 ring-[#ece8fb]">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <header className="flex items-center gap-3">
          {onOpenAuthor ? (
            <button type="button" onClick={onOpenAuthor} className="group flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Сторінка автора: ${post.authorName}`}>{who}</button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">{who}</div>
          )}
          {headerAction}
        </header>

        {post.hiddenAt && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-100">Публікацію приховано до перевірки модератором: її бачите лише ви. Якщо все гаразд, вона повернеться в стрічку.</p>
        )}
        {headline && <h3 className="mt-4 text-[19px] font-bold leading-snug text-[#12172b]">{headline}</h3>}
        {(rest || !headline) && (
          <p className={`whitespace-pre-line break-words text-[15.5px] leading-[1.65] text-[#2d2a5c] ${headline ? "mt-2" : "mt-4"}`}>{expanded ? rest : clipped.text}</p>
        )}
        {clipped.clipped && !expanded && (
          <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-[14px] font-semibold text-[#4338ca] hover:underline underline-offset-4">Читати далі</button>
        )}
      </div>

      {(post.images.length > 0 || post.video) && (
        <div className="mt-4 flex flex-col gap-3 px-3 sm:px-4">
          {post.images.length > 0 && <PostImages images={post.images} alt={post.imageAlt} />}
          {post.video && <PostVideoEmbed video={post.video} />}
        </div>
      )}

      {att && (
        <div className="mx-5 mt-4 flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-[#f6f4ff] to-[#eef0fd] p-3.5 ring-1 ring-[#e4def9] sm:mx-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#5b3df5] shadow-[0_6px_14px_-8px_rgba(91,61,245,0.5)]"><Icon name={att.kind} size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d5bd0]">{post.isShare ? "Ділиться матеріалом" : "Матеріал автора"}</div>
            {att.unavailable
              ? <div className="mt-0.5 text-[14px] text-black/55">Матеріал більше недоступний</div>
              : <><div className="mt-0.5 truncate text-[15px] font-semibold text-[#12172b]">{att.title}</div><div className="text-[12px] text-black/55">{att.meta}</div></>}
          </div>
          {!att.unavailable && (
            <button type="button" onClick={onOpenContent} className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] transition hover:bg-[#f6f4ff]">Відкрити →</button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1 border-t border-[#f1eefb] px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => void like()}
          aria-pressed={post.stats.liked}
          aria-label={post.stats.liked ? "Прибрати вподобання" : "Вподобати"}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3 text-[14px] font-medium transition ${post.stats.liked ? "text-[#7c3aed]" : "text-black/60 hover:bg-[#f6f4ff] hover:text-[#4338ca]"}`}
        >
          <Icon name="heart" size={19} filled={post.stats.liked} />
          {post.stats.likeCount > 0 ? post.stats.likeCount : "Подобається"}
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          aria-expanded={commentsOpen}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3 text-[14px] font-medium transition ${commentsOpen ? "bg-[#f6f4ff] text-[#4338ca]" : "text-black/60 hover:bg-[#f6f4ff] hover:text-[#4338ca]"}`}
        >
          <Icon name="comment" size={19} />
          {post.stats.commentCount > 0 ? `${post.stats.commentCount}` : "Коментувати"}
        </button>
        {likeError && <span role="status" className="text-[13px] text-rose-600">Не вдалося зберегти</span>}
        <span className="ml-auto">
          {!demo && <ReportButton type="post" targetId={post.id} ownerId={post.authorId} label={`Публікація: ${clipText(post.body, 80).text}`} viewerId={viewer?.id} />}
        </span>
      </div>

      {commentsOpen && (
        <div className="border-t border-[#f1eefb] bg-[#fbfaff] px-5 py-4 sm:px-6 rounded-b-[24px]">
          {demo
            ? <p className="text-[13px] text-[#4a2fd0]">Демо: коментарі з’являться у справжніх публікаціях.</p>
            : <PostComments postId={post.id} postAuthorId={post.authorId} viewer={viewer} onRequireLogin={() => {}} onCountChange={(d) => onChange({ ...post, stats: { ...post.stats, commentCount: Math.max(0, post.stats.commentCount + d) } })} />}
        </div>
      )}
    </article>
  );
}
