// «Нова публікація» — a full window in the spirit of LinkedIn / Instagram / Threads, Sensoria style.
// Text, up to 4 photos (checked for explicit content and compressed in the browser, see utils/imageSafety), a YouTube /
// Vimeo video by link, and for authors an attached material and the audience. Also used to edit one's own post.
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { getInitials, type Profile } from "../../lib/auth";
import { createPost, discardUploadedImages, updatePost, uploadPostImages, type FeedAudience, type FeedPost } from "../../lib/authorPosts";
import { fetchAuthorContent } from "../../lib/authorPublic";
import { checkPublicText, MAX_POST_IMAGES, parseVideoUrl, POST_MAX, validateImages, type PostContentKind } from "../../utils/authorPosts";
import { checkPhoto, compressPhoto } from "../../utils/imageSafety";
import type { AuthorContentItem } from "../../utils/authorProfileView";

export const PARTICIPANT_POST_MAX = 1000;
const KIND: Record<string, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };

type NewPhoto = { file: File; url: string };

export default function FeedComposer({
  role,
  viewer,
  post,
  defaultAudience,
  onClose,
  onSaved,
}: {
  role: "author" | "participant";
  viewer: Profile;
  post: FeedPost | null;
  defaultAudience: FeedAudience;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isAuthor = role === "author";
  const max = isAuthor ? POST_MAX : PARTICIPANT_POST_MAX;
  const [audience, setAudience] = useState<FeedAudience>(post?.audience ?? (isAuthor ? (defaultAudience === "authors" ? "authors" : "all") : "participants"));
  const [body, setBody] = useState(post?.body ?? "");
  const [kept, setKept] = useState<string[]>(post?.images ?? []);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [checking, setChecking] = useState(false);
  const [videoOpen, setVideoOpen] = useState(!!post?.video);
  const [video, setVideo] = useState(post?.video?.url ?? "");
  const [materials, setMaterials] = useState<AuthorContentItem[]>([]);
  const [material, setMaterial] = useState<{ kind: PostContentKind; id: string } | null>(post?.contentId && post.contentKind ? { kind: post.contentKind, id: post.contentId } : null);
  const [materialOpen, setMaterialOpen] = useState(!!material);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (isAuthor) fetchAuthorContent(viewer.id).then(setMaterials).catch(() => setMaterials([])); }, [isAuthor, viewer.id]);
  useEffect(() => { textRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [busy, onClose]);
  // previews are freed when the window closes
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  // the text area grows with the text
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(420, Math.max(140, el.scrollHeight))}px`;
  }, [body]);

  const parsedVideo = useMemo(() => (video.trim() ? parseVideoUrl(video.trim()) : null), [video]);
  const videoBad = video.trim() !== "" && !parsedVideo;
  const photoCount = kept.length + photos.length;

  const addPhotos = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const bad = validateImages(files, photoCount);
    if (bad) { setNotice(bad); return; }
    setChecking(true);
    setNotice(null);
    try {
      const ok: NewPhoto[] = [];
      for (const f of files) {
        const verdict = await checkPhoto(f);
        if (!verdict.ok) { setNotice(verdict.reason); continue; }
        const small = await compressPhoto(f);
        ok.push({ file: small, url: URL.createObjectURL(small) });
      }
      setPhotos((p) => [...p, ...ok]);
    } catch {
      setNotice("Не вдалося підготувати фото. Спробуйте інше.");
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    const check = checkPublicText(body, max);
    if (!check.ok) { setNotice(check.message); return; }
    if (videoBad) { setNotice("Відео: підійде лише посилання YouTube або Vimeo."); return; }
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      uploaded = photos.length ? await uploadPostImages(viewer.id, photos.map((p) => p.file)) : [];
      const media = { images: [...kept, ...uploaded], imageAlt: "", videoUrl: parsedVideo?.url ?? null, isShare: false };
      const attach = isAuthor ? material : null;
      if (post) await updatePost(post.id, { body, contentId: attach?.id ?? null, contentKind: attach?.kind ?? null, ...media });
      else await createPost({ audience, authorId: viewer.id, body, contentId: attach?.id ?? null, contentKind: attach?.kind ?? null, ...media });
      onSaved();
      onClose();
    } catch (e) {
      await discardUploadedImages(viewer.id, uploaded);
      const m = (e as { message?: string } | null)?.message ?? "";
      setNotice(/^(Публікація|Забагато)/.test(m) ? m : post ? "Не вдалося зберегти зміни. Спробуйте ще раз." : "Не вдалося опублікувати. Текст збережено — спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const tool = "inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3 text-[14px] font-semibold transition disabled:opacity-40";
  const chosen = materials.find((m) => m.kind === material?.kind && m.id === material?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#12172b]/45 backdrop-blur-[2px] sm:items-start sm:p-6 sm:pt-[6vh]" role="dialog" aria-modal="true" aria-label={post ? "Редагувати публікацію" : "Нова публікація"} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden bg-white shadow-[0_40px_100px_-40px_rgba(40,30,120,0.6)] sm:max-h-[88vh] sm:rounded-[28px]">
        {/* top bar */}
        <div className="flex items-center gap-3 border-b border-[#f1eefb] px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити" className="flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-black/50 hover:bg-black/5">✕</button>
          <h2 className="flex-1 text-center text-[17px] font-bold text-[#12172b]">{post ? "Редагувати публікацію" : "Нова публікація"}</h2>
          <button type="button" onClick={() => void submit()} disabled={busy || checking || !body.trim() || videoBad} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40">
            {busy ? "Публікуємо…" : post ? "Зберегти" : "Опублікувати"}
          </button>
        </div>

        <div className="sensoria-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {/* who and for whom */}
          <div className="flex items-center gap-3">
            <Avatar avatarUrl={viewer.avatarUrl} initials={getInitials(viewer.name)} className="h-12 w-12 text-[15px] text-white" />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold text-[#12172b]">{viewer.name}</div>
              {isAuthor && !post ? (
                <div className="mt-1 flex gap-1.5" role="radiogroup" aria-label="Хто побачить">
                  {(["all", "authors"] as const).map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={audience === a} onClick={() => setAudience(a)} className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${audience === a ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-[#f6f5fb] text-black/55 hover:bg-[#efedf9]"}`}>
                      {a === "all" ? "Для всіх" : "Для авторів"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-1 inline-flex rounded-full bg-[#eef0fd] px-3 py-1 text-[12px] font-semibold text-[#4338ca]">{audience === "participants" ? "Для учасників" : audience === "authors" ? "Для авторів" : "Для всіх"}</div>
              )}
            </div>
          </div>

          <textarea
            ref={textRef}
            value={body}
            onChange={(e) => { setBody(e.target.value); setNotice(null); }}
            maxLength={max}
            aria-label="Текст публікації"
            placeholder={isAuthor ? "Про що хочете розповісти?\n\nПерший короткий рядок стане заголовком." : "Поділіться досвідом, думкою чи маленькою перемогою…"}
            className="mt-5 w-full resize-none border-0 bg-transparent text-[18px] leading-relaxed text-[#12172b] placeholder:text-black/35 focus:outline-none"
          />

          {/* photos */}
          {photoCount > 0 && (
            <div className={`mt-4 grid gap-2 ${photoCount === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {kept.map((u) => (
                <Thumb key={u} src={u} onRemove={() => setKept((k) => k.filter((x) => x !== u))} single={photoCount === 1} />
              ))}
              {photos.map((p) => (
                <Thumb key={p.url} src={p.url} onRemove={() => { URL.revokeObjectURL(p.url); setPhotos((list) => list.filter((x) => x.url !== p.url)); }} single={photoCount === 1} />
              ))}
            </div>
          )}
          {checking && <p className="mt-3 text-[13px] text-[#4a2fd0]">Перевіряємо й стискаємо фото…</p>}

          {/* video */}
          {videoOpen && (
            <div className="mt-4 rounded-2xl bg-[#faf9ff] p-3.5 ring-1 ring-[#ece8fb]">
              <div className="flex items-center gap-2">
                <input value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="Посилання на YouTube або Vimeo" aria-label="Посилання на відео" aria-invalid={videoBad || undefined} className="min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[15px] ring-1 ring-[#e3def9] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]" />
                <button type="button" onClick={() => { setVideo(""); setVideoOpen(false); }} aria-label="Прибрати відео" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/45 hover:bg-black/5">✕</button>
              </div>
              {parsedVideo?.provider === "youtube" && <img src={`https://i.ytimg.com/vi/${parsedVideo.id}/hqdefault.jpg`} alt="" className="mt-3 aspect-video w-full rounded-xl object-cover" />}
              {parsedVideo && parsedVideo.provider !== "youtube" && <p className="mt-2 text-[13px] text-emerald-700">Відео додано.</p>}
              {videoBad && <p className="mt-2 text-[13px] text-rose-700">Підійде лише посилання YouTube або Vimeo.</p>}
            </div>
          )}

          {/* material (authors) */}
          {isAuthor && materialOpen && (
            <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#f6f4ff] to-[#eef0fd] p-3.5 ring-1 ring-[#e4def9]">
              {materials.length === 0 ? (
                <p className="text-[13px] text-black/55">Тут з’являться ваші опубліковані програми, гайди та медитації.</p>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={material ? `${material.kind}:${material.id}` : ""} onChange={(e) => { const [k, ...id] = e.target.value.split(":"); setMaterial(k ? { kind: k as PostContentKind, id: id.join(":") } : null); }} aria-label="Матеріал" className="min-h-[44px] w-full rounded-xl bg-white px-3 text-[15px] ring-1 ring-[#e3def9] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]">
                    <option value="">Оберіть матеріал</option>
                    {materials.map((m) => <option key={`${m.kind}:${m.id}`} value={`${m.kind}:${m.id}`}>{KIND[m.kind] ?? ""} · {m.title}</option>)}
                  </select>
                  <button type="button" onClick={() => { setMaterial(null); setMaterialOpen(false); }} aria-label="Прибрати матеріал" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/45 hover:bg-black/5">✕</button>
                </div>
              )}
              {chosen && <p className="mt-2 text-[13px] text-[#4a2fd0]">Під публікацією з’явиться картка «{chosen.title}» з кнопкою «Відкрити».</p>}
            </div>
          )}

          {notice && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">{notice}</p>}
        </div>

        {/* toolbar */}
        <div className="border-t border-[#f1eefb] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-1">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={photoCount >= MAX_POST_IMAGES || checking} className={`${tool} text-[#2f7a4f] hover:bg-emerald-50`}>
              <Icon name="image" size={19} /> Фото <span className="text-[12px] font-medium text-black/40">{photoCount}/{MAX_POST_IMAGES}</span>
            </button>
            <button type="button" onClick={() => setVideoOpen(true)} disabled={videoOpen} className={`${tool} text-[#c2410c] hover:bg-orange-50`}>
              <Icon name="video" size={19} /> Відео
            </button>
            {isAuthor && (
              <button type="button" onClick={() => setMaterialOpen(true)} disabled={materialOpen} className={`${tool} text-[#4338ca] hover:bg-[#eef0fd]`}>
                <Icon name="library" size={19} /> Матеріал
              </button>
            )}
            <span className={`ml-auto text-[12px] ${body.length > max * 0.9 ? "text-rose-600" : "text-black/40"}`}>{body.length}/{max}</span>
          </div>
          <p className="mt-2 px-1 text-[12px] leading-snug text-black/45">Контакти, посилання й месенджери не публікуються. Фото перевіряються автоматично.{isAuthor ? "" : " Не діліться дуже особистим: про це краще написати автору в повідомленнях."}</p>
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, onRemove, single }: { src: string; onRemove: () => void; single: boolean }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-[#f3f1fb] ${single ? "aspect-[4/3]" : "aspect-square"}`}>
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Прибрати фото" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70">✕</button>
    </div>
  );
}
