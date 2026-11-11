// Discussion under one author publication. Loaded lazily when the post's
// comments are opened. Participants comment at the top level; only the
// post's author replies (shown with an "Автор" mark). Own comments can be
// edited / deleted, others reported. Text goes through the shared contact
// filter (utils/authorPosts.checkPublicText → utils/contactFilter).
import { useEffect, useMemo, useState } from "react";
import Avatar from "../../ui/Avatar";
import { getInitials, type Profile } from "../../../lib/auth";
import {
  addPostComment,
  deletePostComment,
  editPostComment,
  fetchPostComments,
  reportPostComment,
  type PostComment,
} from "../../../lib/authorPosts";
import { COMMENT_MAX, checkPublicText, threadComments } from "../../../utils/authorPosts";
import { formatRelativeTime } from "../../../utils/relativeTime";
import { DeleteCommentDialog, ReportCommentDialog } from "../../participant/ProgramLessonDialogs";

const REPORT_REASONS = [
  "Спам",
  "Образи / агресія",
  "Неприйнятний контент",
  "Реклама",
  "Порушення правил платформи",
  "Інше",
];

type Props = {
  postId: string;
  postAuthorId: string;
  viewer: Profile | null | undefined;
  onRequireLogin: () => void;
  onCountChange: (delta: number) => void;
};

