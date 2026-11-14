// «Оголошення» in the admin panel: official posts of «Команда Sensoria» for «Спільнота → Для всіх» (both authors and
// participants see them). Text up to 3000, up to 4 photos (compressed in the browser), a YouTube / Vimeo video;
// one announcement can be pinned on top of the feed. Everyone gets a notification about a new one.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { Icon } from "../ui/Icon";
import FeedCard from "../feed/FeedCard";
import { discardUploadedImages, uploadPostImages, type FeedPost } from "../../lib/authorPosts";
import { deleteAnnouncement, fetchAdminAnnouncements, saveAnnouncement } from "../../lib/feed";
import { MAX_POST_IMAGES, parseVideoUrl, POST_MAX, validateImages } from "../../utils/authorPosts";
import { compressPhoto } from "../../utils/imageSafety";

type Draft = { id: string | null; body: string; kept: string[]; files: { file: File; url: string }[]; video: string; pinned: boolean };
const EMPTY: Draft = { id: null, body: "", kept: [], files: [], video: "", pinned: false };

export default function AdminAnnouncements() {
  const session = useSession();
  const viewer = session?.profile ?? null;
  const [list, setList] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLElement>(null);

  const load = () => fetchAdminAnnouncements().then((l) => { setList(l); setError(null); }).catch(() => setError("Не вдалося завантажити оголошення. Перевірте, що supabase/feeds.sql виконано."));
  useEffect(() => { void load(); }, []);

  const parsedVideo = useMemo(() => (draft.video.trim() ? parseVideoUrl(draft.video.trim()) : null), [draft.video]);
  const videoBad = draft.video.trim() !== "" && !parsedVideo;
  const photoCount = draft.kept.length + draft.files.length;

  const addPhotos = async (files: FileList | null) => {
    const arr = Array.from(files ?? []);
    const bad = validateImages(arr, photoCount);
    if (bad) { setNotice({ ok: false, text: bad }); return; }
    const ready = await Promise.all(arr.map(async (f) => { const small = await compressPhoto(f); return { file: small, url: URL.createObjectURL(small) }; }));
    setDraft((d) => ({ ...d, files: [...d.files, ...ready] }));
  };

  const publish = async () => {
    if (!viewer || !draft.body.trim() || videoBad) return;
    setBusy(true);
    setNotice(null);
    let uploaded: string[] = [];
    try {
      uploaded = draft.files.length ? await uploadPostImages(viewer.id, draft.files.map((f) => f.file)) : [];
      await saveAnnouncement({ id: draft.id, body: draft.body, images: [...draft.kept, ...uploaded], videoUrl: parsedVideo?.url ?? null, pinned: draft.pinned });
      draft.files.forEach((f) => URL.revokeObjectURL(f.url));
      setNotice({ ok: true, text: draft.id ? "Оголошення оновлено." : "Оголошення опубліковано: воно вже в «Спільнота → Для всіх», усі отримали сповіщення." });
      setDraft(EMPTY);
      void load();
    } catch (e) {
      await discardUploadedImages(viewer.id, uploaded);
      setNotice({ ok: false, text: (e as { message?: string } | null)?.message || "Не вдалося зберегти." });
    } finally {
      setBusy(false);
    }
  };

  const edit = (p: FeedPost) => {
    setDraft({ id: p.id, body: p.body, kept: p.images, files: [], video: p.video?.url ?? "", pinned: !!p.officialPinned });
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const togglePin = async (p: FeedPost) => {
    try {
      await saveAnnouncement({ id: p.id, body: p.body, images: p.images, videoUrl: p.video?.url ?? null, pinned: !p.officialPinned });
      void load();
    } catch { setNotice({ ok: false, text: "Не вдалося змінити закріплення." }); }
  };
  const remove = async (p: FeedPost) => {
    if (!window.confirm("Видалити оголошення? Воно зникне зі «Спільноти» для всіх.")) return;
    try { await deleteAnnouncement(p.id); void load(); } catch { setNotice({ ok: false, text: "Не вдалося видалити." }); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[26px] font-bold text-[#12172b]">Оголошення</h2>
        <p className="mt-1 max-w-[720px] text-[15px] text-black/55">Офіційні новини від «Команди Sensoria» у «Спільнота → Для всіх». Їх бачать і автори, і учасники, а кожен отримує сповіщення про нове оголошення. Одне можна закріпити зверху стрічки.</p>
      </div>

      {/* composer */}
      <section ref={formRef} className="rounded-[26px] bg-white p-5 shadow-[0_24px_60px_-40px_rgba(91,61,245,0.6)] ring-1 ring-[#cfc5fb] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] p-[2px]"><img src="/apple-touch-icon.png" alt="" className="h-11 w-11 rounded-full bg-white object-cover" /></span>
          <div>
            <div className="text-[16px] font-semibold text-[#12172b]">Команда Sensoria</div>
            <div className="text-[12px] text-black/50">{draft.id ? "Редагування оголошення" : "Нове оголошення · Для всіх"}</div>
          </div>
          {draft.id && <button type="button" onClick={() => setDraft(EMPTY)} className="ml-auto rounded-xl px-3 py-2 text-[13px] font-semibold text-black/55 hover:bg-black/5">Скасувати редагування</button>}
        </div>
        <textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          maxLength={POST_MAX}
          rows={6}
          aria-label="Текст оголошення"
          placeholder={"Заголовок (перший короткий рядок)\n\nЩо нового на платформі: оновлення, нові можливості, важливі зміни…"}
          className="mt-4 w-full resize-y rounded-2xl bg-[#faf9ff] p-4 text-[15px] leading-relaxed ring-1 ring-[#ebe8ff] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]"
        />
        {photoCount > 0 && (
          <div className="mt-3 grid max-w-[520px] grid-cols-4 gap-2">
            {draft.kept.map((u) => <Thumb key={u} src={u} onRemove={() => setDraft((d) => ({ ...d, kept: d.kept.filter((x) => x !== u) }))} />)}
            {draft.files.map((f) => <Thumb key={f.url} src={f.url} onRemove={() => { URL.revokeObjectURL(f.url); setDraft((d) => ({ ...d, files: d.files.filter((x) => x.url !== f.url) })); }} />)}
          </div>
        )}
        <input value={draft.video} onChange={(e) => setDraft((d) => ({ ...d, video: e.target.value }))} placeholder="Відео YouTube або Vimeo (необов’язково)" aria-label="Посилання на відео" aria-invalid={videoBad || undefined} className="mt-3 min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[15px] ring-1 ring-[#e3def9] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={photoCount >= MAX_POST_IMAGES} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#2f7a4f] hover:bg-emerald-50 disabled:opacity-40"><Icon name="image" size={17} /> Фото {photoCount}/{MAX_POST_IMAGES}</button>
          <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-[#4338ca] hover:bg-[#eef0fd]">
            <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))} className="h-4 w-4 accent-[#5b3df5]" />
            Закріпити зверху стрічки
          </label>
          <span className="ml-auto text-[12px] text-black/40">{draft.body.length}/{POST_MAX}</span>
          <button type="button" onClick={() => void publish()} disabled={busy || !draft.body.trim() || videoBad} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white disabled:opacity-40">
            {busy ? "Зберігаємо…" : draft.id ? "Зберегти" : "Опублікувати"}
          </button>
        </div>
        {notice && <p role={notice.ok ? "status" : "alert"} className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] ${notice.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`}>{notice.text}</p>}
        {draft.pinned && <p className="mt-2 text-[12px] text-black/50">Закріпити можна одне оголошення: попереднє закріплене відкріпиться.</p>}
      </section>

      {/* published */}
      <section className="flex flex-col gap-4">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-black/40">Опубліковані</h3>
        {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{error}</p>}
        {list && list.length === 0 && <p className="rounded-2xl bg-white px-6 py-10 text-center text-[14px] text-black/55 ring-1 ring-[#efeafd]">Оголошень поки немає.</p>}
        {list?.map((p) => (
          <div key={p.id} className="flex flex-col gap-2">
            <FeedCard post={p} viewer={viewer} onOpenContent={() => {}} onChange={(next) => setList((l) => (l ?? []).map((x) => (x.id === next.id ? next : x)))} />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => edit(p)} className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff]">Редагувати</button>
              <button type="button" onClick={() => void togglePin(p)} className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff]">{p.officialPinned ? "Відкріпити" : "Закріпити зверху"}</button>
              <button type="button" onClick={() => void remove(p)} className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-rose-700 ring-1 ring-rose-100 hover:bg-rose-50">Видалити</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#f3f1fb]">
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Прибрати фото" className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[13px] text-white">✕</button>
    </div>
  );
}
