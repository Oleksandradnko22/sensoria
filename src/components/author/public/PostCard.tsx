// AuthorPost — THE publication component of Sensoria's author profile.
// One structure for every post, whatever it contains:
//
//   author row  (avatar · name · "Автор Sensoria · date [· Закріплено]")
//   title       (optional)
//   body
//   media       (optional: image / carousel / video — see PostMedia)
//   material    (optional: attached Sensoria material, a quiet attachment)
//   actions     (♡ like · Обговорення)
//
// Order and rhythm never change with the content. Each post is one calm
// white card; the text keeps a readable measure while media and the
// attached material use the full card width.
// Typography comes from the single token set below.
import { useState } from "react";
import { Icon } from "../../ui/Icon";
import Avatar from "../../ui/Avatar";
import { getInitials, type Profile } from "../../../lib/auth";
import { setPostLiked, type AuthorPost } from "../../../lib/authorPosts";
import { clipText, splitPostBody, toggleLike } from "../../../utils/authorPosts";
import { formatPostDate, formatReviewDate } from "../../../utils/authorProfileView";
import ReportButton from "../../ReportButton";
import PostComments from "./PostComments";
import { PT } from "./profileType";
import { PostImages, PostVideoEmbed } from "./PostMedia";

const LONG_CLIP = 640;

// Sizes come from profileType.ts (the profile-wide font rule).
const T = {
  name: "text-[16px] font-semibold leading-tight text-black/90",
  meta: "text-[14px] leading-tight text-black/60",
  measure: "max-w-[68ch]",
  pinned: "text-[14px] font-medium text-[#4338ca]",
  title: `${PT.title} text-black/90 max-w-[68ch]`,
  body: `${PT.body} text-black/80 max-w-[68ch]`,
  action: "text-[14px] leading-none",
  gap: "mt-3",
};


export function usePostLike(
  post: AuthorPost,
  viewer: Profile | null | undefined,
  onRequireLogin: () => void,
  onChange: (post: AuthorPost) => void
) {
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState(false);
  const canLike = !!viewer;
  const like = async () => {
    if (!viewer) return onRequireLogin();
    if (!canLike || likeBusy) return;
    const next = toggleLike(post.stats);
    setLikeBusy(true);
    setLikeError(false);
    onChange({ ...post, stats: next }); // optimistic
    if (post.id.startsWith("demo-")) { setLikeBusy(false); return; } // demo feed: nothing to save
    try {
      await setPostLiked(post.id, viewer.id, next.liked);
    } catch {
      onChange({ ...post, stats: post.stats });
      setLikeError(true);
    } finally {
      setLikeBusy(false);
    }
  };
  return { like, likeError };
}

type Props = {
  post: AuthorPost;
  authorName: string;
  authorAvatarUrl: string | null;
  viewer: Profile | null | undefined;
  pinned?: boolean;
  // post opened on its own page: discussion open, text unclipped
  detail?: boolean;
  // in the feed the title opens the post page
  onOpen?: () => void;
  onRequireLogin: () => void;
  onOpenContent: (kind: "program" | "guide" | "meditation", id: string) => void;
  onChange: (post: AuthorPost) => void;
  // feeds: who wrote it (avatar + name, clickable to the author's page) and what sits on the right («Підписатися», own menu)
  showAuthor?: boolean;
  authorLabel?: string;
  onOpenAuthor?: () => void;
  headerAction?: React.ReactNode;
};

