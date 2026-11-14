// "Публікації" in the author's cabinet: write short educational posts,
// optionally attach one of the author's own published materials, pin one
// post ("з цього варто почати"), edit, delete. What participants see —
// likes, discussion — lives on the public profile; here the author sees the
// counts and can jump to the profile to reply under comments.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import {
  createPost,
  deletePost,
  discardUploadedImages,
  fetchMyPosts,
  PostsUnavailableError,
  setPostPinned,
  updatePost,
  uploadPostImages,
  type AuthorPost,
  FEED_LABEL,
  type FeedAudience,
} from "../../lib/authorPosts";
import { fetchAuthorContent } from "../../lib/authorPublic";
import { guides } from "../../data/guides";
import { meditations } from "../../data/meditations";
import {
  MAX_POST_IMAGES,
  POST_MAX,
  POST_KIND_LABEL,
  checkPublicText,
  clipText,
  parseVideoUrl,
  splitPostBody,
  validateImages,
  type PostContentKind,
} from "../../utils/authorPosts";
import { AUTHOR_KIND_LABEL, formatReviewDate, groupAuthorContent, type AuthorContentItem } from "../../utils/authorProfileView";

import BrandSelect from "../ui/BrandSelect";
// `share` = someone else's Sensoria material (catalog guide / meditation),
// shown on the profile as "Поділився матеріалом"; own = "Рекомендований".
type Attach = { kind: PostContentKind; id: string; share: boolean } | null;
const keyOf = (a: Attach) => (a ? `${a.share ? "share" : "own"}:${a.kind}:${a.id}` : "");
const parseKey = (k: string): Attach => {
  if (!k) return null;
  const [mode, kind, ...rest] = k.split(":");
  return { kind: kind as PostContentKind, id: rest.join(":"), share: mode === "share" };
};

export type ComposerResult = {
  audience: FeedAudience;
  body: string;
  attach: Attach;
  newFiles: File[];
  keptImages: string[];
  imageAlt: string;
  videoUrl: string | null;
};

