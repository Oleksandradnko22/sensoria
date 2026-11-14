// «Нова публікація» — written right in the feed (no separate window), compact, in the spirit of LinkedIn / Threads.
// Text with @authors, up to 4 photos (checked and gently compressed in the browser, utils/imageSafety), a YouTube /
// Vimeo video by link, a material (authors: their own; participants: one they bought or study → «Досвід учасника»),
// a poll, «Питання до автора» (authors) and a delicate topic (shown blurred). Also used to edit one's own post.
// Crisis words open the help window (CrisisHelp) and the post goes to a moderator first.
import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import BrandSelect from "../ui/BrandSelect";
import CrisisHelp from "./CrisisHelp";
import { getInitials, type Profile } from "../../lib/auth";
import { discardUploadedImages, uploadPostImages, type FeedAudience, type FeedPoll, type FeedPost } from "../../lib/authorPosts";
import { CRISIS_RE, fetchMyMaterials, saveFeedPost, searchAuthors } from "../../lib/feed";
import { fetchAuthorContent } from "../../lib/authorPublic";
import { checkPublicText, MAX_POST_IMAGES, MENTION_RE, parseVideoUrl, POST_MAX, validateImages, type PostContentKind } from "../../utils/authorPosts";
import { checkPhoto, compressPhoto } from "../../utils/imageSafety";
import { isSpecialistWarningTopic, SPECIALIST_ONLY_MESSAGE, SPECIALIST_TEXT_RE, WARNING_TOPICS } from "../../utils/contentWarning";

export const PARTICIPANT_POST_MAX = 1000;
const KIND: Record<string, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };
const AMA_DAYS = [1, 3, 7];

type NewPhoto = { file: File; url: string };
type Material = { kind: PostContentKind; id: string; title: string };
type Panel = "video" | "material" | "poll" | "ama" | "topic";

