// "Оберіть обкладинку профілю" — deliberately NOT a design editor: pick a
// type, a visual style and one of four ready compositions (or use your own
// photo, or leave it automatic). No colours, gradients or opacity to tune.
import { lazy, Suspense, useRef, useState } from "react";
const CoverMaker = lazy(() => import("./CoverMaker"));
// The author's cover is a wide strip at the top of their page: about 10:1 on a computer, 4:1 on a phone.
const AUTHOR_FRAMES = [
  { label: "10:1", where: "Сторінка автора, комп’ютер", r: 10 },
  { label: "4:1", where: "Сторінка автора, телефон", r: 4 },
];
import AuthorCover, { CoverArt, buildCoverPhoto, parseCoverPhoto } from "./public/AuthorCover";
import { uploadContentFile } from "../../lib/storage";
import { validateImages } from "../../utils/authorPosts";
import {
  COVER_COMPOSITIONS,
  COVER_FAMILIES,
  COVER_FAMILY_HINT,
  COVER_FAMILY_LABEL,
  COVER_PALETTES,
  COVER_TYPES,
  COVER_TYPE_HINT,
  COVER_TYPE_LABEL,
  familyFromTopics,
  resolveCover,
  type CoverFamily,
  type CoverType,
} from "../../utils/authorCover";

export type CoverChoice = {
  type: CoverType | null; // null = automatic
  family: CoverFamily | null;
  comp: number | null;
  imageUrl: string | null;
};

type Props = {
  value: CoverChoice;
  onChange: (next: CoverChoice) => void;
  topics: string[];
  authorId: string;
  title?: string; // the author's name: the starting text in the cover editor
};

