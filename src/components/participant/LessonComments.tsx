// "Обговорення" — the comment thread of a lesson, extracted from
// ProgramExperience.tsx with behaviour unchanged (2026-10-07).
//
// It owns everything that is only about comments: the thread, the compose
// box, edit / delete / report flows and their dialogs. The lesson screen
// gives it the open lesson's id, the viewer and a way to tell the person a
// write failed.
//
// Per-lesson reset: the parent mounts it with key={lessonId + session id}.
// A new key remounts it, which gives exactly what the old effect did when the
// open item (or the viewer) changed — the thread reloads and every draft,
// menu and dialog starts empty.
import { useEffect, useState } from "react";
import { getInitials, type Profile } from "../../lib/auth";
import {
  addComment,
  deleteComment,
  editComment,
  fetchComments,
  reportComment,
  type LessonComment,
} from "../../lib/lessonComments";
import { moderateMessage } from "../../utils/contactFilter";
import { formatRelativeTime } from "../../utils/relativeTime";
import Avatar from "../ui/Avatar";
import { DeleteCommentDialog, ReportCommentDialog } from "./ProgramLessonDialogs";

const REPORT_REASONS = [
  "Спам",
  "Образи / агресія",
  "Неприйнятний контент",
  "Реклама",
  "Порушення правил платформи",
  "Інше",
];

type Props = {
  // The open lesson (content item) id — threads are stored per lesson.
  itemId: string;
  session?: Profile | null;
  // Shows the lesson screen's "не вдалося зберегти …" notice.
  notifyWriteFailed: (what: string) => void;
};