export default function PostComments({ postId, postAuthorId, viewer, onRequireLogin, onCountChange }: Props) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = () => {
    setState("loading");
    fetchPostComments(postId, postAuthorId)
      .then((rows) => {
        setComments(rows);
        setState("ready");
      })
      .catch(() => setState("error"));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [postId]);

  const isPostAuthor = !!viewer && viewer.id === postAuthorId;
  const canWrite = !!viewer && (viewer.role === "participant" || isPostAuthor);
  const threads = useMemo(() => threadComments(comments), [comments]);
  const [shown, setShown] = useState(20);

  const [draft, setDraft] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyNotice, setReplyNotice] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuId(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuId]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const post = async (text: string, parentId: string | null, setNotice: (m: string | null) => void) => {
    if (!viewer) return false;
    const check = checkPublicText(text, COMMENT_MAX);
    if (!check.ok) {
      setNotice(check.message);
      return false;
    }
    setNotice(null);
    try {
      const c = await addPostComment({
        postId,
        userId: viewer.id,
        parentId,
        body: text,
        authorName: viewer.name ?? "Ви",
        avatarUrl: viewer.avatarUrl ?? null,
        postAuthorId,
      });
      setComments((prev) => [...prev, c]);
      onCountChange(1);
      return true;
    } catch {
      setNotice("Не вдалося опублікувати. Спробуйте ще раз — ваш текст збережено в полі.");
      return false;
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const check = checkPublicText(editDraft, COMMENT_MAX);
    if (!check.ok) {
      setEditNotice(check.message);
      return;
    }
    try {
      await editPostComment(editingId, editDraft);
      const id = editingId;
      const body = editDraft.trim();
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body, updatedAt: new Date().toISOString() } : c)));
      setEditingId(null);
      setEditNotice(null);
    } catch {
      setEditNotice("Не вдалося зберегти зміни. Спробуйте ще раз.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await deletePostComment(id);
      // Replies of a deleted top-level comment are removed with it (FK cascade).
      const removed = comments.filter((c) => c.id === id || c.parentId === id).length;
      setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
      onCountChange(-removed);
    } catch {
      setRowError("Не вдалося видалити коментар. Спробуйте ще раз.");
    }
  };

  const submitReport = async () => {
    if (!reportReason || !reportId || !viewer) return;
    try {
      await reportPostComment({ commentId: reportId, reporterId: viewer.id, reason: reportReason });
      setReportSent(true);
    } catch {
      setRowError("Не вдалося надіслати скаргу. Спробуйте ще раз.");
    }
  };

  const renderOne = (c: PostComment, canReply: boolean) => {
    const own = !!viewer && c.userId === viewer.id;
    return (
      <div key={c.id} className="flex gap-3">
        <Avatar avatarUrl={c.avatarUrl} initials={getInitials(c.authorName)} className="w-8 h-8 text-[12px] text-white" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium text-black/80">{c.authorName}</span>
            {c.isAuthor && (
              <span className="px-2 py-0.5 rounded-full bg-[#eef2ff] text-[#4338ca] text-[12px] font-semibold tracking-wide uppercase">
                Автор
              </span>
            )}
            <span className="text-[12px] text-black/60">
              {formatRelativeTime(c.createdAt)}
              {c.updatedAt ? " · відредаговано" : ""}
            </span>
            {viewer && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                  aria-label="Дії з коментарем"
                  aria-haspopup="menu"
                  aria-expanded={menuId === c.id}
                  className="w-11 h-11 -my-2.5 -mr-2.5 rounded-full hover:bg-black/5 text-black/55 text-[16px]"
                >
                  ⋯
                </button>
                {menuId === c.id && (
                  <>
                    <div className="fixed inset-0 z-[5]" onClick={() => setMenuId(null)} />
                    <div role="menu" className="absolute right-0 top-9 z-10 w-44 rounded-xl bg-white border border-black/10 shadow-lg py-1">
                      {own ? (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(c.id);
                              setEditDraft(c.body);
                              setEditNotice(null);
                              setMenuId(null);
                            }}
                            role="menuitem"
                            className="w-full text-left px-3.5 py-3 text-[14px] text-black/70 hover:bg-black/5"
                          >
                            Редагувати
                          </button>
                          <button
                            onClick={() => {
                              setDeleteId(c.id);
                              setMenuId(null);
                            }}
                            role="menuitem"
                            className="w-full text-left px-3.5 py-3 text-[14px] text-rose-600 hover:bg-rose-50"
                          >
                            Видалити
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setReportId(c.id);
                            setReportReason(null);
                            setReportSent(false);
                            setMenuId(null);
                          }}
                          role="menuitem"
                          className="w-full text-left px-3.5 py-3 text-[14px] text-black/70 hover:bg-black/5"
                        >
                          Поскаржитися
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {editingId === c.id ? (
            <div className="mt-1.5">
              <textarea
                value={editDraft}
                onChange={(e) => {
                  setEditDraft(e.target.value);
                  setEditNotice(null);
                }}
                rows={2}
                maxLength={COMMENT_MAX}
                className="w-full rounded-xl border border-black/10 bg-white text-black p-3 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/30"
              />
              {editNotice && <div className="text-[12px] text-rose-600 mt-1.5">{editNotice}</div>}
              <div className="flex gap-2 mt-2">
                <button onClick={saveEdit} className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[12px] font-medium">
                  Зберегти
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-1.5 rounded-lg border border-black/10 text-[12px] text-black/60 hover:bg-black/5"
                >
                  Скасувати
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-black/70 mt-1 whitespace-pre-line break-words">{c.body}</p>
          )}

          {canReply && replyTo !== c.id && (
            <button
              onClick={() => {
                setReplyTo(c.id);
                setReplyDraft("");
                setReplyNotice(null);
              }}
              className="text-[12px] font-medium text-[#4338ca] hover:underline mt-1.5"
            >
              Відповісти
            </button>
          )}
          {canReply && replyTo === c.id && (
            <div className="mt-2">
              <textarea
                value={replyDraft}
                onChange={(e) => {
                  setReplyDraft(e.target.value);
                  setReplyNotice(null);
                }}
                rows={2}
                maxLength={COMMENT_MAX}
                placeholder="Ваша відповідь…"
                className="w-full rounded-xl border border-black/10 bg-white text-black p-3 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/30"
              />
              {replyNotice && <div className="text-[12px] text-rose-600 mt-1.5">{replyNotice}</div>}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={async () => {
                    if (replying) return;
                    setReplying(true);
                    if (await post(replyDraft, c.id, setReplyNotice)) {
                      setReplyTo(null);
                      setReplyDraft("");
                    }
                    setReplying(false);
                  }}
                  disabled={!replyDraft.trim() || replying}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[12px] font-medium disabled:opacity-30"
                >
                  Відповісти
                </button>
                <button
                  onClick={() => setReplyTo(null)}
                  className="px-4 py-1.5 rounded-lg border border-black/10 text-[12px] text-black/60 hover:bg-black/5"
                >
                  Скасувати
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.06]">
      {state === "loading" && (
        <div className="animate-pulse flex flex-col gap-3" aria-busy="true">
          <div className="h-3 w-1/3 rounded bg-black/[0.06]" />
          <div className="h-3 w-3/4 rounded bg-black/[0.04]" />
        </div>
      )}
      {state === "error" && (
        <div className="text-[14px] text-black/55" role="alert">
          Не вдалося завантажити коментарі.{" "}
          <button onClick={load} className="underline font-medium text-black/70">
            Спробувати ще раз
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          {threads.length === 0 ? (
            <p className="text-[14px] text-black/60">Коментарів поки немає.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {threads.slice(0, shown).map(({ comment, replies }) => (
                <div key={comment.id}>
                  {renderOne(comment, isPostAuthor && !comment.isAuthor)}
                  {replies.length > 0 && (
                    <div className="ml-11 mt-3 pl-3 border-l-2 border-[#4338ca]/15 flex flex-col gap-4">
                      {replies.map((r) => renderOne(r, false))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {threads.length > shown && (
            <button onClick={() => setShown((n) => n + 20)} className="mt-4 min-h-[44px] text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
              Показати ще коментарі ({threads.length - shown})
            </button>
          )}
          {rowError && (
            <div className="text-[12px] text-rose-600 mt-3" role="alert">
              {rowError}
            </div>
          )}

          {/* Compose: participants only (the author answers under comments). */}
          {viewer?.role === "participant" ? (
            <div className="mt-5">
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDraftNotice(null);
                }}
                rows={2}
                maxLength={COMMENT_MAX}
                placeholder="Поділіться думкою або запитайте автора…"
                className="w-full rounded-xl border border-black/[0.08] bg-white text-black p-3.5 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/25"
              />
              {draftNotice && (
                <div className="text-[12px] text-rose-600 mt-1.5" role="alert">
                  {draftNotice}
                </div>
              )}
              <button
                onClick={async () => {
                  if (posting) return;
                  setPosting(true);
                  if (await post(draft, null, setDraftNotice)) setDraft("");
                  setPosting(false);
                }}
                disabled={posting || !draft.trim()}
                className="mt-2 px-5 py-2 rounded-lg bg-black/85 text-white text-[14px] font-medium hover:bg-black transition disabled:opacity-30"
              >
                {posting ? "Надсилаємо…" : "Коментувати"}
              </button>
            </div>
          ) : !canWrite ? (
            <button onClick={onRequireLogin} className="mt-5 text-[14px] font-medium text-[#4338ca] hover:underline">
              Увійдіть як учасник, щоб коментувати
            </button>
          ) : null}
        </>
      )}

      {deleteId && <DeleteCommentDialog onCancel={() => setDeleteId(null)} onConfirm={confirmDelete} />}
      {reportId && (
        <ReportCommentDialog
          reasons={REPORT_REASONS}
          reason={reportReason}
          submitted={reportSent}
          onReasonChange={setReportReason}
          onClose={() => setReportId(null)}
          onSubmit={submitReport}
        />
      )}
    </div>
  );
}