export default function PostCard({
  post,
  authorName,
  authorAvatarUrl,
  viewer,
  pinned,
  detail = false,
  onOpen,
  onRequireLogin,
  onOpenContent,
  onChange,
  showAuthor = false,
  authorLabel,
  onOpenAuthor,
  headerAction,
}: Props) {
  const [expanded, setExpanded] = useState(detail);
  const [commentsOpen, setCommentsOpen] = useState(detail);
  const { headline, rest } = splitPostBody(post.body);
  const clipped = clipText(rest, LONG_CLIP);
  const { like, likeError } = usePostLike(post, viewer, onRequireLogin, onChange);
  const att = post.attachment;
  const hasMedia = post.images.length > 0 || !!post.video;

  return (
    <article
      className={`post-in flex flex-col rounded-2xl border px-4 sm:px-7 py-5 sm:py-6 text-black ${
        pinned ? "bg-[#fafaff] border-[#4338ca]/20" : "bg-white border-black/[0.06]"
      }`}
    >
      {showAuthor && (
        <div className="flex items-center gap-3">
          {onOpenAuthor ? (
            <button type="button" onClick={onOpenAuthor} className="group flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Сторінка автора: ${authorName}`}>
              <Avatar avatarUrl={authorAvatarUrl} initials={getInitials(authorName)} className="w-11 h-11 shrink-0 text-[14px] text-white" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-[#12172b] group-hover:underline underline-offset-4">{authorName}</span>
                <span className={`${T.meta} block`}>{authorLabel ? `${authorLabel} · ` : ""}<time dateTime={post.createdAt} title={formatReviewDate(post.createdAt)}>{formatPostDate(post.createdAt)}</time>{post.updatedAt ? " · відредаговано" : ""}</span>
              </span>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar avatarUrl={authorAvatarUrl} initials={getInitials(authorName)} className="w-11 h-11 shrink-0 text-[14px] text-white" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-[#12172b]">{authorName}</span>
                <span className={`${T.meta} block`}>{authorLabel ? `${authorLabel} · ` : ""}<time dateTime={post.createdAt} title={formatReviewDate(post.createdAt)}>{formatPostDate(post.createdAt)}</time>{post.updatedAt ? " · відредаговано" : ""}</span>
              </span>
            </div>
          )}
          {headerAction}
        </div>
      )}
      {/* meta row: no repeated author name in the feed — it is the author's own page */}
      <div className={`flex items-center gap-2 ${showAuthor && !pinned ? "hidden" : ""}`}>
        {detail && (
          <>
            <Avatar avatarUrl={authorAvatarUrl} initials={getInitials(authorName)} className="w-8 h-8 text-[12px] text-white" />
            <span className={T.name}>{authorName}</span>
            <span aria-hidden className={T.meta}>
              ·
            </span>
          </>
        )}
        <div className={`${T.meta} flex flex-wrap items-center gap-x-1.5`}>
          <time dateTime={post.createdAt} title={formatReviewDate(post.createdAt)}>
            {formatPostDate(post.createdAt)}
          </time>
          {post.updatedAt && <span>· відредаговано</span>}
          {pinned && (
            <span className={`${T.pinned} inline-flex items-center gap-1 ml-1`}>
              <Icon name="bookmark" size={12} filled />
              Закріплено
            </span>
          )}
        </div>
      </div>

      {/* title (optional) + body */}
      {headline && (
        <h3 className={`${T.title} mt-3`}>
          {!detail && onOpen ? (
            <button onClick={onOpen} className="text-left py-2.5 -my-2.5 hover:underline underline-offset-4 decoration-black/25">
              {headline}
            </button>
          ) : (
            headline
          )}
        </h3>
      )}
      <p className={`${T.body} whitespace-pre-line break-words ${headline ? "mt-2" : "mt-3"}`}>{expanded ? rest : clipped.text}</p>
      {clipped.clipped && !expanded && (
        <button onClick={() => setExpanded(true)} className="mt-1 py-3 -my-2 text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
          Читати далі
        </button>
      )}

      {/* media (optional) */}
      {hasMedia && (
        <div className="mt-4 flex flex-col gap-3">
          {post.images.length > 0 && <PostImages images={post.images} alt={post.imageAlt} />}
          {post.video && <PostVideoEmbed video={post.video} />}
        </div>
      )}

      {/* attached material (optional) */}
      {att && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-black/[0.1] bg-[#f8f8fc] px-3.5 py-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
            <Icon name={att.kind} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-black/55">
              {post.isShare ? "Поділився матеріалом" : "Рекомендований матеріал"}
            </div>
            {att.unavailable ? (
              <div className="text-[14px] text-black/55 mt-0.5">Матеріал більше недоступний</div>
            ) : (
              <>
                <div className="text-[14px] font-semibold text-black/90 leading-snug mt-0.5">{att.title}</div>
                <div className="text-[12px] text-black/60">{att.meta}</div>
              </>
            )}
          </div>
          {!att.unavailable && (
            <button
              onClick={() => onOpenContent(att.kind, att.id)}
              aria-label={`Відкрити: ${att.title}`}
              className="shrink-0 w-11 h-11 rounded-full bg-white border border-[#4338ca]/30 text-[#4338ca] flex items-center justify-center hover:bg-[#eef0fd] transition-colors"
            >
              <span aria-hidden className="text-[16px] leading-none">→</span>
            </button>
          )}
        </div>
      )}

      {/* actions */}
      <div className={`mt-auto pt-4 flex items-center gap-2 ${T.action}`}>
        <button
          onClick={like}
          aria-pressed={post.stats.liked}
          aria-label={post.stats.liked ? "Прибрати вподобання" : "Вподобати"}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full border transition-colors ${
            post.stats.liked
              ? "border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca]"
              : "border-black/[0.12] text-black/65 hover:bg-black/[0.04] hover:text-black"
          }`}
        >
          <Icon name="heart" size={18} filled={post.stats.liked} />
          {post.stats.likeCount > 0 && <span>{post.stats.likeCount}</span>}
        </button>
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          aria-expanded={commentsOpen}
          aria-controls={`comments-${post.id}`}
          className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full border transition-colors ${
            commentsOpen
              ? "border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca]"
              : "border-black/[0.12] text-black/65 hover:bg-black/[0.04] hover:text-black"
          }`}
        >
          <Icon name="comment" size={18} />
          <span>{post.stats.commentCount > 0 ? `Обговорення · ${post.stats.commentCount}` : "Обговорити"}</span>
        </button>
        <ReportButton
          type="post"
          targetId={post.id}
          ownerId={post.authorId}
          label={`Публікація: ${clipText(post.body, 80).text}`}
          viewerId={viewer?.id}
        />
        {likeError && <span role="status" className="text-[14px] text-rose-600">Не вдалося зберегти</span>}
      </div>

      {commentsOpen && post.id.startsWith("demo-") && (
        <p className="mt-3 rounded-xl bg-[#f6f4ff] px-4 py-3 text-[13px] text-[#4a2fd0]">Демо: коментарі з’являться у справжніх публікаціях.</p>
      )}
      {commentsOpen && !post.id.startsWith("demo-") && (
        <div className="mt-3" id={`comments-${post.id}`}>
          <PostComments
            postId={post.id}
            postAuthorId={post.authorId}
            viewer={viewer}
            onRequireLogin={onRequireLogin}
            onCountChange={(delta) =>
              onChange({ ...post, stats: { ...post.stats, commentCount: Math.max(0, post.stats.commentCount + delta) } })
            }
          />
        </div>
      )}
    </article>
  );
}