export default function FeedComposer({
  role,
  viewer,
  isSpecialist = false,
  post,
  defaultAudience,
  onClose,
  onSaved,
}: {
  role: "author" | "participant";
  // «Фахівець»: only they may write about / mark the themes in SPECIALIST_WARNING_TOPICS
  isSpecialist?: boolean;
  viewer: Profile;
  post: FeedPost | null;
  defaultAudience: FeedAudience;
  onClose: () => void;
  onSaved: (note?: string) => void;
}) {
  const isAuthor = role === "author";
  // a regular author (no «Фахівець» badge) may not touch specialist themes; participants may mark them (it only blurs)
  const restricted = isAuthor && !isSpecialist;
  const max = isAuthor ? POST_MAX : PARTICIPANT_POST_MAX;
  const [audience, setAudience] = useState<FeedAudience>(post?.audience ?? (isAuthor ? (defaultAudience === "authors" ? "authors" : "all") : "participants"));
  const [body, setBody] = useState(post?.body ?? "");
  const [kept, setKept] = useState<string[]>(post?.images ?? []);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<Record<Panel, boolean>>({
    video: !!post?.video, material: !!post?.contentId, poll: !!post?.poll, ama: !!post?.amaUntil, topic: !!post?.sensitiveTopic,
  });
  const [video, setVideo] = useState(post?.video?.url ?? "");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [material, setMaterial] = useState<{ kind: PostContentKind; id: string } | null>(post?.contentId && post.contentKind ? { kind: post.contentKind, id: post.contentId } : null);
  const [poll, setPoll] = useState<FeedPoll>(post?.poll ?? { question: "", options: ["", ""] });
  const [amaDays, setAmaDays] = useState(3);
  const [topic, setTopic] = useState(post?.sensitiveTopic ?? "");
  const [mentioned, setMentioned] = useState<Record<string, string>>(() => Object.fromEntries((post?.mentions ?? []).map((m) => [m.name, m.id])));
  const [suggest, setSuggest] = useState<{ q: string; list: { id: string; name: string; avatarUrl: string | null }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const toggle = (k: Panel, v?: boolean) => setOpen((o) => ({ ...o, [k]: v ?? !o[k] }));

  useEffect(() => {
    if (isAuthor) fetchAuthorContent(viewer.id).then((list) => setMaterials(list.map((m) => ({ kind: m.kind as PostContentKind, id: m.id, title: m.title })))).catch(() => setMaterials([]));
    else fetchMyMaterials().then(setMaterials).catch(() => setMaterials([]));
  }, [isAuthor, viewer.id]);
  useEffect(() => { textRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy && !crisis) { if (suggest) setSuggest(null); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, crisis, suggest, onClose]);
  // previews are freed when the composer closes
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  // the text area grows with the text, up to ~10 lines
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(260, Math.max(76, el.scrollHeight))}px`;
  }, [body]);

  // «@» → authors to mention
  const onText = (value: string, caret: number) => {
    setBody(value);
    setNotice(null);
    const m = /@([^\s@[\]]{0,30})$/.exec(value.slice(0, caret));
    if (!m) { setSuggest(null); return; }
    const q = m[1];
    if (q.length < 1) { setSuggest({ q, list: [] }); return; }
    // one search after a short pause in typing, not one per letter
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      searchAuthors(q).then((list) => setSuggest((cur) => (cur && cur.q !== q ? cur : { q, list: list.filter((a) => a.id !== viewer.id) }))).catch(() => {});
    }, 250);
    setSuggest((cur) => ({ q, list: cur?.list ?? [] }));
  };
  const pickMention = (a: { id: string; name: string }) => {
    const el = textRef.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([^\s@[\]]{0,30})$/, `@[${a.name}] `);
    const next = before + body.slice(caret);
    setBody(next);
    setMentioned((m) => ({ ...m, [a.name]: a.id }));
    setSuggest(null);
    window.requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };

  const parsedVideo = useMemo(() => (video.trim() ? parseVideoUrl(video.trim()) : null), [video]);
  const videoBad = open.video && video.trim() !== "" && !parsedVideo;
  const photoCount = kept.length + photos.length;
  const pollOptions = poll.options.map((o) => o.trim()).filter(Boolean);
  // once people voted, the poll's question and options stay as they were (otherwise the votes would mean something else)
  const pollLocked = !!post?.poll && (post.pollCounts ?? []).some((n) => n > 0);
  const pollBad = open.poll && (pollOptions.length < 2 || new Set(pollOptions.map((o) => o.toLowerCase())).size !== pollOptions.length);

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

  const validate = (): boolean => {
    const check = checkPublicText(body, max);
    if (!check.ok) { setNotice(check.message); return false; }
    if (restricted && (SPECIALIST_TEXT_RE.test(body) || (open.poll && SPECIALIST_TEXT_RE.test([poll.question, ...poll.options].join(" "))) || (open.topic && isSpecialistWarningTopic(topic)))) {
      setNotice(SPECIALIST_ONLY_MESSAGE);
      return false;
    }
    for (const text of [poll.question, ...poll.options]) {
      if (open.poll && text.trim()) { const c = checkPublicText(text, 200); if (!c.ok) { setNotice(c.message); return false; } }
    }
    if (videoBad) { setNotice("Відео: підійде лише посилання YouTube або Vimeo."); return false; }
    if (pollBad) { setNotice("Опитування: потрібно щонайменше 2 різні варіанти відповіді."); return false; }
    return true;
  };

  const submit = async (confirmedCrisis = false) => {
    if (!validate()) return;
    if (!isAuthor && !confirmedCrisis && CRISIS_RE.test(body)) { setCrisis(true); return; }
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      try {
        uploaded = photos.length ? await uploadPostImages(viewer.id, photos.map((p) => p.file)) : [];
      } catch {
        setNotice("Не вдалося завантажити фото. Перевірте інтернет і спробуйте ще раз.");
        return;
      }
      const mentionIds = [...body.matchAll(MENTION_RE)].map((m) => mentioned[m[1]]).filter(Boolean);
      await saveFeedPost({
        authorId: viewer.id,
        audience,
        body,
        contentId: open.material ? material?.id ?? null : null,
        contentKind: open.material ? material?.kind ?? null : null,
        images: [...kept, ...uploaded],
        videoUrl: open.video ? parsedVideo?.url ?? null : null,
        poll: open.poll ? { question: poll.question.trim(), options: pollOptions } : null,
        amaUntil: isAuthor && open.ama ? (post?.amaUntil ?? new Date(Date.now() + amaDays * 86_400_000).toISOString()) : null,
        sensitiveTopic: open.topic && topic ? topic : null,
        mentions: mentionIds,
      }, post?.id);
      // photos taken out while editing leave the storage
      const removed = (post?.images ?? []).filter((u) => !kept.includes(u));
      if (removed.length) void discardUploadedImages(viewer.id, removed);
      onSaved(confirmedCrisis ? "Дякуємо, що поділилися. Ваш текст спершу прочитає модератор." : undefined);
      onClose();
    } catch (e) {
      await discardUploadedImages(viewer.id, uploaded);
      const m = (e as { message?: string } | null)?.message ?? "";
      const generic = post ? "Не вдалося зберегти зміни. Спробуйте ще раз." : "Не вдалося опублікувати. Текст збережено — спробуйте ще раз.";
      setNotice(/^(Публікація|Забагато)/.test(m) ? m : import.meta.env.DEV && m ? `${generic} (${m})` : generic);
    } finally {
      setBusy(false);
      setCrisis(false);
    }
  };

  // one kind per post: photos OR a video OR a material OR a poll OR «Питання до мене»
  const amaOn = isAuthor && open.ama && (!post || !!post.amaUntil);
  const attachment: "photo" | "video" | "material" | "poll" | "ama" | null = photoCount > 0 ? "photo" : open.video ? "video" : open.material ? "material" : open.poll ? "poll" : amaOn ? "ama" : null;
  const blocked = (key: Panel | "photo") => key !== "topic" && attachment !== null && attachment !== key;
  const tools: { key: Panel | "photo"; label: string; icon: IconName; color: string; hide?: boolean }[] = [
    { key: "photo", label: "Фото", icon: "image", color: "text-[#2f7a4f] hover:bg-emerald-50" },
    { key: "video", label: "Відео", icon: "video", color: "text-[#c2410c] hover:bg-orange-50" },
    { key: "material", label: isAuthor ? "Матеріал" : "Відмітити матеріал", icon: "library", color: "text-[#4338ca] hover:bg-[#eef0fd]" },
    { key: "poll", label: "Опитування", icon: "chart", color: "text-[#0e7490] hover:bg-cyan-50" },
    { key: "ama", label: "Питання до мене", icon: "comment", color: "text-[#7c3aed] hover:bg-[#f5f0ff]", hide: !isAuthor || !!post },
    { key: "topic", label: "Делікатна тема", icon: "shield", color: "text-[#b45309] hover:bg-amber-50" },
  ];
  const panel = "mt-3 rounded-2xl bg-[#faf9ff] p-3.5 ring-1 ring-[#ece8fb]";
  const field = "min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[15px] ring-1 ring-[#e3def9] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]";
  const closeBtn = (k: Panel, label: string) => <button type="button" onClick={() => toggle(k, false)} aria-label={label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/45 hover:bg-black/5">✕</button>;

  return (
    <section aria-label={post ? "Редагувати публікацію" : "Нова публікація"} className="rounded-[26px] bg-white shadow-[0_24px_60px_-40px_rgba(50,40,140,0.7)] ring-1 ring-[#d9d4f5]">
      <div className="px-5 pb-4 pt-5 sm:px-6">
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
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити" className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px] text-black/45 hover:bg-black/5">✕</button>
        </div>

        {/* text with @authors */}
        <div className="relative">
          <textarea
            ref={textRef}
            value={body}
            onChange={(e) => onText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            maxLength={max}
            aria-label="Текст публікації"
            placeholder={isAuthor ? "Про що хочете розповісти? Напишіть @, щоб відмітити автора." : "Поділіться досвідом чи маленькою перемогою. Напишіть @, щоб подякувати автору."}
            className="mt-3 w-full resize-none border-0 bg-transparent text-[16px] leading-relaxed text-[#12172b] placeholder:text-black/35 focus:outline-none"
          />
          {suggest && (
            <div className="absolute left-0 z-30 mt-1 w-[300px] max-w-full rounded-2xl bg-white p-1.5 shadow-[0_22px_48px_-18px_rgba(60,40,160,0.45)] ring-1 ring-[#e7e3fb]">
              {suggest.list.length === 0
                ? <p className="px-3 py-2 text-[13px] text-black/45">{suggest.q ? "Автора не знайдено" : "Почніть вводити ім’я автора"}</p>
                : suggest.list.map((a) => (
                  <button key={a.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(a); }} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[#f6f4ff]">
                    <Avatar avatarUrl={a.avatarUrl} initials={getInitials(a.name)} className="h-8 w-8 text-[11px] text-white" />
                    <span className="truncate text-[14px] font-medium text-[#12172b]">{a.name}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* photos */}
        {photoCount > 0 && (
          <div className="mt-3 grid max-w-[520px] grid-cols-4 gap-2">
            {kept.map((u) => <Thumb key={u} src={u} onRemove={() => setKept((k) => k.filter((x) => x !== u))} />)}
            {photos.map((p) => <Thumb key={p.url} src={p.url} onRemove={() => { URL.revokeObjectURL(p.url); setPhotos((list) => list.filter((x) => x.url !== p.url)); }} />)}
          </div>
        )}
        {checking && <p className="mt-2 text-[13px] text-[#4a2fd0]">Перевіряємо й готуємо фото…</p>}

        {open.video && (
          <div className={panel}>
            <div className="flex items-center gap-2">
              <input value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="Посилання на YouTube або Vimeo" aria-label="Посилання на відео" aria-invalid={videoBad || undefined} className={field} />
              {closeBtn("video", "Прибрати відео")}
            </div>
            {parsedVideo?.provider === "youtube" && <img src={`https://i.ytimg.com/vi/${parsedVideo.id}/hqdefault.jpg`} alt="" className="mt-3 aspect-video w-full max-w-[360px] rounded-xl object-cover" />}
            {videoBad && <p className="mt-2 text-[13px] text-rose-700">Підійде лише посилання YouTube або Vimeo.</p>}
          </div>
        )}

        {open.material && (
          <div className={panel}>
            {materials.length === 0 ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[13px] text-black/55">{isAuthor ? "Тут з’являться ваші опубліковані програми, гайди та медитації." : "Відмітити можна матеріал, який ви придбали або проходите."}</p>
                {closeBtn("material", "Прибрати матеріал")}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <BrandSelect value={material ? `${material.kind}:${material.id}` : ""} onChange={(e) => { const [k, ...id] = e.target.value.split(":"); setMaterial(k ? { kind: k as PostContentKind, id: id.join(":") } : null); }} aria-label="Матеріал" className="w-full rounded-xl px-3.5 text-[15px] ring-1 ring-[#e3def9]">
                  <option value="">Оберіть матеріал</option>
                  {materials.map((m) => <option key={`${m.kind}:${m.id}`} value={`${m.kind}:${m.id}`}>{`${KIND[m.kind] ?? ""} · ${m.title}`}</option>)}
                </BrandSelect>
                {closeBtn("material", "Прибрати матеріал")}
              </div>
            )}
            {!isAuthor && material && <p className="mt-2 text-[13px] text-[#4a2fd0]">Публікація стане «Досвідом учасника»: автор матеріалу зможе з вашої згоди показати її на сторінці матеріалу.</p>}
          </div>
        )}

        {open.poll && (
          <div className={panel}>
            <div className="flex items-center gap-2">
              <input value={poll.question} disabled={pollLocked} onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value.slice(0, 200) }))} placeholder="Питання (необов’язково, інакше — текст публікації)" aria-label="Питання опитування" className={field} />
              {closeBtn("poll", "Прибрати опитування")}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {poll.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} disabled={pollLocked} onChange={(e) => setPoll((p) => ({ ...p, options: p.options.map((x, j) => (j === i ? e.target.value.slice(0, 60) : x)) }))} placeholder={`Варіант ${i + 1}`} aria-label={`Варіант ${i + 1}`} aria-invalid={pollBad && !o.trim() && i < 2 ? true : undefined} className={field} />
                  {poll.options.length > 2 && !pollLocked && <button type="button" onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))} aria-label={`Прибрати варіант ${i + 1}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/40 hover:bg-black/5">✕</button>}
                </div>
              ))}
            </div>
            {pollLocked && <p className="mt-2 text-[12px] text-black/50">Люди вже проголосували, тому питання й варіанти змінити не можна.</p>}
            {poll.options.length < 4 && !pollLocked && <button type="button" onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ""] }))} className="mt-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-[#4338ca] hover:bg-[#eef0fd]">+ Додати варіант</button>}
            <p className="mt-1 text-[12px] text-black/45">Голосування анонімне: усі бачать лише відсотки.</p>
          </div>
        )}

        {open.ama && isAuthor && !post && (
          <div className={panel}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-[#12172b]">Питання до мене приймаються</span>
              {AMA_DAYS.map((d) => (
                <button key={d} type="button" aria-pressed={amaDays === d} onClick={() => setAmaDays(d)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${amaDays === d ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-black/55 ring-1 ring-[#e3def9]"}`}>{d === 1 ? "1 день" : d === 3 ? "3 дні" : "7 днів"}</button>
              ))}
              <span className="ml-auto">{closeBtn("ama", "Прибрати питання до автора")}</span>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-black/50">Учасники ставлять питання в коментарях. Найкращі відповіді можна закріпити зверху.</p>
          </div>
        )}

        {open.topic && (
          <div className={panel}>
            <div className="flex items-start gap-2">
              <div className="flex flex-1 flex-wrap gap-1.5" role="radiogroup" aria-label="Делікатна тема">
                {WARNING_TOPICS.map((t) => {
                  const on = topic === t;
                  const locked = restricted && isSpecialistWarningTopic(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={locked || undefined}
                      title={locked ? "Доступно лише фахівцям" : undefined}
                      onClick={() => { if (!locked) setTopic(on ? "" : t); }}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition ${on ? "bg-[#5b3df5] text-white" : locked ? "cursor-not-allowed bg-[#f4f3f8] text-black/35" : "bg-white text-[#1d1a3b] ring-1 ring-[#e3def9] hover:bg-[#f6f4ff]"}`}
                    >
                      {on ? "✓ " : ""}{t}
                      {locked && <Icon name="lock" size={12} />}
                    </button>
                  );
                })}
              </div>
              {closeBtn("topic", "Прибрати делікатну тему")}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-black/50">Публікацію буде приховано під розмиттям: людина сама вирішить, чи відкривати.{restricted ? " Теми із замком — лише для авторів зі статусом «Фахівець»." : ""}</p>
          </div>
        )}

        {notice && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800">{notice}</p>}
      </div>

      {/* toolbar */}
      <div className="border-t border-[#f1eefb] px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-1">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          {tools.filter((t) => !t.hide).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => (t.key === "photo" ? fileRef.current?.click() : toggle(t.key))}
              disabled={blocked(t.key) || (t.key === "photo" ? photoCount >= MAX_POST_IMAGES || checking : false)}
              title={blocked(t.key) ? "Один допис — одне: фото, відео, матеріал, опитування або «Питання до мене»" : undefined}
              aria-pressed={t.key === "photo" ? undefined : open[t.key]}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold transition disabled:opacity-40 ${t.color} ${t.key !== "photo" && open[t.key] ? "bg-black/[0.04]" : ""}`}
            >
              <Icon name={t.icon} size={17} /> {t.label}{t.key === "photo" && <span className="text-[12px] font-medium text-black/40">{photoCount}/{MAX_POST_IMAGES}</span>}
            </button>
          ))}
          <span className={`ml-auto mr-2 text-[12px] ${body.length > max * 0.9 ? "text-rose-600" : "text-black/40"}`}>{body.length}/{max}</span>
          <button type="button" onClick={() => void submit()} disabled={busy || checking || !body.trim() || videoBad || pollBad} className="min-h-[42px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40">
            {busy ? "Публікуємо…" : post ? "Зберегти" : "Опублікувати"}
          </button>
        </div>
        <p className="mt-2 px-1 text-[12px] leading-snug text-black/45">Посилання, контакти й месенджери не публікуються. Фото перевіряються автоматично.{isAuthor ? "" : " Про особисте краще написати автору в повідомленнях."}</p>
      </div>

      {crisis && <CrisisHelp busy={busy} onBack={() => setCrisis(false)} onSend={() => void submit(true)} />}
    </section>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-2xl bg-[#f3f1fb]">
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Прибрати фото" className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[13px] text-white backdrop-blur hover:bg-black/70">✕</button>
    </div>
  );
}