export default function CoverPicker({ value, onChange, topics, authorId, title = "" }: Props) {
  const [makerOpen, setMakerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autoFamily = familyFromTopics(topics);

  const preview = resolveCover({
    coverType: value.type,
    coverVariant: value.family && value.comp ? `${value.family}-0${value.comp}` : null,
    coverImageUrl: value.imageUrl,
    topics,
    seed: authorId,
  });

  const pickType = (type: CoverType | null) => {
    setErr(null);
    if (!type) return onChange({ type: null, family: null, comp: null, imageUrl: null });
    if (type === "personal") return onChange({ ...value, type, family: value.family ?? autoFamily, comp: value.comp ?? 1 });
    onChange({ ...value, type, family: value.family ?? autoFamily, comp: value.comp ?? 1 });
  };

  // two photos: the computer shows a 10:1 strip, the phone a 4:1 one (without a phone photo the computer one is used)
  const photo = parseCoverPhoto(value.imageUrl);
  const onFile = async (file: File | undefined, fromMaker = false, screen: "desktop" | "mobile" = "desktop") => {
    if (!file) return;
    const problem = validateImages([file]);
    if (problem) return setErr(problem);
    const size = await new Promise<{ w: number; h: number } | null>((res) => {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(src); };
      img.onerror = () => { res(null); URL.revokeObjectURL(src); };
      img.src = src;
    });
    const reset = () => { if (fileRef.current) fileRef.current.value = ""; if (mobileRef.current) mobileRef.current.value = ""; };
    if (!fromMaker && size && screen === "desktop" && (size.w < 1600 || size.w < size.h * 4)) {
      reset();
      return setErr(`Фото для комп’ютера: ${size.w} × ${size.h}. Потрібно щонайменше 1600 px у ширину й у 4+ рази ширше, ніж високе. Найкраще 2000 × 200 (10:1).`);
    }
    if (!fromMaker && size && screen === "mobile" && (size.w < 800 || size.w < size.h * 3 || size.w > size.h * 5)) {
      reset();
      return setErr(`Фото для телефона: ${size.w} × ${size.h}. Потрібно щонайменше 800 px у ширину, пропорція близько 4:1. Найкраще 1200 × 300.`);
    }
    setBusy(true);
    setErr(null);
    try {
      const url = await uploadContentFile(authorId, file, screen === "mobile" ? "cover-mobile" : "cover");
      const fresh = `${url}?v=${Date.now()}`;
      const next = screen === "mobile" && photo
        ? { ...photo, mobile: fresh }
        : { desktop: fresh, y: 50, mobile: photo?.mobile ?? null };
      onChange({ ...value, type: "personal", imageUrl: buildCoverPhoto(next) });
    } catch {
      setErr("Не вдалося завантажити зображення. Спробуйте ще раз.");
    } finally {
      setBusy(false);
      reset();
    }
  };

  const drawn = value.type && value.type !== "personal" ? value.type : null;
  const family = value.family ?? autoFamily;

  return (
    <div>
      <div className="text-[13px] font-semibold text-[#2d2a5c] mb-2">Оберіть вигляд</div>
      <div className="rounded-2xl overflow-hidden border border-black/[0.06]">
        <AuthorCover cover={preview} />
      </div>
      <div className="text-[12px] text-black/40 mt-1.5">
        {value.type
          ? "Так обкладинка виглядатиме на вашому публічному профілі."
          : "Автоматично: колір і композиція підбираються за вашими темами. Можна обрати свій варіант нижче."}
      </div>

      <div className="flex flex-wrap gap-2 mt-4" role="radiogroup" aria-label="Тип обкладинки">
        <TypeChip on={!value.type} onClick={() => pickType(null)} label="Автоматично" hint="За вашими темами" />
        {COVER_TYPES.filter((t) => t !== "editorial").map((t) => (
          <TypeChip key={t} on={value.type === t} onClick={() => pickType(t)} label={COVER_TYPE_LABEL[t]} hint={COVER_TYPE_HINT[t]} />
        ))}
      </div>

      {drawn && (
        <div className="mt-5">
          <div className="text-[13px] font-medium text-black/50 mb-2">Візуальний стиль профілю</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Візуальний стиль">
            {COVER_FAMILIES.map((f) => {
              const on = family === f;
              const pal = COVER_PALETTES[f];
              return (
                <button
                  type="button"
                  key={f}
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...value, family: f })}
                  title={COVER_FAMILY_HINT[f]}
                  className={`flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border text-[13px] transition ${
                    on ? "border-[#4338ca]/40 bg-[#eef2ff] text-[#4338ca]" : "border-black/10 text-black/60 hover:bg-black/5"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full" style={{ background: `linear-gradient(135deg, ${pal.a}, ${pal.b})` }} />
                  {COVER_FAMILY_LABEL[f]}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] text-black/40 mt-1.5">{COVER_FAMILY_HINT[family]}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4" role="radiogroup" aria-label="Композиція">
            {COVER_COMPOSITIONS.map((c) => {
              const on = (value.comp ?? 1) === c;
              return (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${COVER_FAMILY_LABEL[family]} 0${c}`}
                  onClick={() => onChange({ ...value, comp: c })}
                  className={`text-left rounded-xl p-1 border-2 transition ${on ? "border-[#4338ca]" : "border-transparent hover:border-black/10"}`}
                >
                  <CoverArt type={drawn} family={family} comp={c} className="aspect-[1200/160] rounded-lg" />
                  <div className="text-[12px] text-black/55 mt-1 px-1">
                    {COVER_FAMILY_LABEL[family]} 0{c}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.type === "personal" && (
        <div className="mt-5 flex flex-col gap-4">
          {/* computer */}
          <div className="min-w-0 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#ece8fb]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[14px] font-semibold text-[#12172b]">Фото для комп’ютера</div>
              <div className="text-[12px] text-black/50">2000 × 200 px · 10:1 · щонайменше 1600 px у ширину</div>
            </div>
            {photo && (
              <div
                className="relative mt-3 aspect-[10/1] w-full min-w-0 cursor-grab touch-none select-none overflow-hidden rounded-xl bg-[#ebeafb] ring-1 ring-[#e3def9] active:cursor-grabbing"
                onPointerDown={(e) => {
                  const startY = e.clientY;
                  const startPos = photo.y;
                  const h = e.currentTarget.clientHeight;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) => {
                    const y = Math.min(100, Math.max(0, startPos - ((ev.clientY - startY) / h) * 60));
                    onChange({ ...value, imageUrl: buildCoverPhoto({ ...photo, y }) });
                  };
                  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              >
                <img src={photo.desktop} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `50% ${photo.y}%` }} />
              </div>
            )}
            {photo && <div className="mt-1.5 text-[12px] text-black/45">Потягніть фото вгору чи вниз, щоб обрати смугу.</div>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="min-h-[40px] rounded-xl bg-white px-4 text-[13px] font-medium ring-1 ring-[#e3def9] hover:ring-[#c9bff7] disabled:opacity-50">
                {busy ? "Завантажуємо…" : photo ? "Замінити" : "Завантажити"}
              </button>
              <button type="button" onClick={() => setMakerOpen(true)} disabled={busy} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-50">
                Створити в конструкторі
              </button>
              {photo && (
                <button type="button" onClick={() => onChange({ ...value, imageUrl: null })} className="min-h-[40px] px-2 text-[13px] text-black/50 hover:text-black">Прибрати обидва</button>
              )}
            </div>
          </div>

          {/* phone */}
          <div className="min-w-0 rounded-2xl bg-[#faf9ff] p-4 ring-1 ring-[#ece8fb]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[14px] font-semibold text-[#12172b]">Фото для телефона</div>
              <div className="text-[12px] text-black/50">1200 × 300 px · 4:1 · щонайменше 800 px у ширину</div>
            </div>
            {photo && (
              <div className="relative mt-3 aspect-[4/1] w-full max-w-[320px] overflow-hidden rounded-xl bg-[#ebeafb] ring-1 ring-[#e3def9]">
                <img src={photo.mobile ?? photo.desktop} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={photo.mobile ? undefined : { objectPosition: `50% ${photo.y}%` }} />
              </div>
            )}
            <div className="mt-1.5 text-[12px] text-black/45">{photo?.mobile ? "На телефоні буде це фото." : "Обов’язково: на телефоні обкладинка вужча, тож потрібне окреме фото."}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => mobileRef.current?.click()} disabled={busy || !photo} title={photo ? undefined : "Спершу додайте фото для комп’ютера"} className="min-h-[40px] rounded-xl bg-white px-4 text-[13px] font-medium ring-1 ring-[#e3def9] hover:ring-[#c9bff7] disabled:opacity-50">
                {photo?.mobile ? "Замінити" : "Завантажити"}
              </button>
              {photo?.mobile && (
                <button type="button" onClick={() => onChange({ ...value, imageUrl: buildCoverPhoto({ ...photo, mobile: null }) })} className="min-h-[40px] px-2 text-[13px] text-black/50 hover:text-black">Прибрати</button>
              )}
            </div>
          </div>
          <div className="text-[12px] text-black/40">JPG, PNG або WebP до 5 МБ. Головне розміщуйте посередині.</div>

          {makerOpen && (
            <Suspense fallback={null}>
              <CoverMaker title={title || "Мій простір"} categoryId={null} frames={AUTHOR_FRAMES} onClose={() => setMakerOpen(false)} onDone={(file) => { setMakerOpen(false); void onFile(file, true); }} />
            </Suspense>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <input ref={mobileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0], false, "mobile")} />
        </div>
      )}

      {err && (
        <div role="alert" className="text-[13px] text-rose-600 mt-3">
          {err}
        </div>
      )}
    </div>
  );
}

function TypeChip({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`text-left px-3.5 py-2 rounded-xl border transition ${
        on ? "border-[#4338ca]/40 bg-[#eef2ff]" : "border-black/10 hover:bg-black/5"
      }`}
    >
      <div className={`text-[13px] font-medium ${on ? "text-[#4338ca]" : "text-black/75"}`}>{label}</div>
      <div className="text-[12px] text-black/40">{hint}</div>
    </button>
  );
}