export default function LessonComments({ itemId, session, notifyWriteFailed }: Props) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentWarning, setCommentWarning] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null);
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // Failures (e.g. Supabase not configured here) just leave the thread
  // empty rather than crashing; the cancelled flag drops a late answer for
  // a lesson that is no longer open.
  useEffect(() => {
    let cancelled = false;
    fetchComments(itemId)
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  // Runs the same client-side moderation pipeline used for author
  // messages (utils/contactFilter.ts) — see that file's own header
  // comment for why this is a UX-level filter, not a security boundary,
  // pending a real server-side re-check. Persists to the real
  // content_comments table (lib/lessonComments.ts) — requires a signed-
  // in session, since RLS writes as auth.uid().
  const submitComment = () => {
    if (!commentText.trim() || !session?.id) return;
    const mod = moderateMessage(commentText);
    if (mod.action === "BLOCK") {
      setCommentWarning(mod.categories.includes("PROFANITY") ? "Коментар містить лексику, неприйнятну на Sensoria. Перефразуйте, будь ласка." : "Коментар не може містити контакти для спілкування поза платформою (телефон, email, соцмережі, месенджери чи посилання).");
      return;
    }
    setCommentWarning(null);
    const body = commentText.trim();
    setCommentText("");
    addComment(itemId, {
      userId: session.id,
      authorName: session.name ?? "Ви",
      avatarUrl: session.avatarUrl ?? null,
      body,
    })
      .then((comment) => setComments((prev) => [...prev, comment]))
      .catch(() => setCommentWarning("Не вдалося опублікувати коментар. Спробуйте ще раз."));
  };

  const startEditComment = (c: LessonComment) => {
    setEditingCommentId(c.id);
    setEditCommentText(c.body);
    setOpenCommentMenuId(null);
  };

  const saveEditComment = () => {
    if (!editingCommentId || !editCommentText.trim()) return;
    const body = editCommentText.trim();
    const commentId = editingCommentId;
    setEditingCommentId(null);
    editComment(commentId, body)
      .then(() => {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, body, updatedAt: new Date().toISOString() } : c))
        );
      })
      .catch(() => {
        // Thread stays as it was; tell the person.
        notifyWriteFailed("зміну коментаря");
      });
  };

  const confirmDeleteComment = () => {
    if (!deleteConfirmCommentId) return;
    const commentId = deleteConfirmCommentId;
    setDeleteConfirmCommentId(null);
    deleteComment(commentId)
      .then(() => setComments((prev) => prev.filter((c) => c.id !== commentId)))
      .catch(() => {
        notifyWriteFailed("видалення коментаря");
      });
  };

  const submitCommentReport = () => {
    if (!reportReason || !reportCommentId || !session?.id) return;
    reportComment({ commentId: reportCommentId, reporterId: session.id, reason: reportReason })
      .then(() => setReportSubmitted(true))
      .catch(() => {
        // reportSubmitted stays false so "Надіслати скаргу" can be retried
        // (no false "Дякуємо" for a report that was never saved).
        notifyWriteFailed("скаргу");
      });
  };

  return (
    <>
      {/* COMMENTS — "Обговорення". Real persistence via
          content_comments (see lib/lessonComments.ts), with
          real client-side contact-info moderation
          (utils/contactFilter.ts, the same pipeline as author
          messages) run before every post. Deliberately the
          quietest section on the screen — smaller/lighter header
          than "Про цей урок" above it, and a plain dark post
          button instead of the blue-purple gradient reserved for
          actually moving through the lesson (complete/continue)
          — a discussion thread is an aside, not something that
          should visually compete with the core content.
          2026-09-25 visual correction pass (section 12/14):
          dropped the thin gray divider (spacing does the
          separating instead) and softened the compose box from
          a flat gray-bordered rectangle to a lighter, translucent
          surface, closer to "part of the page" than "a database
          form". */}
      <div>
        <h2 className="text-[14px] font-semibold text-black/65 mb-1">Обговорення</h2>
        <p className="text-[12px] text-black/40 mb-4">Поділіться думкою або поставте запитання автору.</p>

        <div className="mb-6">
          <textarea
            value={commentText}
            onChange={(e) => {
              setCommentText(e.target.value);
              if (commentWarning) setCommentWarning(null);
            }}
            placeholder="Напишіть коментар..."
            rows={2}
            className="w-full rounded-xl border border-black/[0.08] bg-white/60 p-3.5 text-[13px] resize-none focus:outline-none focus:border-black/20 focus:bg-white transition"
          />
          {commentWarning && <div className="text-[12px] text-rose-600 mt-2">{commentWarning}</div>}
          {/* 2026-09-27 GRID/ALIGNMENT pass: was right-aligned
              against the textarea's far edge — moved to sit
              naturally below it, flush with the same left edge
              as everything else in the content grid, matching
              the "Зберегти нотатку" content → input → action
              pattern used by Reflection above. */}
          <button
            onClick={submitComment}
            disabled={!commentText.trim()}
            className="mt-2 px-5 py-2.5 rounded-lg bg-black/85 text-white text-[13px] font-medium hover:bg-black transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Опублікувати
          </button>
        </div>

        {comments.length === 0 ? (
          <div className="text-[13px] text-black/35">Ще немає коментарів. Будьте першим.</div>
        ) : (
          <div className="flex flex-col gap-5">
            {comments.map((c) => {
              const isOwn = !!session?.id && c.userId === session.id;
              const isEditing = editingCommentId === c.id;
              return (
                <div key={c.id} className="flex gap-3">
                  <Avatar avatarUrl={c.avatarUrl} initials={getInitials(c.authorName)} className="w-8 h-8 text-[11px] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[13px] font-medium text-black/75">{c.authorName}</span>
                      {c.isAuthorReply && (
                        <span className="px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#4338ca] text-[11px] font-medium">Автор</span>
                      )}
                      <span className="text-[12px] text-black/35">
                        {formatRelativeTime(c.createdAt)}
                        {c.updatedAt ? " · відредаговано" : ""}
                      </span>
                      <div className="relative ml-auto">
                        <button
                          onClick={() => setOpenCommentMenuId(openCommentMenuId === c.id ? null : c.id)}
                          className="w-6 h-6 rounded-full hover:bg-black/5 text-black/40 text-[13px] transition"
                          aria-label="Дії з коментарем"
                        >
                          ⋯
                        </button>
                        {openCommentMenuId === c.id && (
                          <>
                            {/* Click-outside-to-close — clicking
                                anywhere else on the page used to
                                leave this menu stuck open. */}
                            <div className="fixed inset-0 z-[5]" onClick={() => setOpenCommentMenuId(null)} />
                            <div className="absolute right-0 top-7 z-10 w-44 rounded-xl bg-white border border-black/10 shadow-lg py-1">
                              {isOwn ? (
                                <>
                                  <button
                                    onClick={() => startEditComment(c)}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-black/70 hover:bg-black/5"
                                  >
                                    Редагувати
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmCommentId(c.id);
                                      setOpenCommentMenuId(null);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-[13px] text-rose-600 hover:bg-rose-50"
                                  >
                                    Видалити
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setReportCommentId(c.id);
                                    setReportReason(null);
                                    setReportSubmitted(false);
                                    setOpenCommentMenuId(null);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-[13px] text-black/70 hover:bg-black/5"
                                >
                                  Поскаржитися
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div>
                        <textarea
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-black/10 p-3 text-[14px] resize-none focus:outline-none focus:border-black/30 transition"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={saveEditComment}
                            className="px-4 py-1.5 rounded-lg bg-black text-white text-[12px] font-medium hover:opacity-90 transition"
                          >
                            Зберегти
                          </button>
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="px-4 py-1.5 rounded-lg border border-black/10 text-[12px] text-black/60 hover:bg-black/5 transition"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-black/60 leading-relaxed">{c.body}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteConfirmCommentId && (
        <DeleteCommentDialog onCancel={() => setDeleteConfirmCommentId(null)} onConfirm={confirmDeleteComment} />
      )}

      {reportCommentId && (
        <ReportCommentDialog
          reasons={REPORT_REASONS}
          reason={reportReason}
          submitted={reportSubmitted}
          onReasonChange={setReportReason}
          onClose={() => setReportCommentId(null)}
          onSubmit={submitCommentReport}
        />
      )}
    </>
  );
}