function Composer({
  hideAudience = false,
  initialAudience = "all",
  initialBody,
  initialAttach,
  initialImages,
  initialAlt,
  initialVideo,
  content,
  submitLabel,
  busy,
  notice,
  onSubmit,
  onCancel,
}: {
  hideAudience?: boolean;
  initialAudience?: FeedAudience;
  initialBody: string;
  initialAttach: Attach;
  initialImages: string[];
  initialAlt: string;
  initialVideo: string;
  content: AuthorContentItem[];
  submitLabel: string;
  busy: boolean;
  notice: string | null;
  onSubmit: (result: ComposerResult) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [audience, setAudience] = useState<FeedAudience>(initialAudience);
  const [attach, setAttach] = useState<Attach>(initialAttach);
  const [kept, setKept] = useState<string[]>(initialImages);
  const [files, setFiles] = useState<File[]>([]);
  const [video, setVideo] = useState(initialVideo);
  const [alt, setAlt] = useState(initialAlt);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const groups = useMemo(() => groupAuthorContent(content), [content]);
  // Other people's / catalog materials that can be shared (guides and
  // meditations; programs of other authors are not listed here).
  const shareable = useMemo(() => {
    const own = new Set(content.map((c) => `${c.kind}:${c.id}`));
    return [
      ...guides.filter((g) => !own.has(`guide:${g.id}`)).map((g) => ({ kind: "guide" as const, id: g.id, title: g.title })),
      ...meditations.filter((m) => !own.has(`meditation:${m.id}`)).map((m) => ({ kind: "meditation" as const, id: m.id, title: m.title })),
    ];
  }, [content]);
  const videoValid = !video.trim() || !!parseVideoUrl(video);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const err = validateImages(picked, kept.length + files.length);
    if (err) setLocalError(err);
    else {
      setLocalError(null);
      setFiles((f) => [...f, ...picked]);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    if (video.trim() && !parseVideoUrl(video)) return setLocalError("Підтримуються лише посилання YouTube або Vimeo.");
    setLocalError(null);
    onSubmit({ audience, body, attach, newFiles: files, keptImages: kept, imageAlt: kept.length + files.length > 0 ? alt : "", videoUrl: video.trim() ? parseVideoUrl(video)!.url : null });
  };
  // An already-attached item that is no longer in the author's published
  // list must stay selectable, or editing would silently drop it.
  const orphan =
    attach &&
    !(attach.share
      ? shareable.some((c) => c.kind === attach.kind && c.id === attach.id)
      : content.some((c) => c.kind === attach.kind && c.id === attach.id));

  return (
    <div>
      <div className={`mb-3 flex flex-wrap items-center gap-2 ${hideAudience ? "hidden" : ""}`} role="radiogroup" aria-label="Хто побачить публікацію">
        <span className="text-[13px] font-medium text-black/55">Кому:</span>
        {(["all", "authors"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={audience === a}
            onClick={() => setAudience(a)}
            className={`min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold transition ${audience === a ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-[#f6f5fb] text-black/60 hover:bg-[#efedf9]"}`}
          >
            {FEED_LABEL[a]}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        maxLength={POST_MAX}
        placeholder={"Заголовок (необов’язково, перший рядок)\n\nКоротко про те, що важливо знати вашим учасникам…"}
        className="w-full rounded-xl border border-black/10 bg-white p-4 text-[14px] leading-relaxed resize-y focus:outline-none focus:border-black/30"
      />
      <div className="flex items-center justify-between gap-3 text-[12px] text-black/40 mt-1.5">
        <span>Перший короткий рядок без крапки на кінці стане заголовком.</span>
        <span>{body.length}/{POST_MAX}</span>
      </div>

      <div className="mt-4">
        <div className="text-[13px] font-medium text-black/55">Фото ({kept.length + files.length}/{MAX_POST_IMAGES})</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {kept.map((u) => (
            <div key={u} className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/5">
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button type="button" aria-label="Прибрати фото" onClick={() => setKept((k) => k.filter((x) => x !== u))}
                className="absolute top-0.5 right-0.5 w-8 h-8 rounded-full bg-black/60 text-white text-[14px] leading-none">×</button>
            </div>
          ))}
          {previews.map((u, i) => (
            <div key={u} className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/5">
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button type="button" aria-label="Прибрати фото" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 w-8 h-8 rounded-full bg-black/60 text-white text-[14px] leading-none">×</button>
            </div>
          ))}
          {kept.length + files.length < MAX_POST_IMAGES && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-lg border border-dashed border-black/20 text-black/45 text-[12px] hover:bg-black/[0.03]">
              + Додати
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <div className="text-[12px] text-black/55 mt-1.5">JPG, PNG або WebP, до 5 МБ кожне.</div>
        {kept.length + files.length > 0 && (
          <label className="block mt-3">
            <span className="text-[13px] font-medium text-black/55">Короткий опис фото (для людей, які не бачать зображення; необов’язково)</span>
            <input value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:border-black/30" placeholder="Наприклад: чашка чаю на підвіконні" />
          </label>
        )}
      </div>

      <label className="block mt-4">
        <span className="text-[13px] font-medium text-black/55">Відео (посилання YouTube або Vimeo)</span>
        <input
          value={video}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          inputMode="url"
          className={`mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-[14px] focus:outline-none ${
            videoValid ? "border-black/10 focus:border-black/30" : "border-rose-300"
          }`}
        />
        {!videoValid && <span className="block text-[12px] text-rose-600 mt-1">Підтримуються лише посилання YouTube або Vimeo.</span>}
      </label>

      <label className="block mt-4">
        <span className="text-[13px] font-medium text-black/55">Матеріал Sensoria</span>
        <BrandSelect
          value={keyOf(attach)}
          onChange={(e) => setAttach(parseKey(e.target.value))}
          className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[14px] focus:outline-none focus:border-black/30"
        >
          <option value="">Без матеріалу</option>
          {orphan && attach && <option value={keyOf(attach)}>Прикріплений матеріал (недоступний)</option>}
          {groups.map((g) => (
            <optgroup key={g.kind} label={`Мої · ${AUTHOR_KIND_LABEL[g.kind]}`}>
              {g.items.map((i) => (
                <option key={`own:${i.kind}:${i.id}`} value={`own:${i.kind}:${i.id}`}>
                  {i.title}
                </option>
              ))}
            </optgroup>
          ))}
          {shareable.length > 0 && (
            <optgroup label="Поділитися матеріалом Sensoria">
              {shareable.map((i) => (
                <option key={`share:${i.kind}:${i.id}`} value={`share:${i.kind}:${i.id}`}>
                  {POST_KIND_LABEL[i.kind]} · {i.title}
                </option>
              ))}
            </optgroup>
          )}
        </BrandSelect>
        {content.length === 0 && (
          <span className="block text-[12px] text-black/40 mt-1.5">
            Тут з’являться ваші опубліковані програми, гайди та медитації.
          </span>
        )}
      </label>

      {(localError || notice) && (
        <div role="alert" className="mt-3 text-[13px] text-rose-600">
          {localError ?? notice}
        </div>
      )}
      <div className="flex gap-2 mt-4">
        <button
          onClick={submit}
          disabled={busy || !body.trim() || !videoValid}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40"
        >
          {busy ? "Зберігаємо…" : submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-black/10 text-[14px] text-black/60 hover:bg-black/5">
            Скасувати
          </button>
        )}
      </div>
    </div>
  );
}

export default function AuthorPosts({ embedded = false, initialAudience = "all" }: { embedded?: boolean; initialAudience?: FeedAudience } = {}) {
  const session = useSession();
  const authorId = session?.profile.id;
  const openProfile = useOpenAuthorProfile();

  const [posts, setPosts] = useState<AuthorPost[]>([]);
  const [content, setContent] = useState<AuthorContentItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unavailable">("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const load = useCallback(() => {
    if (!authorId) return;
    setState("loading");
    Promise.all([fetchMyPosts(authorId, limit), fetchAuthorContent(authorId).catch(() => [] as AuthorContentItem[])])
      .then(([p, c]) => {
        setPosts(p);
        setContent(c);
        setState("ready");
      })
      .catch((e) => setState(e instanceof PostsUnavailableError ? "unavailable" : "error"));
  }, [authorId, limit]);
  useEffect(load, [load]);

  const publish = async ({ audience, body, attach, newFiles, keptImages, imageAlt, videoUrl }: ComposerResult) => {
    if (!authorId) return;
    const check = checkPublicText(body, POST_MAX);
    if (!check.ok) return setNotice(check.message);
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      uploaded = newFiles.length ? await uploadPostImages(authorId, newFiles) : [];
      await createPost({
        audience,
        authorId,
        body,
        contentId: attach?.id ?? null,
        contentKind: attach?.kind ?? null,
        images: [...keptImages, ...uploaded],
        imageAlt,
        videoUrl,
        isShare: !!attach?.share,
      });
      setComposerKey((k) => k + 1);
      load();
    } catch {
      await discardUploadedImages(authorId, uploaded);
      setNotice("Не вдалося опублікувати. Ваш текст збережено в полі — спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string, { body, attach, newFiles, keptImages, imageAlt, videoUrl }: ComposerResult) => {
    if (!authorId) return;
    const check = checkPublicText(body, POST_MAX);
    if (!check.ok) return setNotice(check.message);
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      uploaded = newFiles.length ? await uploadPostImages(authorId, newFiles) : [];
      await updatePost(id, {
        body,
        contentId: attach?.id ?? null,
        contentKind: attach?.kind ?? null,
        images: [...keptImages, ...uploaded],
        imageAlt,
        videoUrl,
        isShare: !!attach?.share,
      });
      setEditingId(null);
      load();
    } catch {
      await discardUploadedImages(authorId, uploaded);
      setNotice("Не вдалося зберегти зміни. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<void>, failure: string) => {
    setRowError(null);
    try {
      await fn();
      load();
    } catch {
      setRowError(failure);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className={`flex items-start justify-between gap-4 flex-wrap ${embedded ? "hidden" : ""}`}>
        <div>
          <h1 className="text-3xl font-bold">Публікації</h1>
          <p className="text-black/50 mt-1 max-w-[560px]">
            Короткі тексти для вашої аудиторії. Вони показуються на вашому публічному профілі разом із рекомендованим
            матеріалом.
          </p>
        </div>
        {authorId && (
          <button
            onClick={() => openProfile(authorId)}
            className="px-4 py-2.5 rounded-xl bg-black/5 hover:bg-black/10 text-[13px] font-medium transition"
          >
            Переглянути мій профіль →
          </button>
        )}
      </div>

      {state === "unavailable" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 px-5 py-4 text-[14px]">
          Публікації ще не підключені до бази даних. Потрібно один раз виконати <code>author-posts-migration.sql</code>.
        </div>
      )}

      {state !== "unavailable" && (
        <>
          <div className="rounded-2xl bg-white border border-black/5 p-6 max-w-[760px]">
            <div className="text-[15px] font-semibold mb-4">Нова публікація</div>
            <Composer
              key={composerKey}
              initialAudience={initialAudience}
              initialBody=""
              initialAttach={null}
              initialImages={[]}
              initialAlt=""
              initialVideo=""
              content={content}
              submitLabel="Опублікувати"
              busy={busy && editingId === null}
              notice={editingId === null ? notice : null}
              onSubmit={publish}
            />
            <p className="text-[12px] text-black/40 mt-4">
              Не діліться контактами чи посиланнями для спілкування або оплати поза Sensoria — такі тексти не публікуються.
            </p>
          </div>

          <div className="max-w-[760px]">
            <div className="text-[13px] font-semibold text-black/45 uppercase tracking-[0.14em] mb-3">Ваші публікації</div>
            {state === "loading" && <div className="text-[14px] text-black/40">Завантаження…</div>}
            {state === "error" && (
              <div className="text-[14px] text-black/55" role="alert">
                Не вдалося завантажити публікації.{" "}
                <button onClick={load} className="underline font-medium">
                  Спробувати ще раз
                </button>
              </div>
            )}
            {state === "ready" && posts.length === 0 && (
              <p className="text-[14px] text-black/40">Публікацій поки немає. Почніть із короткого тексту про ваш підхід.</p>
            )}
            {rowError && (
              <div role="alert" className="text-[13px] text-rose-600 mb-3">
                {rowError}
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {posts.map((p) => {
                const { headline, rest } = splitPostBody(p.body);
                const clip = clipText(rest, 220);
                return (
                  <li key={p.id} className="rounded-2xl bg-white border border-black/5 p-5">
                    {editingId === p.id ? (
                      <Composer
                        initialBody={p.body}
                        initialAttach={p.contentId && p.contentKind ? { kind: p.contentKind, id: p.contentId, share: p.isShare } : null}
                        initialImages={p.images}
                        initialAlt={p.imageAlt}
                        initialVideo={p.video?.url ?? ""}
                        content={content}
                        submitLabel="Зберегти"
                        busy={busy}
                        notice={notice}
                        onSubmit={(res) => saveEdit(p.id, res)}
                        onCancel={() => {
                          setEditingId(null);
                          setNotice(null);
                        }}
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-[12px] text-black/40 mb-2 flex-wrap">
                          <span>{formatReviewDate(p.createdAt)}</span>
                          {p.updatedAt && <span>· відредаговано</span>}
                          {p.isPinned && (
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4338ca]">Закріплено автором</span>
                          )}
                        </div>
                        {headline && <div className="text-[16px] font-semibold mb-1">{headline}</div>}
                        <p className="text-[14px] leading-relaxed text-black/65 whitespace-pre-line">{clip.text}</p>
                        {(p.images.length > 0 || p.video) && (
                          <div className="mt-3 text-[12.5px] text-black/50">
                            {[p.images.length > 0 ? `Фото: ${p.images.length}` : null, p.video ? "Відео" : null].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {p.attachment && (
                          <div className="mt-1.5 text-[12.5px] text-black/50">
                            {p.attachment.unavailable
                              ? "Прикріплений матеріал більше недоступний"
                              : `${p.isShare ? "Поділилися матеріалом" : POST_KIND_LABEL[p.attachment.kind]}: ${p.attachment.title}`}
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-4 text-[13px] flex-wrap">
                          <span className="text-black/40">
                            ♡ {p.stats.likeCount} · Коментарів: {p.stats.commentCount}
                          </span>
                          <span className="ml-auto flex items-center gap-4">
                            <button
                              onClick={() => run(() => setPostPinned(p.id, !p.isPinned), "Не вдалося змінити закріплення.")}
                              className="font-medium text-black/60 hover:text-black"
                            >
                              {p.isPinned ? "Відкріпити" : "Закріпити"}
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(p.id);
                                setNotice(null);
                              }}
                              className="font-medium text-black/60 hover:text-black"
                            >
                              Редагувати
                            </button>
                            {confirmDeleteId === p.id ? (
                              <span role="group" aria-label="Підтвердження видалення" className="flex items-center gap-2">
                                <span className="text-black/50">Видалити разом із коментарями?</span>
                                <button
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    run(() => deletePost(p.id), "Не вдалося видалити публікацію.");
                                  }}
                                  className="font-medium text-rose-600"
                                >
                                  Видалити
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} className="font-medium text-black/60">
                                  Скасувати
                                </button>
                              </span>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(p.id)} className="font-medium text-rose-600/80 hover:text-rose-600">
                                Видалити
                              </button>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {state === "ready" && posts.length >= limit && (
              <button onClick={() => setLimit((l) => l + 50)} className="mt-4 px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[14px] font-medium">
                Показати ще
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}


// «Що нового?» in the feeds: the full composer (text, photos, video, material, audience) in a window — for a new post
// or to edit one of the author's own posts.
export function PostComposerModal({ post, audience, onClose, onSaved }: { post?: AuthorPost | null; audience: FeedAudience; onClose: () => void; onSaved: () => void }) {
  const session = useSession();
  const authorId = session?.profile.id;
  const [content, setContent] = useState<AuthorContentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (authorId) fetchAuthorContent(authorId).then(setContent).catch(() => setContent([]));
  }, [authorId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async ({ audience: aud, body, attach, newFiles, keptImages, imageAlt, videoUrl }: ComposerResult) => {
    if (!authorId) return;
    const check = checkPublicText(body, POST_MAX);
    if (!check.ok) return setNotice(check.message);
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      uploaded = newFiles.length ? await uploadPostImages(authorId, newFiles) : [];
      const media = { images: [...keptImages, ...uploaded], imageAlt, videoUrl, isShare: !!attach?.share };
      if (post) await updatePost(post.id, { body, contentId: attach?.id ?? null, contentKind: attach?.kind ?? null, ...media });
      else await createPost({ audience: aud, authorId, body, contentId: attach?.id ?? null, contentKind: attach?.kind ?? null, ...media });
      onSaved();
      onClose();
    } catch (e) {
      await discardUploadedImages(authorId, uploaded);
      const m = (e as { message?: string } | null)?.message ?? "";
      if (/^(Публікація|Забагато)/.test(m)) { setNotice(m); return; }
      setNotice(post ? "Не вдалося зберегти зміни. Спробуйте ще раз." : "Не вдалося опублікувати. Ваш текст збережено в полі — спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#12172b]/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={post ? "Редагувати публікацію" : "Нова публікація"} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-[760px] rounded-[28px] bg-white p-5 shadow-[0_30px_80px_-30px_rgba(40,30,120,0.55)] sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-bold text-[#12172b]">{post ? "Редагувати публікацію" : "Нова публікація"}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити" className="flex h-10 w-10 items-center justify-center rounded-full text-black/50 hover:bg-black/5">✕</button>
        </div>
        <Composer
          hideAudience={!!post}
          initialAudience={audience}
          initialBody={post?.body ?? ""}
          initialAttach={post?.contentId && post.contentKind ? { kind: post.contentKind, id: post.contentId, share: post.isShare } : null}
          initialImages={post?.images ?? []}
          initialAlt={post?.imageAlt ?? ""}
          initialVideo={post?.video?.url ?? ""}
          content={content}
          submitLabel={post ? "Зберегти" : "Опублікувати"}
          busy={busy}
          notice={notice}
          onSubmit={save}
          onCancel={onClose}
        />
        <p className="mt-4 text-[12px] text-black/40">Не діліться контактами чи посиланнями для спілкування або оплати поза Sensoria — такі тексти не публікуються.</p>
      </div>
    </div>
  );
}
